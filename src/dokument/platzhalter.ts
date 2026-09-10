/**
 * Platzhalter in eckigen Klammern.
 *
 * Beim Einfügen eines Bausteins werden die Werte gesetzt, die der Fall
 * hergibt. Was ohne Wert bleibt, bleibt **stehen** — ein offener Platzhalter
 * sperrt später den Export (R1), ein stillschweigend gelöschter fällt
 * niemandem auf. Das ist der ganze Punkt der Übung.
 */

export interface Platzhalterstand {
  text: string
  /** Platzhalter, die kein Wert füllen konnte. */
  offen: string[]
  gesetzt: number
}

export function setzeWerteEin(
  text: string,
  werte: Record<string, string>,
): Platzhalterstand {
  const offen = new Set<string>()
  let gesetzt = 0

  const gefuellt = text.replace(/\[([^\][]+)\]/g, (ganz, inhalt: string) => {
    const schluessel = inhalt.trim()
    const wert = werte[schluessel] ?? findeUnabhaengigVonGrossschreibung(werte, schluessel)
    if (wert) {
      gesetzt++
      return wert
    }
    offen.add(schluessel)
    return ganz
  })

  return { text: gefuellt, offen: [...offen], gesetzt }
}

function findeUnabhaengigVonGrossschreibung(
  werte: Record<string, string>,
  schluessel: string,
): string | undefined {
  const klein = schluessel.toLowerCase()
  for (const [k, v] of Object.entries(werte)) {
    if (k.toLowerCase() === klein) return v
  }
  return undefined
}

/* ------------------------------------------------------------------ *
 * Klammerausdruck → Knoten
 * ------------------------------------------------------------------ */

/**
 * Zerlegt einen Text in gewöhnliche Stücke und Platzhalter.
 *
 * Die eine Stelle, an der entschieden wird, was ein Platzhalter ist. Sie
 * wird von beiden Wegen benutzt: von der Reparatur beim Laden eines
 * Dokuments (auf dem Server, auf dem JSON-Baum) und vom Editor beim Tippen
 * und Einfügen (im Browser, auf dem ProseMirror-Baum). Zwei Regeln an zwei
 * Orten wären zwei Regeln, die auseinanderlaufen.
 *
 * Ausgenommen sind Markdown-Verweise `[Titel](url)`: die eckige Klammer
 * gehört dort zur Schreibweise des Verweises, nicht zu einem Platzhalter.
 */
export type Textstueck =
  | { art: 'text'; text: string }
  | { art: 'platzhalter'; schluessel: string }

const KLAMMER = /\[([^\][]+)\](\([^)]*\))?/g

export function zerlegeMitPlatzhaltern(text: string): Textstueck[] {
  const stuecke: Textstueck[] = []
  let zuletzt = 0

  for (const treffer of text.matchAll(KLAMMER)) {
    const inhalt = treffer[1]?.trim()
    const stelle = treffer.index ?? 0

    // Ein Markdown-Verweis: unverändert stehen lassen.
    if (!inhalt || treffer[2]) continue

    if (stelle > zuletzt) stuecke.push({ art: 'text', text: text.slice(zuletzt, stelle) })
    stuecke.push({ art: 'platzhalter', schluessel: inhalt })
    zuletzt = stelle + treffer[0].length
  }

  if (zuletzt < text.length) stuecke.push({ art: 'text', text: text.slice(zuletzt) })
  return stuecke
}

/** Ob in diesem Text überhaupt ein Platzhalter steckt. */
export function enthaeltPlatzhalter(text: string): boolean {
  return zerlegeMitPlatzhaltern(text).some((s) => s.art === 'platzhalter')
}
