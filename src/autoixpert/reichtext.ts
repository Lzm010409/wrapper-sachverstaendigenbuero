/**
 * Freitextfelder aus autoiXpert kommen als **HTML**, nicht als Text.
 *
 * Gemessen am 07.09.2026 an einem echten Gutachten:
 *
 *     car.damage_description        <p>- Hecktür strukturell beschädigt -&gt; ersetzen</p><p>…
 *     car.unrepaired_previous_damage <p>-&gt; Felge hinten rechts Bordsteinschaden</p>
 *     accident.circumstances        <p>Beim Rangieren gegen …</p>
 *     accident.plausibility         <p>Der Unfallhergang ist …</p>
 *     car.repaired_previous_damage  <p>augenscheinlich keine erkennbar</p>
 *
 * Wer sie als Text ausgibt, zeigt dem Sachverständigen `<p>` und `-&gt;`.
 * Nicht alle Felder sind betroffen — `car.roadworthiness` etwa ist blanker
 * Text. Diese Umsetzung muss deshalb beides können.
 *
 * **Warum kein `dangerouslySetInnerHTML`:** Der Text stammt aus einem
 * Fremdsystem und ist letztlich von Menschen eingegeben. Hier entstehen
 * ausschliesslich Textknoten und eine feste, kleine Menge Auszeichnungen;
 * alles Übrige wird verworfen. Damit kann fremder Inhalt gar nicht erst zu
 * Markup werden — nicht durch Filtern, sondern durch Bauart.
 */

export interface Textteil {
  text: string
  fett?: boolean
  kursiv?: boolean
}

export interface Absatz {
  art: 'absatz' | 'punkt'
  teile: Textteil[]
}

/** Auszeichnungen, die übernommen werden. Alles andere fällt weg. */
const FETT = new Set(['b', 'strong'])
const KURSIV = new Set(['i', 'em'])
/** Marken, die einen neuen Absatz beginnen. */
const ABSATZ = new Set(['p', 'div', 'br', 'li', 'tr'])
/** Marken, deren Inhalt gar nicht erst übernommen wird. */
const STUMM = new Set(['script', 'style', 'head', 'title'])

const BENANNT: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  auml: 'ä',
  ouml: 'ö',
  uuml: 'ü',
  Auml: 'Ä',
  Ouml: 'Ö',
  Uuml: 'Ü',
  szlig: 'ß',
  euro: '€',
  ndash: '–',
  mdash: '—',
  hellip: '…',
  bdquo: '„',
  ldquo: '“',
  rdquo: '”',
  sbquo: '‚',
  lsquo: '‘',
  rsquo: '’',
}

/** Löst HTML-Entitäten auf — benannte wie numerische. */
export function loeseEntitaeten(text: string): string {
  return text.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (ganz, inhalt: string) => {
    if (inhalt.startsWith('#')) {
      const zahl = inhalt[1] === 'x' || inhalt[1] === 'X'
        ? Number.parseInt(inhalt.slice(2), 16)
        : Number.parseInt(inhalt.slice(1), 10)
      // Ungültige oder gefährlich hohe Werte bleiben, wie sie sind.
      if (!Number.isFinite(zahl) || zahl < 1 || zahl > 0x10ffff) return ganz
      return String.fromCodePoint(zahl)
    }
    return BENANNT[inhalt] ?? ganz
  })
}

/**
 * Zerlegt einen Wert aus autoiXpert in Absätze.
 *
 * Enthält er kein Markup, wird er als **ein** Absatz zurückgegeben — an
 * Zeilenumbrüchen getrennt, damit auch reiner Text mit Umbrüchen richtig
 * steht.
 */
export function zuAbsaetzen(wert: string | null | undefined): Absatz[] {
  if (!wert) return []

  const enthaeltMarkup = /<[a-zA-Z/][^>]*>/.test(wert)
  if (!enthaeltMarkup) {
    return wert
      .split(/\r?\n/)
      .map((zeile) => loeseEntitaeten(zeile).trim())
      .filter(Boolean)
      .map((text) => ({ art: 'absatz' as const, teile: [{ text }] }))
  }

  const absaetze: Absatz[] = []
  let laufend: Absatz | null = null
  let fett = 0
  let kursiv = 0
  let stumm = 0
  let listenTiefe = 0

  const beginneAbsatz = (art: Absatz['art']) => {
    if (laufend && laufend.teile.length === 0) {
      laufend.art = art
      return
    }
    laufend = { art, teile: [] }
    absaetze.push(laufend)
  }

  const fuegeText = (roh: string) => {
    if (stumm > 0) return
    const text = loeseEntitaeten(roh).replace(/\s+/g, ' ')
    if (!text.trim()) return
    if (!laufend) beginneAbsatz(listenTiefe > 0 ? 'punkt' : 'absatz')
    const teil: Textteil = { text }
    if (fett > 0) teil.fett = true
    if (kursiv > 0) teil.kursiv = true
    laufend!.teile.push(teil)
  }

  // Ein einziger Durchlauf: Marke oder Text, nichts dazwischen.
  const marken = /<\/?([a-zA-Z][a-zA-Z0-9]*)[^>]*>/g
  let zuletzt = 0
  let treffer: RegExpExecArray | null

  while ((treffer = marken.exec(wert)) !== null) {
    if (treffer.index > zuletzt) fuegeText(wert.slice(zuletzt, treffer.index))
    zuletzt = marken.lastIndex

    const name = (treffer[1] ?? '').toLowerCase()
    const schliessend = treffer[0].startsWith('</')

    if (STUMM.has(name)) {
      stumm += schliessend ? -1 : 1
      if (stumm < 0) stumm = 0
      continue
    }
    if (FETT.has(name)) fett = Math.max(0, fett + (schliessend ? -1 : 1))
    else if (KURSIV.has(name)) kursiv = Math.max(0, kursiv + (schliessend ? -1 : 1))
    else if (name === 'ul' || name === 'ol') {
      listenTiefe = Math.max(0, listenTiefe + (schliessend ? -1 : 1))
    } else if (ABSATZ.has(name) && !schliessend) {
      beginneAbsatz(name === 'li' || listenTiefe > 0 ? 'punkt' : 'absatz')
    } else if (ABSATZ.has(name) && schliessend) {
      laufend = null
    }
  }
  if (zuletzt < wert.length) fuegeText(wert.slice(zuletzt))

  return absaetze.map(raeumeAuf).filter((a) => a.teile.length > 0)
}

/**
 * Räumt einen Absatz auf: gleich ausgezeichnete Nachbarn werden verschmolzen,
 * doppelte Leerzeichen fallen weg, und der Absatz beginnt und endet ohne
 * Leerraum.
 *
 * Nötig, weil eine entfernte Marke zwei Textstücke hinterlässt: aus
 * `Text <img …> weiter` wurden „Text " und „ weiter" — zusammengesetzt mit
 * zwei Leerzeichen dazwischen.
 */
function raeumeAuf(absatz: Absatz): Absatz {
  const teile: Textteil[] = []
  for (const teil of absatz.teile) {
    const vorher = teile[teile.length - 1]
    const gleich =
      vorher && Boolean(vorher.fett) === Boolean(teil.fett) &&
      Boolean(vorher.kursiv) === Boolean(teil.kursiv)
    if (gleich) vorher!.text += teil.text
    else teile.push({ ...teil })
  }

  for (const teil of teile) teil.text = teil.text.replace(/\s{2,}/g, ' ')
  const erster = teile[0]
  const letzter = teile[teile.length - 1]
  if (erster) erster.text = erster.text.replace(/^\s+/, '')
  if (letzter) letzter.text = letzter.text.replace(/\s+$/, '')

  return { art: absatz.art, teile: teile.filter((t) => t.text.length > 0) }
}

/**
 * Derselbe Inhalt als reiner Text — für Stellen, an denen kein Platz für
 * Absätze ist (Listenzeilen, Kurzübersichten) und für die Weitergabe an
 * andere Bausteine.
 */
export function alsText(wert: string | null | undefined): string {
  return zuAbsaetzen(wert)
    .map((a) => (a.art === 'punkt' ? '• ' : '') + a.teile.map((t) => t.text).join(''))
    .join('\n')
}
