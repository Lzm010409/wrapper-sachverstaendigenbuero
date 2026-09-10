import { attribut, dekodiere, elemente, zuText } from './html'

/**
 * Liest eine Trefferseite von Kleinanzeigen.
 *
 * **Warum an der Form und nicht an der CSS-Klasse:** Kleinanzeigen hat die
 * Suchergebnisseite auf ein neues Frontend umgestellt. Die Selektoren des
 * bisherigen Dienstes (`h2.text-module-begin a.ellipsis`,
 * `p.aditem-main--middle--price-shipping--price`) greifen dort ins Leere; die
 * Klassen heissen jetzt `text-title3 font-strong text-secondary`. Genau
 * solche Namen ändern sich wieder. Was sich nicht ändert, ist die **Gestalt
 * der Werte**: ein Preis endet auf `€`, eine Laufleistung auf `km`, eine
 * Erstzulassung steht als `EZ 03/2009`, ein Ort beginnt mit fünf Ziffern.
 * Daran wird gelesen.
 *
 * **Ein Fund nebenbei:** Die neue Trefferliste trägt Laufleistung und
 * Erstzulassung bereits mit — beim bisherigen Dienst standen sie nur auf der
 * Detailseite („Weder Kilometerstand noch Erstzulassung stehen in der
 * Liste"). Sie werden hier mitgegeben; wer sie nicht braucht, übersieht sie.
 */

export interface Treffer {
  adid: string
  url: string
  title: string
  /** Preis in Euro als Zeichenkette, wie der bisherige Dienst ihn liefert. */
  price: string
  location: string
  description: string
  published_at: string | null
  /** Zusätzlich zum bisherigen Dienst: Laufleistung in km. */
  kilometerstand: number | null
  /** Zusätzlich: Erstzulassung als `MM/JJJJ`. */
  erstzulassung: string | null
}

const PORTAL = 'https://www.kleinanzeigen.de'

/** Die eingebettete JSON-LD-Beschreibung einer Trefferkarte. */
function jsonLd(karte: string): { title?: string; description?: string } {
  const treffer = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/i.exec(karte)
  if (!treffer?.[1]) return {}
  try {
    const daten: unknown = JSON.parse(treffer[1])
    return daten && typeof daten === 'object' ? (daten as { title?: string; description?: string }) : {}
  } catch {
    return {}
  }
}

/**
 * Der Titel: aus der Überschrift der Karte.
 *
 * **Nicht** einfach aus dem Verweis auf die Anzeige — die Karte enthält
 * denselben Link zweimal, einmal um das Bild und einmal um die Überschrift,
 * und der Bildlink trägt als Text nur die Anzahl der Fotos. Wer den ersten
 * nimmt, bekommt Titel wie `15` und `19`; genau das ist beim ersten Versuch
 * passiert.
 */
function titelAus(karte: string, href: string): string | null {
  for (const ebene of ['h1', 'h2', 'h3', 'h4'] as const) {
    for (const stueck of elemente(karte, ebene)) {
      const text = zuText(stueck)
      if (text) return text
    }
  }
  // Ohne Überschrift: der längste Text unter den Verweisen auf die Anzeige.
  let laengster = ''
  for (const anker of elemente(karte, 'a')) {
    const startTag = /^<[^>]*>/.exec(anker)?.[0] ?? ''
    if (attribut(startTag, 'href') !== href) continue
    const text = zuText(anker)
    if (text.length > laengster.length) laengster = text
  }
  return laengster || null
}

/**
 * Die kleinen Merkmal-Schilder unter dem Preis (`210.000 km`, `EZ 03/2009`).
 * Gelesen wird jeder kurze `<span>`-Text der Karte — welcher davon was ist,
 * entscheidet sein Aussehen.
 */
function merkmale(karte: string): { km: number | null; ez: string | null } {
  let km: number | null = null
  let ez: string | null = null
  for (const stueck of elemente(karte, 'span')) {
    const text = zuText(stueck)
    if (!text || text.length > 30) continue
    const kmTreffer = /^([\d.]+)\s*km$/.exec(text)
    if (kmTreffer?.[1] && km === null) {
      km = Number.parseInt(kmTreffer[1].replace(/\./g, ''), 10)
      continue
    }
    const ezTreffer = /^EZ\s*(\d{1,2})\/(\d{4})$/.exec(text)
    if (ezTreffer && ez === null) {
      ez = `${ezTreffer[1]!.padStart(2, '0')}/${ezTreffer[2]}`
    }
  }
  return { km, ez }
}

/**
 * Preis und Ort: der erste Text der Karte, der so aussieht.
 *
 * Die Längenschranken sind nicht willkürlich. Ein Ortsname darf lang sein —
 * `81477 Thalk.Obersendl.-Forsten-Fürstenr.-Solln` hat 46 Zeichen und fiel
 * bei einer Schranke von 40 stillschweigend heraus. Sie soll nur verhindern,
 * dass ein ganzer Beschreibungsabsatz geprüft wird.
 */
function preisUndOrt(karte: string): { preis: string; ort: string } {
  let preis = ''
  let ort = ''
  for (const tag of ['p', 'span', 'div'] as const) {
    for (const stueck of elemente(karte, tag)) {
      const text = zuText(stueck)
      if (!text || text.length > 80) continue
      if (!preis && text.length <= 24) {
        const p = /^([\d.]+)\s*€(?:\s*VB)?$/.exec(text)
        if (p?.[1]) preis = p[1].replace(/\./g, '')
      }
      if (!ort) {
        const o = /^(\d{5}\s+\S.*)$/.exec(text)
        if (o?.[1]) ort = o[1]
      }
      if (preis && ort) return { preis, ort }
    }
  }
  return { preis, ort }
}

/**
 * Der Zeitpunkt der Veröffentlichung.
 *
 * Kleinanzeigen schreibt ihn als `Heute, 21:20`, `Gestern, 19:30` oder — bei
 * älteren Anzeigen — als `26.04.2026`. Umgerechnet wird in dieselbe
 * ISO-Form, die der bisherige Dienst geliefert hat, damit sich für den
 * Aufrufer nichts ändert.
 */
export function leseZeitpunkt(text: string, heute = new Date()): string | null {
  const roh = text.trim()
  const uhrzeit = /^(Heute|Gestern),\s*(\d{1,2}):(\d{2})$/.exec(roh)
  if (uhrzeit) {
    const tag = new Date(heute.getFullYear(), heute.getMonth(), heute.getDate())
    if (uhrzeit[1] === 'Gestern') tag.setDate(tag.getDate() - 1)
    tag.setHours(Number(uhrzeit[2]), Number(uhrzeit[3]), 0, 0)
    return oertlichesIso(tag)
  }
  const datum = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(roh)
  if (datum) {
    return oertlichesIso(new Date(Number(datum[3]), Number(datum[2]) - 1, Number(datum[1])))
  }
  return null
}

/** ISO-Form ohne Zeitzone — so, wie der bisherige Dienst sie schreibt. */
function oertlichesIso(zeit: Date): string {
  const zwei = (n: number) => String(n).padStart(2, '0')
  return (
    `${zeit.getFullYear()}-${zwei(zeit.getMonth() + 1)}-${zwei(zeit.getDate())}` +
    `T${zwei(zeit.getHours())}:${zwei(zeit.getMinutes())}:${zwei(zeit.getSeconds())}`
  )
}

/** Sucht in der Karte den Text, der wie eine Datumsangabe aussieht. */
function zeitpunkt(karte: string, heute?: Date): string | null {
  const mitAttribut = /<time\b[^>]*\sdatetime\s*=\s*"([^"]+)"/i.exec(karte)
  if (mitAttribut?.[1]) return dekodiere(mitAttribut[1])
  for (const tag of ['span', 'p', 'div'] as const) {
    for (const stueck of elemente(karte, tag)) {
      const text = zuText(stueck)
      if (!text || text.length > 24) continue
      const gelesen = leseZeitpunkt(text, heute)
      if (gelesen) return gelesen
    }
  }
  return null
}

/** Alle Treffer einer Seite. */
export function leseTreffer(html: string, heute?: Date): Treffer[] {
  const gefunden: Treffer[] = []
  for (const karte of elemente(html, 'article')) {
    const startTag = /^<[^>]*>/.exec(karte)?.[0] ?? ''
    const adid = attribut(startTag, 'data-adid')
    const href = attribut(startTag, 'data-href')
    if (!adid || !href) continue

    const ld = jsonLd(karte)
    const { km, ez } = merkmale(karte)
    const { preis, ort } = preisUndOrt(karte)

    gefunden.push({
      adid,
      url: href.startsWith('http') ? href : `${PORTAL}${href}`,
      title: titelAus(karte, href) ?? ld.title ?? '',
      price: preis,
      location: ort,
      description: ld.description ?? '',
      published_at: zeitpunkt(karte, heute),
      kilometerstand: km,
      erstzulassung: ez,
    })
  }
  return gefunden
}

/**
 * Die Gesamtzahl der Treffer aus der Zusammenfassung über der Liste:
 * `1 - 25 von 93.071 Mercedes Benz Gebrauchtwagen in Deutschland`.
 *
 * Gesucht wird zuerst im neuen Element (`#srp-breadcrumb-summary`), dann in
 * der alten Klasse (`.breadcrump-summary`) — solange beide Fassungen
 * unterwegs sein können, liest der Leser beide.
 */
export function leseGesamtzahl(html: string): number | null {
  const kandidaten: string[] = []
  const neu = /id="srp-breadcrumb-summary"[^>]*>([\s\S]{0,300}?)<\//i.exec(html)
  if (neu?.[1]) kandidaten.push(zuText(neu[1]))
  const alt = /class="[^"]*breadcrump-summary[^"]*"[^>]*>([\s\S]{0,300}?)<\//i.exec(html)
  if (alt?.[1]) kandidaten.push(zuText(alt[1]))

  for (const text of kandidaten) {
    const treffer = /\bvon\s+([\d.]+)\b/.exec(text)
    if (treffer?.[1]) {
      const wert = Number.parseInt(treffer[1].replace(/\./g, ''), 10)
      if (Number.isFinite(wert)) return wert
    }
  }
  return null
}

/**
 * Die höchste Seitenzahl, die die Seitennummerierung selbst anbietet.
 *
 * Verlässlicher als das Hochrechnen aus der Gesamtzahl: Kleinanzeigen liefert
 * nicht zu jedem Treffer eine eigene Seite. Wer darüber hinaus abfragt, holt
 * sich nur Absagen.
 */
export function leseSeitenzahl(html: string): number | null {
  let hoechste: number | null = null
  for (const treffer of html.matchAll(/\/(?:s-)?seite:(\d+)\//g)) {
    const wert = Number.parseInt(treffer[1] ?? '', 10)
    if (Number.isFinite(wert) && (hoechste === null || wert > hoechste)) hoechste = wert
  }
  return hoechste
}

/**
 * Setzt die Seitenzahl in eine Such-URL — dieselbe Regel wie im bisherigen
 * Dienst, damit dieselben URLs herauskommen.
 *
 * Bei Kategorie-URLs steht `seite:N` unmittelbar **vor** dem Filterabschnitt
 * (`c216+autos.…`), bei einer allgemeinen Suche wird `s-seite:N` angehängt.
 * Eine schon vorhandene Seitenangabe wird zuvor entfernt.
 */
export function setzeSeite(url: string, seite: number): string {
  const adresse = new URL(url)
  const teile = decodeURIComponent(adresse.pathname)
    .split('/')
    .filter((t) => t && !/^s?-?seite:\d+$/.test(t) && !/^s-seite:\d+$/.test(t))

  if (seite > 1) {
    const filterIndex = teile.findIndex((t) => /^k?\d*c\d+/.test(t))
    if (filterIndex !== -1) teile.splice(filterIndex, 0, `seite:${seite}`)
    else teile.push(`s-seite:${seite}`)
  }

  adresse.pathname = `/${teile.join('/')}`
  return adresse.toString()
}
