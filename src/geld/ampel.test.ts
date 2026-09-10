import { describe, expect, it } from 'vitest'
import {
  ampelFuer,
  faelligkeit,
  widerspruch,
  type Rechnungszeile,
} from './ampel'

const HEUTE = new Date('2026-09-09T12:00:00Z')

let laufend = 0

function zeile(mehr: Partial<Rechnungszeile> = {}): Rechnungszeile {
  laufend += 1
  return {
    sevdeskId: `id-${laufend}`,
    nummer: '0926/2081TG01',
    status: 200,
    bruttoCent: 153421,
    bezahltCent: 0,
    rechnungsdatum: new Date('2026-09-01T00:00:00Z'),
    zahldatum: null,
    zahlungszielTage: 30,
    mahnstufe: null,
    ...mehr,
  }
}

describe('faelligkeit', () => {
  it('rechnet das Zahlungsziel auf das Rechnungsdatum', () => {
    expect(faelligkeit(new Date('2026-09-01T00:00:00Z'), 30)?.toISOString().slice(0, 10)).toBe(
      '2026-10-01',
    )
  })

  it('bleibt unbekannt, wenn eine der beiden Angaben fehlt', () => {
    expect(faelligkeit(null, 30)).toBeNull()
    expect(faelligkeit(new Date(), null)).toBeNull()
  })
})

describe('ampelFuer', () => {
  it('meldet „ohne Rechnung", wenn es keine gibt', () => {
    const ampel = ampelFuer([], HEUTE)
    expect(ampel.stand).toBe('ohne_rechnung')
    expect(ampel.offenCent).toBe(0)
  })

  it('ist offen, solange die Frist läuft', () => {
    expect(ampelFuer([zeile()], HEUTE).stand).toBe('offen')
  })

  it('ist überfällig, sobald die Frist vorbei ist', () => {
    const alt = zeile({ rechnungsdatum: new Date('2026-07-01T00:00:00Z') })
    const ampel = ampelFuer([alt], HEUTE)
    expect(ampel.stand).toBe('ueberfaellig')
    expect(ampel.faelligAm?.toISOString().slice(0, 10)).toBe('2026-07-31')
  })

  it('ist nicht überfällig, wenn die Fälligkeit unbekannt ist', () => {
    // Ohne Rechnungsdatum wäre „überfällig" eine Behauptung ins Blaue.
    expect(ampelFuer([zeile({ rechnungsdatum: null })], HEUTE).stand).toBe('offen')
  })

  it('fasst mehrere Rechnungen eines Falls zusammen', () => {
    const ampel = ampelFuer(
      [zeile({ nummer: '…01', bruttoCent: 100000 }), zeile({ nummer: '…02', bruttoCent: 53421 })],
      HEUTE,
    )
    expect(ampel.bruttoCent).toBe(153421)
    expect(ampel.offenCent).toBe(153421)
    expect(ampel.nummern).toEqual(['…01', '…02'])
  })

  it('erkennt eine Teilzahlung — der Fall, auf den es ankommt', () => {
    const ampel = ampelFuer([zeile({ status: 750, bezahltCent: 82459, bruttoCent: 130835 })], HEUTE)
    expect(ampel.stand).toBe('teilbezahlt')
    expect(ampel.offenCent).toBe(48376)
  })

  it('glaubt dem Zustand aus sevDesk, auch ohne gebuchten Betrag', () => {
    // Am Konto lagen zwei solche Rechnungen. Wer nur rechnet, mahnt jemanden,
    // der bezahlt hat.
    expect(ampelFuer([zeile({ status: 1000, bezahltCent: 0 })], HEUTE).stand).toBe('bezahlt')
  })

  it('nennt bezahlt, wenn der volle Betrag gebucht ist', () => {
    expect(ampelFuer([zeile({ bezahltCent: 153421 })], HEUTE).stand).toBe('bezahlt')
  })

  it('bleibt teilbezahlt, wenn eine von zwei Rechnungen offen ist', () => {
    const ampel = ampelFuer(
      [
        zeile({ nummer: 'a', status: 1000, bruttoCent: 100000, bezahltCent: 100000 }),
        zeile({ nummer: 'b', status: 200, bruttoCent: 50000, bezahltCent: 0 }),
      ],
      HEUTE,
    )
    expect(ampel.stand).toBe('teilbezahlt')
    expect(ampel.offenCent).toBe(50000)
  })

  it('nennt einen reinen Entwurf beim Namen', () => {
    expect(ampelFuer([zeile({ status: 50, bruttoCent: 0 })], HEUTE).stand).toBe('entwurf')
  })

  it('nimmt die früheste Fälligkeit der noch offenen Rechnungen', () => {
    const ampel = ampelFuer(
      [
        zeile({ nummer: 'a', rechnungsdatum: new Date('2026-09-01T00:00:00Z') }),
        zeile({ nummer: 'b', rechnungsdatum: new Date('2026-08-01T00:00:00Z') }),
      ],
      HEUTE,
    )
    expect(ampel.faelligAm?.toISOString().slice(0, 10)).toBe('2026-08-31')
  })

  it('nimmt die höchste Mahnstufe', () => {
    const ampel = ampelFuer(
      [zeile({ nummer: 'a', mahnstufe: 1 }), zeile({ nummer: 'b', mahnstufe: 3 })],
      HEUTE,
    )
    expect(ampel.mahnstufe).toBe(3)
  })
})

describe('widerspruch', () => {
  it('meldet einen Deal auf „Bezahlt" ohne Zahlung in sevDesk', () => {
    expect(widerspruch('offen', 'Bezahlt')).toContain('Bezahlt')
  })

  it('sagt deutlich, wenn es zum Aktenzeichen gar keine Rechnung gibt', () => {
    expect(widerspruch('ohne_rechnung', 'Bezahlt')).toContain('keine Rechnung')
  })

  it('meldet Geld, das in Pipedrive noch nicht angekommen ist', () => {
    expect(widerspruch('bezahlt', 'Versendet')).toContain('Pipedrive steht noch')
  })

  it('meldet eine Teilzahlung, die in Pipedrive nicht steht', () => {
    expect(widerspruch('teilbezahlt', 'Versendet')).toContain('Teilbezahlt')
  })

  it('schweigt, wo kein Widerspruch ist', () => {
    expect(widerspruch('bezahlt', 'Bezahlt')).toBeNull()
    expect(widerspruch('offen', 'Versendet')).toBeNull()
    expect(widerspruch('ohne_rechnung', 'Aufgenommen')).toBeNull()
    expect(widerspruch('teilbezahlt', 'Teilbezahlt')).toBeNull()
  })

  it('schweigt ohne Pipedrive-Phase', () => {
    expect(widerspruch('offen', undefined)).toBeNull()
  })
})

describe('doppelte Rechnungsnummern', () => {
  it('zählt eine doppelt angelegte Nummer nur einmal', () => {
    // Am echten Konto: 0823/936TG01 liegt zweimal, gleicher Betrag,
    // einmal bezahlt, einmal offen. Summiert stünde der doppelte Betrag da.
    const ampel = ampelFuer(
      [
        zeile({ nummer: '0823/936TG01', status: 1000, bruttoCent: 85550, bezahltCent: 85549 }),
        zeile({ nummer: '0823/936TG01', status: 100, bruttoCent: 85550, bezahltCent: 0 }),
      ],
      HEUTE,
    )
    expect(ampel.bruttoCent).toBe(85550)
    expect(ampel.stand).toBe('bezahlt')
    expect(ampel.doppelt).toEqual(['0823/936TG01'])
  })

  it('meldet nichts, wo keine Nummer doppelt ist', () => {
    expect(ampelFuer([zeile({ nummer: 'a' }), zeile({ nummer: 'b' })], HEUTE).doppelt).toEqual([])
  })

  it('nimmt bei gleichem Zustand den höheren gebuchten Betrag', () => {
    const ampel = ampelFuer(
      [
        zeile({ nummer: 'x', status: 750, bruttoCent: 100000, bezahltCent: 10000 }),
        zeile({ nummer: 'x', status: 750, bruttoCent: 100000, bezahltCent: 60000 }),
      ],
      HEUTE,
    )
    expect(ampel.bezahltCent).toBe(60000)
  })
})
