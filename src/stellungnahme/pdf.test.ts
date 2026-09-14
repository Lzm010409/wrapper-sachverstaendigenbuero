import { describe, expect, it } from 'vitest'
import type { Absatz, Kopfdaten } from '@/export/hausstil'
import { baueBriefHtml, druckeStellungnahmePdf, type PdfBild } from './pdf'
import { druckerVorhanden } from '@/wbw/drucker'

const KOPF: Kopfdaten = {
  ort: 'Krefeld',
  datum: new Date('2026-09-08T10:00:00Z'),
  empfaengerName: 'Musterversicherung AG',
  empfaengerStrasse: 'Versicherungsallee 1',
  empfaengerPlzOrt: '40000 Düsseldorf',
  betreff: 'Betreff: Schaden 0926/2081TG',
  anrede: 'Sehr geehrte Damen und Herren,',
  einleitungDatum: null,
  einleitungMedium: 'schreiben',
  vorbemerkungEinfuegen: false,
}

const ABSAETZE: Absatz[] = [
  { art: 'betreff', text: KOPF.betreff },
  { art: 'leer', text: '' },
  { art: 'anrede', text: KOPF.anrede },
  { art: 'leer', text: '' },
  { art: 'ueberschrift', text: '1. Verbringungskosten' },
  { art: 'leer', text: '' },
  { art: 'fliesstext', text: 'Die Kürzung <ist> nicht "nachvollziehbar" & wird bestritten.' },
  { art: 'leer', text: '' },
  { art: 'signatur', text: 'Der Sachverständige' },
]

describe('baueBriefHtml', () => {
  const html = baueBriefHtml(KOPF, ABSAETZE, new Map())

  it('trägt Ort, Datum und die Anschrift des Empfängers', () => {
    expect(html).toContain('Krefeld, 08.09.2026')
    expect(html).toContain('Musterversicherung AG')
    expect(html).toContain('Versicherungsallee 1')
    expect(html).toContain('40000 Düsseldorf')
  })

  it('maskiert Sonderzeichen im Fliesstext, statt sie als Markup durchzulassen', () => {
    expect(html).toContain('&lt;ist&gt;')
    expect(html).toContain('&quot;nachvollziehbar&quot;')
    expect(html).toContain('&amp;')
    expect(html).not.toContain('<ist>')
  })

  it('setzt Betreff und Überschrift fett aus', () => {
    expect(html).toMatch(/<p class="betreff">.*Betreff: Schaden/)
    expect(html).toMatch(/<p class="ueberschrift">1\. Verbringungskosten<\/p>/)
  })

  it('ist eine vollständige HTML-Seite — Chromium druckt sonst seine eigene Fehlerseite', () => {
    expect(html.trim().startsWith('<!doctype html>')).toBe(true)
    expect(html).toContain('</html>')
  })
})

describe('baueBriefHtml mit Bild', () => {
  it('bettet ein vorhandenes Bild als data-URI ein', () => {
    const bilder = new Map<string, PdfBild>([
      ['bild-1', { daten: new Uint8Array([1, 2, 3]), mimetyp: 'image/png' }],
    ])
    const absaetze: Absatz[] = [
      {
        art: 'bild',
        text: '[Bild 1: foto.png – siehe Word-Dokument]',
        bild: { bildId: 'bild-1', breite: 0.5, breitePx: 800, hoehePx: 600, dateiname: 'foto.png', nummer: 1 },
      },
    ]
    const html = baueBriefHtml(KOPF, absaetze, bilder)
    expect(html).toContain('data:image/png;base64,')
    expect(html).toContain('width:50%')
  })

  it('lässt den Klartextmarker stehen, wenn das Bild fehlt', () => {
    const absaetze: Absatz[] = [
      {
        art: 'bild',
        text: '[Bild 1: foto.png – siehe Word-Dokument]',
        bild: { bildId: 'fehlt', breite: 0.5, breitePx: 800, hoehePx: 600, dateiname: 'foto.png', nummer: 1 },
      },
    ]
    const html = baueBriefHtml(KOPF, absaetze, new Map())
    expect(html).toContain('Bild 1: foto.png')
    expect(html).not.toContain('<img')
  })
})

/*
 * Diese Prüfung druckt wirklich — derselbe Grundsatz wie bei
 * `src/wbw/drucker.test.ts`: nur so ist belegt, dass am Ende ein PDF
 * herauskommt und keine leere oder abgebrochene Datei.
 */
const chromium = await druckerVorhanden()

describe.skipIf(!chromium)('druckeStellungnahmePdf', () => {
  it('macht aus der Absatzfolge ein PDF', async () => {
    const pdf = await druckeStellungnahmePdf(KOPF, ABSAETZE, new Map())
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-')
    expect(pdf.byteLength).toBeGreaterThan(8000)
  }, 180_000)
})
