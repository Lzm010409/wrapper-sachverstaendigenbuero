import { describe, expect, it } from 'vitest'
import { REITER } from './reiterleiste'
import { baueAutoixpertLink } from './autoixpert-link'

/**
 * Der Absprung nach autoiXpert ist ein Link ins Leere, wenn Id oder Reiter
 * nicht passen - beides muss deshalb hart auf `null` fallen statt auf eine
 * kaputte URL.
 */
describe('baueAutoixpertLink', () => {
  it('baut den Reiter-spezifischen Link je Wrapper-Reiter', () => {
    expect(baueAutoixpertLink('abc123', 'beteiligte')).toBe(
      'https://app.autoixpert.de/Gutachten/abc123/Beteiligte',
    )
    expect(baueAutoixpertLink('abc123', 'fahrzeug')).toBe(
      'https://app.autoixpert.de/Gutachten/abc123/Fahrzeug',
    )
    expect(baueAutoixpertLink('abc123', 'fotos')).toBe(
      'https://app.autoixpert.de/Gutachten/abc123/Fotos',
    )
    expect(baueAutoixpertLink('abc123', 'vorgang')).toBe(
      'https://app.autoixpert.de/Gutachten/abc123/Druck-und-Versand',
    )
  })

  it('kalkulation und wbw zeigen beide auf die Schadenskalkulation', () => {
    expect(baueAutoixpertLink('abc123', 'kalkulation')).toBe(
      'https://app.autoixpert.de/Gutachten/abc123/Schadenskalkulation',
    )
    expect(baueAutoixpertLink('abc123', 'wbw')).toBe(
      'https://app.autoixpert.de/Gutachten/abc123/Schadenskalkulation',
    )
  })

  it('liefert null fuer Stellungnahmen - dort gibt es keine Entsprechung', () => {
    expect(baueAutoixpertLink('abc123', 'stellungnahmen')).toBeNull()
  })

  it('liefert null ohne autoixpertId', () => {
    expect(baueAutoixpertLink(null, 'beteiligte')).toBeNull()
    expect(baueAutoixpertLink(undefined, 'beteiligte')).toBeNull()
    expect(baueAutoixpertLink('', 'beteiligte')).toBeNull()
  })

  it('kodiert Sonderzeichen in der Id', () => {
    expect(baueAutoixpertLink('a b/c', 'fahrzeug')).toBe(
      'https://app.autoixpert.de/Gutachten/a%20b%2Fc/Fahrzeug',
    )
  })

  it('deckt jeden Wrapper-Reiter ab - keiner darf vergessen werden', () => {
    for (const r of REITER) {
      expect(() => baueAutoixpertLink('abc123', r.schluessel)).not.toThrow()
    }
  })
})
