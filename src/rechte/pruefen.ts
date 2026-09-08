import { ROLLENRECHTE, istRecht, type Recht, type Rolle } from './katalog'

/**
 * Aus Rolle und Abweichungen wird der tatsächliche Satz Rechte.
 *
 * Bewusst ohne Datenbank und ohne `server-only`: das ist reine Rechnung, und
 * sie soll ohne Aufbau prüfbar sein. Wer die Zeilen liest, steht in
 * `zugriff.ts`.
 */

export interface Abweichung {
  recht: string
  gewaehrt: boolean
}

/**
 * Die Reihenfolge ist die Aussage: **eine ausdrückliche Entscheidung schlägt
 * die Rolle** — in beide Richtungen. Wer einem Freigeber das Löschen
 * abnimmt, will genau das, auch wenn seine Rolle es mitbringt.
 *
 * Unbekannte Rechte in den Abweichungen werden übergangen. Sie entstehen,
 * wenn ein Recht aus dem Katalog verschwindet, während in der Datenbank noch
 * Zeilen dazu stehen; die sollen nichts kaputtmachen.
 */
export function rechteVon(rolle: Rolle, abweichungen: Abweichung[] = []): Set<Recht> {
  const satz = new Set<Recht>(ROLLENRECHTE[rolle] ?? [])
  for (const a of abweichungen) {
    if (!istRecht(a.recht)) continue
    if (a.gewaehrt) satz.add(a.recht)
    else satz.delete(a.recht)
  }
  return satz
}

export function hatRecht(
  rolle: Rolle,
  abweichungen: Abweichung[],
  recht: Recht,
): boolean {
  return rechteVon(rolle, abweichungen).has(recht)
}
