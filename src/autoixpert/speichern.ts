import 'server-only'
import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { fall } from '@/db/schema'
import { leseFalldaten } from './felder'
import type { Gutachten } from './typen'

export interface GespeicherterFall {
  fallId: string
  /** `true`, wenn dafür kein Fall mit dieser autoiXpert-ID vorlag. */
  neu: boolean
}

/**
 * Legt ein Gutachten lokal ab oder aktualisiert den bestehenden Fall.
 *
 * Erkannt wird ein bereits vorhandener Fall über die autoiXpert-ID, die sich
 * nie ändert — nicht über das Aktenzeichen, das nachträglich gesetzt oder
 * geändert werden kann. Wiederholte Aufrufe mit demselben Gutachten sind
 * damit unschädlich: der zweite Aufruf aktualisiert nur, statt doppelt
 * anzulegen. Das trägt sowohl den manuellen Import (`importiereFall`) als
 * auch den Webhook — beide unterscheiden sich nur darin, woher das Gutachten
 * kommt, nicht darin, wie es abgelegt wird.
 */
export async function speichereFall(gutachten: Gutachten): Promise<GespeicherterFall> {
  const daten = leseFalldaten(gutachten)

  const vorhanden = await db
    .select({ id: fall.id })
    .from(fall)
    .where(eq(fall.autoixpertId, daten.autoixpertId))
    .limit(1)

  const bestehend = vorhanden[0]
  if (bestehend) {
    await db
      .update(fall)
      .set({
        aktenzeichen: daten.aktenzeichen,
        daten: gutachten,
        abgerufenAm: new Date(),
      })
      .where(eq(fall.id, bestehend.id))
    return { fallId: bestehend.id, neu: false }
  }

  const [angelegt] = await db
    .insert(fall)
    .values({
      aktenzeichen: daten.aktenzeichen,
      autoixpertId: daten.autoixpertId,
      daten: gutachten,
      abgerufenAm: new Date(),
    })
    .returning({ id: fall.id })
  return { fallId: angelegt!.id, neu: true }
}
