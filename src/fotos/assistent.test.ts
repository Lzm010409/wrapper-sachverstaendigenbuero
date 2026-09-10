import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  auftragstext,
  beschriftePaket,
  inPakete,
  naechstesPaket,
  type Bildpaket,
} from './assistent'
import type { FotoTeil } from './lexikon'

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

const KOTFLUEGEL: FotoTeil = {
  id: 't1',
  name: 'Kotflügel',
  seiten: ['links', 'rechts'],
  erkennungsmerkmal: null,
  beschaedigungsarten: [
    { begriff: 'kratzbeschädigt', hinweis: 'nur oberflächlicher Kratzer, kein Verzug' },
    { begriff: 'deformiert', hinweis: 'Blech sichtbar eingedrückt oder verformt' },
  ],
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

  it('listet das Teile-Lexikon mit Begriff und Hinweis, wenn Teile übergeben werden', () => {
    const text = auftragstext(FAHRZEUG, [], [KOTFLUEGEL])
    expect(text).toContain('Kotflügel')
    expect(text).toContain('deformiert')
    expect(text).toContain('Blech sichtbar eingedrückt oder verformt')
  })

  it('lässt den Teile-Abschnitt weg, wenn kein Lexikon übergeben wird', () => {
    expect(auftragstext(FAHRZEUG, [])).not.toContain('Teile-Lexikon')
  })

  it('nennt das Erkennungsmerkmal, wenn eines hinterlegt ist', () => {
    const mitMerkmal: FotoTeil = {
      ...KOTFLUEGEL,
      erkennungsmerkmal: 'Sitzt vor der Tür, oberhalb des Reifens, mit Radlauf.',
    }
    const text = auftragstext(FAHRZEUG, [], [mitMerkmal])
    expect(text).toContain('Erkennungsmerkmal: Sitzt vor der Tür, oberhalb des Reifens, mit Radlauf.')
  })

  it('zeigt keine leere Erkennungsmerkmal-Zeile ohne das Feld', () => {
    const text = auftragstext(FAHRZEUG, [], [KOTFLUEGEL])
    expect(text).not.toContain('Erkennungsmerkmal')
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

    const vorschlaege = await beschriftePaket(FAHRZEUG, [], [], [bild('a'), bild('b')])

    expect(vorschlaege.map((v) => [v.fotoId, v.kategorie])).toEqual([
      ['a', 'kennzeichen'],
      ['b', 'tacho'],
    ])
  })

  it('erfindet nichts, wenn zu einem Bild kein Vorschlag kam', async () => {
    ruf.mockResolvedValue(
      antwort([{ id: 'a', kategorie: 'reifen', beschreibung: 'Reifen vorne links', sicherheit: 80 }]),
    )

    const vorschlaege = await beschriftePaket(FAHRZEUG, [], [], [bild('a'), bild('b')])

    expect(vorschlaege.map((v) => v.fotoId)).toEqual(['a'])
  })

  it('ersetzt die Beschreibung eines Positionsfotos immer durch den Kategorienamen', async () => {
    ruf.mockResolvedValue(
      antwort([
        { id: 'a', kategorie: 'ansicht_hinten_links', beschreibung: 'Frei erfundener Text', sicherheit: 80 },
      ]),
    )

    const [vorschlag] = await beschriftePaket(FAHRZEUG, [], [], [bild('a')])

    expect(vorschlag?.beschreibung).toBe('Ansicht hinten links')
  })

  it('ignoriert einen Treffer auf einem Positionsfoto, statt ihn zu übernehmen', async () => {
    // Genau der Fehler vom 10.09.2026: eine Übersichtsaufnahme bekam die
    // Schadensformulierung eines ganz anderen Fotos, weil das Modell dort
    // einen Treffer mitgeschickt hatte.
    ruf.mockResolvedValue(
      antwort([
        {
          id: 'a',
          kategorie: 'ansicht_hinten_links',
          beschreibung: 'wird ignoriert',
          treffer: [{ teil: 'Kotflügel', seite: 'links', beschaedigungsart: 'deformiert' }],
          sicherheit: 75,
        },
      ]),
    )

    const [vorschlag] = await beschriftePaket(FAHRZEUG, [], [KOTFLUEGEL], [bild('a')])

    expect(vorschlag?.beschreibung).toBe('Ansicht hinten links')
  })

  it('ignoriert einen Treffer ausserhalb von kategorie schaden', async () => {
    ruf.mockResolvedValue(
      antwort([
        {
          id: 'a',
          kategorie: 'reifen',
          beschreibung: 'Reifen vorne links mit gutem Profil',
          treffer: [{ teil: 'Kotflügel', seite: 'links', beschaedigungsart: 'deformiert' }],
          sicherheit: 80,
        },
      ]),
    )

    const [vorschlag] = await beschriftePaket(FAHRZEUG, [], [KOTFLUEGEL], [bild('a')])

    expect(vorschlag?.beschreibung).toBe('Reifen vorne links mit gutem Profil')
  })

  it('leitet die vier Häkchen aus der Kategorie ab', async () => {
    ruf.mockResolvedValue(
      antwort([
        { id: 'a', kategorie: 'kennzeichen', beschreibung: 'Amtliches Kennzeichen', sicherheit: 95 },
        { id: 'b', kategorie: 'schaden', beschreibung: 'Heckklappe verzogen', sicherheit: 88 },
      ]),
    )

    const [kennzeichen, schaden] = await beschriftePaket(FAHRZEUG, [], [], [bild('a'), bild('b')])

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

    const [vorschlag] = await beschriftePaket(FAHRZEUG, [], [], [bild('a')])

    expect(vorschlag?.beschreibung.length).toBe(120)
    expect(vorschlag?.beschreibung.endsWith('.')).toBe(false)
  })

  it('nimmt einen leeren Vorschlag nicht an', async () => {
    ruf.mockResolvedValue(antwort([{ id: 'a', kategorie: 'schaden', beschreibung: '  ', sicherheit: 60 }]))

    expect(await beschriftePaket(FAHRZEUG, [], [], [bild('a')])).toEqual([])
  })

  it('verwirft eine erfundene Kategorie, statt sie durchzulassen', async () => {
    ruf.mockResolvedValue(
      antwort([{ id: 'a', kategorie: 'typschild', beschreibung: 'Typschild', sicherheit: 90 }]),
    )

    expect(await beschriftePaket(FAHRZEUG, [], [], [bild('a')])).toEqual([])
  })

  it('rettet eine Sicherheit ausserhalb von 0 bis 100, statt das Paket zu verlieren', async () => {
    // Die Schnittstelle kann die Grenze bei `strict` nicht erzwingen. Ein
    // einzelner Ausreisser darf nicht das ganze Paket ungeprüft lassen.
    ruf.mockResolvedValue(
      antwort([
        { id: 'a', kategorie: 'schaden', beschreibung: 'Stossfänger', sicherheit: 140 },
        { id: 'b', kategorie: 'reifen', beschreibung: 'Reifen vorne links', sicherheit: -5 },
      ]),
    )

    const vorschlaege = await beschriftePaket(FAHRZEUG, [], [], [bild('a'), bild('b')])

    // 140 wird auf 100 geklemmt und bleibt über der Mindestsicherheit.
    expect(vorschlaege.find((v) => v.fotoId === 'a')?.sicherheit).toBe(100)
    // -5 wird auf 0 geklemmt — und fällt damit unter die Mindestsicherheit.
    expect(vorschlaege.find((v) => v.fotoId === 'b')).toBeUndefined()
  })

  it('verwirft jeden Vorschlag unter der Mindestsicherheit von 50, gleich welcher Kategorie', async () => {
    ruf.mockResolvedValue(
      antwort([
        { id: 'a', kategorie: 'reifen', beschreibung: 'Reifen vorne links', sicherheit: 49 },
        {
          id: 'b',
          kategorie: 'schaden',
          beschreibung: 'wird ignoriert',
          treffer: [{ teil: 'Kotflügel', seite: 'rechts', beschaedigungsart: 'deformiert' }],
          sicherheit: 49,
        },
      ]),
    )

    expect(await beschriftePaket(FAHRZEUG, [], [KOTFLUEGEL], [bild('a'), bild('b')])).toEqual([])
  })

  it('behält einen Vorschlag genau bei der Mindestsicherheit von 50', async () => {
    ruf.mockResolvedValue(
      antwort([{ id: 'a', kategorie: 'reifen', beschreibung: 'Reifen vorne links', sicherheit: 50 }]),
    )

    const vorschlaege = await beschriftePaket(FAHRZEUG, [], [], [bild('a')])

    expect(vorschlaege.map((v) => v.fotoId)).toEqual(['a'])
  })

  it('setzt den Hausstil-Satz aus einem Treffer zusammen', async () => {
    ruf.mockResolvedValue(
      antwort([
        {
          id: 'a',
          kategorie: 'schaden',
          beschreibung: 'wird ignoriert',
          treffer: [{ teil: 'Kotflügel', seite: 'rechts', beschaedigungsart: 'deformiert' }],
          sicherheit: 90,
        },
      ]),
    )

    const [vorschlag] = await beschriftePaket(FAHRZEUG, [], [KOTFLUEGEL], [bild('a')])

    expect(vorschlag?.beschreibung).toBe('Kotflügel rechts deformiert')
  })

  it('übernimmt nur den ersten Treffer, auch wenn das Modell mehrere liefert', async () => {
    // Genau ein Teil je Foto ist die Vorgabe — hält sich das Modell trotzdem
    // nicht daran, erzwingt der Server die Grenze, statt einen Satz aus
    // mehreren Teilen zusammenzusetzen.
    const TUER: FotoTeil = {
      id: 't2',
      name: 'Tür',
      seiten: ['links', 'rechts'],
      erkennungsmerkmal: null,
      beschaedigungsarten: [{ begriff: 'verkratzt', hinweis: 'nur oberflächlicher Kratzer' }],
    }
    ruf.mockResolvedValue(
      antwort([
        {
          id: 'a',
          kategorie: 'schaden',
          beschreibung: 'wird ignoriert',
          treffer: [
            { teil: 'Kotflügel', seite: 'links', beschaedigungsart: 'deformiert' },
            { teil: 'Tür', seite: 'links', beschaedigungsart: 'verkratzt' },
          ],
          sicherheit: 85,
        },
      ]),
    )

    const [vorschlag] = await beschriftePaket(FAHRZEUG, [], [KOTFLUEGEL, TUER], [bild('a')])

    expect(vorschlag?.beschreibung).toBe('Kotflügel links deformiert')
  })

  it('verwirft den Vorschlag, wenn kein Teil erkannt wurde und ein Lexikon existiert', async () => {
    // Bis 10.09.2026 fiel das hier auf freien Text zurück ("Dachhimmel
    // verschmutzt"). Jetzt: existiert ein Lexikon, gibt es für schaden nur
    // noch dessen Wortlaut oder gar keinen Vorschlag — nie mehr Freitext.
    ruf.mockResolvedValue(
      antwort([
        {
          id: 'a',
          kategorie: 'schaden',
          beschreibung: 'Dachhimmel verschmutzt',
          treffer: [],
          sicherheit: 70,
        },
      ]),
    )

    expect(await beschriftePaket(FAHRZEUG, [], [KOTFLUEGEL], [bild('a')])).toEqual([])
  })

  it('verwirft den Vorschlag, wenn sich das Modell nicht ans Lexikon gehalten hat', async () => {
    // "vorne" gibt es für den Kotflügel im Lexikon nicht — die Kombination
    // ist ungültig, obwohl beide Werte für sich genommen aus dem Werkzeug
    // stammen könnten. Kein gültiger Treffer heisst jetzt: kein Vorschlag,
    // nicht mehr der freie Text des Modells.
    ruf.mockResolvedValue(
      antwort([
        {
          id: 'a',
          kategorie: 'schaden',
          beschreibung: 'Kotflügel vorne beschädigt',
          treffer: [{ teil: 'Kotflügel', seite: 'vorne', beschaedigungsart: 'deformiert' }],
          sicherheit: 70,
        },
      ]),
    )

    expect(await beschriftePaket(FAHRZEUG, [], [KOTFLUEGEL], [bild('a')])).toEqual([])
  })

  it('verwirft den Vorschlag, wenn die Antwort gar kein treffer-Feld enthält und ein Lexikon existiert', async () => {
    // Der Zod-Default `[]` greift, zählt also wie "kein Treffer" — mit
    // Lexikon vorhanden gibt es dafür keinen Freitext-Ausweg mehr.
    ruf.mockResolvedValue(
      antwort([{ id: 'a', kategorie: 'schaden', beschreibung: 'Heckschürze verkratzt', sicherheit: 80 }]),
    )

    expect(await beschriftePaket(FAHRZEUG, [], [KOTFLUEGEL], [bild('a')])).toEqual([])
  })

  it('bleibt bei freiem Text, wenn für schaden noch kein Lexikon existiert', async () => {
    // Ohne Lexikon-Einträge (teile: []) gibt es keine Alternative zu
    // Freitext — der einzige Fall, in dem schaden weiterhin frei formuliert.
    ruf.mockResolvedValue(
      antwort([{ id: 'a', kategorie: 'schaden', beschreibung: 'Heckschürze verkratzt', sicherheit: 80 }]),
    )

    const [vorschlag] = await beschriftePaket(FAHRZEUG, [], [], [bild('a')])

    expect(vorschlag?.beschreibung).toBe('Heckschürze verkratzt')
  })

  it('gibt bei einem Fehler des Modells nichts zurück, statt zu werfen', async () => {
    ruf.mockRejectedValue(new Error('Zeitlimit'))

    await expect(beschriftePaket(FAHRZEUG, [], [], [bild('a')])).resolves.toEqual([])
  })

  it('fragt gar nicht erst, wenn es keine Bilder gibt', async () => {
    expect(await beschriftePaket(FAHRZEUG, [], [], [])).toEqual([])
    expect(ruf).not.toHaveBeenCalled()
  })

  it('stellt die Kennung vor das jeweilige Bild', async () => {
    ruf.mockResolvedValue(antwort([]))

    await beschriftePaket(FAHRZEUG, [], [], [bild('a'), bild('b')])

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
