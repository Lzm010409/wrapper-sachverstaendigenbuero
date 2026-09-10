import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

/**
 * Die Feldkarte der drei Apify-Actors, geprüft an echten Antworten.
 *
 * **Warum echte Datensätze.** Die bisherige `mappe()` rät über
 * Kandidatenlisten: `g("attributes.Power", "powerKw", "power", …)`. Solche
 * Listen sind gegen eine erfundene Antwort immer grün — sie beweisen nur,
 * dass der Leser die Erfindung versteht. Die Prüfsteine in
 * `fixtures/apify/` sind Antworten der Actors vom 10.09.2026 aus den
 * Probeläufen 1, 2 und 5.
 *
 * **Was hier scheitern soll.** Ein Feld, das der Actor liefert und die Karte
 * nicht findet, fällt still auf `null`. Genau das ist in dieser Sitzung
 * mehrfach passiert: der Golf im Sharan-Korb kam durch, weil `bauart` null
 * war. Diese Tests zählen deshalb nicht Zeilen, sondern **Ausbeute je Feld**:
 * wie viele der gelieferten Datensätze tragen den Wert am Ende wirklich.
 */
const require_ = createRequire(import.meta.url)
const { mappe } = require_('../wbw-plugin/adapters/apify.js')

type Roh = Record<string, unknown>
/*
  Der Portalname in providers.json ist "mobile.de", die Prüfsteindatei heisst
  "mobile-de.json" — ein Punkt im Dateinamen liest sich wie eine Endung.
  Die Feldkarte kennt beide Schreibweisen; hier wird nur die Datei gefunden.
*/
const datei = (portal: string) => portal.replace('.', '-')
const lies = (portal: string): Roh[] =>
  JSON.parse(readFileSync(new URL(`./fixtures/apify/${datei(portal)}.json`, import.meta.url), 'utf8'))

const PORTALE = ['autoscout24', 'mobile-de', 'kleinanzeigen'] as const

/** Anteil der Datensätze, in denen das Feld nach dem Abbilden gefüllt ist. */
function ausbeute(portal: string, feld: string): { gefuellt: number; von: number } {
  const roh = lies(portal)
  const abgebildet = roh.map((r) => mappe(r, portal, []))
  const gefuellt = abgebildet.filter((f: Record<string, unknown>) => {
    const v = f?.[feld]
    return v != null && v !== '' && !(Array.isArray(v) && v.length === 0)
  }).length
  return { gefuellt, von: roh.length }
}

describe('Feldkarte: die Pflichtfelder des Korbs', () => {
  /*
    Ohne diese vier steht kein Fahrzeug im Gutachten: die Adresse als
    Nachweis, der Preis für den Median, Laufleistung und Erstzulassung für
    die Vergleichbarkeit.
  */
  for (const portal of PORTALE) {
    for (const feld of ['url', 'preis', 'kilometerstand', 'erstzulassung']) {
      it(`${portal}: ${feld} steht in jedem Datensatz`, () => {
        const { gefuellt, von } = ausbeute(portal, feld)
        expect(gefuellt).toBe(von)
      })
    }
  }
})

describe('Feldkarte: die Felder, an denen der Korb falsch wurde', () => {
  it('kleinanzeigen: die Bauart kommt an — sonst landet ein Golf im Sharan-Korb', () => {
    const { gefuellt, von } = ausbeute('kleinanzeigen', 'fahrzeugtyp')
    // 34 von 35 tragen "Fahrzeugtyp"; einer hat beim Verkäufer nichts stehen.
    expect(gefuellt).toBeGreaterThanOrEqual(von - 1)
  })

  it('kleinanzeigen: die Leistung wird von PS in kW gerechnet', () => {
    const roh = lies('kleinanzeigen')
    // Gemessen: powerKw=170 bei attributes.Leistung='170 PS'. Der Actor
    // schreibt PS in ein Feld, das kW heisst.
    const mitPs = roh.find((r) => String((r.attributes as Roh)?.Leistung ?? '').startsWith('170'))
    expect(mitPs, 'Prüfstein mit 170 PS fehlt').toBeDefined()
    expect(mappe(mitPs, 'kleinanzeigen', []).leistungKw).toBe(125) // 170 / 1,35962
  })

  it('kleinanzeigen: die Ausstattung geht nicht verloren', () => {
    const { gefuellt, von } = ausbeute('kleinanzeigen', 'ausstattung')
    expect(gefuellt).toBe(von)
  })

  it('mobile-de: die Koordinaten kommen an — es gibt dort keine PLZ', () => {
    const { gefuellt, von } = ausbeute('mobile-de', 'lat')
    expect(gefuellt).toBe(von)
  })

  it('jedes Portal: der Ort steht im Beleg', () => {
    for (const portal of PORTALE) {
      const { gefuellt, von } = ausbeute(portal, 'ort')
      expect(gefuellt, `${portal}`).toBeGreaterThanOrEqual(von - 1)
    }
  })
})

const { leeresFahrzeug } = require_('../wbw-plugin/adapters/gemeinsam.js')
const { mappeMitKarte, KARTEN } = require_('../wbw-plugin/adapters/feldkarte.js')

describe('Der Vertrag leeresFahrzeug() hält', () => {
  /*
    Beim Schreiben der Karte hiess das Feld erst `bauart` statt `fahrzeugtyp`.
    Der Vertrag wäre still um ein Feld gewachsen und um eines ärmer geworden:
    `bauart` hätte niemand gelesen, `fahrzeugtyp` wäre null geblieben — und
    der Karosseriefilter lässt null durch. Genau der Weg, auf dem der Golf in
    den Sharan-Korb kam. Dieser Test hätte es gefangen; deshalb steht er hier.
  */
  const vertrag = Object.keys(leeresFahrzeug('x')).sort()

  for (const portal of PORTALE) {
    it(`${portal}: kein Feld zu viel, kein Feld zu wenig`, () => {
      const eins = mappe(lies(portal)[0], portal, [])
      expect(Object.keys(eins).sort()).toEqual(vertrag)
    })
  }

  it('jede Karte beschreibt nur Felder, die der Vertrag kennt', () => {
    for (const [actor, karte] of Object.entries(KARTEN)) {
      for (const feld of Object.keys(karte as object)) {
        expect(vertrag, `${actor}.${feld}`).toContain(feld)
      }
    }
  })
})

describe('Die Selbstprüfung meldet, was fehlt', () => {
  it('ein fehlendes Pflichtfeld steht in den Warnungen', () => {
    const warnungen: string[] = []
    // Ein Kleinanzeigen-Inserat, bei dem der Verkäufer keinen Fahrzeugtyp
    // eingetragen hat — im Prüfstein genau einer von 35.
    const ohneTyp = lies('kleinanzeigen').find(
      (r) => (r.attributes as Roh)?.Fahrzeugtyp == null,
    )
    expect(ohneTyp, 'Prüfstein ohne Fahrzeugtyp fehlt').toBeDefined()
    mappe(ohneTyp, 'kleinanzeigen', warnungen)
    expect(warnungen.join('\n')).toMatch(/fahrzeugtyp fehlt/)
  })

  it('ein vollständiges Inserat erzeugt keine Warnung', () => {
    const warnungen: string[] = []
    mappe(lies('autoscout24')[0], 'autoscout24', warnungen)
    expect(warnungen).toEqual([])
  })

  it('ein Actor ohne Karte wird abgebildet, aber gemeldet', () => {
    const warnungen: string[] = []
    const f = mappe({ url: 'https://x/1', price: 9990 }, 'irgendein-neues-portal', warnungen)
    expect(f.url).toBe('https://x/1') // Treffer gehen nicht verloren …
    expect(warnungen.join('\n')).toMatch(/ohne Feldkarte/) // … aber still ist es nicht.
  })

  it('mobile.de meldet die fehlende PLZ nicht — die gibt es dort wirklich nicht', () => {
    const warnungen: string[] = []
    const f = mappe(lies('mobile-de')[0], 'mobile.de', warnungen)
    expect(f.plz).toBeNull()
    expect(f.lat).not.toBeNull() // Der Umkreis hängt an den Koordinaten.
    expect(warnungen).toEqual([])
  })
})

const { normalizeAll } = require_('../wbw-plugin/normalize.js')

describe('Die Kette bis zum Umkreisfilter', () => {
  /*
    `mappe()` allein sagt wenig — die Pipeline liest nicht das kanonische
    Fahrzeug, sondern was `normalize.js` daraus macht. Der Umkreisfilter etwa
    greift auf `dealerDetails.location`, und die Ausbeute dort entscheidet, ob
    ein Fahrzeug überhaupt in den Korb kommt.
  */
  const durch = (portal: string) =>
    normalizeAll({ [portal]: lies(portal).map((r) => mappe(r, portal, [])) })

  it('mobile.de: Koordinaten für jeden Treffer — dort ersetzen sie die PLZ', () => {
    const f = durch('mobile.de')
    expect(f.filter((x: any) => x.dealerDetails?.location?.latitude != null)).toHaveLength(f.length)
    // Vorher lieferte mobile.de weder Koordinate noch PLZ; jedes Fahrzeug
    // wäre am Umkreisfilter gescheitert oder ungeprüft durchgelaufen.
    expect(f.filter((x: any) => x.zip != null)).toHaveLength(0)
  })

  it('kleinanzeigen: Bauart, Leistung in kW und Ausstattung stehen im Fahrzeug', () => {
    const f = durch('kleinanzeigen')
    const sharan = f.find((x: any) => /Sharan AHK PANORAMA/.test(x.title))
    expect(sharan).toMatchObject({
      bodyType: 'Van/Bus',
      power: 125, // aus "170 PS"
      mileage: 187000,
      ez: '08/2011',
      getriebe: 'Manuell',
      zip: '64569',
    })
    expect(sharan.features).toContain('Anhängerkupplung')
  })

  it('alle drei Portale: jedes Fahrzeug trägt Preis, Laufleistung und Umkreis', () => {
    for (const portal of ['autoscout24', 'mobile.de', 'kleinanzeigen']) {
      const f = durch(portal)
      for (const x of f as any[]) {
        expect(x.price.total.amount, `${portal} ${x.url}`).toBeTypeOf('number')
        expect(x.mileage, `${portal} ${x.url}`).toBeTypeOf('number')
        expect(x.dealerDetails.location.latitude, `${portal} ${x.url}`).toBeTypeOf('number')
      }
    }
  })
})

const { detectLinie } = require_('../wbw-plugin/ausstattung-matcher.js')

describe('variante trägt die Ausstattungslinie, nicht die Bauform', () => {
  /*
    AutoScout24 hat ein Feld namens `variant`. Es trägt "Crew Van",
    "Cargo Van", "e-Berlingo Crew" — die Bauform. Die alte Kandidatenliste
    fragte es zuerst und füllte damit bei der Hälfte der Inserate das Feld,
    aus dem der Linienfilter liest. Ein Filter, der auf "Crew Van" als Linie
    filtert, verwirft nach Zufall.
  */
  it('autoscout24: aus dem gewählten Feld erkennt detectLinie echte Linien', () => {
    const abgebildet = lies('autoscout24').map((r) => mappe(r, 'autoscout24', []))
    const erkannt = abgebildet.filter((f: any) => detectLinie(f.variante) != null)
    expect(erkannt.length).toBeGreaterThanOrEqual(9) // gemessen: 9 von 20
    expect(erkannt.map((f: any) => detectLinie(f.variante))).toContain('Highline')
  })

  it('autoscout24: keine Bauform steht in variante', () => {
    const abgebildet = lies('autoscout24').map((r) => mappe(r, 'autoscout24', []))
    for (const f of abgebildet as any[]) {
      expect(String(f.variante ?? ''), f.url).not.toMatch(/Crew Van|Cargo Van/)
    }
  })
})
