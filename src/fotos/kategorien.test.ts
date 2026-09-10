import { describe, expect, it } from 'vitest'
import {
  KATEGORIESCHLUESSEL,
  PFLICHT,
  istKategorie,
  kategoriename,
  luecken,
  type Kategorie,
} from './kategorien'

describe('kategorien', () => {
  it('erkennt nur die vereinbarten Schlüssel', () => {
    expect(istKategorie('tacho')).toBe(true)
    // Das Modell soll keine eigenen Namen erfinden dürfen.
    expect(istKategorie('Tachostand')).toBe(false)
    expect(istKategorie('typschild')).toBe(false)
  })

  it('gibt jeder Kategorie einen deutschen Namen', () => {
    for (const schluessel of KATEGORIESCHLUESSEL) {
      expect(kategoriename(schluessel).length).toBeGreaterThan(2)
    }
  })

  it('führt die vier Ecken einzeln — vier gleiche Bilder sind kein Fotosatz', () => {
    const viermalDieselbeEcke: Kategorie[] = [
      'ansicht_vorne_links',
      'ansicht_vorne_links',
      'ansicht_vorne_links',
      'ansicht_vorne_links',
    ]
    expect(luecken(viermalDieselbeEcke)).toContain('ansicht_hinten_rechts')
  })

  it('meldet bei leerem Fotosatz den ganzen Pflichtsatz', () => {
    expect(luecken([])).toEqual(PFLICHT)
  })

  it('meldet nichts, wenn alle Pflichtaufnahmen da sind', () => {
    expect(luecken([...PFLICHT, 'papiere', 'sonstiges'])).toEqual([])
  })

  it('hält die Reihenfolge des Pflichtsatzes, unabhängig von der Eingabe', () => {
    const durcheinander: Kategorie[] = ['reifen', 'kennzeichen', 'schaden']
    expect(luecken(durcheinander)).toEqual(
      PFLICHT.filter((k) => !durcheinander.includes(k)),
    )
  })

  it('zählt Papiere und Sonstiges nicht zur Pflicht', () => {
    expect(PFLICHT).not.toContain('papiere')
    expect(PFLICHT).not.toContain('sonstiges')
  })
})
