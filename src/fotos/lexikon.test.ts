import { describe, expect, it } from 'vitest'
import { istSeite, toggleTreffer, zusammensetzen, type FotoTeil, type Rohtreffer } from './lexikon'

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

const HECKVERKLEIDUNG: FotoTeil = {
  id: 't2',
  name: 'Heckverkleidung',
  seiten: [],
  erkennungsmerkmal: null,
  beschaedigungsarten: [{ begriff: 'plastisch verformt', hinweis: 'Kunststoff eingedrückt' }],
}

const TEILE = [KOTFLUEGEL, HECKVERKLEIDUNG]

function treffer(teil: string, seite: Rohtreffer['seite'], begriff: string): Rohtreffer {
  return { teil, seite, begriff }
}

describe('istSeite', () => {
  it('erkennt die vier gültigen Seiten', () => {
    expect(istSeite('links')).toBe(true)
    expect(istSeite('oben')).toBe(false)
  })
})

describe('zusammensetzen', () => {
  it('baut den Satz aus Teil, Seite und Begriff', () => {
    expect(zusammensetzen(TEILE, [treffer('Kotflügel', 'rechts', 'deformiert')])).toBe(
      'Kotflügel rechts deformiert',
    )
  })

  it('lässt die Seite weg, wenn das Teil keine hat', () => {
    expect(zusammensetzen(TEILE, [treffer('Heckverkleidung', null, 'plastisch verformt')])).toBe(
      'Heckverkleidung plastisch verformt',
    )
  })

  it('ignoriert eine mitgelieferte Seite bei einem Teil ohne Seitenbezug', () => {
    // Die Kombination bleibt gültig — nur die Seite gehört nicht in den Satz.
    expect(zusammensetzen(TEILE, [treffer('Heckverkleidung', 'links', 'plastisch verformt')])).toBe(
      'Heckverkleidung plastisch verformt',
    )
  })

  it('gibt null, wenn das Teil nicht im Lexikon steht', () => {
    expect(zusammensetzen(TEILE, [treffer('Dachhimmel', null, 'deformiert')])).toBeNull()
  })

  it('gibt null, wenn die Beschädigungsart nicht zum Teil gehört', () => {
    expect(zusammensetzen(TEILE, [treffer('Kotflügel', 'links', 'plastisch verformt')])).toBeNull()
  })

  it('gibt null, wenn die Seite für dieses Teil nicht erlaubt ist', () => {
    expect(zusammensetzen(TEILE, [treffer('Kotflügel', 'vorne', 'deformiert')])).toBeNull()
  })

  it('gibt null, wenn eine Seite verlangt ist, aber keine mitkommt', () => {
    expect(zusammensetzen(TEILE, [treffer('Kotflügel', null, 'deformiert')])).toBeNull()
  })

  it('gibt null für ein leeres Array', () => {
    expect(zusammensetzen(TEILE, [])).toBeNull()
  })

  it('verbindet zwei gültige Treffer mit Komma', () => {
    expect(
      zusammensetzen(TEILE, [
        treffer('Kotflügel', 'links', 'deformiert'),
        treffer('Heckverkleidung', null, 'plastisch verformt'),
      ]),
    ).toBe('Kotflügel links deformiert, Heckverkleidung plastisch verformt')
  })

  it('lässt einen ungültigen Treffer stillschweigend heraus, den gültigen nicht', () => {
    expect(
      zusammensetzen(TEILE, [
        treffer('Kotflügel', 'links', 'deformiert'),
        treffer('Dachhimmel', null, 'zerkratzt'),
      ]),
    ).toBe('Kotflügel links deformiert')
  })
})

describe('toggleTreffer', () => {
  it('fügt einen neuen Treffer hinzu, wenn die Liste leer ist', () => {
    const t = treffer('Kotflügel', 'links', 'deformiert')
    expect(toggleTreffer([], t)).toEqual([t])
  })

  it('fügt einen zweiten, unterschiedlichen Treffer hinzu, ohne den ersten zu verlieren', () => {
    const erster = treffer('Kotflügel', 'links', 'deformiert')
    const zweiter = treffer('Heckverkleidung', null, 'plastisch verformt')
    expect(toggleTreffer([erster], zweiter)).toEqual([erster, zweiter])
  })

  it('entfernt einen Treffer wieder, wenn exakt derselbe erneut übergeben wird', () => {
    const t = treffer('Kotflügel', 'links', 'deformiert')
    expect(toggleTreffer([t], { ...t })).toEqual([])
  })

  it('unterscheidet zwei Treffer mit gleichem Teil, aber unterschiedlicher Seite', () => {
    const links = treffer('Kotflügel', 'links', 'deformiert')
    const rechts = treffer('Kotflügel', 'rechts', 'deformiert')
    // Der zweite Klick fügt "rechts" hinzu, statt "links" zu entfernen —
    // beide sind unterschiedliche Kombinationen, keine Verwechslung.
    expect(toggleTreffer([links], rechts)).toEqual([links, rechts])
  })
})
