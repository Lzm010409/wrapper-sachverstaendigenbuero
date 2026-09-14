import { describe, expect, it } from 'vitest'
import { API_TOKEN_ABLAEUFE, apiTokenStatus, hasheApiToken } from './api-token'

describe('hasheApiToken', () => {
  it('ist deterministisch', () => {
    expect(hasheApiToken('cockpit_abc')).toBe(hasheApiToken('cockpit_abc'))
  })

  it('unterscheidet verschiedene Tokens', () => {
    expect(hasheApiToken('cockpit_abc')).not.toBe(hasheApiToken('cockpit_abd'))
  })

  it('gibt nie das Klartext-Token zurück', () => {
    expect(hasheApiToken('cockpit_geheim')).not.toContain('geheim')
  })
})

describe('apiTokenStatus', () => {
  const inZukunft = new Date(Date.now() + 60_000)
  const inDerVergangenheit = new Date(Date.now() - 60_000)

  it('ist aktiv ohne Ablauf und ohne Widerruf', () => {
    expect(apiTokenStatus({ laeuftAbAm: null, widerrufenAm: null })).toBe('aktiv')
  })

  it('ist aktiv vor dem Ablaufdatum', () => {
    expect(apiTokenStatus({ laeuftAbAm: inZukunft, widerrufenAm: null })).toBe('aktiv')
  })

  it('ist abgelaufen nach dem Ablaufdatum', () => {
    expect(apiTokenStatus({ laeuftAbAm: inDerVergangenheit, widerrufenAm: null })).toBe(
      'abgelaufen',
    )
  })

  it('ist widerrufen, sobald ein Widerrufsdatum steht', () => {
    expect(apiTokenStatus({ laeuftAbAm: null, widerrufenAm: inDerVergangenheit })).toBe(
      'widerrufen',
    )
  })

  it('meldet Widerruf, auch wenn das Token zusätzlich abgelaufen ist', () => {
    // Widerruf ist die endgültigere Aussage — sie soll nicht von einem
    // gleichzeitig abgelaufenen Ablaufdatum verdeckt werden.
    expect(
      apiTokenStatus({ laeuftAbAm: inDerVergangenheit, widerrufenAm: inDerVergangenheit }),
    ).toBe('widerrufen')
  })

  it('akzeptiert Zeitangaben auch als Zeichenkette — wie sie aus der Datenbank kommen', () => {
    expect(
      apiTokenStatus({
        laeuftAbAm: inDerVergangenheit.toISOString(),
        widerrufenAm: null,
      }),
    ).toBe('abgelaufen')
  })
})

describe('API_TOKEN_ABLAEUFE', () => {
  it('bietet die drei besprochenen Optionen', () => {
    expect(API_TOKEN_ABLAEUFE.map((a) => a.wert)).toEqual(['90-tage', '1-jahr', 'nie'])
  })
})
