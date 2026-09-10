/**
 * Der Dokumentbaum einer Stellungnahme.
 *
 * Das Schreiben ist die Arbeitsfläche, nicht das Ergebnis: Betreff, Anrede,
 * Einleitung, die nummerierten Positionsabschnitte, das Ergebnis und die
 * Signatur stehen als ein zusammenhängendes Dokument in der Datenbank und
 * werden im Editor frei bearbeitet.
 *
 * Diese Datei beschreibt den Baum als reines JSON — ohne Editor-Bibliothek.
 * Erzeugen, Auslesen und Ausgeben laufen damit auf dem Server und lassen
 * sich ohne Browser prüfen; die Editor-Erweiterungen in `schema.ts` bilden
 * genau dieselbe Struktur nach.
 */

export const KNOTEN = {
  dokument: 'doc',
  absatz: 'paragraph',
  text: 'text',
  betreff: 'betreff',
  anrede: 'anrede',
  abschnitt: 'positionsAbschnitt',
  ueberschrift: 'positionsUeberschrift',
  ergebnis: 'ergebnis',
  signatur: 'signatur',
  bild: 'bild',
  platzhalter: 'platzhalter',
} as const

/** Die Marke, die eingefügten Bibliothekstext als solchen erkennbar hält. */
export const MARKE_BIBLIOTHEK = 'bibliothekstext'

export interface Marke {
  type: string
  attrs?: Record<string, unknown>
}

export interface Textknoten {
  type: 'text'
  text: string
  marks?: Marke[]
}

export interface Elementknoten {
  type: string
  attrs?: Record<string, unknown>
  content?: Knoten[]
  /**
   * Nur bei Knoten im Fliesstext — heute allein der Platzhalter.
   *
   * Ein Platzhalter mitten in einem eingefügten Baustein trägt dessen
   * Herkunftsmarke wie der Text drumherum; ohne sie risse die Spur zum
   * Bibliothekseintrag genau dort, wo noch eine Angabe fehlt.
   */
  marks?: Marke[]
}

export type Knoten = Textknoten | Elementknoten

export function istText(k: Knoten): k is Textknoten {
  return k.type === 'text'
}

/**
 * Woher ein Stück Text stammt. Trägt später die Wirkungsstatistik (F2) und
 * die Rückmeldung an die Trefferliste — deshalb hängt sie am Text und nicht
 * an einer Tabellenzeile, die das erste Umformulieren überlebt hätte.
 */
export interface Herkunftsmarke {
  eintragId: string | null
  nummer: string | null
  titel: string | null
  herkunft: 'vorschlag' | 'bibliothekssuche' | 'eigener_text' | 'formuliert'
}

/**
 * Ein Bild im Schreiben.
 *
 * Der Knoten trägt nur die Kennung und die gewünschte Breite; die Bytes
 * liegen in der Datenbank. Der **Inhalt** des Knotens ist die Beschriftung —
 * damit ist sie gewöhnlicher Text im Dokument und wird wie jeder andere
 * bearbeitet, statt in einem Feld nebenan zu leben.
 */
export interface Bildattribute {
  bildId: string
  /** Anteil der Satzspiegelbreite, 0,1 bis 1. */
  breite: number
  breitePx: number
  hoehePx: number
  dateiname: string
}

/** Voreinstellung nach Hausstil: „ca. 10–12 cm", bei 17,5 cm Satzspiegel. */
export const BILD_BREITE_STANDARD = 0.68

export function bildknoten(attrs: Bildattribute, beschriftung = ''): Elementknoten {
  return {
    type: KNOTEN.bild,
    attrs: { ...attrs },
    content: beschriftung ? [text(beschriftung)] : [],
  }
}

/**
 * Kein Typwächter, sondern eine schlichte Frage.
 *
 * Als `k is Elementknoten` geschrieben würde der Rest eines `else`-Zweigs
 * für den Übersetzer zu `never` — Bild und Absatz sind derselbe Typ, sie
 * unterscheiden sich nur im Feld `type`.
 */
export function istBild(k: Knoten): boolean {
  return !istText(k) && k.type === KNOTEN.bild
}

export function bildattribute(k: Elementknoten): Bildattribute | null {
  const a = k.attrs
  if (!a || typeof a.bildId !== 'string' || !a.bildId) return null
  const zahl = (wert: unknown, ersatz: number) =>
    typeof wert === 'number' && Number.isFinite(wert) && wert > 0 ? wert : ersatz
  return {
    bildId: a.bildId,
    breite: Math.min(1, Math.max(0.1, zahl(a.breite, BILD_BREITE_STANDARD))),
    breitePx: zahl(a.breitePx, 1000),
    hoehePx: zahl(a.hoehePx, 750),
    dateiname: typeof a.dateiname === 'string' ? a.dateiname : 'Bild',
  }
}

/** Alle Bilder im Dokument, in Reihenfolge — daraus entsteht ihre Nummer. */
export function bilder(dokument: Knoten): Elementknoten[] {
  const gefunden: Elementknoten[] = []
  for (const k of alleKnoten(dokument)) {
    if (istBild(k)) gefunden.push(k as Elementknoten)
  }
  return gefunden
}

export interface Abschnittsattribute {
  positionId: string
  bezeichnung: string
  /**
   * Nicht bestritten: der Abschnitt bleibt im Dokument, erscheint aber nicht
   * im Schreiben und bekommt keine Nummer.
   *
   * Bewusst nicht gelöscht — wer eine Position doch bestreiten will, hätte
   * sonst seinen Text verloren. Was einmal geschrieben wurde, verschwindet
   * nicht durch einen Knopfdruck am Rand.
   */
  ausgelassen?: boolean
}

/* ------------------------------------------------------------------ *
 * Bauen
 * ------------------------------------------------------------------ */

export function text(inhalt: string, marken?: Marke[]): Textknoten {
  return marken && marken.length > 0
    ? { type: 'text', text: inhalt, marks: marken }
    : { type: 'text', text: inhalt }
}

export function absatz(inhalt: string | Knoten[] = ''): Elementknoten {
  if (typeof inhalt !== 'string') return { type: KNOTEN.absatz, content: inhalt }
  return inhalt ? { type: KNOTEN.absatz, content: [text(inhalt)] } : { type: KNOTEN.absatz }
}

/**
 * Zerlegt einen Textblock in Absätze.
 *
 * Leerzeilen trennen; einfache Zeilenumbrüche innerhalb eines Absatzes
 * bleiben als Leerzeichen erhalten, weil sie im Bibliothekstext meist nur
 * vom Zeilenumbruch der Quelldatei stammen.
 */
export function absaetzeAusText(inhalt: string, marken?: Marke[]): Elementknoten[] {
  const teile = inhalt
    .split(/\n{2,}/)
    .map((t) => t.replace(/\s*\n\s*/g, ' ').trim())
    .filter(Boolean)
  if (teile.length === 0) return [absatz()]
  return teile.map((t) => absatz([text(t, marken)]))
}

export function herkunftsmarke(h: Herkunftsmarke): Marke {
  return { type: MARKE_BIBLIOTHEK, attrs: { ...h } }
}

export function abschnitt(
  attrs: Abschnittsattribute,
  ueberschrift: string,
  inhalt: Elementknoten[] = [absatz()],
): Elementknoten {
  return {
    type: KNOTEN.abschnitt,
    attrs: { ...attrs, ausgelassen: attrs.ausgelassen === true },
    content: [
      { type: KNOTEN.ueberschrift, content: ueberschrift ? [text(ueberschrift)] : [] },
      ...(inhalt.length > 0 ? inhalt : [absatz()]),
    ],
  }
}

/* ------------------------------------------------------------------ *
 * Lesen
 * ------------------------------------------------------------------ */

export function kinder(k: Knoten): Knoten[] {
  return istText(k) ? [] : (k.content ?? [])
}

/** Läuft den Baum in Dokumentreihenfolge ab. */
export function* alleKnoten(wurzel: Knoten): Generator<Knoten> {
  yield wurzel
  for (const kind of kinder(wurzel)) yield* alleKnoten(kind)
}

/** Sammelt den reinen Text eines Knotens. */
/**
 * Die Angaben eines Platzhalterknotens.
 *
 * `art` trennt zwei Dinge, die früher gleich aussahen: ein **Wert** ist
 * etwas, das eingesetzt wird (`[Kennzeichen]`), eine **Regieanweisung** ist
 * ein Arbeitsauftrag an den Schreibenden (`[Mit Screenshots belegen]`), der
 * im fertigen Brief nichts zu suchen hat. Beide sperren den Export, aber
 * aus verschiedenen Gründen — und man tut mit ihnen Verschiedenes.
 */
export interface Platzhalterattribute {
  schluessel: string
  art: 'wert' | 'regieanweisung'
}

export function platzhalterattribute(k: Elementknoten): Platzhalterattribute | null {
  const a = k.attrs
  if (!a || typeof a.schluessel !== 'string' || !a.schluessel.trim()) return null
  return {
    schluessel: a.schluessel.trim(),
    art: a.art === 'regieanweisung' ? 'regieanweisung' : 'wert',
  }
}

export function istPlatzhalter(k: Knoten): boolean {
  return !istText(k) && k.type === KNOTEN.platzhalter
}

export function knotenText(k: Knoten): string {
  if (istText(k)) return k.text
  /*
    Ein Platzhalter trägt keinen Textinhalt — sein Schlüssel steckt in den
    Angaben. Für alles, was den Baum als Text liest (Ausgabe, Wächter,
    Suche), muss er trotzdem als `[Schlüssel]` erscheinen: R1 sperrt den
    Export über genau diese Klammern, und das soll so bleiben.
  */
  if (istPlatzhalter(k)) {
    const a = platzhalterattribute(k as Elementknoten)
    return a ? `[${a.schluessel}]` : ''
  }
  const teile = kinder(k).map(knotenText)
  // Absätze innerhalb eines Knotens trennen, sonst laufen sie zusammen.
  return k.type === KNOTEN.absatz || k.type === KNOTEN.ueberschrift
    ? teile.join('')
    : teile.join('\n\n')
}

/** Alle Positionsabschnitte in Dokumentreihenfolge — das ist die Nummerierung. */
export function abschnitte(dokument: Knoten): Elementknoten[] {
  const gefunden: Elementknoten[] = []
  for (const k of alleKnoten(dokument)) {
    if (!istText(k) && k.type === KNOTEN.abschnitt) gefunden.push(k)
  }
  return gefunden
}

export function abschnittsAttribute(k: Elementknoten): Abschnittsattribute | null {
  const a = k.attrs
  if (!a || typeof a.positionId !== 'string') return null
  return {
    positionId: a.positionId,
    bezeichnung: typeof a.bezeichnung === 'string' ? a.bezeichnung : '',
    ausgelassen: a.ausgelassen === true,
  }
}

export function istAusgelassen(k: Elementknoten): boolean {
  return k.attrs?.ausgelassen === true
}

export function ueberschriftText(k: Elementknoten): string {
  const kopf = kinder(k).find((x) => !istText(x) && x.type === KNOTEN.ueberschrift)
  return kopf ? knotenText(kopf) : ''
}

/** Die Absätze eines Abschnitts ohne seine Überschrift. */
export function abschnittsInhalt(k: Elementknoten): Knoten[] {
  return kinder(k).filter((x) => istText(x) || x.type !== KNOTEN.ueberschrift)
}

/**
 * Trägt jeder Abschnitt noch seine Position?
 *
 * Ohne die Kennung wäre der Abschnitt nur noch eine Überschrift mit Text:
 * die Anmerkung am Rand fände ihn nicht mehr, die Herkunftsspur liefe ins
 * Leere, und die Wirkungsstatistik verlöre den Fall. Ein Dokument in diesem
 * Zustand wird nicht gespeichert — lieber eine Meldung als ein Schreiben,
 * das seine Verbindung zum Prüfbericht stillschweigend verloren hat.
 */
export function abschnitteVollstaendig(dokument: Elementknoten): boolean {
  return abschnitte(dokument).every(
    (a) => typeof a.attrs?.positionId === 'string' && a.attrs.positionId.length > 0,
  )
}

export function istDokument(wert: unknown): wert is Elementknoten {
  return (
    typeof wert === 'object' &&
    wert !== null &&
    (wert as { type?: unknown }).type === KNOTEN.dokument &&
    Array.isArray((wert as { content?: unknown }).content)
  )
}
