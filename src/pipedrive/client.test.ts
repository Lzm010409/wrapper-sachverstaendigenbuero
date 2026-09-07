import { describe, expect, it } from 'vitest'
import { monetaerWert } from './client'

describe('monetaerWert', () => {
  it('liest Geldfelder in beiden Schreibweisen', () => {
    // Pipedrive liefert je nach API-Fassung eine nackte Zahl oder ein Objekt.
    expect(monetaerWert(1234.5)).toBe(1234.5)
    expect(monetaerWert({ value: 99, currency: 'EUR' })).toBe(99)
  })

  it('gibt nichts zurueck, wo nichts steht', () => {
    expect(monetaerWert(undefined)).toBeUndefined()
    expect(monetaerWert(null)).toBeUndefined()
    expect(monetaerWert({ currency: 'EUR' })).toBeUndefined()
  })
})
