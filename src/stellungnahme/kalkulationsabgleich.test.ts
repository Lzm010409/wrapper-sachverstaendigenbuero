import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Kalkulationszeile } from '@/gutachtenkalkulation/schema'

vi.mock('server-only', () => ({}))
vi.mock('@/ki/client', () => ({
  MODELLE: { schnell: 'test-modell' },
  rufeMitWerkzeugAuf: vi.fn(),
}))

const { ermittleKalkulationsvorschlag } = await import('./kalkulationsabgleich')
const { rufeMitWerkzeugAuf } = await import('@/ki/client')
const ruf = vi.mocked(rufeMitWerkzeugAuf)

afterEach(() => {
  ruf.mockReset()
})

const ZEILEN: Kalkulationszeile[] = [
  { bezeichnung: 'Lohn Lackierung Stoßfänger vorne', betrag: 245.5 },
  { bezeichnung: 'Lackmaterial Stoßfänger vorne', betrag: 88.2 },
  { bezeichnung: 'Ersatzteile Scheinwerfer links', betrag: 410 },
]

const POSITION = { bezeichnung: 'UPE-Aufschlag', begruendungVersicherer: 'Regional nicht üblich' }

describe('ermittleKalkulationsvorschlag', () => {
  it('meldet null ohne jeden Aufruf, wenn es keine Kalkulationszeilen gibt', async () => {
    const ergebnis = await ermittleKalkulationsvorschlag(POSITION, [])
    expect(ergebnis).toBeNull()
    expect(ruf).not.toHaveBeenCalled()
  })

  it('summiert die vom Modell gemeldeten Treffer aus den echten Beträgen', async () => {
    ruf.mockResolvedValue({
      treffer: [
        { index: 0, grund: 'Lohnzeile der Beilackierung' },
        { index: 1, grund: 'Lackmaterialzeile derselben Beilackierung' },
      ],
      begruendung: 'Beide Zeilen gehören zur Beilackierung des Stoßfängers.',
    })

    const vorschlag = await ermittleKalkulationsvorschlag(POSITION, ZEILEN)

    expect(vorschlag).not.toBeNull()
    // 245.50 + 88.20, nicht vom Modell errechnet, sondern aus den echten Zeilen summiert.
    expect(vorschlag!.betrag).toBe(333.7)
    expect(vorschlag!.verwendeteZeilen).toHaveLength(2)
    expect(vorschlag!.begruendung).toContain('Beilackierung')
  })

  it('entdoppelt einen mehrfach gemeldeten Index, bevor summiert wird', async () => {
    ruf.mockResolvedValue({
      treffer: [
        { index: 0, grund: 'a' },
        { index: 0, grund: 'b, nochmal dieselbe Zeile' },
      ],
      begruendung: 'x',
    })

    const vorschlag = await ermittleKalkulationsvorschlag(POSITION, ZEILEN)

    expect(vorschlag!.betrag).toBe(245.5)
    expect(vorschlag!.verwendeteZeilen).toHaveLength(1)
  })

  it('gibt null zurück, wenn das Modell keinen Treffer meldet', async () => {
    ruf.mockResolvedValue({ treffer: [], begruendung: 'Keine passende Zeile gefunden.' })

    const vorschlag = await ermittleKalkulationsvorschlag(POSITION, ZEILEN)

    expect(vorschlag).toBeNull()
  })

  it('ignoriert einen Index ausserhalb der Liste, statt abzustürzen', async () => {
    ruf.mockResolvedValue({ treffer: [{ index: 99, grund: 'unfug' }], begruendung: 'x' })

    const vorschlag = await ermittleKalkulationsvorschlag(POSITION, ZEILEN)

    expect(vorschlag).toBeNull()
  })

  it('wirft verständlich, wenn die Antwort nicht zum Schema passt', async () => {
    ruf.mockResolvedValue({ treffer: 'unfug' })

    await expect(ermittleKalkulationsvorschlag(POSITION, ZEILEN)).rejects.toThrow(/unerwarteter Form/)
  })
})
