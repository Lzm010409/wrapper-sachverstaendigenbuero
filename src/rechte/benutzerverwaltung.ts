import 'server-only'
import { and, asc, eq } from 'drizzle-orm'
import { db } from '@/db'
import { benutzer, benutzerRecht } from '@/db/schema'
import { rechteVon } from './pruefen'
import { RECHTE, type Recht, type Rolle } from './katalog'

/**
 * Die Datenschicht der Benutzerverwaltung.
 *
 * **Warum es sie gibt.** Rollen wurden bis hierher über ein Skript im
 * Container-Terminal vergeben (`pnpm benutzer:anlegen`), und die Sperre eines
 * Kontos (`aktiv = false`) war überhaupt nur per SQL erreichbar — kein
 * Codepfad hat sie je gesetzt. Wer eine Mitarbeiterin sperren musste,
 * brauchte einen Datenbankzugang.
 */

export interface Benutzerzeile {
  id: string
  name: string
  email: string
  rolle: Rolle
  aktiv: boolean
  hatPasswort: boolean
  ueberEntra: boolean
  letzteAnmeldung: string | null
  /** Der tatsächliche Satz — Rolle plus Abweichungen. */
  rechte: Recht[]
  /** Nur die ausdrücklichen Entscheidungen, für die Anzeige „abweichend". */
  abweichungen: { recht: string; gewaehrt: boolean }[]
}

export async function alleBenutzer(): Promise<Benutzerzeile[]> {
  const [zeilen, abweichungen] = await Promise.all([
    db.select().from(benutzer).orderBy(asc(benutzer.name)),
    db
      .select({
        benutzerId: benutzerRecht.benutzerId,
        recht: benutzerRecht.recht,
        gewaehrt: benutzerRecht.gewaehrt,
      })
      .from(benutzerRecht),
  ])

  // Eine Abfrage für alle statt einer je Benutzer — bei zwanzig Konten wäre
  // das sonst einundzwanzig Abfragen für eine Seite.
  const nachBenutzer = new Map<string, { recht: string; gewaehrt: boolean }[]>()
  for (const a of abweichungen) {
    const liste = nachBenutzer.get(a.benutzerId) ?? []
    liste.push({ recht: a.recht, gewaehrt: a.gewaehrt })
    nachBenutzer.set(a.benutzerId, liste)
  }

  return zeilen.map((z) => {
    const eigene = nachBenutzer.get(z.id) ?? []
    return {
      id: z.id,
      name: z.name,
      email: z.email,
      rolle: z.rolle,
      aktiv: z.aktiv,
      hatPasswort: z.passwortHash !== null,
      ueberEntra: z.entraOid !== null,
      letzteAnmeldung: z.letzteAnmeldung?.toISOString() ?? null,
      rechte: [...rechteVon(z.rolle, eigene)],
      abweichungen: eigene,
    }
  })
}

/** Setzt ein einzelnes Recht — oder löscht die Abweichung wieder heraus. */
export async function setzeRecht(
  benutzerId: string,
  recht: Recht,
  /** `null` heisst: zurück auf das, was die Rolle mitbringt. */
  gewaehrt: boolean | null,
  gesetztVon: string,
): Promise<void> {
  if (gewaehrt === null) {
    // `and(...)`, nicht `&&`: das JavaScript-Und gibt hier den zweiten
    // Ausdruck zurück, und die Bedingung wäre allein `recht = …` — das
    // löschte die Abweichung bei **allen** Benutzern.
    await db
      .delete(benutzerRecht)
      .where(and(eq(benutzerRecht.benutzerId, benutzerId), eq(benutzerRecht.recht, recht)))
    return
  }
  await db
    .insert(benutzerRecht)
    .values({ benutzerId, recht, gewaehrt, gesetztVon })
    .onConflictDoUpdate({
      target: [benutzerRecht.benutzerId, benutzerRecht.recht],
      set: { gewaehrt, gesetztVon, gesetztAm: new Date() },
    })
}

export async function setzeRolle(benutzerId: string, rolle: Rolle): Promise<void> {
  await db.update(benutzer).set({ rolle }).where(eq(benutzer.id, benutzerId))
}

export async function setzeAktiv(benutzerId: string, aktiv: boolean): Promise<void> {
  await db.update(benutzer).set({ aktiv }).where(eq(benutzer.id, benutzerId))
}

/** Zählt, wie viele Konten die Benutzerverwaltung noch bedienen könnten. */
export async function verwalterAusser(benutzerId: string): Promise<number> {
  const alle = await alleBenutzer()
  return alle.filter(
    (b) => b.id !== benutzerId && b.aktiv && b.rechte.includes('benutzer.verwalten'),
  ).length
}

export { RECHTE }
