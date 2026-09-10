import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

/**
 * Der Gesamtdeckel des Laufs.
 *
 * `maxTotalChargeUsd` gilt bei Apify **je Aufruf**. Der Wert stand auf
 * 0,50 $, und ein Lauf ruft drei Portale in bis zu drei Zyklen auf — neun
 * Aufrufe, bis zu **4,50 $**, ohne dass irgendwo eine Grenze gerissen wäre.
 * Jeder einzelne Aufruf hätte sich an seinen Deckel gehalten.
 */
const require_ = createRequire(import.meta.url)
const { eroeffne, reserviere, erstatte, schaetzeKosten } = require_('../wbw-plugin/budget.js')

const neuesBuch = () => join(mkdtempSync(join(tmpdir(), 'wbw-budget-')), 'budget.json')
const stand = (datei: string) => JSON.parse(readFileSync(datei, 'utf8'))

describe('Das Hauptbuch', () => {
  it('eröffnet mit dem vollen Deckel', () => {
    const b = neuesBuch()
    eroeffne(b, 1.0)
    expect(stand(b)).toMatchObject({ deckelUsd: 1.0, restUsd: 1.0 })
  })

  it('ein zweiter Prozess erbt den Stand, statt ihn zurückzusetzen', () => {
    // Die Portale laufen als eigene Kindprozesse. Würde jeder neu eröffnen,
    // hätte jeder den vollen Deckel — und der Gesamtdeckel wäre wirkungslos.
    const b = neuesBuch()
    eroeffne(b, 1.0)
    reserviere(b, 0.4, 'autoscout24')
    eroeffne(b, 1.0)
    expect(stand(b).restUsd).toBeCloseTo(0.6, 6)
  })

  it('bewilligt höchstens, was noch da ist', () => {
    const b = neuesBuch()
    eroeffne(b, 0.3)
    expect(reserviere(b, 0.2, 'a')).toBeCloseTo(0.2, 6)
    expect(reserviere(b, 0.2, 'b')).toBeCloseTo(0.1, 6) // nur noch 0,10 übrig
    expect(reserviere(b, 0.2, 'c')).toBe(0) // nichts mehr
  })

  it('gibt den ungenutzten Teil zurück', () => {
    const b = neuesBuch()
    eroeffne(b, 1.0)
    const bewilligt = reserviere(b, 0.2, 'kleinanzeigen')
    // 80 Datensätze bei Kleinanzeigen: 0,005 + 80 × 0,0004 = 0,037 $
    const kosten = schaetzeKosten(80, { grundpreisUsd: 0.005, preisJeDatensatzUsd: 0.0004 })
    expect(kosten).toBeCloseTo(0.037, 6)
    erstatte(b, bewilligt - kosten, 'kleinanzeigen')
    expect(stand(b).restUsd).toBeCloseTo(1.0 - kosten, 6)
  })

  it('erstattet nie über den Deckel hinaus', () => {
    const b = neuesBuch()
    eroeffne(b, 1.0)
    erstatte(b, 5.0, 'unfug')
    expect(stand(b).restUsd).toBe(1.0)
  })

  it('neun Aufrufe reissen den Deckel nicht', () => {
    // Der eigentliche Punkt: drei Portale, drei Zyklen.
    const b = neuesBuch()
    eroeffne(b, 1.0)
    let ausgegeben = 0
    for (let i = 0; i < 9; i++) {
      const bewilligt = reserviere(b, 0.2, `aufruf-${i}`)
      const kosten = Math.min(bewilligt, schaetzeKosten(80, { preisJeDatensatzUsd: 0.0006 }))
      ausgegeben += kosten
      erstatte(b, bewilligt - kosten, `aufruf-${i}`)
    }
    expect(ausgegeben).toBeLessThanOrEqual(1.0)
    expect(stand(b).restUsd).toBeGreaterThanOrEqual(0)
  })

  it('ohne Hauptbuch gilt der Deckel je Aufruf — nichts ändert sich', () => {
    expect(reserviere(null, 0.5, 'x')).toBe(0.5)
    expect(() => erstatte(null, 0.1, 'x')).not.toThrow()
  })

  it('jede Buchung steht mit Grund im Beleg', () => {
    const b = neuesBuch()
    eroeffne(b, 1.0)
    reserviere(b, 0.2, 'mobile.de')
    erstatte(b, 0.15, 'mobile.de')
    const buchungen = stand(b).buchungen
    expect(buchungen).toHaveLength(2)
    expect(buchungen[0]).toMatchObject({ art: 'reserviert', wofuer: 'mobile.de' })
    expect(buchungen[1]).toMatchObject({ art: 'erstattet', wofuer: 'mobile.de' })
  })
})

describe('Die Reihenfolge der Stufen', () => {
  const providers = JSON.parse(
    readFileSync(new URL('../wbw-plugin/providers.json', import.meta.url), 'utf8'),
  )

  it('Apify steht bei jedem Portal vorn', () => {
    // Nur für Apify ist gemessen, dass Umkreis, Laufleistung und Baujahr am
    // Portal wirken und ein tragfähiger Korb herauskommt.
    for (const [portal, konf] of Object.entries(providers.portale) as any) {
      expect(konf.stufen[0].adapter, portal).toBe('apify')
    }
  })

  it('die kostenlosen Stufen bleiben als Rückfall darunter', () => {
    for (const [portal, konf] of Object.entries(providers.portale) as any) {
      expect(konf.stufen.length, portal).toBeGreaterThan(1)
    }
  })

  it('jede Apify-Stufe trägt ihren Preis — sonst rechnet das Hauptbuch mit Vermutungen', () => {
    for (const [portal, konf] of Object.entries(providers.portale) as any) {
      const s = konf.stufen.find((x: any) => x.adapter === 'apify')
      expect(s.grundpreisUsd, portal).toBe(0.005)
      expect(s.preisJeDatensatzUsd, portal).toBeGreaterThan(0)
      expect(s.maxTotalChargeUsd, portal).toBeLessThanOrEqual(0.2)
    }
  })
})
