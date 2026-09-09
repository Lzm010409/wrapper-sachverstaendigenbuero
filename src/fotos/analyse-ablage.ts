import 'server-only'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '@/db'
import { fotoAnalyse } from '@/db/schema'
import { KATEGORIESCHLUESSEL, type Kategorie } from './kategorien'
import type { Fotoanalyse, Fotovorschlag } from './vorschlag'
import { protokolliereWarnung } from '@/protokoll'

/**
 * Ablage der Fotovorschläge.
 *
 * **Warum die abgelegten Daten noch einmal geprüft werden.** In einer
 * jsonb-Spalte steht, was zum Zeitpunkt des Schreibens hineinpasste — nicht
 * das, was der heutige Code erwartet. Wird eine Kategorie später umbenannt,
 * liegen die alten Namen weiter in der Datenbank. Ungeprüft gelesen ergäbe
 * das eine Kategorie, die es nicht mehr gibt, und einen Absturz an einer
 * Stelle, die mit dem Lesen nichts zu tun hat. Deshalb: was nicht mehr
 * passt, fällt beim Lesen still heraus.
 */

const verwendungSchema = z.object({
  imGutachten: z.boolean(),
  inRestwertboerse: z.boolean(),
  inReparaturbestaetigung: z.boolean(),
  inStellungnahme: z.boolean(),
})

const vorschlagSchema = z.object({
  fotoId: z.string(),
  kategorie: z.enum(KATEGORIESCHLUESSEL as [Kategorie, ...Kategorie[]]),
  beschreibung: z.string(),
  verwendung: verwendungSchema,
  sicherheit: z.number(),
  stand: z.enum(['offen', 'uebernommen', 'verworfen']),
})

export async function ladeAnalyse(fallId: string): Promise<Fotoanalyse | null> {
  const [zeile] = await db
    .select({
      vorschlaege: fotoAnalyse.vorschlaege,
      ohneVorschlag: fotoAnalyse.ohneVorschlag,
      erstelltAm: fotoAnalyse.erstelltAm,
      laufZustand: fotoAnalyse.laufZustand,
      laufBegonnenAm: fotoAnalyse.laufBegonnenAm,
      laufFehler: fotoAnalyse.laufFehler,
    })
    .from(fotoAnalyse)
    .where(eq(fotoAnalyse.fallId, fallId))
    .limit(1)
  if (!zeile) return null

  const roh = Array.isArray(zeile.vorschlaege) ? zeile.vorschlaege : []
  const vorschlaege: Fotovorschlag[] = []
  let verworfen = 0
  for (const eintrag of roh) {
    const geprueft = vorschlagSchema.safeParse(eintrag)
    if (geprueft.success) vorschlaege.push(geprueft.data)
    else verworfen += 1
  }
  if (verworfen > 0) {
    protokolliereWarnung('fotos.analyse', 'Abgelegte Fotovorschläge passten nicht mehr zum Schema.', {
      fallId,
      anzahl: verworfen,
    })
  }

  return {
    erstelltAm: zeile.erstelltAm.toISOString(),
    vorschlaege,
    ohneVorschlag: Array.isArray(zeile.ohneVorschlag)
      ? zeile.ohneVorschlag.filter((id): id is string => typeof id === 'string')
      : [],
    laufZustand: zeile.laufZustand,
    laufBegonnenAm: zeile.laufBegonnenAm?.toISOString() ?? null,
    laufFehler: zeile.laufFehler,
  }
}

/**
 * Meldet den Hintergrundlauf an — legt die Zeile an, falls es noch keine
 * gibt, ohne dabei vorhandene Vorschläge anzurühren.
 *
 * **Warum kein zweiter Lauf startet, wenn schon einer läuft.** `foto_analyse`
 * hat eine Zeile je Fall; zwei gleichzeitige Läufe schrieben sich gegenseitig
 * die Vorschläge weg. Die Aufrufstelle prüft deshalb vorher `laufZustand`
 * (siehe `analyse-aktionen.ts`) — dieselbe Reihenfolge wie bei `wbwLauf`.
 */
export async function beginneLauf(fallId: string, angestossenVon: string | null): Promise<void> {
  const werte = {
    fallId,
    angestossenVon,
    laufZustand: 'laeuft' as const,
    laufBegonnenAm: new Date(),
    laufFehler: null,
  }
  await db
    .insert(fotoAnalyse)
    .values(werte)
    .onConflictDoUpdate({ target: fotoAnalyse.fallId, set: werte })
}

/** Meldet den Hintergrundlauf als beendet — mit oder ohne Fehler. */
export async function beendeLauf(fallId: string, fehler: string | null): Promise<void> {
  await db
    .update(fotoAnalyse)
    .set({ laufZustand: fehler ? 'fehler' : 'fertig', laufFehler: fehler })
    .where(eq(fotoAnalyse.fallId, fallId))
}

/**
 * Legt das Ergebnis eines Pakets ab — on top von dem, was der Lauf schon
 * hatte.
 *
 * Ersetzt bewusst nur `vorschlaege`/`ohneVorschlag`, nicht `laufZustand`:
 * die Zeile bleibt `laeuft`, bis `beendeLauf` das Gegenteil sagt, auch wenn
 * dazwischen mehrere Pakete nacheinander geschrieben werden.
 */
export async function speichereAnalyse(
  fallId: string,
  angestossenVon: string | null,
  vorschlaege: Fotovorschlag[],
  ohneVorschlag: string[],
): Promise<void> {
  await db
    .insert(fotoAnalyse)
    .values({ fallId, angestossenVon, vorschlaege, ohneVorschlag, erstelltAm: new Date() })
    .onConflictDoUpdate({
      target: fotoAnalyse.fallId,
      set: { vorschlaege, ohneVorschlag, angestossenVon, erstelltAm: new Date() },
    })
}

/**
 * Wirft die gespeicherte Analyse eines Falls komplett weg.
 *
 * Betrifft nur, was hier lokal steht. Was schon nach autoiXpert übernommen
 * wurde, bleibt dort unverändert stehen — dieser Weg schreibt nirgendwo nach
 * aussen, er vergisst nur, welche Vorschläge diese Anwendung schon gemacht
 * hatte. Die Aufrufstelle prüft vorher, dass kein Lauf gerade arbeitet.
 */
export async function loescheAnalyse(fallId: string): Promise<void> {
  await db.delete(fotoAnalyse).where(eq(fotoAnalyse.fallId, fallId))
}

/**
 * Vermerkt, dass ein Vorschlag übernommen oder verworfen wurde.
 *
 * Gelesen, geändert, geschrieben — ohne Sperre. Das ist hier vertretbar:
 * die Vorschläge zu einem Fall geht in diesem Haus eine Person durch, und
 * das Schlimmste, was zwei gleichzeitige Durchgänge anrichten könnten, ist
 * ein Vorschlag, der noch einmal auftaucht. Eine Sperre auf der Zeile wäre
 * dafür der grössere Aufwand als der Schaden.
 */
export async function setzeStand(
  fallId: string,
  fotoId: string,
  stand: Fotovorschlag['stand'],
  beschreibung?: string,
): Promise<void> {
  const vorhanden = await ladeAnalyse(fallId)
  if (!vorhanden) return

  const vorschlaege = vorhanden.vorschlaege.map((v) =>
    v.fotoId === fotoId ? { ...v, stand, ...(beschreibung === undefined ? {} : { beschreibung }) } : v,
  )
  await db
    .update(fotoAnalyse)
    .set({ vorschlaege })
    .where(eq(fotoAnalyse.fallId, fallId))
}
