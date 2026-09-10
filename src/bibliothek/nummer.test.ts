import { describe, expect, it } from 'vitest'
import { naechsteNummer, zerlegeNummer } from './nummer'

describe('zerlegeNummer', () => {
  it('liest die zweistufige Gliederung „1.2"', () => {
    expect(zerlegeNummer('1.2')).toEqual({ praefix: '', haupt: 1, unter: 2 })
  })

  it('liest die einstufige Gliederung „7"', () => {
    expect(zerlegeNummer('7')).toEqual({ praefix: '', haupt: 7, unter: null })
  })

  it('behält den Buchstabenteil der Sonderfall-Notation „B.7"', () => {
    expect(zerlegeNummer('B.7')).toEqual({ praefix: 'B.', haupt: 7, unter: null })
  })

  it('gibt null zurück, wenn keine Nummer erkennbar ist', () => {
    expect(zerlegeNummer('')).toBeNull()
    expect(zerlegeNummer('Vorbemerkung')).toBeNull()
  })
})

describe('naechsteNummer', () => {
  const kalkulation = [
    { nummer: '1.1', abschnitt: '1. Ersatzteile' },
    { nummer: '1.2', abschnitt: '1. Ersatzteile' },
    { nummer: '1.10', abschnitt: '1. Ersatzteile' },
    { nummer: '2.1', abschnitt: '2. Lackierung' },
  ]

  it('zählt im bestehenden Abschnitt die Unternummer hoch', () => {
    expect(naechsteNummer(kalkulation, '1. Ersatzteile')).toBe('1.11')
  })

  it('zählt dabei numerisch, nicht alphabetisch', () => {
    // Alphabetisch stünde „1.9" hinter „1.10" und die nächste wäre fälschlich „1.10".
    const mit9 = [...kalkulation, { nummer: '1.9', abschnitt: '1. Ersatzteile' }]
    expect(naechsteNummer(mit9, '1. Ersatzteile')).toBe('1.11')
  })

  it('eröffnet für einen neuen Abschnitt die nächste Hauptnummer', () => {
    expect(naechsteNummer(kalkulation, '3. Verbringung')).toBe('3.1')
  })

  it('vergibt in einem leeren Bereich die erste Nummer', () => {
    expect(naechsteNummer([], '1. Irgendwas')).toBe('1.1')
  })

  it('bleibt bei einstufiger Gliederung einstufig', () => {
    const sonderfaelle = [
      { nummer: 'B.7', abschnitt: 'Teil B: Strukturelle Sonderfälle' },
      { nummer: 'B.8', abschnitt: 'Teil B: Strukturelle Sonderfälle' },
    ]
    expect(naechsteNummer(sonderfaelle, 'Teil B: Strukturelle Sonderfälle')).toBe('B.9')
  })

  it('übernimmt Buchstabenteil und Tiefe auch in einen neuen Abschnitt', () => {
    const sonderfaelle = [
      { nummer: 'B.7', abschnitt: 'Teil B: Strukturelle Sonderfälle' },
      { nummer: 'B.8', abschnitt: 'Teil B: Strukturelle Sonderfälle' },
    ]
    expect(naechsteNummer(sonderfaelle, 'Teil C: Neues')).toBe('B.9')
  })

  it('weicht aus, wenn die errechnete Nummer schon vergeben ist', () => {
    // 1.3 gehört zu einem anderen Abschnitt — die Nummer ist trotzdem belegt,
    // und der eindeutige Index über (Bereich, Nummer) würde das Anlegen
    // abweisen.
    const schief = [
      { nummer: '1.1', abschnitt: '1. Ersatzteile' },
      { nummer: '1.2', abschnitt: '1. Ersatzteile' },
      { nummer: '1.3', abschnitt: '2. Lackierung' },
    ]
    expect(naechsteNummer(schief, '1. Ersatzteile')).toBe('1.4')
  })

  it('übergeht Einträge ohne erkennbare Nummer', () => {
    const mitLuecke = [
      { nummer: '', abschnitt: '1. Ersatzteile' },
      { nummer: '1.1', abschnitt: '1. Ersatzteile' },
    ]
    expect(naechsteNummer(mitLuecke, '1. Ersatzteile')).toBe('1.2')
  })

  it('erkennt den Abschnitt unabhängig von Leerraum und Grossschreibung', () => {
    expect(naechsteNummer(kalkulation, '  1. ersatzteile  ')).toBe('1.11')
  })
})
