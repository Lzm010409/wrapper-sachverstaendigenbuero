/**
 * Das Fotolexikon: feste Begriffe für Teil, Achsen und Beschädigungsart.
 *
 * **Warum es das gibt.** Ohne feste Vorgabe formuliert das Sprachmodell frei
 * — "Delle" hier, "Beule" dort, "eingedrückt" im nächsten Fall. Dieses Haus
 * hat ein eigenes Wording, und der Fotoassistent soll es treffen, nicht
 * erraten. Deshalb wählt die KI Teil, Achsen und Beschädigungsart nur noch
 * aus dieser Liste — der Satz wird daraus zusammengesetzt, nicht formuliert.
 *
 * **Warum die Beschädigungsarten je Teil eine eigene Liste sind.** Blech und
 * Kunststoff heissen im Gutachten nicht gleich: eine Delle im Blech ist
 * "deformiert", dieselbe Verformung an einer Kunststoffverkleidung
 * "plastisch verformt". Ein einziges, geteiltes Vokabular würde diesen
 * Unterschied einebnen.
 *
 * **Drei unabhängige Achsen statt einer Seite.** Längsachse (vorne/hinten),
 * Querachse (links/rechts) und Höhenachse (oben/unten/mittig) lassen sich
 * beliebig kombinieren ("vorne links oben") oder ganz weglassen — anders als
 * früher gilt das für jedes Teil gleich, es gibt keine Teil-Restriktion
 * mehr, welche Achsen für ein bestimmtes Teil überhaupt zulässig wären.
 *
 * **Keine `server-only`-Markierung.** Die Verwaltungsseite und der
 * Fotoassistent im Browser brauchen diese Typen und die Komposition; die
 * Datenbank fasst nur `lexikon-ablage.ts` an, siehe dort.
 */

export const LAENGSACHSEN = ['vorne', 'hinten'] as const

export type Laengsachse = (typeof LAENGSACHSEN)[number]

export function istLaengsachse(wert: string): wert is Laengsachse {
  return (LAENGSACHSEN as readonly string[]).includes(wert)
}

export const QUERACHSEN = ['links', 'rechts'] as const

export type Querachse = (typeof QUERACHSEN)[number]

export function istQuerachse(wert: string): wert is Querachse {
  return (QUERACHSEN as readonly string[]).includes(wert)
}

export const HOEHENACHSEN = ['oben', 'unten', 'mittig'] as const

export type Hoehenachse = (typeof HOEHENACHSEN)[number]

export function istHoehenachse(wert: string): wert is Hoehenachse {
  return (HOEHENACHSEN as readonly string[]).includes(wert)
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
  /** Wie sich das Teil optisch von Nachbarteilen abgrenzt (z. B. Kotflügel vs. Tür). */
  erkennungsmerkmal: string | null
  beschaedigungsarten: Beschaedigungsart[]
}

/** Ein roher Treffer, wie ihn das Modell für ein Foto liefert — vor der Prüfung. */
export interface Rohtreffer {
  teil: string
  laengs: Laengsachse | null
  quer: Querachse | null
  hoehe: Hoehenachse | null
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
 * nicht daran gehalten hat. Die drei Achsen werden nicht gegen eine
 * Teil-Konfiguration geprüft — es gibt keine, jedes Teil erlaubt jede
 * Kombination —, sondern nur, wenn gesetzt, in fester Reihenfolge
 * (Längs → Quer → Höhe) in den Satz eingereiht.
 */
function klausel(teile: readonly FotoTeil[], treffer: Rohtreffer): string | null {
  const teil = teile.find((t) => t.name === treffer.teil)
  if (!teil) return null
  if (!teil.beschaedigungsarten.some((b) => b.begriff === treffer.begriff)) return null

  const achsen = [treffer.laengs, treffer.quer, treffer.hoehe].filter(
    (a): a is Exclude<typeof a, null> => a !== null,
  )
  return [teil.name, ...achsen, treffer.begriff].join(' ')
}

/**
 * Setzt aus mehreren Teil/Achsen/Beschädigungsart-Treffern den Hausstil-Satz
 * zusammen — eine Klausel je gültigem Treffer, durch Komma getrennt.
 *
 * Jeder Treffer wird einzeln geprüft: passt er nicht zu einem gelisteten
 * Teil oder zur zugehörigen Beschädigungsart, fällt **nur dieser eine
 * Treffer** heraus — nicht die übrigen. Bleibt am Ende kein gültiger
 * Treffer übrig (auch bei einem leeren Array), gibt die Funktion `null`
 * zurück — das Signal für den Aufrufer, auf den freien Text des Modells
 * zurückzufallen.
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
 * falls exakt derselbe (teil, alle drei Achsen, begriff) schon aktiv ist —
 * das Toggle-Verhalten der Chips im Klickmenü des Prüfmodus und der
 * normalen Fotobearbeitung (`foto-assistent.tsx`). Anders als beim
 * KI-Vorschlag gibt es hier keine Ein-Treffer-Grenze: ein Mensch klickt nur
 * an, was er wirklich sieht.
 */
export function toggleTreffer(aktiv: readonly Rohtreffer[], neu: Rohtreffer): Rohtreffer[] {
  const index = aktiv.findIndex(
    (r) =>
      r.teil === neu.teil &&
      r.laengs === neu.laengs &&
      r.quer === neu.quer &&
      r.hoehe === neu.hoehe &&
      r.begriff === neu.begriff,
  )
  if (index === -1) return [...aktiv, neu]
  return aktiv.filter((_, i) => i !== index)
}
