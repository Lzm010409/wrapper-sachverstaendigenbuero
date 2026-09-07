import { describe, expect, it } from 'vitest'
import { leseErgebnis, trichterzeilen } from './ergebnis'

/**
 * Die Zahlen und Feldnamen stammen aus einem echten Lauf vom 07.09.2026:
 * Mercedes E 53 AMG, AutoScout24 und Kleinanzeigen, 24 Treffer, sieben im
 * Korb, Vorschlag 34.796 EUR.
 *
 * Wichtig daran sind die **Feldnamen**. Die Vereinheitlichung des Plugins
 * (`normalize.js`) benennt sie anders als die Adapter: `mileage` statt
 * `kilometerstand`, `ez` statt `erstzulassung`, und der Preis steht bei
 * AutoScout24 verschachtelt unter `price.total.amount`. Beim ersten Versuch
 * stand deshalb in jeder Zeile ein Strich.
 */
const ECHT = {
  wbw: {
    anzahl: 7,
    vorschlagBrutto: 34796,
    roh: { min: 34991, max: 43999, median: 36999 },
    bereinigt: { median: 34796, getrimmt: 35652 },
  },
  statistik: {
    gescraped: 24,
    imUmkreis: 18,
    toleranzRaus: 8,
    dublettenRaus: 0,
    linieRaus: 0,
    karosserieRaus: 3,
    getriebeRaus: 0,
    tuerenRaus: 0,
    imKorb: 7,
  },
  korb: [
    {
      rang: 1,
      score: 0.42,
      fehlend: ['AHK', 'Navigationssystem'],
      fahrzeug: {
        source: 'autoscout24',
        title: 'Mercedes-Benz E 53 AMG 4Matic+ Performance',
        price: { total: { amount: 35390 } },
        mileage: 180000,
        ez: '03/2019',
        power: 320,
        zip: '74906',
        _distanzKm: 295,
        url: 'https://www.autoscout24.de/angebote/…',
      },
    },
  ],
}

describe('leseErgebnis', () => {
  const e = leseErgebnis(ECHT)!

  it('liest den Wertvorschlag', () => {
    expect(e.wert.vorschlagBrutto).toBe(34796)
    expect(e.wert.anzahl).toBe(7)
    expect(e.wert.medianRoh).toBe(36999)
    expect(e.wert.min).toBe(34991)
  })

  it('liest den verschachtelten Preis von AutoScout24', () => {
    expect(e.korb[0]?.preis).toBe(35390)
  })

  it('versteht die Feldnamen der Vereinheitlichung', () => {
    expect(e.korb[0]?.kilometerstand).toBe(180000)
    expect(e.korb[0]?.erstzulassung).toBe('03/2019')
    expect(e.korb[0]?.leistungKw).toBe(320)
    expect(e.korb[0]?.ort).toBe('74906')
    expect(e.korb[0]?.entfernungKm).toBe(295)
  })

  it('versteht auch die flachen Feldnamen der Adapter', () => {
    const flach = leseErgebnis({
      korb: [
        {
          rang: 1,
          fahrzeug: {
            quelle: 'kleinanzeigen',
            titel: 'Mercedes E 53',
            preis: 33000,
            kilometerstand: 150000,
            erstzulassung: '05/2019',
            leistungKw: 320,
            ort: 'Duisburg',
          },
        },
      ],
    })!
    expect(flach.korb[0]?.preis).toBe(33000)
    expect(flach.korb[0]?.kilometerstand).toBe(150000)
    expect(flach.korb[0]?.ort).toBe('Duisburg')
  })

  it('nennt, was im Inserat fehlte', () => {
    expect(e.korb[0]?.fehlend).toEqual(['AHK', 'Navigationssystem'])
  })

  it('stürzt nicht ab, wenn das Plugin ein Feld umbenennt', () => {
    const duenn = leseErgebnis({ korb: [{ fahrzeug: {} }] })!
    expect(duenn.korb[0]?.rang).toBe(1)
    expect(duenn.korb[0]?.preis).toBeNull()
    expect(duenn.wert.vorschlagBrutto).toBeNull()
  })

  it('gibt null zurück, wo gar nichts steht', () => {
    expect(leseErgebnis(null)).toBeNull()
    expect(leseErgebnis('kaputt')).toBeNull()
  })
})

describe('trichterzeilen', () => {
  it('zeigt nur die Stationen, die etwas entfernt haben', () => {
    const zeilen = trichterzeilen(leseErgebnis(ECHT)!.trichter)
    expect(zeilen.map((z) => `${z.wert} ${z.name}`)).toEqual([
      '24 von den Portalen',
      '18 im Umkreis',
      '8 ausserhalb der Toleranzen',
      '3 andere Karosserie',
      '7 im Korb',
    ])
  })

  it('zeigt den Korb auch dann, wenn er leer ist', () => {
    const zeilen = trichterzeilen(leseErgebnis({ statistik: { gescraped: 4, imKorb: 0 } })!.trichter)
    expect(zeilen).toEqual([
      { name: 'von den Portalen', wert: 4 },
      { name: 'im Korb', wert: 0 },
    ])
  })
})
