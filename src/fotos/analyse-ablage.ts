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
  }
}

/**
 * Legt das Ergebnis eines Laufs ab und ersetzt dabei das vorige.
 *
 * Der Lauf ist die neue Wahrheit: die alten Vorschläge bezogen sich auf den
 * Fotosatz von damals, und ein Bild kann inzwischen ausgetauscht sein.
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
