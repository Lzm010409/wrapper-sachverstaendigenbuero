import { afterEach, describe, expect, it, vi } from 'vitest'
import type { EingelesenerBericht } from '@/pruefbericht/einlesen'

vi.mock('server-only', () => ({}))
vi.mock('@/ki/client', () => ({
  MODELLE: { schnell: 'test-modell' },
  rufeMitWerkzeugAuf: vi.fn(),
}))

const { extrahiereKalkulation, baueInhalt } = await import('./extraktion')
const { rufeMitWerkzeugAuf } = await import('@/ki/client')
const ruf = vi.mocked(rufeMitWerkzeugAuf)

afterEach(() => {
  ruf.mockReset()
})

const BERICHT: EingelesenerBericht = {
  seitenzahl: 2,
  seiten: [
    { nummer: 1, art: 'text', text: 'Lohn Karosserie 620,40' },
    { nummer: 2, art: 'bild', text: '', bildBase64: 'ZmFrZQ==' },
  ],
  zusammenfassung: { text: 1, bild: 1 },
}

describe('baueInhalt', () => {
  it('trägt Text- und Bildseiten als eigene Blöcke', () => {
    const bloecke = baueInhalt(BERICHT)
    expect(bloecke.some((b) => b.type === 'text' && b.text?.includes('Lohn Karosserie'))).toBe(true)
    expect(bloecke.some((b) => b.type === 'image')).toBe(true)
  })
})

describe('extrahiereKalkulation', () => {
  it('gibt die geprüfte Kalkulation samt Seitenzusammenfassung zurück', async () => {
    ruf.mockResolvedValue({
      zeilen: [{ bezeichnung: 'Lohn Karosserie', betrag: 620.4 }],
      summeNetto: 620.4,
      unklarheiten: [],
    })

    const ergebnis = await extrahiereKalkulation(BERICHT)

    expect(ergebnis.kalkulation.zeilen).toHaveLength(1)
    expect(ergebnis.kalkulation.summeNetto).toBe(620.4)
    expect(ergebnis.quellen).toEqual({ text: 1, bild: 1 })
    expect(ruf).toHaveBeenCalledWith(
      expect.objectContaining({ modell: 'test-modell', werkzeug: expect.objectContaining({ name: 'kalkulationszeilen_melden' }) }),
    )
  })

  it('wirft verständlich, wenn die Antwort nicht zum Schema passt', async () => {
    ruf.mockResolvedValue({ zeilen: 'unfug' })

    await expect(extrahiereKalkulation(BERICHT)).rejects.toThrow(/unerwarteter Form/)
  })
})
