import 'server-only'
import { and, asc, eq, ne, sql } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '@/db'
import { fotoTeil } from '@/db/schema'
import { protokolliereWarnung } from '@/protokoll'
import type { Beschaedigungsart, FotoTeil } from './lexikon'

/**
 * Die Datenschicht des Fotolexikons.
 *
 * **Warum die Beschädigungsarten beim Lesen noch einmal geprüft werden.** In
 * der jsonb-Spalte steht, was beim Schreiben hineinpasste — nicht das, was
 * der heutige Code erwartet. Was nicht mehr passt, fällt beim Lesen still
 * heraus, statt die ganze Seite mitzunehmen (dasselbe Vorgehen wie in
 * `fotos/analyse-ablage.ts`).
 */

const beschaedigungsartSchema = z.object({ begriff: z.string(), hinweis: z.string() })

export interface FotoTeilEingabe {
  name: string
  /** Wie sich das Teil optisch von Nachbarteilen abgrenzt. Optional. */
  erkennungsmerkmal: string | null
  beschaedigungsarten: Beschaedigungsart[]
}

export async function ladeLexikon(): Promise<FotoTeil[]> {
  const zeilen = await db.select().from(fotoTeil).orderBy(asc(fotoTeil.name))

  return zeilen.map((z) => {
    const roh = Array.isArray(z.beschaedigungsarten) ? z.beschaedigungsarten : []
    const beschaedigungsarten: Beschaedigungsart[] = []
    let verworfen = 0
    for (const eintrag of roh) {
      const geprueft = beschaedigungsartSchema.safeParse(eintrag)
      if (geprueft.success) beschaedigungsarten.push(geprueft.data)
      else verworfen += 1
    }
    if (verworfen > 0) {
      protokolliereWarnung('fotos.lexikon', 'Abgelegte Beschädigungsarten passten nicht zum Schema.', {
        teilId: z.id,
        anzahl: verworfen,
      })
    }

    return {
      id: z.id,
      name: z.name,
      erkennungsmerkmal: z.erkennungsmerkmal,
      beschaedigungsarten,
    }
  })
}

/**
 * Ob der Name schon vergeben ist — geprüft vor dem Schreiben, damit die
 * Aktion eine verständliche Meldung geben kann statt den rohen
 * Datenbankfehler des Unique-Index `foto_teil_name_idx` durchzureichen.
 */
export async function nameVergeben(name: string, ausgenommenId?: string): Promise<boolean> {
  const bedingung = sql`lower(${fotoTeil.name}) = lower(${name})`
  const [treffer] = await db
    .select({ id: fotoTeil.id })
    .from(fotoTeil)
    .where(ausgenommenId ? and(bedingung, ne(fotoTeil.id, ausgenommenId)) : bedingung)
    .limit(1)
  return Boolean(treffer)
}

/** Legt einen Teil neu an oder ändert ihn, wenn `id` gesetzt ist. */
export async function speichereTeil(
  eingabe: FotoTeilEingabe,
  benutzerId: string,
  id?: string,
): Promise<void> {
  if (id) {
    await db
      .update(fotoTeil)
      .set({ ...eingabe, geaendertAm: new Date() })
      .where(eq(fotoTeil.id, id))
    return
  }
  await db.insert(fotoTeil).values({ ...eingabe, erstelltVon: benutzerId })
}

export async function loescheTeil(id: string): Promise<void> {
  await db.delete(fotoTeil).where(eq(fotoTeil.id, id))
}
