/**
 * Der Inseratsausdruck als HTML.
 *
 * **Was das Dokument ist:** ein Beleg. Es tritt an die Stelle des
 * ausgedruckten Inserats, das früher zur Akte ging, und muss deshalb genau
 * das zeigen, was am Tag des Abrufs im Portal stand — samt Adresse und
 * Zeitpunkt, damit ein Versicherer es nachvollziehen kann.
 *
 * **Was es nicht ist:** eine Bewertung. Der Abstand zum Subjektfahrzeug, die
 * Vergleichbarkeit und das Urteil der Prüfung stehen im Report, nicht hier.
 * Ein Beleg, der schon eine Wertung enthält, ist als Beleg weniger wert.
 *
 * Ohne `server-only`: hier wird nur Text gebaut. Das macht die Seite ohne
 * Browser und ohne Datenbank prüfbar.
 */

import { portalName } from './portalnamen'

export interface Belegfahrzeug {
  kennung: string
  quelle: string
  titel: string | null
  url: string | null
  preis: number | null
  kilometerstand: number | null
  erstzulassung: string | null
  leistungKw: number | null
  getriebe: string | null
  kraftstoff: string | null
  plz: string | null
  ort: string | null
  ausstattung: string[]
  beschreibung: string | null
  /** Bilder als `data:`-Adresse — eingebettet, nicht verlinkt. */
  bilder: string[]
}

export interface Belegkopf {
  aktenzeichen: string | null
  /** Wonach gesucht wurde — eine Zeile, kein Datensatz. */
  subjekt: string
  abgerufenAm: Date
}

const euro = new Intl.NumberFormat('de-DE', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
})

/** Schützt vor Text, der aus einem fremden Inserat kommt. */
export function sicher(wert: string | null | undefined): string {
  return (wert ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function zeitpunkt(wert: Date): string {
  return wert.toLocaleString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function angabe(name: string, wert: string | null): string {
  return wert
    ? `<div class="angabe"><dt>${sicher(name)}</dt><dd>${sicher(wert)}</dd></div>`
    : `<div class="angabe fehlt"><dt>${sicher(name)}</dt><dd>ohne Angabe</dd></div>`
}

/**
 * Ein Fahrzeug als Abschnitt.
 *
 * `seitenumbruch` setzt den Umbruch **vor** den Abschnitt, nicht dahinter —
 * sonst hängt am Ende jedes Pakets eine leere Seite.
 */
export function fahrzeugabschnitt(f: Belegfahrzeug, seitenumbruch = false): string {
  const ausstattung =
    f.ausstattung.length > 0
      ? `<div class="block">
      <h2>Ausstattung laut Inserat</h2>
      <ul class="merkmale">${f.ausstattung.map((a) => `<li>${sicher(a)}</li>`).join('')}</ul>
    </div>`
      : ''

  const beschreibung = f.beschreibung
    ? `<div class="block">
      <h2>Beschreibung des Anbieters</h2>
      <p class="fliess">${sicher(f.beschreibung)}</p>
    </div>`
    : ''

  const bilder =
    f.bilder.length > 0
      ? `<div class="bilder">${f.bilder
          .map((b) => `<img src="${b}" alt="">`)
          .join('')}</div>`
      : '<p class="fehlt">Das Inserat führte kein Bild.</p>'

  return `<section class="fahrzeug${seitenumbruch ? ' umbruch' : ''}">
    <h1>${sicher(f.titel ?? 'Inserat ohne Titel')}</h1>
    <p class="preis">${f.preis === null ? 'ohne Preisangabe' : euro.format(f.preis)}</p>

    <dl class="angaben">
      ${angabe('Laufleistung', f.kilometerstand === null ? null : `${f.kilometerstand.toLocaleString('de-DE')} km`)}
      ${angabe('Erstzulassung', f.erstzulassung)}
      ${angabe('Leistung', f.leistungKw === null ? null : `${f.leistungKw} kW`)}
      ${angabe('Getriebe', f.getriebe)}
      ${angabe('Kraftstoff', f.kraftstoff)}
      ${angabe('Standort', [f.plz, f.ort].filter(Boolean).join(' ') || null)}
      ${angabe('Portal', portalName(f.quelle))}
    </dl>

    ${bilder}
    ${ausstattung}
    ${beschreibung}

    <div class="block quelle">
      <h2>Fundstelle</h2>
      ${
        f.url
          ? `<p class="adresse">${sicher(f.url)}</p>`
          : '<p class="fehlt">Zu diesem Inserat wurde keine Adresse mitgeliefert.</p>'
      }
    </div>
  </section>`
}

/**
 * Die Formatvorlage.
 *
 * Bewusst hier und nicht in `globals.css`: der Beleg wird gedruckt, nicht
 * angezeigt. Er braucht Seitenränder, Umbruchregeln und Farben, die auf
 * Papier tragen — die Anwendung braucht davon nichts.
 */
const STIL = `
  @page { size: A4; margin: 18mm 16mm; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
    font-size: 10.5pt;
    line-height: 1.45;
    color: #1f2933;
  }
  .kopf {
    display: flex;
    justify-content: space-between;
    gap: 12mm;
    padding-bottom: 3mm;
    margin-bottom: 6mm;
    border-bottom: 1px solid #d5dbe0;
    font-size: 9pt;
    color: #5a6872;
  }
  .kopf strong { color: #1f2933; font-weight: 600; }
  .fahrzeug.umbruch { break-before: page; }
  h1 { margin: 0 0 1mm; font-size: 15pt; font-weight: 600; line-height: 1.25; }
  .preis { margin: 0 0 4mm; font-size: 13pt; font-weight: 600; color: #1878b4; }
  h2 {
    margin: 0 0 1.5mm;
    font-size: 8pt;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: #5a6872;
  }
  .angaben {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    /* Spaltenabstand, kein Zeilenabstand: ohne ihn stiessen der Wert der
       linken und die Beschriftung der rechten Spalte aneinander und lasen
       sich als ein Wort — „129.558 kmErstzulassung". */
    column-gap: 10mm;
    row-gap: 0;
    margin: 0 0 5mm;
    border-top: 1px solid #e7ebee;
  }
  .angabe {
    display: flex;
    justify-content: space-between;
    gap: 6mm;
    padding: 1.6mm 0;
    border-bottom: 1px solid #e7ebee;
  }
  .angabe dt { color: #5a6872; }
  .angabe dd { margin: 0; font-weight: 600; text-align: right; }
  .angabe.fehlt dd { font-weight: 400; color: #97a2ab; }
  .bilder {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 3mm;
    margin-bottom: 5mm;
  }
  .bilder img {
    width: 100%;
    height: 42mm;
    object-fit: cover;
    border-radius: 1.5mm;
    background: #eef1f3;
  }
  .block { margin-bottom: 5mm; break-inside: avoid; }
  .merkmale {
    display: flex;
    flex-wrap: wrap;
    gap: 1.5mm 3mm;
    margin: 0;
    padding: 0;
    list-style: none;
    font-size: 9.5pt;
  }
  .merkmale li {
    padding: 0.6mm 2mm;
    background: #f2f5f7;
    border-radius: 1mm;
  }
  .fliess { margin: 0; white-space: pre-wrap; font-size: 9.5pt; }
  .adresse { margin: 0; font-family: "SFMono-Regular", Menlo, Consolas, monospace; font-size: 8pt; word-break: break-all; color: #5a6872; }
  .fehlt { color: #97a2ab; font-size: 9.5pt; margin: 0; }
  .fuss {
    margin-top: 6mm;
    padding-top: 2.5mm;
    border-top: 1px solid #d5dbe0;
    font-size: 8pt;
    color: #97a2ab;
  }
`

/** Setzt eine ganze Belegdatei zusammen — ein Fahrzeug oder ein Portalpaket. */
export function belegseite(kopf: Belegkopf, fahrzeuge: Belegfahrzeug[], titel: string): string {
  return `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<title>${sicher(titel)}</title>
<style>${STIL}</style>
</head>
<body>
  <div class="kopf">
    <div>
      <strong>Vergleichsfahrzeug zur Wiederbeschaffung</strong><br>
      ${kopf.aktenzeichen ? `Akte ${sicher(kopf.aktenzeichen)} · ` : ''}${sicher(kopf.subjekt)}
    </div>
    <div style="text-align:right; white-space:nowrap">
      Abgerufen am<br><strong>${zeitpunkt(kopf.abgerufenAm)}</strong>
    </div>
  </div>

  ${fahrzeuge.map((f, i) => fahrzeugabschnitt(f, i > 0)).join('\n')}

  <p class="fuss">
    Inseratspreise sind Angebots-, keine Transaktionspreise. Der Ausdruck gibt
    den Stand zum genannten Zeitpunkt wieder; das Inserat kann sich seither
    geändert haben oder entfallen sein.
  </p>
</body>
</html>`
}
