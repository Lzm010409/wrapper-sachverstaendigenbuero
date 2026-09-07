/**
 * Das Nötigste an HTML-Verarbeitung — bewusst ohne Parser-Abhängigkeit.
 *
 * Gebraucht werden drei Dinge: den Text eines Fragments lesen, ein Attribut
 * lesen, und eine flache Liste gleichartiger Elemente durchgehen. Ein
 * vollständiger DOM-Baum wäre dafür ein grosses Werkzeug für eine kleine
 * Aufgabe — und würde nichts robuster machen, denn brüchig sind hier nicht
 * die Klammern, sondern die Klassennamen, die Kleinanzeigen jederzeit ändert.
 * Genau deshalb liest `suchseite.ts` die Werte an ihrer **Form** ab
 * (`210.000 km`, `EZ 03/2009`) und nicht an einer CSS-Klasse.
 */

/** Die benannten Entitäten, die auf diesen Seiten wirklich vorkommen. */
const NAMEN: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  euro: '€',
  auml: 'ä',
  ouml: 'ö',
  uuml: 'ü',
  Auml: 'Ä',
  Ouml: 'Ö',
  Uuml: 'Ü',
  szlig: 'ß',
  eacute: 'é',
  deg: '°',
  ndash: '–',
  mdash: '—',
  hellip: '…',
  laquo: '«',
  raquo: '»',
  bdquo: '„',
  ldquo: '“',
  rdquo: '”',
  shy: '',
}

/** Löst HTML-Entitäten auf: benannt, dezimal (`&#8364;`) und hexadezimal. */
export function dekodiere(text: string): string {
  return text.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (ganz, kern: string) => {
    if (kern.startsWith('#')) {
      const zahl = kern[1] === 'x' || kern[1] === 'X'
        ? Number.parseInt(kern.slice(2), 16)
        : Number.parseInt(kern.slice(1), 10)
      return Number.isFinite(zahl) && zahl > 0 ? String.fromCodePoint(zahl) : ganz
    }
    const ersatz = NAMEN[kern]
    return ersatz === undefined ? ganz : ersatz
  })
}

/**
 * Der sichtbare Text eines HTML-Fragments.
 *
 * `<script>` und `<style>` fliegen samt Inhalt heraus — sonst stünde der
 * JavaScript-Quelltext der Seite im Ergebnis. Jedes übrige Tag wird zu einem
 * Leerzeichen, damit `<span>a</span><span>b</span>` nicht zu `ab` verklebt.
 */
export function zuText(fragment: string): string {
  return dekodiere(
    fragment
      .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<[^>]*>/g, ' '),
  )
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Der Wert eines Attributs im **Start-Tag** eines Fragments. */
export function attribut(startTag: string, name: string): string | null {
  const treffer = new RegExp(`\\s${name}\\s*=\\s*"([^"]*)"`, 'i').exec(startTag)
  if (treffer?.[1] !== undefined) return dekodiere(treffer[1])
  const ohneAnfuehrung = new RegExp(`\\s${name}\\s*=\\s*'([^']*)'`, 'i').exec(startTag)
  return ohneAnfuehrung?.[1] !== undefined ? dekodiere(ohneAnfuehrung[1]) : null
}

/**
 * Zerlegt ein Dokument in die Fragmente eines Elements, z. B. alle
 * `<article>…</article>`.
 *
 * Gilt nur für **nicht verschachtelte** Elemente — bei den Trefferkarten der
 * Suchseite und den Detailzeilen einer Anzeige ist das der Fall (an der
 * echten Seite geprüft: 27 mal `<article`, 27 mal `</article>`). Für
 * verschachtelte Elemente wäre das Verfahren falsch, und es wird dafür auch
 * nirgends verwendet.
 */
export function elemente(html: string, tag: string): string[] {
  const gefunden: string[] = []
  const start = new RegExp(`<${tag}\\b[^>]*>`, 'gi')
  const ende = `</${tag}>`
  let treffer: RegExpExecArray | null
  while ((treffer = start.exec(html)) !== null) {
    const schluss = html.indexOf(ende, start.lastIndex)
    if (schluss === -1) break
    gefunden.push(html.slice(treffer.index, schluss + ende.length))
  }
  return gefunden
}

/** Das Element mit einer bestimmten `id`, samt Inhalt. */
export function elementMitId(html: string, tag: string, id: string): string | null {
  for (const stueck of elemente(html, tag)) {
    const startTag = /^<[^>]*>/.exec(stueck)?.[0] ?? ''
    if (attribut(startTag, 'id') === id) return stueck
  }
  return null
}

/** Eine deutsche Zahl (`210.000`, `1.234,56`) als `number`, sonst `null`. */
export function zahl(text: string | null | undefined): number | null {
  if (!text) return null
  const treffer = /-?\d[\d.]*(?:,\d+)?/.exec(text.replace(/\s/g, ''))
  if (!treffer) return null
  const wert = Number.parseFloat(treffer[0].replace(/\./g, '').replace(',', '.'))
  return Number.isFinite(wert) ? wert : null
}
