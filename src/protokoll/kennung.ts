import { randomInt } from 'node:crypto'

/**
 * Eine kurze Kennung für einen Fehler.
 *
 * Sie ist die **Brücke zwischen dem, was der Benutzer sieht, und dem, was im
 * Protokoll steht**. Ohne sie beginnt jede Fehlermeldung mit „bei mir ging
 * gerade irgendwas nicht", und die Suche im Protokoll ist eine Suche nach
 * einem Zeitpunkt, den niemand genau weiss.
 *
 * **Warum sie so aussieht.** Sie wird am Telefon durchgegeben und von Hand
 * abgetippt. Deshalb acht Zeichen aus einem Alphabet ohne die Paare, die
 * sich verwechseln lassen — kein I neben 1, kein O neben 0 — und ein
 * Bindestrich in der Mitte, weil sich Vierergruppen leichter vorlesen.
 *
 * Sie ist **kein Geheimnis**: sie zeigt nur, wo im Protokoll zu suchen ist,
 * und gibt für sich genommen nichts preis.
 */

/** Ohne I, L, O, U, 0 und 1 — die Zeichen, die man sich vorlesen kann. */
const ZEICHEN = 'ABCDEFGHJKMNPQRSTVWXYZ23456789'

export function neueKennung(): string {
  let wert = ''
  for (let i = 0; i < 8; i++) {
    if (i === 4) wert += '-'
    wert += ZEICHEN[randomInt(ZEICHEN.length)]
  }
  return wert
}

/** Erkennt eine Kennung im Text — damit die Suche im Protokoll sie findet. */
export const KENNUNGSMUSTER = /\b[A-Z2-9]{4}-[A-Z2-9]{4}\b/
