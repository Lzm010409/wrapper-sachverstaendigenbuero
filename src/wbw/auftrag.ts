import 'server-only'
import { and, desc, eq } from 'drizzle-orm'
import { db } from '@/db'
import { wbwLauf } from '@/db/schema'
import { waehleSuchmodell } from './modell'
import { ermittleModelle, fuehreLaufAus, type Schritt, type WbwEingabe } from './lauf'
import { notiere } from '@/melden/ablage'
import { leseErgebnis } from './ergebnis'
import { fehlendeLaufangaben, type LaufEingaben } from './lauf-eingaben'
import { protokolliereFehler, protokolliereWarnung } from '@/protokoll'
import { gespeicherteAuswahl } from './korb'
import type { Pruefurteil } from './pruefung'

export type { LaufEingaben } from './lauf-eingaben'
export { fehlendeLaufangaben } from './lauf-eingaben'

/**
 * Der WBW-Recherchelauf als Hintergrundarbeit.
 *
 * **Warum überhaupt im Hintergrund:** Ein Lauf dauert Minuten. Die Portale
 * werden nacheinander abgefragt, zwischen den Abrufen wird bewusst pausiert,
 * und Kleinanzeigen holt zu jedem Inserat eine Detailseite. Eine
 * HTTP-Antwort kann darauf nicht warten — der Browser bräche ab, und ein
 * Neuladen der Seite würde den Lauf verlieren.
 *
 * **Warum in der Datenbank und nicht im Arbeitsspeicher:** Der Stand muss
 * ein Neuladen überstehen, und wer den Lauf gestartet hat, soll den Rechner
 * zuklappen können. Nebenbei bleibt jeder Lauf nachvollziehbar: mit welchen
 * Eingaben gesucht wurde, welche Schritte durchliefen und was herauskam.
 *
 * **Warum das hier reicht und keine Warteschlange nötig ist:** Die Anwendung
 * läuft als **ein** langlebiger Node-Prozess in einem Container — kein
 * serverloses Umfeld, in dem eine Antwort den Prozess beendet. Eine
 * abgekoppelte Zusage läuft dort zu Ende. Was sie nicht überlebt, ist ein
 * Neustart des Containers; genau dafür räumt `starten.mjs` beim Hochfahren
 * die hängengebliebenen Läufe auf, statt sie für immer auf „läuft" stehen zu
 * lassen.
 */

export type Laufzustand = 'laeuft' | 'fertig' | 'fehler'

export interface Laufstand {
  id: string
  fallId: string
  zustand: Laufzustand
  eingabe: LaufEingaben
  protokoll: Schritt[]
  ergebnis: unknown
  markenfremd: unknown
  /** Was jeder gelaufene Zyklus ergeben hat. */
  zyklen: unknown
  /** Das Urteil der Prüfung je Fahrzeug, nach seiner Kennzeichnung. */
  urteile: Record<string, Pruefurteil>
  /** Die Auswahl des Sachverständigen — `null`, solange er nicht entschieden hat. */
  auswahl: string[] | null
  fehler: string | null
  begonnenAm: string
  beendetAm: string | null
}

/** Läuft für diesen Fall schon einer? */
export async function laufenderLauf(fallId: string): Promise<string | null> {
  const [zeile] = await db
    .select({ id: wbwLauf.id })
    .from(wbwLauf)
    .where(and(eq(wbwLauf.fallId, fallId), eq(wbwLauf.zustand, 'laeuft')))
    .limit(1)
  return zeile?.id ?? null
}

export async function holeLauf(id: string): Promise<Laufstand | null> {
  const [zeile] = await db.select().from(wbwLauf).where(eq(wbwLauf.id, id)).limit(1)
  return zeile ? zuStand(zeile) : null
}

/** Der jüngste Lauf eines Falls — den zeigt der Reiter beim Öffnen. */
export async function letzterLauf(fallId: string): Promise<Laufstand | null> {
  const [zeile] = await db
    .select()
    .from(wbwLauf)
    .where(eq(wbwLauf.fallId, fallId))
    .orderBy(desc(wbwLauf.begonnenAm))
    .limit(1)
  return zeile ? zuStand(zeile) : null
}

function zuStand(zeile: typeof wbwLauf.$inferSelect): Laufstand {
  return {
    id: zeile.id,
    fallId: zeile.fallId,
    zustand: zeile.zustand,
    eingabe: zeile.eingabe as LaufEingaben,
    protokoll: (zeile.protokoll as Schritt[]) ?? [],
    ergebnis: zeile.ergebnis,
    markenfremd: zeile.markenfremd,
    zyklen: zeile.zyklen,
    urteile:
      zeile.urteile && typeof zeile.urteile === 'object'
        ? (zeile.urteile as Record<string, Pruefurteil>)
        : {},
    auswahl: gespeicherteAuswahl(zeile.auswahl),
    fehler: zeile.fehler,
    begonnenAm: zeile.begonnenAm.toISOString(),
    beendetAm: zeile.beendetAm?.toISOString() ?? null,
  }
}

/**
 * Legt den Lauf an und koppelt ihn ab.
 *
 * Zurück kommt sofort die Kennung — die Oberfläche fragt damit den Stand ab.
 */
export async function starteLauf(
  fallId: string,
  eingaben: LaufEingaben,
  /** Wer ihn angestossen hat — er bekommt die Meldung, wenn er fertig ist. */
  benutzerId: string | null = null,
): Promise<{ id: string } | { fehler: string }> {
  const fehlt = fehlendeLaufangaben(eingaben)
  if (fehlt.length > 0) {
    return { fehler: `Es fehlt noch: ${fehlt.join(', ')}.` }
  }

  const laeuftSchon = await laufenderLauf(fallId)
  if (laeuftSchon) {
    return {
      fehler:
        'Für diesen Fall läuft bereits eine Recherche. Zwei gleichzeitig würden ' +
        'sich gegenseitig in die Frequenzbremse der Portale treiben.',
    }
  }

  const [angelegt] = await db
    .insert(wbwLauf)
    .values({ fallId, eingabe: eingaben, protokoll: [], angestossenVon: benutzerId })
    .returning({ id: wbwLauf.id })

  if (!angelegt) return { fehler: 'Der Lauf liess sich nicht anlegen.' }

  // Bewusst ohne `await`: die Antwort geht sofort hinaus, der Lauf arbeitet
  // im selben Prozess weiter. `fuehreAus` fängt jeden Fehler ab und schreibt
  // ihn in die Zeile — eine unbehandelte Zusage darf den Server nicht
  // mitnehmen.
  void fuehreAus(angelegt.id, fallId, eingaben, benutzerId)

  return { id: angelegt.id }
}

/** Hängt einen Schritt an das Protokoll an. */
async function schreibeSchritt(id: string, schritte: Schritt[]): Promise<void> {
  try {
    await db.update(wbwLauf).set({ protokoll: schritte }).where(eq(wbwLauf.id, id))
  } catch (fehler) {
    // Ein verlorener Fortschrittseintrag darf den Lauf nicht abbrechen.
    protokolliereWarnung('wbw.fortschritt', 'Ein Fortschrittseintrag ging verloren.', {
      laufId: id,
      grund: fehler instanceof Error ? fehler.message : String(fehler),
    })
  }
}

/**
 * Der eigentliche Lauf. Läuft abgekoppelt und schreibt seinen Stand in die
 * Zeile — hier wird nichts geworfen, was niemand fangen würde.
 */
async function fuehreAus(
  id: string,
  fallId: string,
  eingaben: LaufEingaben,
  benutzerId: string | null,
): Promise<void> {
  const schritte: Schritt[] = []
  const melde = (schritt: Schritt) => {
    // Ein Schritt mit gleichem Namen ersetzt seinen Vorgänger: aus „läuft"
    // wird „fertig", statt beides untereinander zu zeigen.
    const vorhanden = schritte.findIndex((s) => s.name === schritt.name)
    if (vorhanden === -1) schritte.push(schritt)
    else schritte[vorhanden] = schritt
    void schreibeSchritt(id, [...schritte])
  }

  try {
    const { proPortal: modellProPortal, as24Modelle } = await ermittleModellProPortal(
      eingaben,
      melde,
    )

    const eingabe: WbwEingabe = {
      subjekt: {
        marke: eingaben.marke,
        modell: eingaben.modell,
        baureihe: eingaben.baureihe,
        variante: eingaben.variante,
        ez: eingaben.ez,
        mileage: eingaben.laufleistung,
        power: eingaben.leistungKw,
        bauart: eingaben.bauart,
      },
      modellProPortal,
      as24Modelle,
      plz: eingaben.plz,
      sollAusstattung: eingaben.sollAusstattung,
      ...(eingaben.getriebe ? { getriebe: eingaben.getriebe } : {}),
      ...(eingaben.tueren ? { tueren: eingaben.tueren } : {}),
      radiusKm: eingaben.radiusKm,
      kmToleranz: eingaben.kmToleranz,
      ezToleranzJahre: eingaben.ezToleranzJahre,
      leistungToleranzKw: eingaben.leistungToleranzKw,
      maxItemsProPortal: eingaben.maxItemsProPortal,
      portale: eingaben.portale,
      markenfilter: true,
      // Der Kostenschutz des Plugins bleibt zu, solange er nicht für diesen
      // einen Lauf geöffnet wird.
      ...(eingaben.kostenpflichtigErlaubt ? { umgebung: { WBW_ALLOW_PAID: '1' } } : {}),
    }

    const ergebnis = await fuehreLaufAus(eingabe, melde)

    await db
      .update(wbwLauf)
      .set({
        zustand: 'fertig',
        ergebnis: ergebnis.ergebnis,
        markenfremd: ergebnis.markenfremd,
        // Bewusst der entprellte Verlauf und nicht `ergebnis.protokoll`: das
        // Plugin haengt jeden Schritt zweimal an (erst „laeuft", dann
        // „fertig"), und in der Anzeige stuende dann alles doppelt.
        protokoll: schritte,
        zyklen: ergebnis.zyklen,
        urteile: ergebnis.urteile,
        ordner: ergebnis.ordner,
        beendetAm: new Date(),
      })
      .where(eq(wbwLauf.id, id))

    // Der Lauf dauert Minuten. Wer ihn angestossen hat, ist längst woanders —
    // ohne diese Meldung endete er lautlos.
    const gelesen = leseErgebnis(ergebnis.ergebnis)
    const korb = gelesen?.wert.anzahl ?? 0
    await notiere({
      benutzerId,
      art: korb > 0 ? 'erfolg' : 'warnung',
      titel: 'Vergleichsfahrzeuge gefunden',
      text:
        korb > 0
          ? `${korb} Fahrzeuge im Korb, Vorschlag ${betragText(gelesen?.wert.vorschlagBrutto)}.`
          : 'Der Lauf ist durchgelaufen, aber kein Fahrzeug hat es in den Korb geschafft. ' +
            'Die Toleranzen sind vermutlich zu eng.',
      verweis: `/faelle/${fallId}?reiter=wbw`,
      quelle: 'wbw',
    })
  } catch (fehler) {
    const meldung = fehler instanceof Error ? fehler.message : String(fehler)
    protokolliereFehler('wbw.lauf', 'Der Recherchelauf ist gescheitert.', fehler, {
      laufId: id,
      fallId,
      benutzerId: benutzerId ?? undefined,
      portale: eingaben.portale,
    })
    try {
      await db
        .update(wbwLauf)
        .set({
          zustand: 'fehler',
          fehler: meldung.slice(0, 2000),
          protokoll: schritte,
          beendetAm: new Date(),
        })
        .where(eq(wbwLauf.id, id))
    } catch (schreibfehler) {
      protokolliereFehler(
        'wbw.lauf.festhalten',
        'Der gescheiterte Lauf liess sich nicht in der Datenbank vermerken.',
        schreibfehler,
        { laufId: id, fallId },
      )
    }
    await notiere({
      benutzerId,
      art: 'fehler',
      titel: 'Recherche abgebrochen',
      text: meldung.slice(0, 300),
      verweis: `/faelle/${fallId}?reiter=wbw`,
      quelle: 'wbw',
    })
  }
}

/** Für die Meldung: ein Betrag in Euro, oder „ohne Wert". */
function betragText(wert: number | null | undefined): string {
  if (wert == null) return 'ohne Wert'
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(wert)
}

/**
 * Der Modellname **je Portal**. Die Portale führen verschiedene Taxonomien:
 * AutoScout24 kennt `E 53 AMG` als eigenes Modell, Kleinanzeigen nur die
 * Baureihe `E-Klasse` — `e_53_amg` liefert dort null Treffer.
 *
 * Bei AutoScout24 wird die echte Modellliste geholt und der längste
 * Wortpräfix gesucht, der exakt einem Modell entspricht. Findet sich keiner,
 * wird **nichts** gesetzt: ein unbekanntes Modell lässt das Portal
 * stillschweigend fallen und liefert die ganze Marke.
 */
async function ermittleModellProPortal(
  eingaben: LaufEingaben,
  melde: (schritt: Schritt) => void,
): Promise<{ proPortal: WbwEingabe['modellProPortal']; as24Modelle: string[] }> {
  const proPortal: WbwEingabe['modellProPortal'] = {}
  if (eingaben.baureihe) proPortal.kleinanzeigen = eingaben.baureihe
  proPortal.mobilede = eingaben.modell
  // Die Liste wandert mit: aus ihr wählen die späteren Zyklen ihre gröberen
  // Namen, und ein zweiter Abruf dafür wäre eine zweite Wartezeit.
  let as24Modelle: string[] = []

  if (!eingaben.portale.includes('autoscout24')) return { proPortal, as24Modelle }

  const name = 'Modell bei AutoScout24 auflösen'
  melde({ name, stand: 'laeuft' })
  try {
    const liste = await ermittleModelle(eingaben.marke, eingaben.modell)
    as24Modelle = liste.modelle
    const treffer = waehleSuchmodell(eingaben.modell, eingaben.baureihe, liste.modelle)
    if (treffer.modell) {
      proPortal.autoscout24 = treffer.modell
      melde({
        name,
        stand: 'fertig',
        // Der Weg über die Baureihe wird benannt, nicht verschwiegen: gesucht
        // wurde dann gröber als der Untertyp es hergäbe, und das gehört ins
        // Protokoll, weil es den Korb erklärt.
        text:
          treffer.quelle === 'baureihe'
            ? `AutoScout24 kennt „${eingaben.modell}" nicht — gesucht wird über die ` +
              `Baureihe „${treffer.modell}"`
            : treffer.verworfen
              ? `„${eingaben.modell}" → „${treffer.modell}" (ohne „${treffer.verworfen}")`
              : `„${treffer.modell}" — genau so führt AutoScout24 es`,
      })
    } else {
      melde({
        name,
        stand: 'leer',
        text:
          `AutoScout24 kennt weder „${eingaben.modell}" noch die Baureihe ` +
          `${eingaben.baureihe ? `„${eingaben.baureihe}" ` : ''}unter ${liste.anzahl} Modellen ` +
          `von ${eingaben.marke}. Gesucht wird über die ganze Marke.`,
      })
    }
  } catch (fehler) {
    melde({
      name,
      stand: 'fehler',
      text: fehler instanceof Error ? fehler.message.slice(0, 300) : String(fehler),
    })
  }
  return { proPortal, as24Modelle }
}
