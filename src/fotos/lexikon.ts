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
  /** Wie sich das Teil optisch von Nachbarteilen abgrenzt (z. B. Kotflügel vs. Tür). */
  erkennungsmerkmal: string | null
  beschaedigungsarten: Beschaedigungsart[]
}

/** Ein roher Treffer, wie ihn das Modell für ein Foto liefert — vor der Prüfung. */
export interface Rohtreffer {
  teil: string
  seite: Seite | null
  begriff: string
}

/**
 * Prüft einen einzelnen Treffer gegen das Lexikon und baut seine Klausel.
 *
 * Gibt `null`, wenn der Treffer nicht zu einem gelisteten Teil passt — das
 * ist das Signal, genau diesen Treffer zu verwerfen, ohne die übrigen
 * anzutasten. Teil und Begriff müssen dafür Zeichen für Zeichen zu einem
 * Lexikoneintrag passen: beide kommen aus einer Auswahlliste, die dem
 * Modell vorgegeben wurde, ein Abweichen heisst also, dass sich das Modell
 * nicht daran gehalten hat.
 */
function klausel(teile: readonly FotoTeil[], treffer: Rohtreffer): string | null {
  const teil = teile.find((t) => t.name === treffer.teil)
  if (!teil) return null
  if (!teil.beschaedigungsarten.some((b) => b.begriff === treffer.begriff)) return null

  // Ein Teil ohne Seitenbezug (z. B. eine Heckverkleidung) bekommt keine
  // Seite in den Satz — eine trotzdem mitgelieferte Seite wird ignoriert,
  // statt die sonst gültige Kombination zu verwerfen.
  if (teil.seiten.length === 0) return `${teil.name} ${treffer.begriff}`

  if (!treffer.seite || !teil.seiten.includes(treffer.seite)) return null
  return `${teil.name} ${treffer.seite} ${treffer.begriff}`
}

/**
 * Setzt aus mehreren Teil/Seite/Beschädigungsart-Treffern den Hausstil-Satz
 * zusammen — eine Klausel je gültigem Treffer, durch Komma getrennt.
 *
 * Jeder Treffer wird einzeln geprüft: passt er nicht zu einem gelisteten
 * Teil, zur zugehörigen Beschädigungsart oder zur erlaubten Seite, fällt
 * **nur dieser eine Treffer** heraus — nicht die übrigen. Bleibt am Ende
 * kein gültiger Treffer übrig (auch bei einem leeren Array), gibt die
 * Funktion `null` zurück — das Signal für den Aufrufer, auf den freien Text
 * des Modells zurückzufallen.
 */
export function zusammensetzen(
  teile: readonly FotoTeil[],
  treffer: readonly Rohtreffer[],
): string | null {
  const klauseln = treffer.map((t) => klausel(teile, t)).filter((k): k is string => k !== null)
  return klauseln.length > 0 ? klauseln.join(', ') : null
}

/**
 * Fügt einen Treffer der aktiven Liste hinzu, oder entfernt ihn wieder,
 * falls exakt derselbe (teil, seite, begriff) schon aktiv ist — das
 * Toggle-Verhalten der Chips im Klickmenü des Prüfmodus (`foto-assistent.
 * tsx`). Anders als beim KI-Vorschlag gibt es hier keine Ein-Treffer-Grenze:
 * ein Mensch klickt nur an, was er wirklich sieht.
 */
export function toggleTreffer(aktiv: readonly Rohtreffer[], neu: Rohtreffer): Rohtreffer[] {
  const index = aktiv.findIndex(
    (r) => r.teil === neu.teil && r.seite === neu.seite && r.begriff === neu.begriff,
  )
  if (index === -1) return [...aktiv, neu]
  return aktiv.filter((_, i) => i !== index)
}
