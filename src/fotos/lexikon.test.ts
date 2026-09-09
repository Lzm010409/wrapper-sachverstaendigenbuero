import { describe, expect, it } from 'vitest'
import { istSeite, zusammensetzen, type FotoTeil } from './lexikon'

const KOTFLUEGEL: FotoTeil = {
  id: 't1',
  name: 'Kotflügel',
  seiten: ['links', 'rechts'],
  beschaedigungsarten: [
    { begriff: 'kratzbeschädigt', hinweis: 'nur oberflächlicher Kratzer, kein Verzug' },
    { begriff: 'deformiert', hinweis: 'Blech sichtbar eingedrückt oder verformt' },
  ],
}

const HECKVERKLEIDUNG: FotoTeil = {
  id: 't2',
  name: 'Heckverkleidung',
  seiten: [],
  beschaedigungsarten: [{ begriff: 'plastisch verformt', hinweis: 'Kunststoff eingedrückt' }],
}

const TEILE = [KOTFLUEGEL, HECKVERKLEIDUNG]

describe('istSeite', () => {
  it('erkennt die vier gültigen Seiten', () => {
    expect(istSeite('links')).toBe(true)
    expect(istSeite('oben')).toBe(false)
  })
})

describe('zusammensetzen', () => {
  it('baut den Satz aus Teil, Seite und Begriff', () => {
    expect(zusammensetzen(TEILE, 'Kotflügel', 'rechts', 'deformiert')).toBe(
      'Kotflügel rechts deformiert',
    )
  })

  it('lässt die Seite weg, wenn das Teil keine hat', () => {
    expect(zusammensetzen(TEILE, 'Heckverkleidung', null, 'plastisch verformt')).toBe(
      'Heckverkleidung plastisch verformt',
    )
  })

  it('ignoriert eine mitgelieferte Seite bei einem Teil ohne Seitenbezug', () => {
    // Die Kombination bleibt gültig — nur die Seite gehört nicht in den Satz.
    expect(zusammensetzen(TEILE, 'Heckverkleidung', 'links', 'plastisch verformt')).toBe(
      'Heckverkleidung plastisch verformt',
    )
  })

  it('gibt null, wenn das Teil nicht im Lexikon steht', () => {
    expect(zusammensetzen(TEILE, 'Dachhimmel', null, 'deformiert')).toBeNull()
  })

  it('gibt null, wenn die Beschädigungsart nicht zum Teil gehört', () => {
    expect(zusammensetzen(TEILE, 'Kotflügel', 'links', 'plastisch verformt')).toBeNull()
  })

  it('gibt null, wenn die Seite für dieses Teil nicht erlaubt ist', () => {
    expect(zusammensetzen(TEILE, 'Kotflügel', 'vorne', 'deformiert')).toBeNull()
  })

  it('gibt null, wenn eine Seite verlangt ist, aber keine mitkommt', () => {
    expect(zusammensetzen(TEILE, 'Kotflügel', null, 'deformiert')).toBeNull()
  })

  it('gibt null ohne Teil oder ohne Begriff', () => {
    expect(zusammensetzen(TEILE, null, 'links', 'deformiert')).toBeNull()
    expect(zusammensetzen(TEILE, 'Kotflügel', 'links', null)).toBeNull()
  })
})
