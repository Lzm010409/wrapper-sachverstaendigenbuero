import 'server-only'
import { and, desc, eq, isNull } from 'drizzle-orm'
import { db } from '@/db'
import { meldung } from '@/db/schema'
import type { Meldungsart } from './typen'

/**
 * Meldungen, die den Blick überdauern.
 *
 * Nur für das, was im **Hintergrund** passiert. Ein Formularfehler gehört ans
 * Feld und nicht in eine Liste; hier steht, was fertig geworden oder
 * gescheitert ist, während der Benutzer woanders war.
 */

export interface Gemeldet {
  id: string
  art: Meldungsart
  titel: string
  text: string
  verweis: string | null
  quelle: string | null
  erstelltAm: string
  gelesen: boolean
}

/**
 * Hält eine Meldung fest.
 *
 * Wirft nie: eine verlorene Benachrichtigung darf den Vorgang nicht
 * mitreissen, über den sie berichtet. Ein Recherchelauf, der fertig wird und
 * daran scheitert, das zu melden, wäre die schlechtere Nachricht.
 */
export async function notiere(eintrag: {
  benutzerId: string | null
  art: Meldungsart
  titel: string
  text: string
  verweis?: string | null
  quelle?: string | null
}): Promise<void> {
  if (!eintrag.benutzerId) return
  try {
    await db.insert(meldung).values({
      benutzerId: eintrag.benutzerId,
      art: eintrag.art,
      titel: eintrag.titel,
      text: eintrag.text.slice(0, 2000),
      verweis: eintrag.verweis ?? null,
      quelle: eintrag.quelle ?? null,
    })
  } catch (fehler) {
    console.error('Meldung liess sich nicht festhalten:', fehler)
  }
}

/** Der Verlauf eines Benutzers, jüngste zuerst. */
export async function verlauf(benutzerId: string, hoechstens = 30): Promise<Gemeldet[]> {
  const zeilen = await db
    .select()
    .from(meldung)
    .where(eq(meldung.benutzerId, benutzerId))
    .orderBy(desc(meldung.erstelltAm))
    .limit(hoechstens)

  return zeilen.map((z) => ({
    id: z.id,
    art: z.art,
    titel: z.titel,
    text: z.text,
    verweis: z.verweis,
    quelle: z.quelle,
    erstelltAm: z.erstelltAm.toISOString(),
    gelesen: z.gelesenAm !== null,
  }))
}

/** Setzt alles Ungelesene auf gelesen. */
export async function alsGelesen(benutzerId: string): Promise<void> {
  await db
    .update(meldung)
    .set({ gelesenAm: new Date() })
    .where(and(eq(meldung.benutzerId, benutzerId), isNull(meldung.gelesenAm)))
}

/*
  Aufgeräumt wird beim Start des Containers, nicht hier: `starten.mjs`
  entfernt Gelesenes, das älter als 30 Tage ist. Ungelesenes bleibt stehen,
  egal wie alt — wer drei Wochen weg war, soll beim Wiederkommen sehen, was in
  der Zeit gescheitert ist.
*/
