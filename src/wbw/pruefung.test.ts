import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  brauchbare,
  inPakete,
  pruefePaket,
  ungeprueft,
  vorbelegt,
  type Inseratsangabe,
  type Pruefurteil,
} from './pruefung'

vi.mock('@/ki/client', () => ({
  MODELLE: { schnell: 'test-modell' },
  rufeMitWerkzeugAuf: vi.fn(),
}))
vi.mock('@/protokoll', () => ({ protokolliereWarnung: vi.fn() }))

const { rufeMitWerkzeugAuf } = await import('@/ki/client')
const ruf = vi.mocked(rufeMitWerkzeugAuf)

afterEach(() => {
  ruf.mockReset()
})

const AUFTRAG = {
  subjekt: {
    marke: 'Mercedes-Benz',
    modell: 'E 53 AMG',
    variante: '4Matic+',
    ez: '06/2021',
    kilometerstand: 42000,
    leistungKw: 320,
  },
  sollAusstattung: ['Panoramadach', 'Standheizung'],
}

function inserat(id: string, mehr: Partial<Inseratsangabe> = {}): Inseratsangabe {
  return {
    id,
    quelle: 'autoscout24',
    titel: 'Mercedes-Benz E 53 AMG',
    beschreibung: 'Scheckheftgepflegt, Panoramadach.',
    ausstattung: [],
    preis: 58000,
    kilometerstand: 45000,
    erstzulassung: '03/2021',
    leistungKw: 320,
    anzahlBilder: 12,
    ...mehr,
  }
}

function urteil(id: string, mehr: Record<string, unknown> = {}) {
  return {
    id,
    erkannteAusstattung: ['Panoramadach'],
    fehlendeAusstattung: ['Standheizung'],
    vergleichbarkeit: 82,
    begruendung: 'Gleiche Motorisierung, 3.000 km mehr.',
    auffaelligkeiten: [],
    empfehlung: 'aufnehmen',
    ...mehr,
  }
}

describe('Pakete', () => {
  it('teilt in Pakete der gewünschten Grösse', () => {
    expect(inPakete([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]])
  })

  it('kommt mit einer leeren Liste zurecht', () => {
    expect(inPakete([], 25)).toEqual([])
  })

  it('läuft bei Paketgrösse null nicht endlos', () => {
    expect(inPakete([1, 2], 0)).toEqual([[1], [2]])
  })
})

describe('Ein Paket prüfen', () => {
  it('ordnet die Urteile über die id zu, nicht über die Reihenfolge', async () => {
    // Ein verrutschtes Urteil wäre schlimmer als ein fehlendes: es sieht
    // plausibel aus und hängt am falschen Fahrzeug.
    ruf.mockResolvedValue({ urteile: [urteil('b'), urteil('a', { vergleichbarkeit: 40 })] })

    const ergebnis = await pruefePaket(AUFTRAG, [inserat('a'), inserat('b')])

    expect(ergebnis.map((u) => u.id)).toEqual(['a', 'b'])
    expect(ergebnis[0]?.vergleichbarkeit).toBe(40)
    expect(ergebnis[1]?.vergleichbarkeit).toBe(82)
  })

  it('lässt kein Inserat verschwinden, wenn der Aufruf scheitert', async () => {
    ruf.mockRejectedValue(new Error('429 rate limit'))

    const ergebnis = await pruefePaket(AUFTRAG, [inserat('a'), inserat('b')])

    expect(ergebnis).toHaveLength(2)
    expect(ergebnis.every((u) => u.ungeprueft)).toBe(true)
    expect(ergebnis.every((u) => u.empfehlung === 'pruefen')).toBe(true)
  })

  it('lässt kein Inserat verschwinden, wenn die Antwort nicht zum Schema passt', async () => {
    ruf.mockResolvedValue({ urteile: [{ id: 'a', vergleichbarkeit: 'sehr gut' }] })

    const ergebnis = await pruefePaket(AUFTRAG, [inserat('a')])

    expect(ergebnis).toHaveLength(1)
    expect(ergebnis[0]?.ungeprueft).toBe(true)
  })

  it('füllt ein fehlendes Urteil auf, statt das Fahrzeug zu übergehen', async () => {
    ruf.mockResolvedValue({ urteile: [urteil('a')] })

    const ergebnis = await pruefePaket(AUFTRAG, [inserat('a'), inserat('b')])

    expect(ergebnis).toHaveLength(2)
    expect(ergebnis[1]?.ungeprueft).toBe(true)
  })

  it('übernimmt keine erfundene id', async () => {
    // Das Modell gibt ein Urteil zu einem Inserat, das es nie gesehen hat.
    ruf.mockResolvedValue({ urteile: [urteil('a'), urteil('erfunden')] })

    const ergebnis = await pruefePaket(AUFTRAG, [inserat('a')])

    expect(ergebnis.map((u) => u.id)).toEqual(['a'])
  })

  it('kürzt eine ausufernde Begründung', async () => {
    ruf.mockResolvedValue({ urteile: [urteil('a', { begruendung: 'x'.repeat(900) })] })

    const ergebnis = await pruefePaket(AUFTRAG, [inserat('a')])

    expect(ergebnis[0]?.begruendung.length).toBe(300)
  })

  it('ruft für eine leere Liste gar nicht erst auf', async () => {
    expect(await pruefePaket(AUFTRAG, [])).toEqual([])
    expect(ruf).not.toHaveBeenCalled()
  })

  it('kürzt lange Beschreibungen, bevor sie hinausgehen', async () => {
    ruf.mockResolvedValue({ urteile: [urteil('a')] })
    await pruefePaket(AUFTRAG, [inserat('a', { beschreibung: 'Lang. '.repeat(1000) })])

    const inhalt = ruf.mock.calls[0]?.[0].inhalt[0]
    expect(inhalt?.text?.length).toBeLessThan(4000)
    expect(inhalt?.text).toContain('…')
  })
})

describe('Vorbelegung des Hakens', () => {
  const alsUrteil = (empfehlung: Pruefurteil['empfehlung']): Pruefurteil => ({
    ...ungeprueft('x', ''),
    empfehlung,
  })

  it('hakt an, was aufgenommen oder geprüft werden soll', () => {
    expect(vorbelegt(alsUrteil('aufnehmen'))).toBe(true)
    expect(vorbelegt(alsUrteil('pruefen'))).toBe(true)
  })

  it('lässt nur das Verworfene ohne Haken', () => {
    expect(vorbelegt(alsUrteil('verwerfen'))).toBe(false)
  })

  it('hakt an, wozu gar kein Urteil vorliegt', () => {
    // Sonst fiele ein Fahrzeug wegen eines Netzfehlers still aus dem Korb.
    expect(vorbelegt(undefined)).toBe(true)
  })
})

describe('Brauchbare zählen', () => {
  it('zählt nur, was das Modell aufnehmen würde', () => {
    const urteile: Pruefurteil[] = [
      { ...ungeprueft('a', ''), empfehlung: 'aufnehmen' },
      { ...ungeprueft('b', ''), empfehlung: 'pruefen' },
      { ...ungeprueft('c', ''), empfehlung: 'verwerfen' },
      { ...ungeprueft('d', ''), empfehlung: 'aufnehmen' },
    ]
    // „pruefen" zählt nicht mit: sonst hörte die Suche auf, weil acht
    // Fahrzeuge unklar sind.
    expect(brauchbare(urteile)).toBe(2)
  })
})
