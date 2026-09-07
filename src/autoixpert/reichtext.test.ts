import { describe, expect, it } from 'vitest'
import { alsText, loeseEntitaeten, zuAbsaetzen } from './reichtext'

/**
 * Die Beispiele stammen aus einem echten Gutachten (0926/2078TG, abgerufen
 * am 07.09.2026). Genau so kamen sie aus der Schnittstelle - und genau so
 * standen sie vorher im Cockpit auf dem Schirm.
 */
const SCHADEN =
  '<p>- Hecktür strukturell beschädigt -&gt; ersetzen</p>' +
  '<p>- Abdeckung Reserverad deformiert -&gt; ersetzen</p>' +
  '<p><br></p>' +
  '<p>Aufgrund der zu erwartenden Farbtonproblematik ist eine Einlackierung erforderlich.</p>'

describe('loeseEntitaeten', () => {
  it('loest benannte Entitaeten', () => {
    expect(loeseEntitaeten('a -&gt; b &amp; c')).toBe('a -> b & c')
    expect(loeseEntitaeten('Hectk&uuml;r')).toBe('Hectkür')
  })

  it('loest numerische Entitaeten, dezimal und hexadezimal', () => {
    expect(loeseEntitaeten('&#8364;')).toBe('€')
    expect(loeseEntitaeten('&#x20AC;')).toBe('€')
  })

  it('laesst Unbekanntes und Unsinniges stehen', () => {
    expect(loeseEntitaeten('&gibtesnicht;')).toBe('&gibtesnicht;')
    expect(loeseEntitaeten('&#999999999;')).toBe('&#999999999;')
  })
})

describe('zuAbsaetzen', () => {
  it('macht aus dem echten Schadentext lesbare Absaetze', () => {
    const a = zuAbsaetzen(SCHADEN)
    expect(a).toHaveLength(3) // der leere <p><br></p> faellt weg
    expect(a[0]!.teile[0]!.text).toBe('- Hecktür strukturell beschädigt -> ersetzen')
    expect(a[2]!.teile[0]!.text).toContain('Einlackierung erforderlich.')
  })

  it('behandelt reinen Text als einen Absatz', () => {
    // car.roadworthiness kommt ohne Markup - der Weg muss beides koennen.
    expect(zuAbsaetzen('verkehrssicher')).toEqual([
      { art: 'absatz', teile: [{ text: 'verkehrssicher' }] },
    ])
  })

  it('trennt reinen Text an Zeilenumbruechen', () => {
    expect(zuAbsaetzen('erste Zeile\nzweite Zeile')).toHaveLength(2)
  })

  it('uebernimmt fett und kursiv', () => {
    const a = zuAbsaetzen('<p>ganz <strong>wichtig</strong> und <em>schief</em></p>')
    expect(a[0]!.teile.find((t) => t.fett)?.text).toBe('wichtig')
    expect(a[0]!.teile.find((t) => t.kursiv)?.text).toBe('schief')
  })

  it('macht aus Listenpunkten Punkte', () => {
    const a = zuAbsaetzen('<ul><li>eins</li><li>zwei</li></ul>')
    expect(a.map((x) => x.art)).toEqual(['punkt', 'punkt'])
    expect(a.map((x) => x.teile[0]!.text)).toEqual(['eins', 'zwei'])
  })

  it('gibt bei leerer Eingabe nichts zurueck', () => {
    expect(zuAbsaetzen(null)).toEqual([])
    expect(zuAbsaetzen('')).toEqual([])
    expect(zuAbsaetzen('<p></p><p>  </p>')).toEqual([])
  })

  /*
    Sicherheit: hier entstehen nur Textknoten. Ein Skript kann also gar
    nicht ausgefuehrt werden - aber sein Inhalt soll auch nicht als Text
    auf dem Schirm landen.
  */
  it('verwirft Skript und Stil samt Inhalt', () => {
    const a = zuAbsaetzen('<p>davor</p><script>alert(1)</script><style>p{}</style><p>danach</p>')
    expect(alsText('<p>davor</p><script>alert(1)</script><p>danach</p>')).toBe('davor\ndanach')
    expect(a.some((x) => x.teile.some((t) => t.text.includes('alert')))).toBe(false)
  })

  it('gibt unbekannte Marken als Text nicht aus', () => {
    const a = zuAbsaetzen('<p>Text <img src=x onerror=alert(1)> weiter</p>')
    expect(alsText('<p>Text <img src=x onerror=alert(1)> weiter</p>')).toBe('Text weiter')
    expect(a[0]!.teile.some((t) => t.text.includes('onerror'))).toBe(false)
  })
})

describe('alsText', () => {
  it('setzt Absaetze mit Zeilenumbruch und Punkte mit Aufzaehlungszeichen', () => {
    expect(alsText(SCHADEN).split('\n')).toHaveLength(3)
    expect(alsText('<ul><li>eins</li></ul>')).toBe('• eins')
  })
})
