import { describe, expect, it } from 'vitest'
import { loeseModellAuf, passendeModelle } from './modell'

/** Ausschnitt aus den 357 Modellnamen, die AutoScout24 fuer Mercedes fuehrt. */
const MERCEDES = [
  'E 200', 'E 220', 'E 300', 'E 350', 'E 400', 'E 43 AMG', 'E 53 AMG', 'E 63 AMG',
  'A 35 AMG', 'A 45 AMG', 'A 45 AMG S', 'GLC 300', 'GLC 43 AMG', 'C 220', 'G 500',
]

describe('loeseModellAuf', () => {
  it('loest den Untertyp der VXS auf den Modellnamen des Portals auf', () => {
    // Der Fall, an dem die Aufloesung des Plugins scheitert.
    const e = loeseModellAuf('E 53 AMG 4Matic+', MERCEDES)
    expect(e.modell).toBe('E 53 AMG')
    expect(e.weg).toBe('praefix')
    expect(e.verworfen).toBe('4Matic+')
  })

  it('nimmt die genaue Uebereinstimmung, wenn es sie gibt', () => {
    const e = loeseModellAuf('E 300', MERCEDES)
    expect(e).toEqual({ modell: 'E 300', weg: 'genau', verworfen: null })
  })

  it('nimmt den LAENGSTEN passenden Praefix', () => {
    // Sonst wuerde aus "A 45 AMG S 4Matic+" ein "A 45 AMG" - ein anderes Auto.
    const e = loeseModellAuf('A 45 AMG S 4Matic+', MERCEDES)
    expect(e.modell).toBe('A 45 AMG S')
    expect(e.verworfen).toBe('4Matic+')
  })

  it('ist unempfindlich gegen Schreibweise und Trennzeichen', () => {
    expect(loeseModellAuf('e-53-amg', MERCEDES).modell).toBe('E 53 AMG')
    expect(loeseModellAuf('  E   53   AMG  ', MERCEDES).modell).toBe('E 53 AMG')
  })

  it('bleibt offen, wo nichts passt - und raet nicht', () => {
    // Ein unbekanntes Modell laesst das Portal stillschweigend fallen und
    // liefert die ganze Marke. Lieber nachfragen.
    const e = loeseModellAuf('Phantasiemodell XYZ', MERCEDES)
    expect(e).toEqual({ modell: null, weg: 'offen', verworfen: null })
  })

  it('bleibt offen ohne Eingabe oder ohne Liste', () => {
    expect(loeseModellAuf(null, MERCEDES).weg).toBe('offen')
    expect(loeseModellAuf('E 53 AMG', []).weg).toBe('offen')
  })

  it('verkuerzt nicht auf einen zu kurzen Praefix', () => {
    // "E" allein ist kein Modell - daraus darf nichts werden.
    expect(loeseModellAuf('E 999 Sondermodell', MERCEDES).modell).toBeNull()
  })
})

describe('passendeModelle', () => {
  it('schlaegt die Modelle derselben Reihe vor', () => {
    expect(passendeModelle('GLC 300 d 4Matic', MERCEDES)).toEqual(['GLC 300', 'GLC 43 AMG'])
  })

  it('gibt die ganze Liste, wenn nichts passt', () => {
    expect(passendeModelle('Phantasie', MERCEDES).length).toBe(MERCEDES.length)
  })
})
