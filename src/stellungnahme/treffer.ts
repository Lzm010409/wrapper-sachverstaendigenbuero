/**
 * Ordnet Kürzungspositionen Einträge der Argumentbibliothek zu.
 *
 * Die Suche selbst ist deterministisch und läuft ohne Modellaufruf: bei 68
 * Einträgen ist eine gewichtete Stichwortsuche augenblicklich, vorhersagbar
 * und erklärbar. Das Modell kommt erst danach ins Spiel, um die besten
 * Kandidaten einzustufen — und auch das nur als Vorschlag.
 *
 * Wichtig für die Einstufung ist die Regel aus dem Skill: nicht der
 * Bauteilname entscheidet, sondern die Begründung des Prüfdienstleisters.
 * Zwei Kürzungen können dasselbe Teil betreffen und trotzdem verschiedene
 * Gegenargumente verlangen.
 */

export type Trefferguete = 'direkt' | 'teilweise' | 'kein'

export interface Bibliothekseintrag {
  id: string
  nummer: string
  titel: string
  bereich: string
  abschnitt: string
  typischeBegruendung: string | null
  gegenargument: string | null
  vorgehen: string | null
  status: string
  haeufigkeitText: string | null
  varianten: { id: string; bezeichnung: string; text: string }[]
}

export interface Kandidat {
  eintrag: Bibliothekseintrag
  punkte: number
  guete: Trefferguete
  /** Welche Begriffe den Treffer getragen haben — macht ihn nachvollziehbar. */
  treffergruende: string[]
  /** Varianten, deren Bezeichnung zur Position passt. */
  passendeVarianten: { id: string; bezeichnung: string }[]
}

/** Wörter ohne Aussagekraft für die Zuordnung. */
const STOPPWOERTER = new Set([
  'und','oder','der','die','das','den','dem','des','ein','eine','einer','eines','einem','einen',
  'ist','sind','wird','werden','wurde','nicht','kein','keine','für','von','vom','mit','bei','als',
  'auf','aus','an','am','im','in','zu','zur','zum','dass','sich','auch','nur','über','durch','vor',
  'nach','wie','so','bzw','ggf','ca','etc','sowie','laut','gemäß','gemaess','herr','frau',
])

/** Zerlegt einen Text in vergleichbare Wortstämme. */
export function begriffe(text: string | null | undefined): string[] {
  if (!text) return []
  return text
    .toLowerCase()
    .replace(/[^a-zäöüß0-9\s-]/g, ' ')
    .split(/[\s-]+/)
    .map((w) => w.trim())
    .filter((w) => w.length >= 4 && !STOPPWOERTER.has(w))
    .map(stamm)
}

/**
 * Grobe Stammform für deutsche Substantive und Adjektive.
 *
 * Reicht für die Zuordnung: „Halterung" und „Halterungen", „Lackierung" und
 * „Lackierungen" sollen zusammenfallen, ohne dafür eine Morphologie-
 * Bibliothek einzuführen.
 */
export function stamm(wort: string): string {
  const endungen = ['ungen', 'erung', 'ungs', 'ung', 'chen', 'lein', 'nen', 'en', 'er', 'es', 'em', 'e', 'n', 's']
  let w = wort
  let geaendert = true

  // Wiederholt kürzen, bis nichts mehr passt. Ein einzelner Durchgang
  // genügt nicht: „halterungen" verliert sonst „ungen" und bleibt bei
  // „halter", während „halterung" über „erung" bei „halt" landet — zwei
  // Formen desselben Wortes fielen dann nicht zusammen.
  while (geaendert) {
    geaendert = false
    for (const endung of endungen) {
      if (w.length - endung.length >= 4 && w.endsWith(endung)) {
        w = w.slice(0, -endung.length)
        geaendert = true
        break
      }
    }
  }
  return w
}

/**
 * Ab welcher Länge ein gemeinsamer Wortteil als tragender Kern gilt.
 *
 * Sieben Zeichen sind bewusst hoch angesetzt. Bei sechs verbindet die Regel
 * „reifen" mit „greifen", bei fünf schon „lacki" in „Lackierung" und
 * „Lackiererei" — die Trefferliste füllt sich dann mit Zufallsbekannt-
 * schaften, und eine Liste, der man nicht traut, wird nicht benutzt.
 */
const KERN_MINDESTLAENGE = 7

/**
 * Prüft, ob zwei Stämme dieselbe Sache meinen.
 *
 * Deutsche Fachsprache bildet Komposita: „Lackmaterial" im Prüfbericht und
 * „Materialzuschlag" in der Bibliothek betreffen denselben Streitpunkt,
 * teilen aber kein Wort. Deshalb zählt neben der Gleichheit auch, wenn der
 * eine Stamm im anderen steckt — begrenzt auf hinreichend lange Teile,
 * damit nicht jedes „teil" alles trifft.
 */
export function begriffePassen(a: string, b: string): 'gleich' | 'kompositum' | 'nein' {
  if (a === b) return 'gleich'

  // Deckt beides ab: ein Wort steckt vollständig im anderen
  // („Stoßfänger" in „Stoßfängerhalterung"), oder zwei Komposita teilen nur
  // ein Mittelstück („Lackmaterial" und „Materialzuschlag" über „material").
  if (laengsteGemeinsameFolge(a, b) >= KERN_MINDESTLAENGE) return 'kompositum'

  return 'nein'
}

/** Länge der längsten gemeinsamen Zeichenfolge zweier Wörter. */
export function laengsteGemeinsameFolge(a: string, b: string): number {
  if (!a || !b) return 0
  let vorige = new Array<number>(b.length + 1).fill(0)
  let beste = 0

  for (let i = 1; i <= a.length; i++) {
    const aktuelle = new Array<number>(b.length + 1).fill(0)
    for (let j = 1; j <= b.length; j++) {
      if (a[i - 1] === b[j - 1]) {
        aktuelle[j] = (vorige[j - 1] ?? 0) + 1
        if (aktuelle[j]! > beste) beste = aktuelle[j]!
      }
    }
    vorige = aktuelle
  }
  return beste
}

export interface Position {
  bezeichnung: string
  begruendungVersicherer: string
  typ: string
}

const GEWICHT = {
  /** Übereinstimmung im Titel des Eintrags. */
  titel: 5,
  /**
   * Übereinstimmung mit der typischen Begründung. Höher gewichtet als der
   * Titel, weil der Skill das ausdrücklich verlangt: „Das im Kürzungsschreiben
   * tatsächlich verwendete Argument des Prüfdienstleisters bestimmt, welche
   * Variante passt — nicht nur der Bauteilname."
   */
  begruendung: 6,
  /** Übereinstimmung im Abschnitt. */
  abschnitt: 2,
  /** Übereinstimmung im Gegenargument selbst. */
  text: 1,
  /** Passende Variantenbezeichnung. */
  variante: 3,
}

/** Bewertet einen Eintrag gegen eine Position. */
export function bewerte(position: Position, eintrag: Bibliothekseintrag): Kandidat {
  const ausBezeichnung = new Set(begriffe(position.bezeichnung))
  const ausBegruendung = new Set(begriffe(position.begruendungVersicherer))

  let punkte = 0
  let genaueTreffer = 0
  const gruende = new Set<string>()

  const zaehle = (felder: string | null, quelle: Set<string>, gewicht: number) => {
    for (const b of new Set(begriffe(felder))) {
      for (const q of quelle) {
        const art = begriffePassen(b, q)
        if (art === 'gleich') {
          punkte += gewicht
          genaueTreffer++
          gruende.add(b)
          break
        }
        if (art === 'kompositum') {
          // Ein Teiltreffer über ein Kompositum ist ein Hinweis, kein Beweis.
          punkte += Math.ceil(gewicht / 2)
          gruende.add(b.length <= q.length ? b : q)
          break
        }
      }
    }
  }

  zaehle(eintrag.titel, ausBezeichnung, GEWICHT.titel)
  zaehle(eintrag.titel, ausBegruendung, GEWICHT.begruendung)
  zaehle(eintrag.typischeBegruendung, ausBegruendung, GEWICHT.begruendung)
  zaehle(eintrag.typischeBegruendung, ausBezeichnung, GEWICHT.titel)
  zaehle(eintrag.abschnitt, ausBezeichnung, GEWICHT.abschnitt)
  zaehle(eintrag.gegenargument, ausBezeichnung, GEWICHT.text)

  const passendeVarianten: { id: string; bezeichnung: string }[] = []
  for (const v of eintrag.varianten) {
    const vb = begriffe(v.bezeichnung)
    const trifft = vb.some((b) =>
      [...ausBezeichnung, ...ausBegruendung].some((q) => begriffePassen(b, q) !== 'nein'),
    )
    if (trifft) {
      punkte += GEWICHT.variante
      passendeVarianten.push({ id: v.id, bezeichnung: v.bezeichnung })
    }
  }

  // Der Bereich muss zum Kürzungstyp passen, sonst ist der Treffer wertlos.
  if (bereichPasst(position.typ, eintrag.bereich)) {
    punkte += 2
  } else {
    punkte = Math.floor(punkte / 2)
  }

  return {
    eintrag,
    punkte,
    guete: stufeEin(punkte, gruende.size, genaueTreffer),
    treffergruende: [...gruende],
    passendeVarianten,
  }
}

function bereichPasst(positionsTyp: string, bereich: string): boolean {
  if (bereich === 'sonderfall') return true
  return positionsTyp === bereich
}

/**
 * Übersetzt die Punktzahl in die Einstufung des Skills.
 *
 * Die Schwellen sind bewusst zurückhaltend: ein „direkter Treffer" behauptet,
 * der hinterlegte Text passe im Kern — das soll er nur, wenn mehrere
 * Begriffe zusammenkommen, nicht bei einem einzelnen Zufallstreffer.
 */
export function stufeEin(
  punkte: number,
  verschiedeneBegriffe: number,
  genaueTreffer: number,
): Trefferguete {
  // Ein „direkter Treffer" behauptet, der hinterlegte Text passe im Kern.
  // Das darf nicht allein auf Kompositum-Ähnlichkeit beruhen: sonst gilt
  // „Lackierräder / Montagebedarf vor Ofentrocknung" als direkter Treffer
  // für eine Kürzung des Lackierlohns, nur weil beide „lackier" enthalten.
  // Ein falsch etikettierter Vorschlag ist schlimmer als gar keiner.
  if (punkte >= 14 && verschiedeneBegriffe >= 2 && genaueTreffer >= 1) return 'direkt'
  if (punkte >= 6) return 'teilweise'
  return 'kein'
}

export interface Vorschlagsliste {
  position: Position
  kandidaten: Kandidat[]
  /** Beste erreichte Einstufung — bestimmt die Anzeige an der Position. */
  besteGuete: Trefferguete
}

/**
 * Ermittelt die Vorschläge für eine Position.
 *
 * `hoechstens` begrenzt die Liste; die volle Bibliothek bleibt in der
 * Auswahlmaske trotzdem jederzeit erreichbar (Konzept E6) — die Vorschläge
 * sind eine Abkürzung, kein Tor.
 */
export function findeVorschlaege(
  position: Position,
  eintraege: Bibliothekseintrag[],
  hoechstens = 4,
): Vorschlagsliste {
  const bewertet = eintraege
    .map((e) => bewerte(position, e))
    .filter((k) => k.guete !== 'kein')
    .sort((a, b) => b.punkte - a.punkte)

  const kandidaten = bewertet.slice(0, hoechstens)

  return {
    position,
    kandidaten,
    besteGuete: kandidaten[0]?.guete ?? 'kein',
  }
}
