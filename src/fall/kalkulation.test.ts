import { describe, expect, it, vi, afterEach } from 'vitest'
import { abrufkennung, ladeKalkulation } from './kalkulation'
import type { Gutachten } from '@/autoixpert/typen'

/**
 * Die VXS wird jetzt zweimal gelesen: für den Untertyp der
 * Vergleichsfahrzeugsuche **und** für die Kalkulationszahlen. Geprüft wird
 * hier vor allem, dass die vier Ausgänge auseinandergehalten werden — „keine
 * Kalkulation" und „nicht abrufbar" dürfen in der Oberfläche nicht dasselbe
 * anzeigen.
 */

const GUTACHTEN = { id: 'abc-123', external_id: '0926_2081TG' } as unknown as Gutachten

const MIT_ZAHLEN = `<vxs:Dossiers>
  <vxs:ManufacturerName>Mercedes-Benz</vxs:ManufacturerName>
  <vxs:SubModelName>E 53 AMG 4Matic+ (213.061)</vxs:SubModelName>
  <vxs:TotalNetCorrected>8490.71</vxs:TotalNetCorrected>
  <vxs:TotalGrossCorrected>10103.94</vxs:TotalGrossCorrected>
</vxs:Dossiers>`

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

/** Setzt einen Zugang und schiebt eine Antwort unter. */
async function mitAntwort(antwort: Response | Error) {
  vi.stubEnv('AUTOIXPERT_API_TOKEN', 'test-token')
  vi.stubEnv('AUTOIXPERT_BASIS_URL', 'https://example.test/v1')
  vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
    if (antwort instanceof Error) throw antwort
    return antwort
  })
  return ladeKalkulation(GUTACHTEN)
}

describe('abrufkennung', () => {
  it('nimmt die interne Id, weil sie immer eindeutig ist', () => {
    expect(abrufkennung(GUTACHTEN)).toBe('abc-123')
  })

  it('weicht auf die externe Id aus', () => {
    expect(abrufkennung({ id: '', external_id: '0926_2081TG' } as unknown as Gutachten)).toBe(
      '0926_2081TG',
    )
  })
})

describe('ladeKalkulation', () => {
  it('meldet einen fehlenden Zugang als solchen', async () => {
    vi.stubEnv('AUTOIXPERT_API_TOKEN', '')
    expect(await ladeKalkulation(GUTACHTEN)).toEqual({ stand: 'nicht_eingerichtet' })
  })

  it('liest die Zahlen, wenn eine Kalkulation da ist', async () => {
    const ansicht = await mitAntwort(new Response(MIT_ZAHLEN, { status: 200 }))
    expect(ansicht.stand).toBe('gefunden')
    expect(ansicht.daten?.kalkulation.reparaturkostenNetto).toBe(8490.71)
    expect(ansicht.daten?.kalkulation.reparaturkostenBrutto).toBe(10103.94)
    expect(ansicht.daten?.fahrzeug.untertyp).toBe('E 53 AMG 4Matic+ (213.061)')
  })

  it('nennt eine fehlende Kalkulation beim Namen — sie ist kein Fehler', async () => {
    const ansicht = await mitAntwort(new Response('nicht da', { status: 404 }))
    expect(ansicht.stand).toBe('ohne_kalkulation')
  })

  it('wertet eine leere Datei als „keine Kalkulation"', async () => {
    const ansicht = await mitAntwort(new Response('<vxs:Dossiers/>', { status: 200 }))
    expect(ansicht.stand).toBe('ohne_kalkulation')
  })

  it('unterscheidet einen Ausfall davon', async () => {
    const ansicht = await mitAntwort(new Response('kaputt', { status: 500 }))
    expect(ansicht.stand).toBe('fehler')
    expect(ansicht.meldung).toContain('500')
  })

  it('meldet auch die Unerreichbarkeit als Fehler', async () => {
    const ansicht = await mitAntwort(new Error('ECONNREFUSED'))
    expect(ansicht.stand).toBe('fehler')
    expect(ansicht.meldung).toContain('ECONNREFUSED')
  })
})
