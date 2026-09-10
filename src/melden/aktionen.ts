'use server'

import { aktuellerBenutzer } from '@/auth/sitzung'
import { alsGelesen, verlauf, type Gemeldet } from './ablage'

/**
 * Die Oberfläche fragt hier nach Meldungen aus dem Hintergrund.
 *
 * Ohne Anmeldung kommt eine leere Liste und **kein** Fehler: die Abfrage
 * läuft in einem Zeitgeber weiter, und eine abgelaufene Sitzung soll dort
 * nicht alle zwanzig Sekunden eine Ausnahme erzeugen.
 */
export async function frageMeldungenAb(): Promise<Gemeldet[]> {
  const benutzer = await aktuellerBenutzer()
  if (!benutzer) return []
  return verlauf(benutzer.id)
}

export async function markiereGelesen(): Promise<void> {
  const benutzer = await aktuellerBenutzer()
  if (!benutzer) return
  await alsGelesen(benutzer.id)
}
