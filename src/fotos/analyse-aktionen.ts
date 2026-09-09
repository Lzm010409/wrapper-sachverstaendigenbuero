'use server'

import { eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { db } from '@/db'
import { fall } from '@/db/schema'
import { verlangeBenutzer } from '@/auth/sitzung'
import { verlangeRecht } from '@/rechte/zugriff'
import { clientAusUmgebung } from '@/autoixpert/client'
import { gutachtenSchema } from '@/autoixpert/typen'
import { kiVerfuegbar } from '@/ki/client'
import { beschriftePaket, naechstesPaket, type Fahrzeugkontext } from './assistent'
import { holeVorschaubilder } from './vorschaubilder'
import {
  beendeLauf,
  beginneLauf,
  ladeAnalyse,
  loescheAnalyse,
  setzeStand,
  speichereAnalyse,
} from './analyse-ablage'
import { ladeLexikon } from './lexikon-ablage'
import { beschrifteFoto } from './aktionen'
import { notiere } from '@/melden/ablage'
import { protokolliereFehler } from '@/protokoll'
import type { Fotoanalyse, Fotovorschlag } from './vorschlag'
import type { Verwendung } from './ansicht'
import type { Aktionsergebnis } from '@/melden/typen'

/**
 * Der Fotoassistent als Serveraktion.
 *
 * **Ein Hintergrundlauf, keine offene Anfrage.** Ein Fall mit 67 Fotos
 * braucht mehrere Modellaufrufe hintereinander — eine gute Minute, in der
 * eine einzige HTTP-Antwort nicht offenstehen kann, ohne dass ein Proxy
 * dazwischenfunkt oder der Browser abbricht. `starteAnalyseLauf` legt den
 * Lauf deshalb nur an und kehrt sofort zurück; die eigentliche Arbeit
 * (`fuehreAnalyseAus`) läuft **ohne** `await` im selben, langlebigen
 * Node-Prozess weiter — derselbe Aufbau wie beim WBW-Recherchelauf
 * (`wbw/auftrag.ts`, dort ausführlich begründet). Die Oberfläche fragt den
 * Stand alle paar Sekunden ab (`frageAnalyseStandAb`, siehe `foto-assistent.
 * tsx`) und bekommt beim Fertigwerden zusätzlich eine Benachrichtigung
 * (`@/melden`), die auch dann ankommt, wenn niemand mehr auf der Seite ist.
 *
 * **Warum die Analyse kein eigenes Recht braucht.** Sie schreibt nichts nach
 * draussen und kostet Bruchteile eines Cents je Fall. Das Recht sitzt eine
 * Stufe später, beim Übernehmen — dort wirkt es im führenden System.
 */

/** Sicherung gegen einen Lauf, der nie „fertig" meldet. */
const HOECHSTENS_RUNDEN = 40

/** Startet den Hintergrundlauf, sofern nicht schon einer für diesen Fall arbeitet. */
export async function starteAnalyseLauf(fallId: string): Promise<Aktionsergebnis> {
  const benutzer = await verlangeBenutzer()

  if (!kiVerfuegbar()) {
    return { fehler: 'Die KI-Funktionen sind auf diesem Server nicht eingerichtet.' }
  }
  if (!clientAusUmgebung()) {
    return { fehler: 'autoiXpert ist auf diesem Server nicht eingerichtet.' }
  }

  const vorhanden = await ladeAnalyse(fallId)
  if (vorhanden?.laufZustand === 'laeuft') {
    return { fehler: 'Für diesen Fall läuft bereits eine Analyse.' }
  }

  await beginneLauf(fallId, benutzer.id)
  // Bewusst ohne `await`: die Antwort geht sofort hinaus, der Lauf arbeitet
  // im selben Prozess weiter (siehe Erläuterung oben). `fuehreAnalyseAus`
  // fängt jeden Fehler selbst ab — eine unbehandelte Zusage darf den Server
  // nicht mitnehmen.
  void fuehreAnalyseAus(fallId, benutzer.id)

  return { hinweis: 'Analyse gestartet.' }
}

/** Für das Abfragen aus der Oberfläche — kein eigenes Recht, nur Anmeldung. */
export async function frageAnalyseStandAb(fallId: string): Promise<Fotoanalyse | null> {
  await verlangeBenutzer()
  return ladeAnalyse(fallId)
}

/**
 * Der eigentliche Lauf. Läuft abgekoppelt und schreibt seinen Stand in die
 * Zeile — hier wird nichts geworfen, was niemand fangen würde.
 */
async function fuehreAnalyseAus(fallId: string, benutzerId: string): Promise<void> {
  let gesamt = 0
  try {
    const [zeile] = await db
      .select({ daten: fall.daten })
      .from(fall)
      .where(eq(fall.id, fallId))
      .limit(1)
    const geprueft = zeile?.daten ? gutachtenSchema.safeParse(zeile.daten) : null
    if (!geprueft?.success) throw new Error('Zu diesem Fall fehlen die autoiXpert-Daten.')
    const gutachten = geprueft.data
    const reportId = gutachten.id || gutachten.external_id
    if (!reportId) throw new Error('Zu diesem Fall fehlt die autoiXpert-Kennung.')

    const client = clientAusUmgebung()
    if (!client) throw new Error('autoiXpert ist auf diesem Server nicht eingerichtet.')

    const fotos = await client.holeFotos(reportId)
    gesamt = fotos.length

    if (fotos.length > 0) {
      const kontext: Fahrzeugkontext = {
        marke: gutachten.car?.make ?? null,
        modell: gutachten.car?.model ?? null,
        kennzeichen: gutachten.car?.license_plate ?? null,
        schadenbeschreibung: gutachten.car?.damage_description ?? null,
      }
      // Die Stilvorlage kommt aus dem Fall selbst: was der Sachverständige
      // hier schon geschrieben hat, ist die beste Vorgabe für den Rest.
      const stilbeispiele = fotos
        .map((f) => f.description?.trim())
        .filter((b): b is string => Boolean(b))
        .slice(0, 8)
      const teile = await ladeLexikon()

      const bekannt = new Map<string, Fotovorschlag>()
      const gescheitert = new Set<string>()

      for (let runde = 0; runde < HOECHSTENS_RUNDEN; runde += 1) {
        const offen = naechstesPaket(fotos, new Set(bekannt.keys()), gescheitert)
        if (offen.length === 0) break

        const bilder = await holeVorschaubilder(client, reportId, offen.map((f) => f.id))
        const neue = await beschriftePaket(kontext, stilbeispiele, teile, bilder)

        for (const v of neue) bekannt.set(v.fotoId, v)
        const geglueckt = new Set(neue.map((v) => v.fotoId))
        for (const f of offen) if (!geglueckt.has(f.id)) gescheitert.add(f.id)

        // Nach jedem Paket abgelegt, nicht erst am Ende: bricht der Lauf
        // später ab, ist die Arbeit der vorigen Pakete nicht verloren.
        await speichereAnalyse(fallId, benutzerId, [...bekannt.values()], [...gescheitert])

        // Kein Vorschlag zustande gekommen? Dann bringt die nächste Runde
        // dasselbe Ergebnis — hier ist Schluss, mit Grund.
        if (neue.length === 0) break
      }
    }

    await beendeLauf(fallId, null)
    const stand = await ladeAnalyse(fallId)
    await notiere({
      benutzerId,
      art: 'erfolg',
      titel: 'Fotoanalyse fertig',
      text: `${stand?.vorschlaege.length ?? 0} von ${gesamt} Fotos beschriftet.`,
      verweis: `/faelle/${fallId}?reiter=fotos`,
      quelle: 'fotos',
    })
  } catch (fehler) {
    const text = fehler instanceof Error ? fehler.message : String(fehler)
    protokolliereFehler('fotos.assistent.lauf', 'Die Fotoanalyse ist gescheitert.', fehler, { fallId })
    try {
      await beendeLauf(fallId, text)
    } catch (schreibfehler) {
      protokolliereFehler(
        'fotos.assistent.lauf.festhalten',
        'Der gescheiterte Lauf liess sich nicht in der Datenbank vermerken.',
        schreibfehler,
        { fallId },
      )
    }
    await notiere({
      benutzerId,
      art: 'fehler',
      titel: 'Fotoanalyse gescheitert',
      text: text.slice(0, 300),
      verweis: `/faelle/${fallId}?reiter=fotos`,
      quelle: 'fotos',
    })
  } finally {
    revalidatePath(`/faelle/${fallId}`)
  }
}

/**
 * Wirft die gespeicherte Analyse eines Falls weg — der nächste Lauf fängt
 * für alle Fotos wieder bei null an.
 *
 * **Wofür das gebraucht wird.** Ein Foto mit Vorschlag zählt für
 * `fuehreAnalyseAus` als „schon dran gewesen", gleich welchen Stands — auch
 * ein verworfener bekäme sonst nie einen zweiten Versuch. Ändert sich das
 * Fotolexikon oder will man nach einer schlechten Serie neu anfangen,
 * braucht es deshalb einen Schnitt, keinen Umweg über 67 Mal „Verwerfen".
 *
 * **Was dabei nicht verloren geht.** Was schon nach autoiXpert übernommen
 * wurde, steht dort unverändert weiter — dieser Weg schreibt nirgendwo nach
 * aussen. Ein neuer Lauf schlägt für diese Fotos einfach noch einmal etwas
 * vor; nicht mehr, nicht weniger.
 */
export async function setzeAnalyseZurueck(fallId: string): Promise<Aktionsergebnis> {
  await verlangeBenutzer()

  const vorhanden = await ladeAnalyse(fallId)
  if (vorhanden?.laufZustand === 'laeuft') {
    return { fehler: 'Die Analyse läuft gerade — bitte warten, bis sie fertig ist.' }
  }

  await loescheAnalyse(fallId)
  revalidatePath(`/faelle/${fallId}`)
  return { hinweis: 'Analyse zurückgesetzt.' }
}

/**
 * Übernimmt einen Vorschlag nach autoiXpert.
 *
 * **Warum das Recht zweimal geprüft wird.** `beschrifteFoto` prüft es
 * ohnehin — dieselbe Prüfung, dieselbe Konstante. Sie steht hier trotzdem
 * noch einmal, weil jede exportierte Funktion einer `'use server'`-Datei
 * ein eigener Endpunkt ist und ihre Wache selbst tragen muss. Ein
 * Schutz, der nur über den Umweg einer anderen Funktion greift, ist beim
 * nächsten Umbau derjenige, der still verschwindet; `wache.test.ts`
 * verlangt ihn deshalb an Ort und Stelle.
 */
export async function uebernimmVorschlag(
  fallId: string,
  fotoId: string,
  beschreibung: string,
  verwendung: Verwendung,
): Promise<Aktionsergebnis> {
  await verlangeRecht('autoixpert.schreiben')

  const ergebnis = await beschrifteFoto(fallId, fotoId, {
    beschreibung,
    imGutachten: verwendung.imGutachten,
    inRestwertboerse: verwendung.inRestwertboerse,
    inReparaturbestaetigung: verwendung.inReparaturbestaetigung,
    inStellungnahme: verwendung.inStellungnahme,
  })
  if (ergebnis.fehler) return ergebnis

  // Erst nach dem geglückten Schreiben. Andersherum stünde der Vorschlag als
  // übernommen da, obwohl in autoiXpert nichts angekommen ist.
  await setzeStand(fallId, fotoId, 'uebernommen', beschreibung)
  revalidatePath(`/faelle/${fallId}`)
  return { hinweis: 'Übernommen.' }
}

/** Verwirft einen Vorschlag. Schreibt nichts nach autoiXpert. */
export async function verwirfVorschlag(fallId: string, fotoId: string): Promise<Aktionsergebnis> {
  await verlangeBenutzer()
  await setzeStand(fallId, fotoId, 'verworfen')
  revalidatePath(`/faelle/${fallId}`)
  return {}
}
