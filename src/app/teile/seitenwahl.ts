/**
 * Seite und Größe aus der Adresse — für jede paginierte Liste dasselbe Muster.
 *
 * **Warum eine gemeinsame Stelle.** Fünf Listen lesen `?seite=&groesse=` aus
 * `searchParams`, rechnen daraus den Versatz für die Datenbankabfrage und
 * reichen dieselben Werte an die `Pagination`-Komponente weiter. Ohne diese
 * Stelle stünde die Zulässigkeitsprüfung der Größe fünfmal da, mit fünf
 * Gelegenheiten, sie beim nächsten Mal zu vergessen.
 *
 * **Warum clampen statt ablehnen.** Ein Wert aus der Adresse ist nie
 * vertrauenswürdig — von Hand geändert, aus einem alten Lesezeichen, ein
 * Tippfehler. `seite=0`, `seite=-5` oder `groesse=abc` sollen die Seite nicht
 * zum Absturz bringen, sondern still auf einen brauchbaren Wert fallen.
 */

/** Die wählbaren Seitengrößen, überall gleich. */
export const SEITENGROESSEN = [25, 50, 100, 200] as const

export const STANDARD_GROESSE: (typeof SEITENGROESSEN)[number] = 50

/** Nimmt einen Wert aus der Adresse — mehrfach gesetzt zählt der erste. */
function einzelwert(roh: string | string[] | undefined): string {
  return (Array.isArray(roh) ? roh[0] : roh)?.trim() ?? ''
}

export interface Seitenwahl {
  seite: number
  groesse: number
  /** `(seite - 1) * groesse` — direkt als `OFFSET` in der Abfrage verwendbar. */
  versatz: number
}

/** Liest Seite und Größe aus rohen `searchParams`, mit sicheren Grenzwerten. */
export function leseSeite(
  seiteRoh: string | string[] | undefined,
  groesseRoh: string | string[] | undefined,
): Seitenwahl {
  const seiteZahl = Number.parseInt(einzelwert(seiteRoh), 10)
  const seite = Number.isFinite(seiteZahl) && seiteZahl > 1 ? seiteZahl : 1

  const groesseZahl = Number.parseInt(einzelwert(groesseRoh), 10)
  const groesse = (SEITENGROESSEN as readonly number[]).includes(groesseZahl)
    ? groesseZahl
    : STANDARD_GROESSE

  return { seite, groesse, versatz: (seite - 1) * groesse }
}
