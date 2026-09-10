/**
 * Themen eines Bildes.
 *
 * Frei getippte Schlagworte statt einer festen Gliederung: Bilder lassen
 * sich schlecht in Bereiche und Abschnitte pressen — ein Kalkulationsauszug
 * kann zugleich Beilackierung, Verbringung und Materialaufschlag betreffen.
 */

export const MAX_THEMEN = 12
export const MAX_LAENGE = 60

/**
 * Zerlegt die Eingabe in Themen.
 *
 * Komma, Strichpunkt und Zeilenumbruch trennen. Doppelte fallen weg —
 * dieselbe Zeile zweimal zu vergeben hilft beim Suchen niemandem, und der
 * Filter zählte sie doppelt.
 */
export function leseThemen(eingabe: string): string[] {
  const gesehen = new Set<string>()
  const themen: string[] = []

  for (const roh of eingabe.split(/[,;\n]/)) {
    const thema = roh.trim().replace(/\s+/g, ' ').slice(0, MAX_LAENGE)
    if (!thema) continue
    const schluessel = thema.toLocaleLowerCase('de-DE')
    if (gesehen.has(schluessel)) continue
    gesehen.add(schluessel)
    themen.push(thema)
    if (themen.length >= MAX_THEMEN) break
  }

  return themen
}
