import { describe, expect, it } from 'vitest'
import { leiteAb } from './ableitungen'

describe('leiteAb', () => {
  it('findet einzusetzende Werte im Gegenargument', () => {
    const { platzhalter } = leiteAb({ gegenargument: 'Die Kürzung von [Betrag] ist unbegründet.' })
    expect(platzhalter).toEqual([{ schluessel: 'Betrag', art: 'wert' }])
  })

  it('unterscheidet Arbeitsaufträge von einzusetzenden Werten', () => {
    const { platzhalter } = leiteAb({
      gegenargument: 'Der Betrag von [Betrag] ist zu ersetzen.',
      vorgehen: '[Mit Screenshots aus dem Kalkulationsprogramm belegen, die das widerlegen.]',
    })
    expect(platzhalter).toEqual([
      { schluessel: 'Betrag', art: 'wert' },
      {
        schluessel: 'Mit Screenshots aus dem Kalkulationsprogramm belegen, die das widerlegen.',
        art: 'regieanweisung',
      },
    ])
  })

  it('durchsucht auch Vorgehen, typische Begründung und interne Hinweise', () => {
    const { platzhalter } = leiteAb({
      typischeBegruendung: 'Es sei [Position] nicht erforderlich.',
      vorgehen: 'Prüfen, ob [Bauteil] verbaut ist.',
      hinweise: 'Bei [Hersteller] nachfragen.',
    })
    expect(platzhalter.map((p) => p.schluessel)).toEqual(['Position', 'Bauteil', 'Hersteller'])
  })

  it('nennt jeden Platzhalter nur einmal, auch über Felder hinweg', () => {
    const { platzhalter } = leiteAb({
      gegenargument: 'Der Betrag [Betrag] …',
      vorgehen: 'Den Betrag [Betrag] belegen.',
    })
    expect(platzhalter).toHaveLength(1)
  })

  it('erkennt Gerichtszitate als Fundstellen', () => {
    const { belege } = leiteAb({
      gegenargument: 'Das hat der BGH Karlsruhe, Az.: VI ZR 1/20 entschieden.',
    })
    expect(belege).toHaveLength(1)
    expect(belege[0]?.gericht).toContain('BGH')
  })

  it('erkennt Fundstellen auch im Vorgehen', () => {
    const { belege } = leiteAb({ vorgehen: 'Auf LG Musterstadt hinweisen.' })
    expect(belege.map((b) => b.gericht)).toContain('LG Musterstadt')
  })

  it('sucht keine Fundstellen in den internen Hinweisen', () => {
    // Die Hinweise gehen nie in ein Schreiben (R4) — was dort steht, ist
    // Feldnotiz und keine zu belegende Aussage.
    const { belege } = leiteAb({
      gegenargument: 'Ohne Zitat.',
      hinweise: 'Vergleiche OLG Oldenburg, dort ähnlich.',
    })
    expect(belege).toHaveLength(0)
  })

  it('kommt mit leeren und fehlenden Feldern zurecht', () => {
    expect(leiteAb({})).toEqual({ platzhalter: [], belege: [] })
    expect(leiteAb({ gegenargument: null, vorgehen: '' })).toEqual({ platzhalter: [], belege: [] })
  })

  it('hält einen Markdown-Verweis nicht für einen Platzhalter', () => {
    const { platzhalter } = leiteAb({
      gegenargument: 'Siehe [die Fundstelle](https://example.org/urteil).',
    })
    expect(platzhalter).toEqual([])
  })
})
