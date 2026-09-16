import { describe, expect, it, vi } from 'vitest'
import type { AutoixpertClient } from '@/autoixpert/client'
import type { Dokument } from '@/autoixpert/typen'
import type { EingelesenerBericht } from '@/pruefbericht/einlesen'

vi.mock('server-only', () => ({}))

const leseBericht = vi.fn()
vi.mock('@/pruefbericht/einlesen', () => ({ leseBericht: (...args: unknown[]) => leseBericht(...args) }))

const extrahiereKalkulation = vi.fn()
vi.mock('./extraktion', () => ({
  extrahiereKalkulation: (...args: unknown[]) => extrahiereKalkulation(...args),
}))

const { ladeGutachtenKalkulation } = await import('./laden')

/**
 * Ein Fake statt eines echten `AutoixpertClient` — hier geht es nur um die
 * Reihenfolge der Aufrufe (DAT-Kalkulation vor Gutachten), nicht um HTTP.
 * Der Client selbst hat seine eigenen Tests in `autoixpert/client.test.ts`.
 */
function client(dokumente: Dokument[]): { holeDokumente: ReturnType<typeof vi.fn>; holeDokumentDatei: ReturnType<typeof vi.fn> } {
  return {
    holeDokumente: vi.fn().mockResolvedValue(dokumente),
    holeDokumentDatei: vi.fn().mockResolvedValue(Buffer.from('PDF')),
  }
}

const BERICHT: EingelesenerBericht = {
  seitenzahl: 1,
  seiten: [{ nummer: 1, art: 'text', text: 'Lohn 100' }],
  zusammenfassung: { text: 1, bild: 0 },
}

describe('ladeGutachtenKalkulation', () => {
  it('lädt die DAT-Schadenskalkulation, wenn sie in der Dokumentliste steht', async () => {
    leseBericht.mockResolvedValue(BERICHT)
    extrahiereKalkulation.mockResolvedValue({
      kalkulation: { zeilen: [{ bezeichnung: 'Lohn', betrag: 100 }], summeNetto: 100, unklarheiten: [] },
      quellen: { text: 1, bild: 0 },
    })

    const c = client([
      { id: 'd1', type: 'report' },
      { id: 'd2', type: 'dat_damage_calculation' },
    ] as Dokument[])

    const ergebnis = await ladeGutachtenKalkulation(c as unknown as AutoixpertClient, 'r1')

    expect(ergebnis.quelle).toBe('dat_damage_calculation')
    expect(ergebnis.zeilen).toEqual([{ bezeichnung: 'Lohn', betrag: 100 }])
    expect(c.holeDokumentDatei).toHaveBeenCalledWith('r1', 'dat_damage_calculation')
  })

  it('weicht auf das Gutachten-PDF aus, wenn keine DAT-Kalkulation vorliegt', async () => {
    leseBericht.mockResolvedValue(BERICHT)
    extrahiereKalkulation.mockResolvedValue({
      kalkulation: { zeilen: [], summeNetto: null, unklarheiten: [] },
      quellen: { text: 1, bild: 0 },
    })

    const c = client([{ id: 'd1', type: 'report' }] as Dokument[])

    const ergebnis = await ladeGutachtenKalkulation(c as unknown as AutoixpertClient, 'r1')

    expect(ergebnis.quelle).toBe('report')
    expect(c.holeDokumentDatei).toHaveBeenCalledWith('r1', 'report')
  })
})
