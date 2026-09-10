/**
 * Was Server und Browser an der übergreifenden Suche teilen.
 *
 * **Warum getrennt von `global.ts`:** dort stehen die Abfragen, und die
 * ziehen `@/db` nach sich. Das Suchfeld in der Kopfleiste ist eine
 * Client-Komponente; importierte sie die Mindestlänge von dort, landete der
 * Postgres-Treiber im Browserpaket — der Bau brach mit „Module not found:
 * Can't resolve 'net'". Gemessen am 08.09.2026, zum zweiten Mal an diesem
 * Tag (siehe `wbw/urteil.ts`).
 *
 * **Die Regel dahinter:** Typen allein verschwinden beim Übersetzen, ein
 * Wert nicht. Sobald eine Client-Komponente einen *Wert* aus einem Modul
 * braucht, gehört er in eine Datei ohne Serverabhängigkeiten.
 */

export type Trefferart = 'fall' | 'stellungnahme' | 'eintrag' | 'bild'

export interface Treffer {
  art: Trefferart
  id: string
  /** Was in der Zeile steht. */
  titel: string
  /** Die Zeile darunter — Aktenzeichen, Fall, Bereich. */
  unterzeile: string | null
  pfad: string
}

export interface Suchergebnis {
  begriff: string
  treffer: Treffer[]
  /** Ob mindestens eine Art mehr hergäbe, als gezeigt wird. */
  mehr: boolean
}

/** Kürzeste Eingabe, ab der gesucht wird. */
export const MINDESTLAENGE = 2
