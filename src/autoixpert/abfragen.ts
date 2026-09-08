import 'server-only'
import { desc, eq, sql } from 'drizzle-orm'
import { db } from '@/db'
import { fall } from '@/db/schema'

/**
 * Lesende Abfragen auf die abgelegten Fälle.
 *
 * **Warum sie hier stehen und nicht in `aktionen.ts`:** Jede exportierte
 * Funktion einer Datei mit `'use server'` ist ein aufrufbarer Endpunkt. Diese
 * drei standen dort — ohne jede Anmeldeprüfung. Wer die Kennung der Aktion
 * aus dem Browserpaket las, bekam mit einem einzigen Aufruf die letzten 100
 * Fälle samt Aktenzeichen, Anspruchsteller, Kennzeichen und der vollständigen
 * autoiXpert-Antwort — ohne Cookie, ohne Konto.
 *
 * Es ist derselbe Austritt, den `src/auth/wache.ts` für die **Seiten**
 * geschlossen hat, nur eine Ebene tiefer. Und die Lehre daraus ist dieselbe:
 * eine vergessene Prüfung fällt nicht auf. Deshalb steht hier nicht bloss
 * eine Prüfung mehr — die Funktionen sind gar kein Endpunkt mehr. Sie werden
 * nur von Serverkomponenten aufgerufen, und die verlangen die Anmeldung
 * bereits als erste Anweisung.
 *
 * `import 'server-only'` sorgt dafür, dass ein versehentlicher Import aus
 * einer Client-Komponente den Bau abbricht statt die Datei ins Browserpaket
 * zu ziehen.
 */

/** Die zuletzt abgerufenen Fälle. */
export function ladeFaelle() {
  return db
    .select({
      id: fall.id,
      aktenzeichen: fall.aktenzeichen,
      autoixpertId: fall.autoixpertId,
      daten: fall.daten,
      abgerufenAm: fall.abgerufenAm,
    })
    .from(fall)
    .orderBy(desc(fall.abgerufenAm))
    .limit(100)
}

export async function ladeFall(id: string) {
  const zeilen = await db.select().from(fall).where(eq(fall.id, id)).limit(1)
  return zeilen[0] ?? null
}

export async function zaehleFaelle(): Promise<number> {
  const zeilen = await db.select({ anzahl: sql<number>`count(*)`.mapWith(Number) }).from(fall)
  return zeilen[0]?.anzahl ?? 0
}
