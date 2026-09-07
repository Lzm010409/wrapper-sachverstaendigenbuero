import { describe, expect, it } from 'vitest'
import { baueFallAnsicht, baueTitel, baueUntertitel, type Falldaten } from './modell'

/**
 * Dieser Test laeuft ohne Datenbank - das ist der Punkt der Trennung.
 * Vorher zog die Testdatei ueber drei Ecken das Datenbankmodul mit und
 * brach ohne DATABASE_URL ab, obwohl die geprueften Funktionen rein sind.
 */

const daten = {
  gutachtenTyp: 'Haftpflichtschaden',
  zustand: 'aufgenommen',
  aktenzeichen: '0926/2081TG',
  anspruchsteller: { name: 'Beispiel GmbH' },
} as unknown as Falldaten

describe('baueUntertitel', () => {
  const zeit = new Date('2026-09-07T10:00:00Z')

  it('setzt alle drei Stuecke mit Trennzeichen', () => {
    expect(baueUntertitel(daten, zeit)).toMatch(
      /^Haftpflichtschaden · aufgenommen · abgerufen /,
    )
  })

  it('beginnt nie mit einem Trennzeichen', () => {
    // Der frueherer Fehler: ohne Typ und Zustand stand da " · abgerufen …".
    expect(baueUntertitel(null, zeit)).toMatch(/^abgerufen /)
  })

  it('laesst den Abrufzeitpunkt weg, wenn es keinen gibt', () => {
    expect(baueUntertitel(daten, null)).toBe('Haftpflichtschaden · aufgenommen')
  })

  it('liefert eine leere Zeile, wenn nichts bekannt ist', () => {
    expect(baueUntertitel(null, null)).toBe('')
  })
})

describe('baueTitel', () => {
  it('nennt unlesbare Daten unlesbar, statt einen Namen zu erfinden', () => {
    expect(baueTitel(daten, false)).toBe('Falldaten nicht lesbar')
  })

  it('nimmt den Anspruchsteller', () => {
    expect(baueTitel(daten, true)).toBe('Beispiel GmbH')
  })

  it('sagt es, wenn das Gutachten keinen Anspruchsteller kennt', () => {
    expect(baueTitel({} as Falldaten, true)).toBe('Fall ohne Anspruchsteller')
  })
})

describe('baueFallAnsicht', () => {
  const zeile = { id: 'abc', aktenzeichen: 'GESPEICHERT-1', abgerufenAm: null }

  it('bevorzugt das Aktenzeichen aus dem Gutachten', () => {
    // Sonst widerspraeche die Fallseite der Liste, die genau dieses zeigt.
    expect(baueFallAnsicht(zeile, daten, true, []).aktenzeichen).toBe('0926/2081TG')
  })

  it('faellt auf das beim Import gespeicherte zurueck', () => {
    expect(baueFallAnsicht(zeile, null, false, []).aktenzeichen).toBe('GESPEICHERT-1')
  })

  it('reicht die Schreiben durch, auch wenn die Falldaten unlesbar sind', () => {
    const schreiben = [
      { id: 's1', betreff: 'Test', erstelltAm: null, versendetAm: null, positionen: 3 },
    ]
    const ansicht = baueFallAnsicht(zeile, null, false, schreiben)
    expect(ansicht.lesbar).toBe(false)
    expect(ansicht.schreiben).toHaveLength(1)
  })
})
