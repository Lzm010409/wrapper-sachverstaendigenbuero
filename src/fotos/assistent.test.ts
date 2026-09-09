import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  auftragstext,
  beschriftePaket,
  inPakete,
  naechstesPaket,
  type Bildpaket,
} from './assistent'

vi.mock('@/ki/client', () => ({
  MODELLE: { schnell: 'test-modell' },
  rufeMitWerkzeugAuf: vi.fn(),
}))
vi.mock('@/protokoll', () => ({ protokolliereWarnung: vi.fn() }))

const { rufeMitWerkzeugAuf } = await import('@/ki/client')
const ruf = vi.mocked(rufeMitWerkzeugAuf)

afterEach(() => ruf.mockReset())

const FAHRZEUG = {
  marke: 'Mercedes-Benz',
  modell: 'E 53 AMG 4Matic+',
  kennzeichen: 'OL-AB 123',
  schadenbeschreibung: 'Anstoss hinten rechts',
}

function bild(fotoId: string): Bildpaket {
  return { fotoId, daten: 'AAA', typ: 'image/jpeg' }
}

function antwort(vorschlaege: unknown[]) {
  return { vorschlaege }
}

describe('inPakete', () => {
  it('teilt in Pakete und lässt keins fallen', () => {
    const pakete = inPakete([1, 2, 3, 4, 5], 2)
    expect(pakete).toEqual([[1, 2], [3, 4], [5]])
  })

  it('läuft bei Paketgrösse 0 nicht endlos', () => {
    expect(inPakete([1, 2], 0)).toEqual([[1], [2]])
  })
})

describe('auftragstext', () => {
  it('nennt die Stilbeispiele, wenn es welche gibt', () => {
    const text = auftragstext(FAHRZEUG, ['Heckstossfänger rechts, Kratzer'])
    expect(text).toContain('Heckstossfänger rechts, Kratzer')
    expect(text).toContain('Kennzeichen: OL-AB 123')
  })

  it('lässt den Stilabschnitt weg, wenn der Fall noch keine Beschreibung hat', () => {
    expect(auftragstext(FAHRZEUG, [])).not.toContain('Sachverständige in diesem Fall bereits')
  })

  it('führt alle Kategorien auf, damit das Modell keine erfindet', () => {
    const text = auftragstext(FAHRZEUG, [])
    expect(text).toContain('ansicht_hinten_rechts')
    expect(text).toContain('vin')
  })
})

describe('beschriftePaket', () => {
  it('ordnet die Vorschläge nach id zu, nicht nach Reihenfolge', async () => {
    ruf.mockResolvedValue(
      antwort([
        { id: 'b', kategorie: 'tacho', beschreibung: 'Tachostand', sicherheit: 90 },
        { id: 'a', kategorie: 'kennzeichen', beschreibung: 'Amtliches Kennzeichen', sicherheit: 95 },
      ]),
    )

    const vorschlaege = await beschriftePaket(FAHRZEUG, [], [bild('a'), bild('b')])

    expect(vorschlaege.map((v) => [v.fotoId, v.kategorie])).toEqual([
      ['a', 'kennzeichen'],
      ['b', 'tacho'],
    ])
  })

  it('erfindet nichts, wenn zu einem Bild kein Vorschlag kam', async () => {
    ruf.mockResolvedValue(
      antwort([{ id: 'a', kategorie: 'reifen', beschreibung: 'Reifen vorne links', sicherheit: 80 }]),
    )

    const vorschlaege = await beschriftePaket(FAHRZEUG, [], [bild('a'), bild('b')])

    expect(vorschlaege.map((v) => v.fotoId)).toEqual(['a'])
  })

  it('leitet die vier Häkchen aus der Kategorie ab', async () => {
    ruf.mockResolvedValue(
      antwort([
        { id: 'a', kategorie: 'kennzeichen', beschreibung: 'Amtliches Kennzeichen', sicherheit: 95 },
        { id: 'b', kategorie: 'schaden', beschreibung: 'Heckklappe verzogen', sicherheit: 88 },
      ]),
    )

    const [kennzeichen, schaden] = await beschriftePaket(FAHRZEUG, [], [bild('a'), bild('b')])

    // Das Kennzeichen identifiziert Fahrzeug und Halter — nicht in die Börse.
    expect(kennzeichen?.verwendung.inRestwertboerse).toBe(false)
    expect(kennzeichen?.verwendung.imGutachten).toBe(true)
    expect(schaden?.verwendung).toEqual({
      imGutachten: true,
      inRestwertboerse: true,
      inReparaturbestaetigung: true,
      inStellungnahme: true,
    })
  })

  it('kürzt die Beschreibung und nimmt das Satzzeichen am Ende weg', async () => {
    ruf.mockResolvedValue(
      antwort([{ id: 'a', kategorie: 'schaden', beschreibung: `${'x'.repeat(200)}.`, sicherheit: 70 }]),
    )

    const [vorschlag] = await beschriftePaket(FAHRZEUG, [], [bild('a')])

    expect(vorschlag?.beschreibung.length).toBe(120)
    expect(vorschlag?.beschreibung.endsWith('.')).toBe(false)
  })

  it('nimmt einen leeren Vorschlag nicht an', async () => {
    ruf.mockResolvedValue(antwort([{ id: 'a', kategorie: 'schaden', beschreibung: '  ', sicherheit: 60 }]))

    expect(await beschriftePaket(FAHRZEUG, [], [bild('a')])).toEqual([])
  })

  it('verwirft eine erfundene Kategorie, statt sie durchzulassen', async () => {
    ruf.mockResolvedValue(
      antwort([{ id: 'a', kategorie: 'typschild', beschreibung: 'Typschild', sicherheit: 90 }]),
    )

    expect(await beschriftePaket(FAHRZEUG, [], [bild('a')])).toEqual([])
  })

  it('gibt bei einem Fehler des Modells nichts zurück, statt zu werfen', async () => {
    ruf.mockRejectedValue(new Error('Zeitlimit'))

    await expect(beschriftePaket(FAHRZEUG, [], [bild('a')])).resolves.toEqual([])
  })

  it('fragt gar nicht erst, wenn es keine Bilder gibt', async () => {
    expect(await beschriftePaket(FAHRZEUG, [], [])).toEqual([])
    expect(ruf).not.toHaveBeenCalled()
  })

  it('stellt die Kennung vor das jeweilige Bild', async () => {
    ruf.mockResolvedValue(antwort([]))

    await beschriftePaket(FAHRZEUG, [], [bild('a'), bild('b')])

    const inhalt = ruf.mock.calls[0]?.[0].inhalt ?? []
    const arten = inhalt.map((b) => (b.type === 'image' ? 'bild' : b.text))
    expect(arten.slice(1)).toEqual(['Foto id=a:', 'bild', 'Foto id=b:', 'bild'])
  })
})

describe('naechstesPaket', () => {
  const fotos = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }]

  it('nimmt nur, was noch keinen Vorschlag hat', () => {
    expect(naechstesPaket(fotos, new Set(['a', 'c']), new Set(), 12)).toEqual([
      { id: 'b' },
      { id: 'd' },
    ])
  })

  it('versucht ein gescheitertes Foto nicht noch einmal', () => {
    // Ohne diese Regel belegte ein Bild, das sich nicht laden lässt, in
    // jedem weiteren Paket einen Platz — und der Lauf käme nie ans Ende.
    expect(naechstesPaket(fotos, new Set(['a']), new Set(['b']), 12)).toEqual([
      { id: 'c' },
      { id: 'd' },
    ])
  })

  it('hält die Paketgrösse ein', () => {
    expect(naechstesPaket(fotos, new Set(), new Set(), 2)).toEqual([{ id: 'a' }, { id: 'b' }])
  })

  it('gibt nichts zurück, wenn alles erledigt oder gescheitert ist', () => {
    expect(naechstesPaket(fotos, new Set(['a', 'b']), new Set(['c', 'd']), 12)).toEqual([])
  })
})
