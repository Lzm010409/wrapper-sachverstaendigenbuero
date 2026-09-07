import { describe, expect, it } from 'vitest'
import { REITER, leseReiter } from './reiterleiste'

/**
 * Der Reiter steht in der Adresse. Alles, was von dort kommt, ist Eingabe
 * aus der Welt - ein Tippfehler, ein alter Verweis, ein Angriffsversuch.
 * Keiner davon darf zu einer leeren Seite fuehren.
 */
describe('leseReiter', () => {
  it('nimmt jeden bekannten Reiter an', () => {
    for (const r of REITER) {
      expect(leseReiter(r.schluessel)).toBe(r.schluessel)
    }
  })

  it('faellt ohne Angabe auf den ersten Reiter zurueck', () => {
    expect(leseReiter(undefined)).toBe('beteiligte')
  })

  it('faellt bei unbekannter Angabe auf den ersten Reiter zurueck', () => {
    expect(leseReiter('kalkulation')).toBe('beteiligte')
    expect(leseReiter('')).toBe('beteiligte')
    expect(leseReiter('__proto__')).toBe('beteiligte')
  })

  it('haelt den Fall als ersten Reiter fest', () => {
    // Wer einen Fall oeffnet, soll bei den Beteiligten landen - nicht in
    // einem Werkzeug. Aendert sich die Reihenfolge, faellt es hier auf.
    expect(REITER[0].schluessel).toBe('beteiligte')
  })
})
