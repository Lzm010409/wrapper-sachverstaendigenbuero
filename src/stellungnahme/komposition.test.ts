import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/ki/client', () => ({
  MODELLE: { formulieren: 'test-modell' },
  rufeFuerTextAuf: vi.fn(),
}))

const { formulierePositionen } = await import('./komposition')
const { rufeFuerTextAuf } = await import('@/ki/client')
const ruf = vi.mocked(rufeFuerTextAuf)

afterEach(() => {
  ruf.mockReset()
})

function auftrag(bezeichnung: string) {
  return {
    positionId: bezeichnung,
    auftrag: {
      positionBezeichnung: bezeichnung,
      begruendungVersicherer: null,
      bausteine: [{ text: 'Ein Baustein.', herkunft: 'bibliothek' as const }],
      platzhalterWerte: {},
      betragGutachten: null,
      betragGekuerzt: null,
    },
  }
}

describe('formulierePositionen', () => {
  it('lässt die erste Position allein laufen, bevor die übrigen starten', async () => {
    // Zählt, wie viele Aufrufe gleichzeitig offen waren. Ohne Warmlauf wären
    // es bei vier Positionen vier; mit Warmlauf erst einer, dann drei.
    let offen = 0
    let hoechstensGleichzeitig = 0

    ruf.mockImplementation(async () => {
      offen += 1
      hoechstensGleichzeitig = Math.max(hoechstensGleichzeitig, offen)
      await new Promise((weiter) => setTimeout(weiter, 5))
      offen -= 1
      return 'Absatz.'
    })

    await formulierePositionen([auftrag('a'), auftrag('b'), auftrag('c'), auftrag('d')])

    expect(ruf).toHaveBeenCalledTimes(4)
    expect(hoechstensGleichzeitig).toBe(3)
  })

  it('gibt die Ergebnisse in der Reihenfolge der Aufträge zurück', async () => {
    ruf.mockImplementation(async () => 'Absatz.')

    const ergebnis = await formulierePositionen([auftrag('a'), auftrag('b'), auftrag('c')])

    expect(ergebnis.map((e) => e.positionId)).toEqual(['a', 'b', 'c'])
    expect(ergebnis.every((e) => e.text === 'Absatz.')).toBe(true)
  })

  it('reisst die übrigen Positionen nicht mit, wenn der Warmlauf scheitert', async () => {
    ruf
      .mockRejectedValueOnce(new Error('Das Sprachmodell antwortete nicht.'))
      .mockResolvedValue('Absatz.')

    const ergebnis = await formulierePositionen([auftrag('a'), auftrag('b')])

    expect(ergebnis[0]).toEqual({
      positionId: 'a',
      fehler: 'Das Sprachmodell antwortete nicht.',
    })
    expect(ergebnis[1]).toEqual({ positionId: 'b', text: 'Absatz.' })
  })

  it('isoliert einen Fehler in einer späteren Position', async () => {
    ruf.mockResolvedValueOnce('Absatz.').mockRejectedValueOnce(new Error('kaputt'))

    const ergebnis = await formulierePositionen([auftrag('a'), auftrag('b')])

    expect(ergebnis[0]?.text).toBe('Absatz.')
    expect(ergebnis[1]?.fehler).toBe('kaputt')
  })

  it('gibt bei leerer Liste nichts zurück und ruft das Modell nicht auf', async () => {
    expect(await formulierePositionen([])).toEqual([])
    expect(ruf).not.toHaveBeenCalled()
  })
})
