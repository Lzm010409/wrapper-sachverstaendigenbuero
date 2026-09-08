import { describe, expect, it } from 'vitest'
import { ausErgebnis, erfolg, fehler, info, rolleZu, warnung } from './typen'

/**
 * Der Kern des Konzepts: die Art steht **an** der Meldung.
 *
 * Vorher wurde sie am Text erraten —
 * `meldung.match(/sperr|gescheitert|nicht |Konflikt/i)`. Die Fälle hier sind
 * echte Meldungstexte aus dem Schreiben-Editor; an ihnen zeigt sich, warum
 * Raten kein Verfahren ist.
 */

describe('Meldungsarten', () => {
  it('trägt die Art am Datensatz, nicht im Wortlaut', () => {
    expect(fehler('Die Verbindung ist abgerissen.').art).toBe('fehler')
    expect(erfolg('Abschnitt ausformuliert.').art).toBe('erfolg')
    expect(warnung('Diese Stelle steht so nicht mehr im Brief.').art).toBe('warnung')
    expect(info('Der Lauf dauert einige Minuten.').art).toBe('info')
  })

  it('nimmt einen Titel mit, wo einer gebraucht wird', () => {
    expect(erfolg('3 Fahrzeuge im Korb.', 'Recherche fertig')).toEqual({
      art: 'erfolg',
      text: '3 Fahrzeuge im Korb.',
      titel: 'Recherche fertig',
    })
  })
})

describe('Was das Raten falsch gemacht hätte', () => {
  const alterRegex = /sperr|gescheitert|nicht |Konflikt/i

  it.each([
    ['Anrede und Einleitungssatz im Brief nachgetragen.', 'erfolg'],
    ['Abschnitt ausformuliert. Rückgängig mit Strg+Z.', 'erfolg'],
    ['Der Versandvermerk ist gesetzt.', 'erfolg'],
  ])('„%s" ist kein Fehler', (text) => {
    expect(alterRegex.test(text)).toBe(false)
    expect(erfolg(text).art).toBe('erfolg')
  })

  it('hätte einen Erfolg als Fehler eingefärbt, sobald „nicht" darin vorkommt', () => {
    // Genau das ist der Punkt: derselbe Vorgang, anders formuliert, andere
    // Farbe. Ein Wortlaut ist kein Zustand.
    const text = 'Der Baustein wurde übernommen, ein zweiter war nicht nötig.'
    expect(alterRegex.test(text)).toBe(true)
    expect(erfolg(text).art).toBe('erfolg')
  })
})

describe('Rolle für Hilfsmittel', () => {
  it('unterbricht nur, wo etwas schiefging', () => {
    expect(rolleZu('fehler')).toBe('alert')
    expect(rolleZu('warnung')).toBe('alert')
  })

  it('meldet Erfolg und Auskunft ohne Unterbrechung', () => {
    expect(rolleZu('erfolg')).toBe('status')
    expect(rolleZu('info')).toBe('status')
  })
})

describe('ausErgebnis', () => {
  it('macht aus einem Fehler eine Fehlermeldung', () => {
    expect(ausErgebnis({ fehler: 'Kein Zugang' })).toEqual({
      art: 'fehler',
      text: 'Kein Zugang',
      titel: undefined,
    })
  })

  it('macht aus einem Hinweis eine Erfolgsmeldung', () => {
    expect(ausErgebnis({ hinweis: 'Fall geladen' })?.art).toBe('erfolg')
  })

  it('lässt den Fehler gewinnen, wenn beides dasteht', () => {
    // Steht beides da, ist der Fehler die wichtigere Auskunft.
    expect(ausErgebnis({ fehler: 'Teilweise misslungen', hinweis: '3 von 5' })?.art).toBe('fehler')
  })

  it('gibt nichts zurück, wo nichts zu melden ist', () => {
    expect(ausErgebnis({})).toBeNull()
    expect(ausErgebnis(null)).toBeNull()
    expect(ausErgebnis(undefined)).toBeNull()
  })
})
