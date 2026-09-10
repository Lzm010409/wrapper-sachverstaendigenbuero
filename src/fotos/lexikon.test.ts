import { describe, expect, it } from 'vitest'
import {
  achsenPassenZumTeil,
  istHoehenachse,
  istLaengsachse,
  istQuerachse,
  toggleTreffer,
  zusammensetzen,
  type FotoTeil,
  type Rohtreffer,
} from './lexikon'

const KOTFLUEGEL: FotoTeil = {
  id: 't1',
  name: 'Kotflügel',
  erkennungsmerkmal: null,
  gueltigeLaengsachsen: [],
  gueltigeQuerachsen: ['links', 'rechts'],
  gueltigeHoehenachsen: [],
  beschaedigungsarten: [
    { begriff: 'kratzbeschädigt', hinweis: 'nur oberflächlicher Kratzer, kein Verzug' },
    { begriff: 'deformiert', hinweis: 'Blech sichtbar eingedrückt oder verformt' },
  ],
}

const HECKVERKLEIDUNG: FotoTeil = {
  id: 't2',
  name: 'Heckverkleidung',
  erkennungsmerkmal: null,
  gueltigeLaengsachsen: ['vorne', 'hinten'],
  gueltigeQuerachsen: [],
  gueltigeHoehenachsen: ['oben', 'unten', 'mittig'],
  beschaedigungsarten: [{ begriff: 'plastisch verformt', hinweis: 'Kunststoff eingedrückt' }],
}

const TEILE = [KOTFLUEGEL, HECKVERKLEIDUNG]

function treffer(
  teil: string,
  begriff: string,
  achsen: Partial<Pick<Rohtreffer, 'laengs' | 'quer' | 'hoehe'>> = {},
): Rohtreffer {
  return { teil, laengs: null, quer: null, hoehe: null, ...achsen, begriff }
}

describe('istLaengsachse / istQuerachse / istHoehenachse', () => {
  it('erkennt die gültigen Werte jeder Achse', () => {
    expect(istLaengsachse('vorne')).toBe(true)
    expect(istLaengsachse('links')).toBe(false)
    expect(istQuerachse('links')).toBe(true)
    expect(istQuerachse('oben')).toBe(false)
    expect(istHoehenachse('mittig')).toBe(true)
    expect(istHoehenachse('vorne')).toBe(false)
  })
})

describe('zusammensetzen', () => {
  it('baut den Satz ohne jede Achse', () => {
    expect(zusammensetzen(TEILE, [treffer('Kotflügel', 'deformiert')])).toBe('Kotflügel deformiert')
  })

  it('baut den Satz mit nur der Querachse', () => {
    expect(zusammensetzen(TEILE, [treffer('Kotflügel', 'deformiert', { quer: 'rechts' })])).toBe(
      'Kotflügel rechts deformiert',
    )
  })

  it('baut den Satz mit Längs- und Querachse in dieser Reihenfolge', () => {
    expect(
      zusammensetzen(TEILE, [
        treffer('Kotflügel', 'deformiert', { laengs: 'vorne', quer: 'links' }),
      ]),
    ).toBe('Kotflügel vorne links deformiert')
  })

  it('baut den Satz mit allen drei Achsen in der Reihenfolge Längs, Quer, Höhe', () => {
    expect(
      zusammensetzen(TEILE, [
        treffer('Kotflügel', 'deformiert', { laengs: 'vorne', quer: 'links', hoehe: 'oben' }),
      ]),
    ).toBe('Kotflügel vorne links oben deformiert')
  })

  it('erlaubt jede Achsenkombination für jedes Teil — es gibt keine Teil-Restriktion mehr', () => {
    expect(
      zusammensetzen(TEILE, [
        treffer('Heckverkleidung', 'plastisch verformt', { laengs: 'hinten', hoehe: 'unten' }),
      ]),
    ).toBe('Heckverkleidung hinten unten plastisch verformt')
  })

  it('gibt null, wenn das Teil nicht im Lexikon steht', () => {
    expect(zusammensetzen(TEILE, [treffer('Dachhimmel', 'deformiert')])).toBeNull()
  })

  it('gibt null, wenn die Beschädigungsart nicht zum Teil gehört', () => {
    expect(zusammensetzen(TEILE, [treffer('Kotflügel', 'plastisch verformt')])).toBeNull()
  })

  it('gibt null für ein leeres Array', () => {
    expect(zusammensetzen(TEILE, [])).toBeNull()
  })

  it('verbindet zwei gültige Treffer mit Komma', () => {
    expect(
      zusammensetzen(TEILE, [
        treffer('Kotflügel', 'deformiert', { quer: 'links' }),
        treffer('Heckverkleidung', 'plastisch verformt'),
      ]),
    ).toBe('Kotflügel links deformiert, Heckverkleidung plastisch verformt')
  })

  it('lässt einen ungültigen Treffer stillschweigend heraus, den gültigen nicht', () => {
    expect(
      zusammensetzen(TEILE, [
        treffer('Kotflügel', 'deformiert', { quer: 'links' }),
        treffer('Dachhimmel', 'zerkratzt'),
      ]),
    ).toBe('Kotflügel links deformiert')
  })
})

describe('achsenPassenZumTeil', () => {
  it('gibt true, wenn keine Achse gesetzt ist, unabhängig von der Konfiguration', () => {
    expect(achsenPassenZumTeil(TEILE, treffer('Kotflügel', 'deformiert'))).toBe(true)
  })

  it('gibt true, wenn eine gesetzte Achse zu den hinterlegten gültigen Werten gehört', () => {
    expect(
      achsenPassenZumTeil(TEILE, treffer('Kotflügel', 'deformiert', { quer: 'links' })),
    ).toBe(true)
  })

  it('gibt false, wenn eine gesetzte Achse nicht zu den hinterlegten gültigen Werten gehört', () => {
    // Kotflügel hat keine gültige Längsachse hinterlegt.
    expect(
      achsenPassenZumTeil(TEILE, treffer('Kotflügel', 'deformiert', { laengs: 'vorne' })),
    ).toBe(false)
  })

  it('prüft jede Achse unabhängig — eine gültige Achse rettet keine ungültige', () => {
    expect(
      achsenPassenZumTeil(
        TEILE,
        treffer('Heckverkleidung', 'plastisch verformt', { hoehe: 'oben', quer: 'links' }),
      ),
      // Höhe ist für die Heckverkleidung gültig, Quer nicht — die Kombination
      // muss trotzdem als Ganzes verworfen werden.
    ).toBe(false)
  })

  it('gibt true für ein unbekanntes Teil — das erledigt klausel() bereits selbst', () => {
    expect(
      achsenPassenZumTeil(TEILE, treffer('Dachhimmel', 'deformiert', { laengs: 'vorne' })),
    ).toBe(true)
  })
})

describe('toggleTreffer', () => {
  it('fügt einen neuen Treffer hinzu, wenn die Liste leer ist', () => {
    const t = treffer('Kotflügel', 'deformiert', { quer: 'links' })
    expect(toggleTreffer([], t)).toEqual([t])
  })

  it('fügt einen zweiten, unterschiedlichen Treffer hinzu, ohne den ersten zu verlieren', () => {
    const erster = treffer('Kotflügel', 'deformiert', { quer: 'links' })
    const zweiter = treffer('Heckverkleidung', 'plastisch verformt')
    expect(toggleTreffer([erster], zweiter)).toEqual([erster, zweiter])
  })

  it('entfernt einen Treffer wieder, wenn exakt derselbe erneut übergeben wird', () => {
    const t = treffer('Kotflügel', 'deformiert', { quer: 'links' })
    expect(toggleTreffer([t], { ...t })).toEqual([])
  })

  it('unterscheidet zwei Treffer mit gleichem Teil, aber unterschiedlicher Querachse', () => {
    const links = treffer('Kotflügel', 'deformiert', { quer: 'links' })
    const rechts = treffer('Kotflügel', 'deformiert', { quer: 'rechts' })
    // Der zweite Klick fügt "rechts" hinzu, statt "links" zu entfernen —
    // beide sind unterschiedliche Kombinationen, keine Verwechslung.
    expect(toggleTreffer([links], rechts)).toEqual([links, rechts])
  })

  it('unterscheidet zwei Treffer mit gleicher Quer-, aber unterschiedlicher Höhenachse', () => {
    const oben = treffer('Kotflügel', 'deformiert', { quer: 'links', hoehe: 'oben' })
    const unten = treffer('Kotflügel', 'deformiert', { quer: 'links', hoehe: 'unten' })
    expect(toggleTreffer([oben], unten)).toEqual([oben, unten])
  })
})
