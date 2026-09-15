import { describe, expect, it } from 'vitest'
import { importSchema } from './schema'

describe('importSchema', () => {
  it('nimmt eine vollständige Antwort des Modells an', () => {
    const ergebnis = importSchema.safeParse({
      betreff: 'Stellungnahme zur Kürzung vom 01.02.2026',
      anrede: 'Sehr geehrte Damen und Herren,',
      empfaengerName: 'HUK-Coburg',
      empfaengerStrasse: 'Bahnhofsplatz 1',
      empfaengerPlzOrt: '96450 Coburg',
      positionen: [
        {
          bezeichnung: 'UPE-Aufschlag',
          begruendungstext: 'Der Aufschlag ist regional üblich und wurde zurecht angesetzt.',
          betragGutachten: 150.5,
          betragGekuerzt: 100,
        },
      ],
      ergebnisAbsatz: 'Wir bitten um Nachzahlung des Differenzbetrags.',
      unklarheiten: [],
    })
    expect(ergebnis.success).toBe(true)
  })

  it('lässt jedes Feld einer Position leer, wenn nichts zweifelsfrei zu lesen war', () => {
    const ergebnis = importSchema.safeParse({
      betreff: null,
      anrede: null,
      empfaengerName: null,
      empfaengerStrasse: null,
      empfaengerPlzOrt: null,
      positionen: [
        { bezeichnung: 'Lackierlohn', begruendungstext: null, betragGutachten: null, betragGekuerzt: null },
      ],
      ergebnisAbsatz: null,
      unklarheiten: ['Beträge nicht eindeutig lesbar'],
    })
    expect(ergebnis.success).toBe(true)
  })

  it('setzt unklarheiten auf eine leere Liste, wenn das Modell sie wegliess', () => {
    const ergebnis = importSchema.safeParse({
      betreff: null,
      anrede: null,
      empfaengerName: null,
      empfaengerStrasse: null,
      empfaengerPlzOrt: null,
      positionen: [],
      ergebnisAbsatz: null,
    })
    expect(ergebnis.success).toBe(true)
    if (ergebnis.success) expect(ergebnis.data.unklarheiten).toEqual([])
  })

  it('weist eine Position ohne Bezeichnung ab', () => {
    const ergebnis = importSchema.safeParse({
      betreff: null,
      anrede: null,
      empfaengerName: null,
      empfaengerStrasse: null,
      empfaengerPlzOrt: null,
      positionen: [{ begruendungstext: null, betragGutachten: null, betragGekuerzt: null }],
      ergebnisAbsatz: null,
    })
    expect(ergebnis.success).toBe(false)
  })

  it('weist eine fehlende positionen-Liste ab', () => {
    const ergebnis = importSchema.safeParse({
      betreff: 'X',
      anrede: null,
      empfaengerName: null,
      empfaengerStrasse: null,
      empfaengerPlzOrt: null,
      ergebnisAbsatz: null,
    })
    expect(ergebnis.success).toBe(false)
  })
})
