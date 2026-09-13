import { describe, expect, it } from 'vitest'
import { erkenneRueckfall, rueckfallHinweis } from './lauf'

/**
 * Der Rückfall auf eine andere Beschaffungsstufe.
 *
 * Apify steht in `providers.json` bewusst vorn: nur dafür ist gemessen, dass
 * Umkreis, Laufleistung und Baujahr am Portal wirken und ein tragfähiger Korb
 * herauskommt (Probeläufe 1 bis 5). Trägt stattdessen eine der kostenlosen
 * Stufen, ist der Korb anders zustande gekommen als geplant.
 *
 * Das darf nicht still passieren. Genau dieselbe Fehlerklasse hat in dieser
 * Sitzung schon die PDF-Ausgabe getroffen: eine Stufe fiel weg, und die
 * Meldung sah aus wie immer.
 */
describe('erkenneRueckfall', () => {
  it('erkennt, wenn nicht die erste Stufe getragen hat', () => {
    const protokoll = {
      getrageneStufe: 'L1',
      versuche: [
        { stufe: 'L3', adapter: 'apify', ergebnis: 'fehler', fehler: 'HTTP 402 für Actor' },
        { stufe: 'L1', adapter: 'kleinanzeigen', ergebnis: 'erfolg', treffer: 12 },
      ],
    }
    expect(erkenneRueckfall('kleinanzeigen', 'eng', protokoll)).toEqual({
      portal: 'kleinanzeigen',
      zyklus: 'eng',
      stufe: 'L1',
      stattdessen: 'L3',
      grund: 'HTTP 402 für Actor',
      bewusst: false,
    })
  })

  it('schweigt, wenn die erste Stufe getragen hat', () => {
    const protokoll = {
      getrageneStufe: 'L3',
      versuche: [{ stufe: 'L3', adapter: 'apify', ergebnis: 'erfolg', treffer: 17 }],
    }
    expect(erkenneRueckfall('kleinanzeigen', 'eng', protokoll)).toBeNull()
  })

  it('nennt den Grund auch, wenn die Stufe nur übersprungen wurde', () => {
    const protokoll = {
      getrageneStufe: 'L1',
      versuche: [
        { stufe: 'L3', adapter: 'apify', ergebnis: 'uebersprungen', grund: 'enabled: false' },
        { stufe: 'L1', adapter: 'kleinanzeigen', ergebnis: 'erfolg', treffer: 8 },
      ],
    }
    expect(erkenneRueckfall('kleinanzeigen', 'weit', protokoll)?.grund).toBe('enabled: false')
  })

  it('ein Fehlschlag ist kein Rückfall — den meldet der Lauf ohnehin', () => {
    const protokoll = {
      getrageneStufe: null,
      versuche: [{ stufe: 'L3', adapter: 'apify', ergebnis: 'fehler', fehler: 'Zeitüberschreitung' }],
    }
    expect(erkenneRueckfall('mobile.de', 'eng', protokoll)).toBeNull()
  })

  it('kommt mit einem fehlenden oder kaputten Protokoll zurecht', () => {
    expect(erkenneRueckfall('mobile.de', 'eng', null)).toBeNull()
    expect(erkenneRueckfall('mobile.de', 'eng', undefined)).toBeNull()
    expect(erkenneRueckfall('mobile.de', 'eng', {})).toBeNull()
    expect(erkenneRueckfall('mobile.de', 'eng', 'kein Objekt')).toBeNull()
  })
})

describe('rueckfallHinweis', () => {
  it('ohne Rückfall bleibt die Meldung, wie sie war', () => {
    expect(rueckfallHinweis([])).toBeNull()
  })

  it('nennt Portal und Stufe und warnt — mit Anzeigenamen, nicht dem rohen Schlüssel', () => {
    const h = rueckfallHinweis([
      { portal: 'kleinanzeigen', zyklus: 'eng', stufe: 'L1', stattdessen: 'L3', grund: 'HTTP 402', bewusst: false },
    ])
    expect(h?.text).toMatch(/Kleinanzeigen über L1/)
    expect(h?.text).toMatch(/anders zustande gekommen/)
    expect(h?.warnung).toBe(true)
  })

  it('der nicht gesetzte Kosten-Haken ist ein Hinweis, keine Warnung', () => {
    /*
      Apify steht jetzt als erste Stufe. Wer den kostenpflichtigen Haken nicht
      setzt, bekommt bei JEDEM Lauf den kostenlosen Weg — das jedes Mal als
      "Achtung" zu melden wäre eine Warnung, die niemand mehr liest.
    */
    const h = rueckfallHinweis([
      { portal: 'kleinanzeigen', zyklus: 'eng', stufe: 'L1', stattdessen: 'L3',
        grund: 'L3 Apify ist kostenpflichtig und gesperrt. Zum bewussten Freischalten WBW_ALLOW_PAID=1 setzen',
        bewusst: true },
    ])
    expect(h?.warnung).toBe(false)
    expect(h?.text).toMatch(/nicht freigegeben/)
  })

  it('ein echter Fehler neben dem Haken bleibt eine Warnung', () => {
    const h = rueckfallHinweis([
      { portal: 'kleinanzeigen', zyklus: 'eng', stufe: 'L1', stattdessen: 'L3', grund: 'WBW_ALLOW_PAID', bewusst: true },
      { portal: 'mobile.de', zyklus: 'eng', stufe: 'L0', stattdessen: 'L3', grund: 'HTTP 500', bewusst: false },
    ])
    expect(h?.warnung).toBe(true)
  })

  it('zählt dasselbe Portal aus mehreren Zyklen nur einmal', () => {
    const h = rueckfallHinweis([
      { portal: 'kleinanzeigen', zyklus: 'eng', stufe: 'L1', stattdessen: 'L3', grund: null, bewusst: false },
      { portal: 'kleinanzeigen', zyklus: 'weit', stufe: 'L1', stattdessen: 'L3', grund: null, bewusst: false },
    ])
    expect(h?.text.match(/Kleinanzeigen/g)).toHaveLength(1)
  })

  it('zählt mehrere Portale mit Anzeigenamen auf', () => {
    const h = rueckfallHinweis([
      { portal: 'kleinanzeigen', zyklus: 'eng', stufe: 'L1', stattdessen: 'L3', grund: null, bewusst: false },
      { portal: 'autoscout24', zyklus: 'eng', stufe: 'L0', stattdessen: 'L3', grund: null, bewusst: false },
    ])
    expect(h?.text).toMatch(/Kleinanzeigen über L1 und AutoScout24 über L0/)
  })
})
