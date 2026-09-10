/**
 * Ein Typ für alle Rückmeldungen der Anwendung.
 *
 * **Was vorher war:** neun verschiedene Muster für dieselbe Sache. Ein
 * `<div className="hinweis fehler">` hier, ein `role="status"` dort, an einer
 * Stelle wurde am Text erraten, ob es ein Fehler ist:
 *
 *     className={`hinweis ${meldung.match(/sperr|gescheitert|nicht /i) ? 'fehler' : ''}`}
 *
 * Das ging meistens gut. „Das Bild liess sich **nicht** hochladen" wurde als
 * Fehler erkannt — „Diese Stelle steht so **nicht** mehr im Brief" auch, und
 * das war schon Glück. Wer eine Meldung umformuliert, ändert damit ihre
 * Farbe.
 *
 * **Die Regel hier:** die Art steht an der Meldung, nicht in ihrem Wortlaut.
 * Sie entscheidet über Farbe, Vorlesen und darüber, ob die Einblendung von
 * selbst verschwindet.
 */

export type Meldungsart = 'fehler' | 'warnung' | 'erfolg' | 'info'

export interface Meldung {
  art: Meldungsart
  text: string
  /** Optionale Überschrift für die Einblendung, z. B. „Recherche fertig". */
  titel?: string
}

/**
 * Was eine Serveraktion zurückgibt.
 *
 * Bisher hatte fast jede Datei ihren eigenen, inhaltsgleichen Typ —
 * `AnmeldeZustand`, `BildErgebnis`, `ImportZustand`, `Startantwort`,
 * `AktionsErgebnis`, `ExportErgebnis` und dreimal ein namenloses
 * `{ fehler?: string }`. Neuer Code nimmt diesen hier.
 */
export interface Aktionsergebnis {
  fehler?: string
  hinweis?: string
}

/** Kurzformen, damit an der Aufrufstelle die Art steht und nicht eine Farbe. */
export const fehler = (text: string, titel?: string): Meldung => ({ art: 'fehler', text, titel })
export const warnung = (text: string, titel?: string): Meldung => ({ art: 'warnung', text, titel })
export const erfolg = (text: string, titel?: string): Meldung => ({ art: 'erfolg', text, titel })
export const info = (text: string, titel?: string): Meldung => ({ art: 'info', text, titel })

/**
 * Übersetzt ein Aktionsergebnis in eine Meldung — `fehler` schlägt `hinweis`,
 * denn wenn beides dasteht, ist der Fehler die wichtigere Auskunft.
 */
export function ausErgebnis(ergebnis: Aktionsergebnis | null | undefined): Meldung | null {
  if (!ergebnis) return null
  if (ergebnis.fehler) return fehler(ergebnis.fehler)
  if (ergebnis.hinweis) return erfolg(ergebnis.hinweis)
  return null
}

/**
 * Die Rolle für Hilfsmittel.
 *
 * `alert` unterbricht den Vorlesefluss — richtig, wenn etwas schiefging, und
 * lästig bei „Gespeichert". Deshalb hängt die Rolle an der Art und wird nicht
 * an jeder Stelle neu entschieden; an einer Stelle stand `role="status"` an
 * einer Fehlermeldung.
 */
export function rolleZu(art: Meldungsart): 'alert' | 'status' {
  return art === 'fehler' || art === 'warnung' ? 'alert' : 'status'
}
