import { describe, expect, it } from 'vitest'
import {
  belegname,
  eindeutig,
  erstzulassungsteil,
  laufleistungsteil,
  paketname,
  teil,
} from './dateiname'

describe('Namensbestandteile', () => {
  it('schreibt Umlaute aus, statt sie zu verschlucken', () => {
    // `anhngerkupplung` wäre nicht mehr auszusprechen.
    expect(teil('Anhängerkupplung')).toBe('anhaengerkupplung')
    expect(teil('Rückfahrkamera')).toBe('rueckfahrkamera')
    expect(teil('Strassenmaß')).toBe('strassenmass')
  })

  it('wirft heraus, womit Windows und OneDrive nicht zurechtkommen', () => {
    expect(teil('AMG-Line / Sport*Paket')).toBe('amg-line-sport-paket')
    expect(teil('Klima "Automatik"')).toBe('klima-automatik')
  })

  it('lässt keinen Bindestrich am Rand stehen', () => {
    expect(teil('  Panoramadach  ')).toBe('panoramadach')
    expect(teil('—Standheizung—')).toBe('standheizung')
  })

  it('verträgt Leeres', () => {
    expect(teil(null)).toBe('')
    expect(teil('')).toBe('')
    expect(teil('///')).toBe('')
  })
})

describe('Laufleistung', () => {
  it('rundet auf Tausender', () => {
    expect(laufleistungsteil(129_558)).toBe('130tkm')
    expect(laufleistungsteil(129_000)).toBe('129tkm')
  })

  it('schweigt, wo die Rundung null ergäbe', () => {
    // `0tkm` stünde da als Angabe — und wäre eine falsche.
    expect(laufleistungsteil(400)).toBe('')
    expect(laufleistungsteil(0)).toBe('')
    expect(laufleistungsteil(null)).toBe('')
  })
})

describe('Erstzulassung', () => {
  it('nimmt jede Schreibweise, die die Portale liefern', () => {
    expect(erstzulassungsteil('02/2019')).toBe('ez19')
    expect(erstzulassungsteil('02.2019')).toBe('ez19')
    expect(erstzulassungsteil('2019-02-15')).toBe('ez19')
    expect(erstzulassungsteil('2019')).toBe('ez19')
  })

  it('schweigt, wo kein Jahr steht', () => {
    expect(erstzulassungsteil('unbekannt')).toBe('')
    expect(erstzulassungsteil(null)).toBe('')
  })
})

describe('Name eines Einzelbelegs', () => {
  it('setzt den Namen aus dem Haus zusammen', () => {
    expect(
      belegname({ kilometerstand: 129_558, erstzulassung: '02/2019', merkmal: 'Panoramadach' }),
    ).toBe('WBW-konkret-130tkm-ez19-panoramadach.pdf')
  })

  it('lässt weg, was fehlt, statt einen Platzhalter zu setzen', () => {
    expect(belegname({ kilometerstand: 129_558, erstzulassung: '02/2019' })).toBe(
      'WBW-konkret-130tkm-ez19.pdf',
    )
    expect(belegname({ erstzulassung: '02/2019', merkmal: 'AHK' })).toBe(
      'WBW-konkret-ez19-ahk.pdf',
    )
    expect(belegname({})).toBe('WBW-konkret.pdf')
  })

  it('kürzt einen ausufernden Namen', () => {
    const lang = belegname({ kilometerstand: 100_000, merkmal: 'x'.repeat(400) })
    expect(lang.length).toBeLessThanOrEqual(124)
    expect(lang.endsWith('.pdf')).toBe(true)
  })
})

describe('Name eines Portalpakets', () => {
  it('nimmt den Portalnamen, wie er im Haus heisst', () => {
    expect(paketname('autoscout24')).toBe('WBW-autoscout24.pdf')
    expect(paketname('kleinanzeigen')).toBe('WBW-kleinanzeigen.pdf')
  })

  it('macht aus dem Punkt in mobile.de einen Bindestrich', () => {
    // Ein zweiter Punkt vor der Endung liest sich wie eine zweite Endung.
    expect(paketname('mobile.de')).toBe('WBW-mobile-de.pdf')
  })
})

describe('Eindeutige Namen', () => {
  it('nummeriert Gleiche durch, ohne den ersten anzufassen', () => {
    // Der erste behält seinen Namen, damit ein erneuter Lauf nicht plötzlich
    // andere Dateien schreibt.
    expect(
      eindeutig(['WBW-konkret-130tkm-ez19.pdf', 'WBW-konkret-130tkm-ez19.pdf', 'WBW-x.pdf']),
    ).toEqual(['WBW-konkret-130tkm-ez19.pdf', 'WBW-konkret-130tkm-ez19-2.pdf', 'WBW-x.pdf'])
  })

  it('zählt weiter als bis zwei', () => {
    expect(eindeutig(['a.pdf', 'a.pdf', 'a.pdf'])).toEqual(['a.pdf', 'a-2.pdf', 'a-3.pdf'])
  })

  it('unterscheidet nicht nach Gross- und Kleinschreibung', () => {
    // OneDrive tut es auch nicht — zwei Dateien, die sich nur darin
    // unterscheiden, überschrieben sich dort gegenseitig.
    expect(eindeutig(['A.pdf', 'a.pdf'])).toEqual(['A.pdf', 'a-2.pdf'])
  })
})
