import { describe, expect, it } from 'vitest'
import { ZYKLEN, genugGefunden, modellFuerStufe, toleranzenFuer } from './zyklus'

const EINSTELLUNG = {
  kmToleranz: 20000,
  ezToleranzJahre: 2,
  leistungToleranzKw: 30,
  radiusKm: 150,
}

describe('Toleranzen je Stufe', () => {
  it('lässt die erste Stufe unverändert', () => {
    // Zyklus 1 ist die Suche, die der Sachverständige eingestellt hat —
    // sie darf nicht schon geweitet loslaufen.
    expect(toleranzenFuer(EINSTELLUNG, ZYKLEN[0]!)).toEqual(EINSTELLUNG)
  })

  it('weitet die zweite Stufe um die Hälfte', () => {
    expect(toleranzenFuer(EINSTELLUNG, ZYKLEN[1]!)).toEqual({
      kmToleranz: 30000,
      ezToleranzJahre: 3,
      leistungToleranzKw: 45,
      radiusKm: 225,
    })
  })

  it('verdoppelt die dritte Stufe', () => {
    expect(toleranzenFuer(EINSTELLUNG, ZYKLEN[2]!)).toEqual({
      kmToleranz: 40000,
      ezToleranzJahre: 4,
      leistungToleranzKw: 60,
      radiusKm: 300,
    })
  })

  it('deckelt den Radius bei 500 km', () => {
    // Jenseits davon ist die Entfernung kein Merkmal des Marktes mehr.
    const weit = toleranzenFuer({ ...EINSTELLUNG, radiusKm: 400 }, ZYKLEN[2]!)
    expect(weit.radiusKm).toBe(500)
  })
})

describe('Modellname je Stufe', () => {
  const AS24 = ['E-Klasse', 'E 53 AMG', 'GLC-Klasse', 'GLC 300']

  it('nimmt in Stufe 1 den genauen Namen', () => {
    expect(modellFuerStufe('E 53 AMG 4Matic+', AS24, ZYKLEN[0]!)).toEqual({
      stufe: 'genau',
      modell: 'E 53 AMG',
    })
  })

  it('fällt auf den genauen zurück, wenn das Portal den Haupttyp nicht führt', () => {
    // AutoScout24 kennt kein `E 53`. Zweimal dieselbe Suche ist besser als
    // eine Suche auf einen Namen, den das Portal fallen lässt.
    expect(modellFuerStufe('E 53 AMG 4Matic+', AS24, ZYKLEN[1]!)).toEqual({
      stufe: 'genau',
      modell: 'E 53 AMG',
    })
  })

  it('nimmt in Stufe 3 die Baureihe', () => {
    expect(modellFuerStufe('E 53 AMG 4Matic+', AS24, ZYKLEN[2]!)).toEqual({
      stufe: 'baureihe',
      modell: 'E-Klasse',
    })
  })

  it('wird nie gröber als die Stufe erlaubt', () => {
    // Stufe 1 darf die Baureihe nicht nehmen, auch wenn es sie gibt.
    expect(modellFuerStufe('GLC 300 d', AS24, ZYKLEN[0]!)?.stufe).toBe('genau')
  })

  it('gibt null, wenn das Portal die Bezeichnung gar nicht kennt', () => {
    expect(modellFuerStufe('S 580 lang', AS24, ZYKLEN[2]!)).toBeNull()
  })
})

describe('Abbruch', () => {
  it('hört auf, sobald die Mindestzahl erreicht ist', () => {
    expect(genugGefunden(8)).toBe(true)
    expect(genugGefunden(7)).toBe(false)
  })

  it('läuft bei einer Mindestzahl von null nicht endlos weiter', () => {
    // Sonst wäre der Abbruch nie erfüllt und alle drei Zyklen liefen immer.
    expect(genugGefunden(1, 0)).toBe(true)
    expect(genugGefunden(0, 0)).toBe(false)
  })
})
