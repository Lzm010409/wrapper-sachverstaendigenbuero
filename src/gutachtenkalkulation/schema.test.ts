import { describe, expect, it } from 'vitest'
import { gutachtenKalkulationSchema, kalkulationszeileSchema } from './schema'

describe('kalkulationszeileSchema', () => {
  it('nimmt eine Zeile mit Bezeichnung und Betrag an', () => {
    const ergebnis = kalkulationszeileSchema.safeParse({
      bezeichnung: 'Lohn Lackierung Stoßfänger vorne',
      betrag: 245.5,
    })
    expect(ergebnis.success).toBe(true)
  })

  it('weist eine Zeile ohne Betrag ab', () => {
    const ergebnis = kalkulationszeileSchema.safeParse({ bezeichnung: 'Ersatzteile' })
    expect(ergebnis.success).toBe(false)
  })
})

describe('gutachtenKalkulationSchema', () => {
  it('nimmt eine vollständige Antwort des Modells an', () => {
    const ergebnis = gutachtenKalkulationSchema.safeParse({
      zeilen: [
        { bezeichnung: 'Lohn Karosserie', betrag: 620.4 },
        { bezeichnung: 'Ersatzteile Stoßfänger vorne', betrag: 410 },
      ],
      summeNetto: 1030.4,
      unklarheiten: [],
    })
    expect(ergebnis.success).toBe(true)
  })

  it('lässt eine leere Zeilenliste und eine unbekannte Summe zu', () => {
    const ergebnis = gutachtenKalkulationSchema.safeParse({
      zeilen: [],
      summeNetto: null,
      unklarheiten: ['Kalkulation nur als Scan, Beträge nicht zweifelsfrei lesbar'],
    })
    expect(ergebnis.success).toBe(true)
  })

  it('setzt unklarheiten auf eine leere Liste, wenn das Modell sie wegliess', () => {
    const ergebnis = gutachtenKalkulationSchema.safeParse({ zeilen: [], summeNetto: null })
    expect(ergebnis.success).toBe(true)
    if (ergebnis.success) expect(ergebnis.data.unklarheiten).toEqual([])
  })

  it('weist eine Antwort ohne Zeilenliste ab', () => {
    const ergebnis = gutachtenKalkulationSchema.safeParse({ summeNetto: null })
    expect(ergebnis.success).toBe(false)
  })
})
