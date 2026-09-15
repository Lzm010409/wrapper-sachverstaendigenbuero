import { describe, expect, it } from 'vitest'
import { pruefePositionsfelder } from './positions-validierung'

describe('pruefePositionsfelder', () => {
  it('lässt gültige Eingaben durch und rundet auf zwei Nachkommastellen', () => {
    const ergebnis = pruefePositionsfelder({
      bezeichnung: '  Lackierlohn  ',
      betragGutachten: '150.5',
      betragGekuerzt: '100',
    })
    expect(ergebnis).toEqual({
      werte: { bezeichnung: 'Lackierlohn', betragGutachten: 150.5, betragGekuerzt: 100 },
    })
  })

  it('lässt leere Beträge als "kein Betrag" durch', () => {
    const ergebnis = pruefePositionsfelder({
      bezeichnung: 'Wertminderung',
      betragGutachten: '',
      betragGekuerzt: '  ',
    })
    expect(ergebnis).toEqual({
      werte: { bezeichnung: 'Wertminderung', betragGutachten: null, betragGekuerzt: null },
    })
  })

  it('weist eine leere Bezeichnung ab', () => {
    const ergebnis = pruefePositionsfelder({
      bezeichnung: '   ',
      betragGutachten: '',
      betragGekuerzt: '',
    })
    expect(ergebnis).toEqual({ fehler: 'Die Bezeichnung darf nicht leer sein.' })
  })

  it('weist einen negativen Betrag ab', () => {
    const ergebnis = pruefePositionsfelder({
      bezeichnung: 'Lackierlohn',
      betragGutachten: '-50',
      betragGekuerzt: '',
    })
    expect('fehler' in ergebnis && ergebnis.fehler).toMatch(/Gutachten-Betrag/)
  })

  it('weist mehr als zwei Nachkommastellen ab', () => {
    const ergebnis = pruefePositionsfelder({
      bezeichnung: 'Lackierlohn',
      betragGutachten: '',
      betragGekuerzt: '100.999',
    })
    expect('fehler' in ergebnis && ergebnis.fehler).toMatch(/Gekürzter Betrag/)
  })

  it('weist Text ab, der keine Zahl ist', () => {
    const ergebnis = pruefePositionsfelder({
      bezeichnung: 'Lackierlohn',
      betragGutachten: 'einhundert',
      betragGekuerzt: '',
    })
    expect('fehler' in ergebnis).toBe(true)
  })

  it('verlangt keine Relation zwischen den beiden Beträgen — ein gekürzter Betrag über dem Gutachten ist erlaubt', () => {
    const ergebnis = pruefePositionsfelder({
      bezeichnung: 'Nachforderung',
      betragGutachten: '100',
      betragGekuerzt: '150',
    })
    expect(ergebnis).toEqual({
      werte: { bezeichnung: 'Nachforderung', betragGutachten: 100, betragGekuerzt: 150 },
    })
  })
})
