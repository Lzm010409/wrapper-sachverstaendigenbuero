import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

/**
 * Die vollständigen Filter je Portal — gegen die Vorgabe des Sachverständigen.
 *
 * **Der Befund, aus dem diese Tests entstanden sind.** Bis zum 11.09.2026
 * trug `params.json` bereits `karosserie`, `getriebe` und `tueren` — der
 * Sachverständige trägt sie in der Maske ein — und **keine einzige
 * Portaleingabe benutzte sie**. Die Angaben wurden erhoben und
 * fallengelassen; die Suchen gingen ohne sie hinaus. Genau das war in der
 * Apify-Konsole zu sehen.
 *
 * Die Sollform stammt aus drei Beispielobjekten des Sachverständigen, gegen
 * die `enum`-Listen der Eingabeschemata geprüft. Wo seine Beispiele und die
 * Messungen auseinandergingen, steht der Grund am Test.
 */
const require_ = createRequire(import.meta.url)
const { build } = require_('../wbw-plugin/build-search-urls.js')

/** Sein Testfall: Smart ForTwo EQ, 06/2021, 37.000 km, 60 kW, Zentrum 41469. */
const SMART = {
  subject: { marke: 'Smart', modell: 'ForTwo', ez: '06/2021', mileage: 37000, leistungKw: 60 },
  plz: '41469',
  zentrum: { lat: 51.184, lon: 6.682 },
  radiusKm: 200,
  ezToleranzJahre: 1,
  kmToleranz: 20000,
  leistungToleranzKw: 10,
  maxItemsProPortal: 50,
  karosserie: 'Kleinwagen',
  getriebe: 'Automatik',
  kraftstoff: 'Elektro',
  tueren: 3,
  bauartAmPortal: true,
}

describe('AutoScout24 — Zeichenketten, kleingeschrieben', () => {
  const a = build(SMART).autoScout

  it('trägt alle Merkmale des Subjekts', () => {
    expect(a).toMatchObject({
      make: 'smart',
      model: 'fortwo',
      fuelType: 'electric',
      transmission: 'automatic',
      bodyType: 'hatchback',
      condition: 'used',
      yearFrom: 2020,
      yearTo: 2022,
      mileageTo: 57000,
    })
  })

  it('grenzt zweifach ein: nativ über die PLZ und über die Detailkoordinate', () => {
    // Laut Schema grenzt `location` bereits bei der Suche ein, während
    // lat/lon danach anhand der Detailkoordinate nachschärft.
    expect(a).toMatchObject({ location: '41469', lat: 51.184, lon: 6.682, radiusKm: 200 })
  })

  it('ein ForTwo ist "hatchback", nicht "sedan"', () => {
    // Die Vorgabe setzte `sedan`. Das Eingabeschema führt `hatchback` für
    // Kleinwagen — und der Sachverständige trägt „Kleinwagen" ein.
    expect(a.bodyType).not.toBe('sedan')
  })
})

describe('mobile.de — Listen, versal, mit Suffix', () => {
  const m = build(SMART).mobileDe

  it('die vier Merkmale gehen als Liste hinaus', () => {
    // Eine Zeichenkette an dieser Stelle wird nicht abgelehnt — sie filtert
    // nur nichts.
    expect(m.fuelType).toEqual(['ELECTRIC'])
    expect(m.transmission).toEqual(['AUTOMATIC_GEAR'])
    expect(m.bodyType).toEqual(['KLEINWAGEN'])
    expect(m.condition).toEqual(['USED'])
  })

  it('Unfallfahrzeuge bleiben draussen', () => {
    // Die Vorgabe hatte `damageStatus: "ANY"`. Für einen
    // Wiederbeschaffungswert ist ein Unfallfahrzeug kein Vergleichsfahrzeug —
    // und mobile.de meldet den Unfallstatus im Datensatz gar nicht (0 von 10
    // im Probelauf), filtern ist deshalb der einzige Weg.
    expect(m.damageStatus).toBe('EXCLUDE')
  })

  it('die Detailseiten werden geholt', () => {
    // Die Vorgabe hatte `includeDetails: false`. Ohne Details kommen weder
    // Koordinaten noch Ausstattung — bei mobile.de gibt es keine PLZ, der
    // Umkreis hängt allein an `sellerLatitude`.
    expect(m.includeDetails).toBe(true)
  })
})

describe('Kleinanzeigen — deutsche Tokens, Spannen statt Einzelwerte', () => {
  const k = build(SMART).kleinanzeigen

  it('alle Attributfilter mit Typkürzel', () => {
    expect(k.attributeFilters).toEqual({
      'autos.marke_s': 'smart',
      'autos.km_i': '17000,57000',
      'autos.ez_i': '2020,2022',
      'autos.power_i': '68,95',
      'autos.fuel_s': 'elektro',
      'autos.shift_s': 'automatik',
      'autos.typ_s': 'kleinwagen',
      'autos.anzahl_tueren_s': '2_3',
      'autos.schaden_s': 'nein',
    })
  })

  it('keine englischen Werte — das Portal führt deutsche', () => {
    // Die Vorgabe hatte `"eletric"` (Tippfehler), `"automatic"` und
    // `"sedan"`. Alle drei filtern bei Kleinanzeigen nichts.
    const werte = Object.values(k.attributeFilters).join(' ')
    expect(werte).not.toMatch(/eletric|electric|automatic|sedan/)
  })

  it('Zahlen als Spanne, nicht als Einzelwert', () => {
    // Die Vorgabe hatte `autos.km_i: 37000`. Das filterte auf genau diesen
    // Kilometerstand — praktisch auf nichts.
    expect(k.attributeFilters['autos.km_i']).toContain(',')
    expect(k.attributeFilters['autos.ez_i']).toContain(',')
  })

  it('drei Türen fallen in die Gruppe 2_3', () => {
    expect(build({ ...SMART, tueren: 5 }).kleinanzeigen.attributeFilters['autos.anzahl_tueren_s'])
      .toBe('4_5')
  })
})

describe('Die Bauart geht nur in den engen Zyklus', () => {
  /*
    Gemessen am 10.09.2026 schnitt `bodyType: "van"` den AutoScout24-Korb
    eines VW Sharan von zehn Treffern auf einen — dort meint `van` das
    Nutzfahrzeug. Zyklus 1 sucht mit Bauart und liefert scharf getrennt;
    reicht der Korb nicht, sucht Zyklus 2 ohne sie.
  */
  const weit = build({ ...SMART, bauartAmPortal: false })

  it('ohne die Marke des Zyklus fehlt sie überall', () => {
    expect(weit.autoScout).not.toHaveProperty('bodyType')
    expect(weit.mobileDe).not.toHaveProperty('bodyType')
    expect(weit.kleinanzeigen.attributeFilters).not.toHaveProperty('autos.typ_s')
  })

  it('Getriebe und Kraftstoff bleiben in jedem Zyklus', () => {
    // Deren Vokabular ist eindeutig, das der Bauart nachweislich nicht.
    expect(weit.autoScout.fuelType).toBe('electric')
    expect(weit.mobileDe.transmission).toEqual(['AUTOMATIC_GEAR'])
    expect(weit.kleinanzeigen.attributeFilters['autos.shift_s']).toBe('automatik')
  })
})

describe('Die Leistungsspanne kommt aus der Maske', () => {
  it('leistungToleranzKw bestimmt die Spanne, nicht eine feste Prozentzahl', () => {
    // 60 kW ± 5 kW = 55…65 kW = 75…88 PS.
    const eng = build({ ...SMART, leistungToleranzKw: 5 })
    expect(eng.mobileDe.powerMin).toBe(75)
    expect(eng.mobileDe.powerMax).toBe(88)
  })
})

describe('Fehlt eine Angabe, fehlt der Filter', () => {
  it('ohne Kraftstoff kein Kraftstofffilter — statt eines leeren Werts', () => {
    const ohne = build({ ...SMART, kraftstoff: undefined })
    expect(ohne.autoScout).not.toHaveProperty('fuelType')
    expect(ohne.mobileDe).not.toHaveProperty('fuelType')
    expect(ohne.kleinanzeigen.attributeFilters).not.toHaveProperty('autos.fuel_s')
  })

  it('eine Bauart ohne Portalwort wird weggelassen, nicht geraten', () => {
    // Pickup kennt AutoScout24 im Eingabeschema nicht, obwohl das
    // Ausgabefeld "SUV/Off-Road/Pick-Up" meldet.
    const pickup = build({ ...SMART, karosserie: 'Pickup' })
    expect(pickup.autoScout).not.toHaveProperty('bodyType')
    expect(pickup.mobileDe.bodyType).toEqual(['PICKUP'])
  })
})

describe('Was gesucht wurde, steht im Ergebnis', () => {
  it('die deutschen Begriffe wandern mit — für Protokoll und Selbstprüfung', () => {
    expect(build(SMART)._abgeleitet).toMatchObject({
      karosserie: 'Kleinwagen',
      bauartAmPortal: true,
      kraftstoff: 'Elektro',
      getriebe: 'Automatik',
      tueren: 3,
    })
  })
})

const { kraftstoffPasst } = require_('../wbw-plugin/portalvokabular.js')
const { nurAngebote } = require_('../wbw-plugin/adapters/apify.js')
void nurAngebote

describe('Die Selbstprüfung: hat der Kraftstofffilter gegriffen?', () => {
  /*
    Ob Kleinanzeigen für Elektro wirklich `elektro` heisst, steht in keiner
    Quelle, die vorliegt — die Filterleiste des Portals zeigte nur benzin,
    diesel, lpg und hybrid. Ein falsches Token wird von diesem Actor nicht
    abgelehnt, es filtert nur nichts.

    Statt zu raten und zu hoffen, zählt die Beschaffung nach: kommen
    Fahrzeuge mit anderem Kraftstoff zurück, steht das als Warnung im
    Protokoll. So fällt ein falsches Token beim ersten echten Lauf auf.
  */
  it('erkennt dieselbe Sache in den drei Portalschreibweisen', () => {
    expect(kraftstoffPasst('Benzin', 'Benzin')).toBe(true) // Kleinanzeigen
    expect(kraftstoffPasst('Benzin', 'PETROL')).toBe(true) // mobile.de
    expect(kraftstoffPasst('Benzin', 'Gasoline')).toBe(true) // AutoScout24
    expect(kraftstoffPasst('Elektro', 'ELECTRIC')).toBe(true)
  })

  it('schlägt an, wenn der Filter nicht gegriffen hat', () => {
    expect(kraftstoffPasst('Elektro', 'Diesel')).toBe(false)
    expect(kraftstoffPasst('Diesel', 'Benzin')).toBe(false)
  })

  it('ein Fahrzeug ohne Angabe ist kein Beweis gegen den Filter', () => {
    expect(kraftstoffPasst('Elektro', null)).toBe(true)
    expect(kraftstoffPasst('Elektro', '')).toBe(true)
  })

  it('ohne angeforderten Kraftstoff passt alles', () => {
    expect(kraftstoffPasst(null, 'Diesel')).toBe(true)
    expect(kraftstoffPasst(undefined, 'Diesel')).toBe(true)
  })
})

describe('Jeder gesendete Wert steht im Enum des Actors', () => {
  /*
    Diese Actors lehnen einen unbekannten Wert nicht ab. Sie reichen ihn
    durch, und er filtert nichts. Ein Tippfehler wie `"eletric"` kostet damit
    den ganzen Filter, ohne dass irgendwo etwas rot wird — deshalb steht hier
    die enum-Liste aus dem Eingabeschema als Gegenprobe.
  */
  const AS24 = {
    fuelType: ['petrol', 'diesel', 'electric', 'hybrid', 'plug-in hybrid', 'lpg', 'cng', 'hydrogen'],
    transmission: ['automatic', 'manual', 'semi-automatic'],
    bodyType: ['sedan', 'station wagon', 'suv', 'hatchback', 'coupe', 'convertible', 'van', 'transporter'],
    condition: ['all', 'new', 'used'],
  }
  const MOBILE = {
    fuelType: ['DIESEL', 'PETROL', 'ELECTRIC', 'HYBRID', 'PLUG_IN_HYBRID', 'HYBRID_DIESEL', 'CNG', 'LPG', 'HYDROGEN', 'ETHANOL'],
    transmission: ['MANUAL_GEAR', 'AUTOMATIC_GEAR', 'SEMI_AUTOMATIC_GEAR'],
    bodyType: ['LIMOUSINE', 'KOMBI', 'KLEINWAGEN', 'COUPE', 'CABRIO', 'SUV', 'GELAENDEWAGEN', 'VAN', 'PICKUP'],
    condition: ['NEW', 'USED', 'EMPLOYEE_CAR', 'PRE_REGISTRATION', 'DEMONSTRATION', 'CLASSIC'],
    damageStatus: ['ANY', 'EXCLUDE', 'ONLY'],
  }

  const BAUARTEN = ['Limousine', 'Kombi', 'Kleinwagen', 'Coupé', 'Cabrio', 'SUV', 'Van', 'Pickup']
  const KRAFTSTOFFE = ['Benzin', 'Diesel', 'Elektro', 'Hybrid', 'Plug-in-Hybrid', 'LPG', 'CNG']

  it('über alle Bauarten, Kraftstoffe und Getriebe hinweg', () => {
    for (const karosserie of BAUARTEN) {
      for (const kraftstoff of KRAFTSTOFFE) {
        for (const getriebe of ['Automatik', 'Manuell']) {
          const o = build({ ...SMART, karosserie, kraftstoff, getriebe })
          const a = o.autoScout
          const m = o.mobileDe
          for (const [feld, erlaubt] of Object.entries(AS24)) {
            if (a[feld] != null) expect(erlaubt, `AS24.${feld}=${a[feld]}`).toContain(a[feld])
          }
          for (const [feld, erlaubt] of Object.entries(MOBILE)) {
            const wert = m[feld]
            if (wert == null) continue
            for (const w of Array.isArray(wert) ? wert : [wert]) {
              expect(erlaubt, `mobile.${feld}=${w}`).toContain(w)
            }
          }
        }
      }
    }
  })
})
