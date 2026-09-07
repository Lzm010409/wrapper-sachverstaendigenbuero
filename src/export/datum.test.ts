import { describe, expect, it } from 'vitest'
import { nachDeutsch, nachIso } from './datum'
import { baueEinleitung, type Kopfdaten } from './hausstil'

describe('Datum des Anschreibens', () => {
  it('übersetzt zwischen deutscher und ISO-Schreibweise', () => {
    expect(nachIso('01.08.2026')).toBe('2026-08-01')
    expect(nachIso('1.8.2026')).toBe('2026-08-01')
    expect(nachDeutsch('2026-08-01')).toBe('01.08.2026')
  })

  it('lässt eine ISO-Angabe unverändert durch', () => {
    expect(nachIso('2026-08-01')).toBe('2026-08-01')
  })

  it('behandelt Bruchstücke wie eine leere Angabe', () => {
    // „0" stand tatsächlich in einem Schreiben: das Feld war ein Textfeld,
    // der Kasten klappte beim ersten Zeichen zu, und das Bruchstück blieb.
    for (const murks of ['0', '01.', '01.08.', 'morgen', '', '32.13.2026']) {
      expect(nachIso(murks)).toBe('')
      expect(nachDeutsch(nachIso(murks))).toBe('')
    }
  })

  it('geht den Weg hin und zurück ohne Verlust', () => {
    for (const tag of ['01.01.2026', '13.08.2026', '31.12.2025']) {
      expect(nachDeutsch(nachIso(tag))).toBe(tag)
    }
  })
})

const KOPF: Kopfdaten = {
  ort: 'Westerstede',
  datum: new Date('2026-08-13T10:00:00Z'),
  empfaengerName: 'Rechtsanwalt Jens Schlossmacher',
  empfaengerStrasse: null,
  empfaengerPlzOrt: null,
  betreff: 'Stellungnahme',
  anrede: 'Sehr geehrte Damen und Herren,',
  einleitungDatum: null,
  einleitungMedium: 'schreiben',
  pruefdienstleister: null,
  vorbemerkungEinfuegen: false,
}

describe('Einleitungssatz', () => {
  it('bleibt aus, solange das Datum ein Bruchstück ist', () => {
    expect(baueEinleitung({ ...KOPF, einleitungDatum: '0' })).toBeNull()
    expect(baueEinleitung({ ...KOPF, einleitungDatum: '01.08.' })).toBeNull()
  })

  it('nennt Datum und Prüfdienstleister, sobald das Datum vollständig ist', () => {
    const satz = baueEinleitung({
      ...KOPF,
      einleitungDatum: '01.08.2026',
      pruefdienstleister: 'ClaimsControlling GmbH',
    })
    expect(satz).toContain('mit dem Schreiben vom 01.08.2026')
    expect(satz).toContain('ClaimsControlling GmbH')
  })
})
