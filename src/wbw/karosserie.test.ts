import { describe, expect, it } from 'vitest'
import { bauartAusShape, shapeBezeichnung, type Bauart } from './karosserie'

/**
 * Die Werteliste stammt aus der autoiXpert-Dokumentation ("Gueltige
 * Fahrzeugarten"). Die Bauarten sind die des Plugins (KAROSSERIEN in
 * ausstattung-matcher.js).
 */
describe('bauartAusShape', () => {
  it('uebersetzt die Fahrzeugarten, die es im Korb gibt', () => {
    const erwartet: Record<string, Bauart> = {
      sedan: 'Limousine',
      compact: 'Kleinwagen',
      coupe: 'Coupé',
      stationWagon: 'Kombi',
      suv: 'SUV',
      convertible: 'Cabrio',
      van: 'Van',
      transporter: 'Van',
      pickup: 'Pickup',
    }
    for (const [shape, bauart] of Object.entries(erwartet)) {
      expect(bauartAusShape(shape), shape).toBe(bauart)
    }
  })

  it('trifft die beiden echten Faelle', () => {
    // 0926/2081TG: E Limousine (BM 213) -> sedan
    expect(bauartAusShape('sedan')).toBe('Limousine')
    // 0926/2078TG: G (BM 465) -> suv
    expect(bauartAusShape('suv')).toBe('SUV')
  })

  it('gibt nichts zurueck, wo das Plugin keine Bauart kennt', () => {
    // Fuer Motorrad, Wohnmobil, LKW und Anhaenger ist eine Suche ueber die
    // Autoportale ohnehin nicht der Weg. Lieber nicht filtern als falsch.
    for (const shape of ['motorcycle', 'motorHome', 'truck', 'trailer', 'bus', 'bicycle']) {
      expect(bauartAusShape(shape), shape).toBeNull()
    }
  })

  it('gibt nichts zurueck ohne Angabe oder bei unbekanntem Wert', () => {
    expect(bauartAusShape(null)).toBeNull()
    expect(bauartAusShape('')).toBeNull()
    expect(bauartAusShape('   ')).toBeNull()
    // Ein neuer Wert der Schnittstelle darf nicht geraten werden.
    expect(bauartAusShape('hovercraft')).toBeNull()
  })

  it('ist unempfindlich gegen die Schreibweise', () => {
    expect(bauartAusShape('stationwagon')).toBe('Kombi')
    expect(bauartAusShape('SUV')).toBe('SUV')
  })
})

describe('shapeBezeichnung', () => {
  it('nennt die deutsche Bezeichnung', () => {
    expect(shapeBezeichnung('stationWagon')).toBe('Kombi')
    expect(shapeBezeichnung('semiTruck')).toBe('Sattelzugmaschine')
  })

  it('erfindet nichts', () => {
    expect(shapeBezeichnung('hovercraft')).toBeNull()
    expect(shapeBezeichnung(null)).toBeNull()
  })
})
