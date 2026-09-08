import { describe, expect, it } from 'vitest'
import { trenneLinie } from './linie'

describe('Linie vom Modell trennen', () => {
  it('trennt die Linie ab und lässt das Modell stehen', () => {
    expect(trenneLinie('Sharan Highline')).toEqual({
      modell: 'Sharan',
      linie: 'Highline',
      entfernt: [],
    })
  })

  it('räumt das Modellfeld leer, wenn nur Linie und Zusatz darin standen', () => {
    /*
      Der Fall vom 08.09.2026. Die DAT lieferte als Untertyp „Highline BMT";
      das Feld enthielt damit kein Fahrzeug. AutoScout24 kannte den Begriff
      unter 119 VW-Modellen nicht und suchte über die ganze Marke — in beiden
      Zyklen null Treffer.
    */
    expect(trenneLinie('Highline BMT')).toEqual({
      modell: '',
      linie: 'Highline',
      entfernt: ['BMT'],
    })
  })

  it('lässt ein Modell unangetastet, das keine Linie trägt', () => {
    expect(trenneLinie('Sharan 2.0 TDI')).toEqual({
      modell: 'Sharan 2.0 TDI',
      linie: null,
      entfernt: [],
    })
  })

  it('hält AMG als Modellbestandteil fest', () => {
    // `E 53 AMG` ist bei AutoScout24 ein eigenes Modell. Fiele das „AMG" weg,
    // bliebe „E 53" — und das führt das Portal nicht.
    expect(trenneLinie('E 53 AMG 4Matic+').modell).toBe('E 53 AMG 4Matic+')
  })

  it('trennt die AMG-Line, ohne das AMG-Modell zu treffen', () => {
    expect(trenneLinie('C 220 d AMG Line')).toEqual({
      modell: 'C 220 d',
      linie: 'AMG Line',
      entfernt: [],
    })
  })

  it('nimmt die längere Bezeichnung, wo zwei zutreffen', () => {
    // Sonst bliebe „Technology" als Rest im Modellfeld stehen.
    expect(trenneLinie('Passat BlueMotion Technology').entfernt).toEqual(['BlueMotion Technology'])
  })

  it('achtet auf Wortgrenzen', () => {
    // „Lifestyle" ist keine „Life"-Linie.
    expect(trenneLinie('Ceed Lifestyle').linie).toBe(null)
  })

  it('kommt mit leerer und fehlender Eingabe zurecht', () => {
    expect(trenneLinie('')).toEqual({ modell: '', linie: null, entfernt: [] })
    expect(trenneLinie(null)).toEqual({ modell: '', linie: null, entfernt: [] })
    expect(trenneLinie(undefined)).toEqual({ modell: '', linie: null, entfernt: [] })
  })

  it('lässt doppelten Leerraum nicht stehen', () => {
    expect(trenneLinie('Golf Highline 1.4 TSI').modell).toBe('Golf 1.4 TSI')
  })

  it('erkennt die Linie unabhängig von der Schreibweise', () => {
    expect(trenneLinie('Tiguan HIGHLINE').linie).toBe('Highline')
    expect(trenneLinie('A4 s-line').linie).toBe('S line')
  })

  it('kennt die Linien der französischen Marken', () => {
    // Der Citroën-Fall vom 08.09.2026: „Feel" ist die Linie, „XL" die
    // Langversion des Berlingo — im Modellfeld stand beides.
    expect(trenneLinie('Berlingo Feel')).toEqual({
      modell: 'Berlingo',
      linie: 'Feel',
      entfernt: [],
    })
    expect(trenneLinie('208 Allure').linie).toBe('Allure')
    expect(trenneLinie('Clio Intens').linie).toBe('Intens')
  })

  it('lässt XL am Modell, weil es die Baulänge meint und nicht die Linie', () => {
    // „Berlingo XL" ist ein anderes Fahrzeug als „Berlingo" — die Länge darf
    // nicht stillschweigend verschwinden.
    expect(trenneLinie('Berlingo XL Feel')).toEqual({
      modell: 'Berlingo XL',
      linie: 'Feel',
      entfernt: [],
    })
  })
})
