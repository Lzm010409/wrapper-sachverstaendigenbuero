/**
 * Das Fotolexikon: feste Begriffe für Teil, Seite und Beschädigungsart.
 *
 * **Warum es das gibt.** Ohne feste Vorgabe formuliert das Sprachmodell frei
 * — "Delle" hier, "Beule" dort, "eingedrückt" im nächsten Fall. Dieses Haus
 * hat ein eigenes Wording, und der Fotoassistent soll es treffen, nicht
 * erraten. Deshalb wählt die KI Teil, Seite und Beschädigungsart nur noch aus
 * dieser Liste — der Satz wird daraus zusammengesetzt, nicht formuliert.
 *
 * **Warum die Beschädigungsarten je Teil eine eigene Liste sind.** Blech und
 * Kunststoff heissen im Gutachten nicht gleich: eine Delle im Blech ist
 * "deformiert", dieselbe Verformung an einer Kunststoffverkleidung
 * "plastisch verformt". Ein einziges, geteiltes Vokabular würde diesen
 * Unterschied einebnen.
 *
 * **Keine `server-only`-Markierung.** Die Verwaltungsseite und der
 * Fotoassistent im Browser brauchen diese Typen und die Komposition; die
 * Datenbank fasst nur `lexikon-ablage.ts` an, siehe dort.
 */

export const SEITEN = ['links', 'rechts', 'vorne', 'hinten'] as const

export type Seite = (typeof SEITEN)[number]

export function istSeite(wert: string): wert is Seite {
  return (SEITEN as readonly string[]).includes(wert)
}

export interface Beschaedigungsart {
  /** Der exakte Wortlaut, der im Satz erscheint, z. B. "deformiert". */
  begriff: string
  /** Wonach die KI entscheidet, wann dieser Begriff zutrifft, statt eines anderen. */
  hinweis: string
}

export interface FotoTeil {
  id: string
  name: string
  /** Welche Seiten für dieses Teil gelten. Leer heisst: das Teil hat keine Seite. */
  seiten: Seite[]
  beschaedigungsarten: Beschaedigungsart[]
}

/**
 * Setzt aus Teil, Seite und Beschädigungsart den Hausstil-Satz zusammen.
 *
 * Gibt `null`, wenn die Kombination nicht zu einem gelisteten Teil passt —
 * das ist für den Aufrufer das Signal, auf den freien Text des Modells
 * zurückzufallen, statt einen falschen oder erfundenen Satz zu übernehmen.
 * Teil und Begriff müssen dafür Zeichen für Zeichen zu einem Lexikoneintrag
 * passen: beide kommen aus einer Auswahlliste, die dem Modell vorgegeben
 * wurde, ein Abweichen heisst also, dass sich das Modell nicht daran gehalten
 * hat.
 */
export function zusammensetzen(
  teile: readonly FotoTeil[],
  teilName: string | null,
  seite: Seite | null,
  begriff: string | null,
): string | null {
  if (!teilName || !begriff) return null

  const teil = teile.find((t) => t.name === teilName)
  if (!teil) return null
  if (!teil.beschaedigungsarten.some((b) => b.begriff === begriff)) return null

  // Ein Teil ohne Seitenbezug (z. B. eine Heckverkleidung) bekommt keine
  // Seite in den Satz — eine trotzdem mitgelieferte Seite wird ignoriert,
  // statt die sonst gültige Kombination zu verwerfen.
  if (teil.seiten.length === 0) return `${teil.name} ${begriff}`

  if (!seite || !teil.seiten.includes(seite)) return null
  return `${teil.name} ${seite} ${begriff}`
}
