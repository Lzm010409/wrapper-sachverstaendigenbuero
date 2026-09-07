import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { inhaltsZeichen, istTextseite, leseBericht, werkzeugeVorhanden } from './einlesen'

/**
 * Die echten Prüfberichte enthalten Namen, Adressen und Schadennummern und
 * gehören deshalb nicht ins Repository. Wer sie zur Hand hat, legt sie in
 * einen Ordner und setzt `PRUEFBERICHT_FIXTURES` darauf — dann laufen die
 * Kalibrierungstests mit. Ohne den Ordner bleiben sie übersprungen, ohne
 * dass die Testkette rot wird.
 */
const FIXTURES = process.env.PRUEFBERICHT_FIXTURES
const hatFixture = (name: string) => Boolean(FIXTURES && existsSync(join(FIXTURES, name)))

describe('inhaltsZeichen', () => {
  it('zählt ohne Leerraum', () => {
    expect(inhaltsZeichen('  a b\n c ')).toBe(3)
    expect(inhaltsZeichen('   \n\t ')).toBe(0)
  })
})

describe('istTextseite', () => {
  it('hält eine Seite mit Fliesstext für textführend', () => {
    expect(istTextseite('Sehr geehrte Damen und Herren, '.repeat(8))).toBe(true)
  })

  it('erkennt eine gescannte Seite trotz eingebettetem Wasserzeichen', () => {
    // Genau dieser Fall tritt im HUK-Bündel auf: die gescannten Seiten des
    // DEKRA-Berichts tragen nur die Schadennummer als Textebene.
    expect(istTextseite('2611634578678C')).toBe(false)
    expect(istTextseite('')).toBe(false)
    expect(istTextseite('   \n  \n ')).toBe(false)
  })
})

describe('Werkzeuge', () => {
  it('findet pdfinfo, pdftotext und pdftoppm', async () => {
    const { ok, fehlend } = await werkzeugeVorhanden()
    expect(fehlend, 'poppler-utils fehlt — im Container über das Dockerfile installiert').toEqual([])
    expect(ok).toBe(true)
  })
})

describe.skipIf(!hatFixture('huk.pdf'))('Bündel aus Anschreiben und Scan (HUK)', () => {
  it('entscheidet je Seite, nicht je Dokument', async () => {
    const pdf = readFileSync(join(FIXTURES!, 'huk.pdf'))
    const bericht = await leseBericht(pdf)

    expect(bericht.seitenzahl).toBe(6)
    // Anschreiben digital, Prüfbericht gescannt.
    expect(bericht.seiten[0]!.art).toBe('text')
    expect(bericht.seiten[1]!.art).toBe('text')
    expect(bericht.seiten[2]!.art).toBe('bild')
    expect(bericht.zusammenfassung).toEqual({ text: 2, bild: 4 })
  })

  it('liefert für Bildseiten ein auswertbares JPEG', async () => {
    const pdf = readFileSync(join(FIXTURES!, 'huk.pdf'))
    const bericht = await leseBericht(pdf, { nurSeiten: [3] })
    const seite = bericht.seiten[0]!
    expect(seite.art).toBe('bild')
    expect(seite.bildBase64!.length).toBeGreaterThan(10_000)
    // JPEG beginnt mit ffd8ff — nach Base64 also "/9j/".
    expect(seite.bildBase64!.startsWith('/9j/')).toBe(true)
  })
})

describe.skipIf(!hatFixture('lvm.pdf'))('Durchgehend gescanntes Dokument (LVM)', () => {
  it('rastert alle Seiten', async () => {
    const pdf = readFileSync(join(FIXTURES!, 'lvm.pdf'))
    const bericht = await leseBericht(pdf)
    expect(bericht.seitenzahl).toBe(8)
    expect(bericht.zusammenfassung.text).toBe(0)
    expect(bericht.zusammenfassung.bild).toBe(8)
  })
})

describe('Fehlerfälle', () => {
  it('meldet eine Datei, die kein PDF ist, verständlich', async () => {
    await expect(leseBericht(Buffer.from('kein pdf'))).rejects.toThrow(/nicht als PDF/)
  })
})

/**
 * Ein selbst gebautes PDF mit zwei Textseiten.
 *
 * Reicht, um den Fortschrittsrückruf zu prüfen, ohne einen echten
 * Prüfbericht zu brauchen — der gehört wegen der Namen und Schadennummern
 * darin nicht ins Repository.
 */
function baueZweiseiter(): Buffer {
  const seite = (nummer: number, inhalt: number) =>
    `${nummer} 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] ` +
    `/Resources << /Font << /F1 9 0 R >> >> /Contents ${inhalt} 0 R >>endobj\n`
  const text = (nummer: number, was: string) => {
    // Mehrere Zeilen, weil eine einzelne über den Seitenrand hinausliefe und
    // dabei abgeschnitten würde — die Seite gälte dann als gescannt. Und die
    // Länge muss stimmen, sonst schneidet der Leser den Strom ab.
    const zeilen = Array.from(
      { length: 5 },
      (_, i) => `BT /F1 12 Tf 72 ${760 - i * 20} Td (${was} Zeile ${i + 1}) Tj ET`,
    )
    const strom = zeilen.join('\n') + '\n'
    return `${nummer} 0 obj<< /Length ${strom.length} >>stream\n${strom}endstream\nendobj\n`
  }

  return Buffer.from(
    '%PDF-1.4\n' +
      '1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj\n' +
      '2 0 obj<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>endobj\n' +
      seite(3, 5) +
      seite(4, 6) +
      text(5, 'Kuerzungsbericht Seite eins mit Fliesstext') +
      text(6, 'Seite zwei mit ebenso viel Fliesstext') +
      '9 0 obj<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>endobj\n' +
      'trailer<< /Root 1 0 R /Size 10 >>\n%%EOF\n',
    'latin1',
  )
}

describe('Fortschritt beim Einlesen', () => {
  it('meldet jede gelesene Seite mit ihrer Art', async () => {
    const meldungen: { seite: number; von: number; art: string }[] = []
    const bericht = await leseBericht(baueZweiseiter(), {
      melde: (s) => meldungen.push(s),
    })

    expect(bericht.seitenzahl).toBe(2)
    expect(meldungen).toEqual([
      { seite: 1, von: 2, art: 'text' },
      { seite: 2, von: 2, art: 'text' },
    ])
  })

  it('läuft auch ohne Rückruf', async () => {
    await expect(leseBericht(baueZweiseiter())).resolves.toMatchObject({ seitenzahl: 2 })
  })
})
