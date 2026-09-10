'use server'

import { revalidatePath } from 'next/cache'
import { and, asc, eq, inArray } from 'drizzle-orm'
import { db } from '@/db'
import { eintrag, position, stellungnahme } from '@/db/schema'
import { verlangeBenutzer } from '@/auth/sitzung'
import { gutachtenSchema } from '@/autoixpert/typen'
import { leseFalldaten, platzhalterWerte } from '@/autoixpert/felder'
import type { Extraktion } from '@/pruefbericht/schema'
import { pruefeVorExport, type Pruefergebnis } from '@/export/waechter'
import { schreibeDokument } from '@/dokument/dienst'
import { gesamttext, pruefBausteineAusDokument } from '@/dokument/pruefung'
import { eintraegeJePosition, selbstGeschriebeneAbschnitte } from '@/dokument/spur'
import { abschnitteVollstaendig, istDokument, type Elementknoten } from '@/dokument/typen'
import { formulierePosition } from './komposition'
import { ladeStellungnahme } from './abfragen'
import { istDublette, sperreBereichZurNummernvergabe } from '@/bibliothek/sperre'

/* ------------------------------------------------------------------ *
 * Speichern
 * ------------------------------------------------------------------ */

export type SpeicherErgebnis =
  | { stand: number }
  | { konflikt: number; fehler: string }
  | { fehler: string }

/**
 * Der Satz, mit dem ein versendetes Schreiben jede Änderung abweist.
 *
 * Ein Schreiben, das aus dem Haus ist, ist ein Beleg: was dort steht, ist
 * das, was der Versicherer bekommen hat. Bisher liess sich ein als
 * versendet vermerktes Schreiben trotzdem weiterschreiben — der Text
 * änderte sich, der Vermerk blieb, und aus dem Beleg wurde eine Behauptung.
 * Gesperrt war nur das Löschen; die Oberfläche liess damit eine
 * Unveränderlichkeit vermuten, die es nicht gab.
 */
const VERSENDET =
  'Dieses Schreiben ist als versendet vermerkt und deshalb geschlossen. ' +
  'Nimm den Versandvermerk zurück, wenn es noch geändert werden soll.'

/** Ob das Schreiben geschlossen ist. Gibt die Meldung zurück, oder null. */
async function istVersendet(stellungnahmeId: string): Promise<string | null> {
  const [zeile] = await db
    .select({ versendetAm: stellungnahme.versendetAm })
    .from(stellungnahme)
    .where(eq(stellungnahme.id, stellungnahmeId))
    .limit(1)
  if (!zeile) return 'Diese Stellungnahme gibt es nicht mehr.'
  return zeile.versendetAm ? VERSENDET : null
}

/** Dasselbe, ausgehend von einer Position. */
async function istVersendetUeberPosition(positionId: string): Promise<string | null> {
  const [zeile] = await db
    .select({ versendetAm: stellungnahme.versendetAm })
    .from(position)
    .innerJoin(stellungnahme, eq(position.stellungnahmeId, stellungnahme.id))
    .where(eq(position.id, positionId))
    .limit(1)
  if (!zeile) return 'Diese Position gibt es nicht mehr.'
  return zeile.versendetAm ? VERSENDET : null
}

/**
 * Nimmt eine Fassung des Schreibens entgegen.
 *
 * Der Editor speichert nach kurzer Ruhe von selbst. Passt der Stand nicht,
 * hat inzwischen jemand anderes gespeichert — dann wird gemeldet statt
 * überschrieben.
 */
export async function speichereDokument(
  stellungnahmeId: string,
  dokument: unknown,
  stand: number,
): Promise<SpeicherErgebnis> {
  await verlangeBenutzer()

  const geschlossen = await istVersendet(stellungnahmeId)
  if (geschlossen) return { fehler: geschlossen }

  if (!istDokument(dokument)) return { fehler: 'Das übergebene Dokument ist unbrauchbar.' }
  if (!abschnitteVollstaendig(dokument)) {
    return {
      fehler:
        'Mindestens ein Abschnitt hat seine Zuordnung zur Kürzungsposition verloren. ' +
        'Es wurde nichts gespeichert — bitte die Seite neu laden.',
    }
  }

  const ergebnis = await schreibeDokument(stellungnahmeId, dokument, stand)
  if ('konflikt' in ergebnis) {
    return {
      konflikt: ergebnis.konflikt,
      fehler:
        'Jemand anderes hat diese Stellungnahme zwischenzeitlich gespeichert. ' +
        'Bitte die Seite neu laden — sonst gingen die fremden Änderungen verloren.',
    }
  }
  return ergebnis
}

/* ------------------------------------------------------------------ *
 * Prüfen
 * ------------------------------------------------------------------ */

function falldatenWerte(daten: unknown): Record<string, string> {
  const geprueft = gutachtenSchema.safeParse(daten)
  if (!geprueft.success) return {}
  return platzhalterWerte(leseFalldaten(geprueft.data))
}

/** Sammelt alle Zahlen, die im Fall belegt sind — Grundlage für R2. */
function belegteZahlen(
  s: NonNullable<Awaited<ReturnType<typeof ladeStellungnahme>>>,
  werte: Record<string, string>,
): string[] {
  const zahlen = new Set<string>()
  for (const wert of Object.values(werte)) {
    for (const t of wert.matchAll(/[\d.,]+/g)) zahlen.add(t[0])
  }
  for (const p of s.positionen) {
    for (const feld of [p.betragGutachten, p.betragGekuerzt, p.differenz]) {
      if (feld) zahlen.add(feld)
    }
  }
  const e = s.extraktion as Extraktion | null
  if (e?.summeGutachten != null) zahlen.add(String(e.summeGutachten))
  if (e?.summeGekuerzt != null) zahlen.add(String(e.summeGekuerzt))
  return [...zahlen]
}

const LEERES_ERGEBNIS: Pruefergebnis = {
  befunde: [],
  gesperrt: false,
  zusammenfassung: { sperrt: 0, warnt: 0 },
}

/**
 * Prüft die Fassung, die gerade im Editor steht.
 *
 * Bewusst gegen das übergebene Dokument und nicht gegen die gespeicherte
 * Fassung: sonst meldete die Prüfung Befunde zu Sätzen, die gerade
 * berichtigt wurden.
 */
export async function pruefeDokument(
  stellungnahmeId: string,
  dokument: unknown,
): Promise<Pruefergebnis> {
  await verlangeBenutzer()
  if (!istDokument(dokument)) return LEERES_ERGEBNIS

  const s = await ladeStellungnahme(stellungnahmeId)
  if (!s) return LEERES_ERGEBNIS

  return pruefeVorExport({
    bausteine: pruefBausteineAusDokument(dokument, await ladeInterneHinweise(dokument)),
    belegteZahlen: belegteZahlen(s, falldatenWerte(s.fall?.daten)),
    gesamttext: gesamttext(dokument),
  })
}

/**
 * Lädt die internen Hinweise der verwendeten Einträge — nur zum Prüfen.
 *
 * Sie werden nirgends in das Dokument geschrieben; R4 vergleicht bloss, ob
 * ihr Wortlaut auf anderem Weg hineingeraten ist.
 */
async function ladeInterneHinweise(dokument: Elementknoten): Promise<Map<string, string | null>> {
  const ids = [...new Set([...eintraegeJePosition(dokument).values()].flat())]
  const hinweise = new Map<string, string | null>()
  if (ids.length === 0) return hinweise

  const zeilen = await db
    .select({ id: eintrag.id, hinweise: eintrag.hinweise })
    .from(eintrag)
    .where(inArray(eintrag.id, ids))
  for (const z of zeilen) hinweise.set(z.id, z.hinweise)
  return hinweise
}

/* ------------------------------------------------------------------ *
 * Ausformulieren, Abschnitt für Abschnitt
 * ------------------------------------------------------------------ */

export interface FormulierErgebnis {
  text?: string
  fehler?: string
}

/**
 * Formuliert einen einzelnen Abschnitt aus.
 *
 * Ein Aufruf je Abschnitt, ausgelöst am Rand des Briefes — nicht mehr ein
 * Knopf für das ganze Dokument. Was zurückkommt, ersetzt den Abschnitt im
 * Editor und lässt sich mit einem Rückschritt wieder zurückholen.
 */
export async function formuliereAbschnitt(
  stellungnahmeId: string,
  positionId: string,
  text: string,
): Promise<FormulierErgebnis> {
  await verlangeBenutzer()

  const inhalt = text.trim()
  if (!inhalt) return { fehler: 'Dieser Abschnitt ist leer — es gäbe nichts auszuformulieren.' }

  const s = await ladeStellungnahme(stellungnahmeId)
  if (!s) return { fehler: 'Stellungnahme nicht gefunden.' }

  const p = s.positionen.find((x) => x.id === positionId)

  try {
    return {
      text: await formulierePosition({
        positionBezeichnung: p?.bezeichnung ?? 'Position',
        begruendungVersicherer: p?.begruendungVersicherer ?? null,
        bausteine: [{ text: inhalt, herkunft: 'bibliothek' }],
        platzhalterWerte: falldatenWerte(s.fall?.daten),
        betragGutachten: p?.betragGutachten ?? null,
        betragGekuerzt: p?.betragGekuerzt ?? null,
      }),
    }
  } catch (fehler) {
    return {
      fehler: fehler instanceof Error ? fehler.message : 'Das Ausformulieren ist gescheitert.',
    }
  }
}

/* ------------------------------------------------------------------ *
 * Behandlung einer Position
 * ------------------------------------------------------------------ */

export async function setzeBehandlung(
  positionId: string,
  behandlung: 'offen' | 'bestritten' | 'anerkannt' | 'nicht_bestreiten',
): Promise<{ fehler?: string }> {
  await verlangeBenutzer()
  const geschlossen = await istVersendetUeberPosition(positionId)
  if (geschlossen) return { fehler: geschlossen }

  await db.update(position).set({ behandlung }).where(eq(position.id, positionId))
  return {}
}

/**
 * Entfernt eine Kürzungsposition ganz.
 *
 * Der Unterschied zu „Nicht bestreiten" ist wesentlich: dort bleibt die
 * Position im Fall, wird nur nicht bestritten — ihr Abschnitt steht weiter
 * im Brief, ausgegraut, und ihre Marke in der Leiste bleibt. Hier
 * verschwindet sie ganz: aus dem Schreiben, aus der Leiste, aus dem Fall.
 *
 * Dafür gibt es einen guten Grund: die Auswertung des Prüfberichts liest
 * gelegentlich eine Zeile heraus, die gar keine Kürzung ist — eine
 * doppelte, eine falsch gelesene, eine Zwischensumme. So etwas gehört
 * nicht ausgegraut, sondern weg.
 */
export async function entfernePosition(positionId: string): Promise<{ fehler?: string }> {
  await verlangeBenutzer()
  const geschlossen = await istVersendetUeberPosition(positionId)
  if (geschlossen) return { fehler: geschlossen }

  await db.delete(position).where(eq(position.id, positionId))
  return {}
}

/* ------------------------------------------------------------------ *
 * F9 — selbst geschriebenen Abschnitt in die Bibliothek
 * ------------------------------------------------------------------ */

/**
 * Legt aus einem selbst geschriebenen Abschnitt einen Bibliotheks-Entwurf an.
 *
 * Die Begründung des Prüfdienstleisters wird als „Typische Begründung"
 * übernommen — genau das Feld, über das der Eintrag später wiedergefunden
 * wird. Freigeben darf ihn nur ein Mensch (Konzept E5).
 */
export async function uebernehmeAbschnittInBibliothek(
  stellungnahmeId: string,
  positionId: string,
  dokument: unknown,
): Promise<{ hinweis?: string; fehler?: string }> {
  const benutzer = await verlangeBenutzer()
  if (!istDokument(dokument)) return { fehler: 'Das übergebene Dokument ist unbrauchbar.' }

  const abschnitt = selbstGeschriebeneAbschnitte(dokument).find((a) => a.positionId === positionId)
  if (!abschnitt) {
    return {
      fehler:
        'Dieser Abschnitt stammt aus der Bibliothek — übernommen wird nur, was selbst ' +
        'geschrieben wurde.',
    }
  }

  const s = await ladeStellungnahme(stellungnahmeId)
  const p = s?.positionen.find((x) => x.id === positionId)

  /*
    Lesen und Schreiben unter derselben Sperre wie das Anlegeformular.

    Vorher lagen die beiden Anweisungen frei nebeneinander: Zwei Bearbeiter,
    die gleichzeitig je einen Abschnitt übernehmen, lasen denselben Bestand,
    errechneten beide „99.5" und schrieben beide — einer lief in den
    eindeutigen Index über (Bereich, Nummer), und der rohe Datenbankfehler
    schlug bis in die Oberfläche durch. Dieselbe Sperre greift auch gegen
    das Anlegeformular, das in denselben Bereich schreibt; nähme nur eine
    Seite sie, wäre sie wertlos.
  */
  let nummer = ''
  try {
    await db.transaction(async (tx) => {
      await sperreBereichZurNummernvergabe(tx, 'kalkulation')

      const vorhandene = await tx
        .select({ nummer: eintrag.nummer })
        .from(eintrag)
        .where(eq(eintrag.bereich, 'kalkulation'))

      let naechste = 1
      for (const v of vorhandene) {
        const treffer = v.nummer.match(/^99\.(\d+)$/)
        if (treffer) naechste = Math.max(naechste, Number(treffer[1]) + 1)
      }

      nummer = `99.${naechste}`
      await tx.insert(eintrag).values({
        nummer,
        titel: abschnitt.ueberschrift || p?.bezeichnung || 'Ohne Titel',
        bereich: 'kalkulation',
        abschnitt: '99. Aus Stellungnahmen übernommen',
        typischeBegruendung: p?.begruendungVersicherer ?? null,
        gegenargument: abschnitt.text,
        status: 'entwurf',
        herkunft: 'aus_stellungnahme',
        erstelltVon: benutzer.id,
        quelldatei: `Stellungnahme ${s?.betreff ?? stellungnahmeId}`,
      })
    })
  } catch (ausnahme) {
    if (istDublette(ausnahme)) {
      return {
        fehler:
          'Die Nummer für den Bibliothekseintrag war einen Augenblick später schon belegt. ' +
          'Bitte noch einmal übernehmen.',
      }
    }
    throw ausnahme
  }

  revalidatePath('/bibliothek')
  return { hinweis: `Als Entwurf ${nummer} in der Bibliothek angelegt — noch nicht freigegeben.` }
}

/** Die Reihenfolge, in der ein wieder aufgenommener Abschnitt einzusortieren ist. */
export async function positionsReihenfolge(stellungnahmeId: string): Promise<string[]> {
  await verlangeBenutzer()
  const zeilen = await db
    .select({ id: position.id })
    .from(position)
    .where(and(eq(position.stellungnahmeId, stellungnahmeId)))
    .orderBy(asc(position.reihenfolge))
  return zeilen.map((z) => z.id)
}
