import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ergaenzeAusgang,
  miss,
  protokolliereFehler,
  protokolliereInfo,
  protokolliereWarnung,
  setzeAusgaengeZurueck,
  type Ausgang,
  type Eintrag,
} from './index'
import { KENNUNGSMUSTER, neueKennung } from './kennung'

let geschrieben: Eintrag[] = []
let ausgabe: string[] = []

beforeEach(() => {
  setzeAusgaengeZurueck()
  geschrieben = []
  ausgabe = []
  ergaenzeAusgang((e) => geschrieben.push(e))
  vi.spyOn(console, 'error').mockImplementation((z: unknown) => void ausgabe.push(String(z)))
  vi.spyOn(console, 'log').mockImplementation((z: unknown) => void ausgabe.push(String(z)))
})

afterEach(() => {
  vi.restoreAllMocks()
  setzeAusgaengeZurueck()
})

describe('Kennung', () => {
  it('lässt sich vorlesen: acht Zeichen ohne I, L, O, U, 0 und 1', () => {
    for (let i = 0; i < 200; i++) {
      const k = neueKennung()
      expect(k).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/)
      expect(k).not.toMatch(/[ILOU01]/)
    }
  })

  it('wiederholt sich nicht', () => {
    const viele = new Set(Array.from({ length: 500 }, () => neueKennung()))
    expect(viele.size).toBe(500)
  })

  it('ist im Text wiederzufinden', () => {
    const k = neueKennung()
    expect(`Fehler ${k} beim Laden`).toMatch(KENNUNGSMUSTER)
  })
})

describe('Fehler festhalten', () => {
  it('gibt die Kennung zurück und schreibt sie mit', () => {
    const kennung = protokolliereFehler('autoixpert.holeVxs', 'Nicht erreichbar.')
    expect(kennung).toMatch(KENNUNGSMUSTER)
    expect(geschrieben[0]?.kennung).toBe(kennung)
  })

  it('schreibt eine Zeile JSON, nicht einen Satz', () => {
    protokolliereFehler('x.y', 'kaputt')
    const gelesen = JSON.parse(ausgabe[0]!) as Eintrag
    expect(gelesen.stufe).toBe('fehler')
    expect(gelesen.stelle).toBe('x.y')
    expect(gelesen.zeit).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('nimmt den Zusammenhang mit', () => {
    protokolliereFehler('wbw.lauf', 'gescheitert', new Error('x'), {
      fallId: 'cc91a067-c89e-48be-947e-cbae40f337b6',
      benutzerId: 'b1',
      dienst: 'autoscout24',
      dauerMs: 4120,
    })
    expect(geschrieben[0]).toMatchObject({
      fallId: 'cc91a067-c89e-48be-947e-cbae40f337b6',
      benutzerId: 'b1',
      dienst: 'autoscout24',
      dauerMs: 4120,
    })
  })

  it('zerlegt den Fehler samt Ursache', () => {
    const ursache = new Error('ECONNREFUSED')
    protokolliereFehler('x', 'kaputt', new Error('Netz weg', { cause: ursache }))
    expect(geschrieben[0]?.fehler).toMatchObject({
      name: 'Error',
      meldung: 'Netz weg',
      ursache: 'Error: ECONNREFUSED',
    })
    expect(geschrieben[0]?.fehler?.spur).toContain('Error: Netz weg')
  })

  it('kürzt die Stapelspur auf das Nützliche', () => {
    protokolliereFehler('x', 'kaputt', new Error('tief'))
    expect((geschrieben[0]?.fehler?.spur ?? '').split('\n').length).toBeLessThanOrEqual(8)
  })

  it('verträgt einen geworfenen Nicht-Fehler', () => {
    protokolliereFehler('x', 'kaputt', 'nur ein String')
    expect(geschrieben[0]?.fehler).toMatchObject({ name: 'Unbekannt', meldung: 'nur ein String' })
  })
})

describe('Schwärzung am Ausgang', () => {
  it('greift auch, wenn die Aufrufstelle nicht daran gedacht hat', () => {
    protokolliereFehler('x', 'Fahrzeug WDD2130611A553209, K-MO 3119', undefined, {
      email: 'probe@test.local',
    })
    const e = geschrieben[0]!
    expect(e.meldung).toBe('Fahrzeug «VIN», «Kennzeichen»')
    expect(e.email).toBe('«geschwärzt»')
  })

  it('greift auch in der Fehlermeldung und der Spur', () => {
    protokolliereFehler('x', 'kaputt', new Error('Token Bearer 6pnjMm2CEMuw abgelehnt'))
    expect(geschrieben[0]?.fehler?.meldung).toBe('Token Bearer «geschwärzt» abgelehnt')
  })
})

describe('Stufen', () => {
  it('schreibt Warnungen und Fehler nach stderr, Auskünfte nach stdout', () => {
    protokolliereInfo('x', 'lief durch')
    expect(console.log).toHaveBeenCalled()
    protokolliereWarnung('x', 'dauerte lange')
    protokolliereFehler('x', 'kaputt')
    expect(console.error).toHaveBeenCalledTimes(2)
  })

  it('gibt nur Fehlern eine Kennung', () => {
    protokolliereWarnung('x', 'dauert')
    protokolliereInfo('x', 'fertig')
    expect(geschrieben.every((e) => e.kennung === undefined)).toBe(true)
  })
})

describe('miss', () => {
  it('lässt einen schnellen Aufruf unerwähnt', async () => {
    await miss('autoixpert.holeGutachten', async () => 'gut')
    expect(geschrieben).toEqual([])
  })

  it('meldet einen langsamen Aufruf als Warnung, ohne ihn zu stören', async () => {
    const ergebnis = await miss(
      'pipedrive.findeDeal',
      async () => {
        await new Promise((w) => setTimeout(w, 25))
        return 'da'
      },
      { langsamAbMs: 10, dienst: 'pipedrive' },
    )
    expect(ergebnis).toBe('da')
    expect(geschrieben[0]).toMatchObject({ stufe: 'warnung', dienst: 'pipedrive' })
    expect(geschrieben[0]?.dauerMs).toBeGreaterThanOrEqual(20)
  })

  it('hält einen Fehler fest und wirft ihn weiter', async () => {
    await expect(
      miss('autoixpert.holeVxs', async () => {
        throw new Error('HTTP 500')
      }),
    ).rejects.toThrow('HTTP 500')
    expect(geschrieben[0]).toMatchObject({ stufe: 'fehler', stelle: 'autoixpert.holeVxs' })
    expect(geschrieben[0]?.dauerMs).toBeGreaterThanOrEqual(0)
  })
})

describe('Ein Ausgang, der versagt', () => {
  it('nimmt weder das Protokollieren noch den Vorgang mit', () => {
    ergaenzeAusgang(() => {
      throw new Error('Datenbank weg')
    })
    expect(() => protokolliereFehler('x', 'kaputt')).not.toThrow()
    // Die Zeile nach stderr steht trotzdem, plus die Meldung über den Ausgang.
    expect(ausgabe.length).toBeGreaterThanOrEqual(2)
    expect(ausgabe.some((z) => z.includes('protokoll.ausgang'))).toBe(true)
  })
})

/**
 * Die Klammer über die Bündelgrenze.
 *
 * Next bündelt `instrumentation.ts` getrennt vom Anwendungscode; beide
 * bekommen eine eigene Instanz dieses Moduls. Hing die Ausgangsliste am
 * Modul, meldete der Start die Fehlerliste in der einen Instanz an, während
 * jede Meldung aus einer Seite durch die andere lief — sie stand dann im
 * Containerprotokoll und fehlte in der Fehlerliste der Anwendung.
 */
describe('Ausgänge über Bündelgrenzen hinweg', () => {
  const SCHLUESSEL = Symbol.for('gollenstede.protokoll.ausgaenge')

  it('führt die Ausgangsliste am globalThis, nicht am Modul', () => {
    const gesehen: string[] = []
    ergaenzeAusgang((e) => gesehen.push(e.stelle))

    // Ein zweites Bündel käme genau hier heran — über den geteilten Schlüssel.
    const liste = (globalThis as Record<symbol, unknown>)[SCHLUESSEL] as Ausgang[]
    expect(Array.isArray(liste)).toBe(true)

    protokolliereInfo('probe.bündel', 'Meldung')
    expect(gesehen).toContain('probe.bündel')
  })

  it('meldet einen benannten Ausgang nur einmal an', () => {
    let gezaehlt = 0
    const ausgang = () => {
      gezaehlt += 1
    }
    ergaenzeAusgang(ausgang, 'fehlerliste')
    ergaenzeAusgang(ausgang, 'fehlerliste')

    protokolliereInfo('probe.doppelt', 'Meldung')
    expect(gezaehlt).toBe(1)
  })
})
