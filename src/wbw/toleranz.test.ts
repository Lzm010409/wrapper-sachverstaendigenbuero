import { describe, expect, it } from 'vitest'
import { ezToleranzFuer, kmToleranzFuer } from './toleranz'

describe('kmToleranzFuer', () => {
  it('nimmt für den Sharan mehr als die feste Vorgabe', () => {
    /*
      Der Lauf vom 08.09.2026: 162.390 km, feste ±25.000 km. Von 48 Fahrzeugen
      im Umkreis fielen 33 an den Toleranzen — bei einem Fahrzeug, dessen
      Laufleistung am Markt zwischen 120.000 und 260.000 km streut.
    */
    expect(kmToleranzFuer(162390)).toBe(32000)
  })

  it('bleibt bei jungen Fahrzeugen bei der festen Vorgabe', () => {
    // 20 % von 60.000 sind 12.000 — enger als die Vorgabe. Dann gilt die
    // Vorgabe: bei wenig gelaufenen Fahrzeugen ist der Markt dicht besetzt.
    expect(kmToleranzFuer(60000)).toBe(25000)
    expect(kmToleranzFuer(125000)).toBe(25000)
  })

  it('deckelt die Spanne nach oben', () => {
    // Jenseits von 60.000 km Spanne vergleicht man keine Fahrzeuge mehr,
    // sondern nur noch Karosserien.
    expect(kmToleranzFuer(500000)).toBe(60000)
  })

  it('fällt ohne Laufleistung auf die Vorgabe zurück', () => {
    expect(kmToleranzFuer(null)).toBe(25000)
    expect(kmToleranzFuer(0)).toBe(25000)
  })

  it('rundet auf volle Tausend', () => {
    expect(kmToleranzFuer(162390) % 1000).toBe(0)
  })
})

describe('ezToleranzFuer', () => {
  const heute = new Date('2026-09-08')

  it('bleibt bei jungen Fahrzeugen eng', () => {
    // Ein Baujahr Unterschied ist bei einem drei Jahre alten Fahrzeug viel.
    expect(ezToleranzFuer('03/2023', heute)).toBe(1)
    expect(ezToleranzFuer('11/2021', heute)).toBe(1)
  })

  it('setzt die erste Grenze bei fünf Jahren', () => {
    // 06/2021 ist am 08.09.2026 gut fünf Jahre alt — schon die zweite Stufe.
    expect(ezToleranzFuer('10/2021', heute)).toBe(1)
    expect(ezToleranzFuer('06/2021', heute)).toBe(2)
  })

  it('weitet sich mit dem Alter', () => {
    // Ein Sharan von 2010 gegen einen von 2012: am Markt derselbe Wagen.
    expect(ezToleranzFuer('12/2010', heute)).toBe(3)
  })

  it('kennt die Zwischenstufe', () => {
    expect(ezToleranzFuer('01/2018', heute)).toBe(2)
  })

  it('fällt ohne Erstzulassung auf die Vorgabe zurück', () => {
    expect(ezToleranzFuer(null, heute)).toBe(1)
    expect(ezToleranzFuer('Unfug', heute)).toBe(1)
  })

  it('nimmt ein Datum aus der Zukunft nicht als hohes Alter', () => {
    expect(ezToleranzFuer('01/2030', heute)).toBe(1)
  })
})
