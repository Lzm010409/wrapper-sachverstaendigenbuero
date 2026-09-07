import { attribut, dekodiere, elemente, elementMitId, zuText } from './html'

/**
 * Liest die Detailseite einer Anzeige.
 *
 * Anders als die Trefferliste steht die Detailseite noch im alten Aufbau —
 * `#viewad-details` mit einer flachen Liste aus `Label` + `Wert`,
 * `#viewad-configuration` mit der Ausstattung. Die Feldnamen kommen also aus
 * dem Dokument selbst und werden **nicht** übersetzt: was Kleinanzeigen
 * `Anzahl Türen` nennt, heisst auch hier so. Der Aufrufer (das WBW-Plugin)
 * greift genau auf diese Namen zu.
 *
 * Was Kleinanzeigen **nicht** liefert: Koordinaten. Nur Postleitzahl und Ort;
 * die Entfernung rechnet das Plugin selbst aus.
 */

export interface Preis {
  amount: string
  currency: string
  negotiable: boolean
}

export interface Ort {
  zip: string
  city: string
  state: string
}

export interface Inserat {
  id: string
  url_requested: string
  url_redirected: string
  title: string | null
  price: Preis
  location: Ort
  details: Record<string, string>
  features: string[]
  description: string | null
  extra_info: { created_at: string | null; views: string }
  media: { images: { urls: string[] } }
}

/**
 * Der Preis, so wie der bisherige Dienst ihn zerlegt hat: `10.999 €` wird zu
 * `{amount:"10999", currency:"€", negotiable:false}`, `1.200 € VB` zu
 * `negotiable:true`. Fehlt der Preis, steht `"0"` — auch das übernommen,
 * damit sich für den Aufrufer nichts ändert.
 */
export function lesePreis(text: string | null | undefined): Preis {
  if (!text?.trim()) return { amount: '0', currency: '€', negotiable: false }
  const roh = text.trim()
  const verhandelbar = /\bVB\b/.test(roh)
  const betrag = roh
    .replace(/\bVB\b/g, '')
    .replace(/€/g, '')
    .replace(/\./g, '')
    .replace(/,/g, '.')
    .trim()
  return { amount: betrag, currency: '€', negotiable: verhandelbar }
}

/**
 * Der Ort aus `#viewad-locality`: `27755 Niedersachsen - Delmenhorst`.
 * Vor dem Gedankenstrich stehen Postleitzahl und Bundesland, dahinter der
 * Ort. Fehlt der hintere Teil, bleibt `city` leer — dieselbe Aufteilung wie
 * beim bisherigen Dienst.
 */
export function leseOrt(text: string | null | undefined): Ort {
  if (!text?.trim()) return { zip: '', city: '', state: '' }
  const teile = text.includes(' - ') ? text.split(' - ') : [text]
  const vorn = (teile[0] ?? '').trim()
  const trennung = vorn.split(' ')
  const zip = (trennung[0] ?? '').trim()
  const state = trennung.slice(1).join(' ').trim()
  const city = (teile[1] ?? '').trim()
  return { zip, city, state }
}

/** Die Merkmalliste: `Kilometerstand` → `210.000 km`. */
export function leseMerkmale(html: string): Record<string, string> {
  const bereich = elementMitId(html, 'div', 'viewad-details')
  if (!bereich) return {}

  const merkmale: Record<string, string> = {}
  for (const zeile of elemente(bereich, 'li')) {
    const werte = elemente(zeile, 'span')
    const wertStueck = werte.find((s) => {
      const startTag = /^<[^>]*>/.exec(s)?.[0] ?? ''
      return (attribut(startTag, 'class') ?? '').includes('addetailslist--detail--value')
    })
    if (!wertStueck) continue
    const wert = zuText(wertStueck)
    // Das Label ist der Text der Zeile ohne den Wert — genau so trennt es
    // auch der bisherige Dienst.
    const label = zuText(zeile).replace(wert, '').trim()
    if (label) merkmale[label] = wert
  }
  return merkmale
}

/** Die Ausstattung aus `#viewad-configuration`. */
export function leseAusstattung(html: string): string[] {
  const bereich = elementMitId(html, 'div', 'viewad-configuration')
  if (!bereich) return []
  const gefunden: string[] = []
  for (const stueck of elemente(bereich, 'li')) {
    const text = zuText(stueck)
    if (text) gefunden.push(text)
  }
  return gefunden
}

/**
 * Der Beschreibungstext. Zeilenumbrüche der Anzeige (`<br>`) bleiben
 * Zeilenumbrüche — sonst klebt der Fliesstext zusammen und niemand kann ihn
 * im Gutachten lesen.
 */
export function leseBeschreibung(html: string): string | null {
  const treffer = /<p\b[^>]*\sid="viewad-description-text"[^>]*>([\s\S]*?)<\/p>/i.exec(html)
  if (!treffer?.[1]) return null
  const text = dekodiere(
    treffer[1]
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]*>/g, ''),
  )
    .replace(/ /g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .trim()
  return text || null
}

/**
 * Die Bilder der Galerie.
 *
 * Zwei Fallen, beide an der echten Seite gemessen:
 *
 * 1. Dasselbe Bild kommt in mehreren Grössen vor (`?rule=$_2.AUTO`,
 *    `$_35.AUTO`, `$_59.AUTO`). Ohne Rücksicht darauf kamen für eine Anzeige
 *    mit 19 Fotos 69 URLs heraus. Unterschieden wird deshalb am Pfad.
 * 2. Auf der Seite stehen auch die Vorschaubilder **fremder** Anzeigen
 *    („Ähnliche Anzeigen", weitere Anzeigen des Verkäufers). Sie tragen
 *    dieselbe Bild-Adresse und wären nicht zu unterscheiden — nach Pfad
 *    gefiltert blieben 31 statt 19 Bilder übrig, zwölf davon von anderen
 *    Fahrzeugen. Genommen werden deshalb nur die Bilder der Galerie
 *    (`id="viewad-image"`).
 */
export function leseBilder(html: string): string[] {
  const gesehen = new Set<string>()
  const urls: string[] = []

  const sammle = (tag: string) => {
    const quelle =
      attribut(tag, 'src') ?? attribut(tag, 'data-src') ?? attribut(tag, 'data-imgsrc')
    if (!quelle || !quelle.includes('prod-ads') || !/^https?:\/\//.test(quelle)) return
    const pfad = quelle.split('?')[0] ?? quelle
    if (gesehen.has(pfad)) return
    gesehen.add(pfad)
    urls.push(quelle)
  }

  for (const treffer of html.matchAll(/<img\b[^>]*>/gi)) {
    const tag = treffer[0]
    if (attribut(tag, 'id') !== 'viewad-image') continue
    sammle(tag)
  }
  return urls
}

/** Einstelldatum und Aufrufzähler. */
export function leseZusatz(html: string): { created_at: string | null; views: string } {
  const bereich = elementMitId(html, 'div', 'viewad-extra-info')
  let erstellt: string | null = null
  if (bereich) {
    const text = zuText(bereich)
    const datum = /\b(\d{1,2}\.\d{1,2}\.\d{4})\b/.exec(text)
    erstellt = datum?.[1] ?? null
  }
  const aufrufe = /id="viewad-cntr-num"[^>]*>([\s\S]{0,40}?)<\//i.exec(html)
  return { created_at: erstellt, views: aufrufe?.[1] ? zuText(aufrufe[1]) : '0' }
}

/** Die Anzeigen-Nummer aus der URL: `…/3455356908-216-2469` → `3455356908`. */
export function adidAusUrl(url: string): string | null {
  const lang = /\/(\d{6,})-\d+-\d+(?:[/?#]|$)/.exec(url)
  if (lang?.[1]) return lang[1]
  // Die Kurzform `…/s-anzeige/3455356908` — so wird die Seite hier abgerufen.
  const kurz = /\/s-anzeige\/(\d{6,})(?:[/?#]|$)/.exec(url)
  return kurz?.[1] ?? null
}

/** Die Anzeigen-Nummer, wie die Seite sie selbst ausweist. */
export function adidAusSeite(html: string): string | null {
  const kasten = elementMitId(html, 'div', 'viewad-ad-id-box')
  if (!kasten) return null
  for (const eintrag of elemente(kasten, 'li')) {
    const text = zuText(eintrag)
    if (/^\d{6,}$/.test(text)) return text
  }
  return null
}

/** Setzt alles zusammen. */
export function leseInserat(html: string, url: string, angefragt = url): Inserat {
  const titel = /<h1\b[^>]*\sid="viewad-title"[^>]*>([\s\S]*?)<\/h1>/i.exec(html)
  const preis = /<h2\b[^>]*\sid="viewad-price"[^>]*>([\s\S]*?)<\/h2>/i.exec(html)
  const ort = /id="viewad-locality"[^>]*>([\s\S]{0,200}?)<\//i.exec(html)

  return {
    id: adidAusSeite(html) ?? adidAusUrl(url) ?? adidAusUrl(angefragt) ?? '',
    url_requested: angefragt,
    url_redirected: url,
    title: titel?.[1] ? zuText(titel[1]) : null,
    price: lesePreis(preis?.[1] ? zuText(preis[1]) : null),
    location: leseOrt(ort?.[1] ? zuText(ort[1]) : null),
    details: leseMerkmale(html),
    features: leseAusstattung(html),
    description: leseBeschreibung(html),
    extra_info: leseZusatz(html),
    media: { images: { urls: leseBilder(html) } },
  }
}
