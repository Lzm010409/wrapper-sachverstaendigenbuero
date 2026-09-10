import { describe, expect, it } from 'vitest'
import {
  beurteileMarke,
  erkenneMarkeImTitel,
  filtereNachMarke,
  kanonischeMarke,
} from './markenfilter'

/**
 * Die Faelle stammen aus einem echten Lauf vom 07.09.2026: Suche nach einer
 * Mercedes E 53 AMG, im Korb landete ein Skoda Superb Combi.
 */

describe('kanonischeMarke', () => {
  it('erkennt Schreibweisen derselben Marke', () => {
    expect(kanonischeMarke('Mercedes-Benz')).toBe('mercedes-benz')
    expect(kanonischeMarke('mercedes')).toBe('mercedes-benz')
    expect(kanonischeMarke('VW')).toBe('volkswagen')
    expect(kanonischeMarke('Volkswagen')).toBe('volkswagen')
  })

  it('kommt mit diakritischen Zeichen zurecht', () => {
    // Kleinanzeigen schreibt "Škoda", AutoScout24 "Skoda".
    expect(kanonischeMarke('Škoda')).toBe('skoda')
    expect(kanonischeMarke('Skoda')).toBe('skoda')
    expect(kanonischeMarke('Citroën')).toBe('citroen')
  })

  it('gibt bei Unbekanntem nichts zurueck', () => {
    expect(kanonischeMarke('Phantasiemarke')).toBeNull()
    expect(kanonischeMarke('')).toBeNull()
    expect(kanonischeMarke(null)).toBeNull()
  })
})

describe('erkenneMarkeImTitel', () => {
  it('liest die Marke am Titelanfang', () => {
    expect(erkenneMarkeImTitel('Mercedes-Benz E 300 d 9G-TRONIC Avantgarde')).toBe('mercedes-benz')
    expect(erkenneMarkeImTitel('Škoda Superb Combi 2.0 TDI 190 PS')).toBe('skoda')
    expect(erkenneMarkeImTitel('Range Rover Evoque HSE 2017')).toBe('land-rover')
  })

  it('liest zweiteilige Markennamen', () => {
    expect(erkenneMarkeImTitel('Land Rover Discovery Sport')).toBe('land-rover')
    expect(erkenneMarkeImTitel('Alfa Romeo Giulia')).toBe('alfa-romeo')
  })

  it('laesst sich von einer Marke im hinteren Text nicht taeuschen', () => {
    // Sonst gaelte dieser Golf als Opel.
    expect(erkenneMarkeImTitel('VW Golf mit Anhaengerkupplung von Opel')).toBe('volkswagen')
  })
})

describe('beurteileMarke', () => {
  const skoda = {
    title: 'Škoda Superb Combi 2.0 TDI 190 PS – Baujahr 2019',
    model: 'Škoda Superb Combi 2.0 TDI 190 PS – Baujahr 2019',
    power: null,
  }

  it('erkennt den Skoda in der Mercedes-Suche als fremd', () => {
    // Genau der Fall, der ohne diesen Filter im Korb stand.
    expect(beurteileMarke(skoda, 'Mercedes-Benz')).toBe('fremd')
  })

  it('laesst passende Fahrzeuge durch', () => {
    expect(beurteileMarke({ titel: 'Mercedes-Benz E 300 AMG' }, 'Mercedes-Benz')).toBe('passt')
  })

  it('bleibt bei unklarer Marke grosszuegig', () => {
    // Im Zweifel drin: ein zu Unrecht entferntes Vergleichsfahrzeug faellt
    // niemandem auf, waere aber genauso schaedlich.
    expect(beurteileMarke({ titel: 'Limousine, scheckheftgepflegt' }, 'Mercedes-Benz')).toBe('unklar')
    expect(beurteileMarke({}, 'Mercedes-Benz')).toBe('unklar')
  })

  it('entscheidet nichts, wenn die Marke des Subjekts unbekannt ist', () => {
    expect(beurteileMarke(skoda, null)).toBe('unklar')
    expect(beurteileMarke(skoda, 'Phantasiemarke')).toBe('unklar')
  })

  it('nimmt ein Markenfeld vor dem Titel', () => {
    expect(beurteileMarke({ marke: 'Skoda', titel: 'Mercedes E 300' }, 'Mercedes-Benz')).toBe('fremd')
  })
})

describe('filtereNachMarke', () => {
  it('trennt Fremdes ab und nennt die erkannte Marke', () => {
    const ergebnis = filtereNachMarke(
      [
        { titel: 'Mercedes-Benz E 300 AMG' },
        { title: 'Škoda Superb Combi 2.0 TDI' },
        { title: 'Range Rover Evoque HSE' },
        { titel: 'Limousine ohne Angabe' },
      ],
      'Mercedes-Benz',
    )
    expect(ergebnis.behalten).toHaveLength(2)
    expect(ergebnis.entfernt.map((e) => e.erkannt)).toEqual(['skoda', 'land-rover'])
  })

  it('entfernt nichts, wenn die Subjektmarke fehlt', () => {
    const ergebnis = filtereNachMarke([{ title: 'Škoda Superb' }], null)
    expect(ergebnis.entfernt).toHaveLength(0)
  })
})
