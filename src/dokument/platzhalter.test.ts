import { describe, expect, it } from 'vitest'
import { enthaeltPlatzhalter, setzeWerteEin, zerlegeMitPlatzhaltern } from './platzhalter'

describe('zerlegeMitPlatzhaltern', () => {
  it('trennt Text und Platzhalter', () => {
    expect(zerlegeMitPlatzhaltern('Am Fahrzeug [Kennzeichen] ist es so.')).toEqual([
      { art: 'text', text: 'Am Fahrzeug ' },
      { art: 'platzhalter', schluessel: 'Kennzeichen' },
      { art: 'text', text: ' ist es so.' },
    ])
  })

  it('nimmt mehrere Platzhalter mit', () => {
    const stuecke = zerlegeMitPlatzhaltern('[A] und [B]')
    expect(stuecke.filter((s) => s.art === 'platzhalter')).toHaveLength(2)
  })

  it('schneidet Leerraum im Schlüssel weg', () => {
    expect(zerlegeMitPlatzhaltern('[ Bauteil ]')).toEqual([
      { art: 'platzhalter', schluessel: 'Bauteil' },
    ])
  })

  /*
    Der Grund für die Ausnahme: die Bibliothek enthält Markdown-Verweise auf
    Fundstellen. Würde `[BGH VI ZR 1/20]` aus `[BGH VI ZR 1/20](https://…)`
    zu einem Platzhalter, stünde im Brief plötzlich eine offene Angabe, wo
    ein Verweis gemeint war — und der Export wäre gesperrt.
  */
  it('lässt Markdown-Verweise in Ruhe', () => {
    expect(zerlegeMitPlatzhaltern('siehe [BGH VI ZR 1/20](https://example.invalid)')).toEqual([
      { art: 'text', text: 'siehe [BGH VI ZR 1/20](https://example.invalid)' },
    ])
  })

  it('gibt reinen Text unverändert zurück', () => {
    expect(zerlegeMitPlatzhaltern('Nur Text.')).toEqual([{ art: 'text', text: 'Nur Text.' }])
  })

  it('lässt eine leere Klammer stehen', () => {
    expect(zerlegeMitPlatzhaltern('leer []')).toEqual([{ art: 'text', text: 'leer []' }])
  })

  it('beantwortet die Frage nach dem Vorhandensein', () => {
    expect(enthaeltPlatzhalter('Am [Bauteil]')).toBe(true)
    expect(enthaeltPlatzhalter('siehe [X](y)')).toBe(false)
    expect(enthaeltPlatzhalter('nichts')).toBe(false)
  })
})

describe('setzeWerteEin bleibt unberührt', () => {
  it('setzt bekannte Werte ein und lässt unbekannte stehen', () => {
    const stand = setzeWerteEin('[Marke] am [Bauteil]', { Marke: 'VW' })
    expect(stand.text).toBe('VW am [Bauteil]')
    expect(stand.offen).toEqual(['Bauteil'])
    expect(stand.gesetzt).toBe(1)
  })
})
