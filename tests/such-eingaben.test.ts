import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

/**
 * Die Such-Eingaben der drei Actors, gebaut aus einem Subjekt.
 *
 * **Warum das ein eigener Test ist.** Ein Filter, den der Actor nicht kennt,
 * wird nach Schema *„sent as-is and may simply not narrow results"* — er
 * scheitert **lautlos** und liefert nur einen schlechteren Korb. In dieser
 * Sitzung ist das fünfmal passiert. Diese Tests halten deshalb je Portal das
 * vollständige Eingabeobjekt fest: was fehlt, fällt hier auf und nicht erst
 * im Gutachten.
 *
 * Jeder Wert unten stammt aus einem echten Probelauf (Konzept
 * `docs/wbw-beschaffung-apify.md`), nicht aus der Actor-Dokumentation.
 */
const require_ = createRequire(import.meta.url)
const { build } = require_('../wbw-plugin/build-search-urls.js')

/** Der Fall vom 08.09.2026: VW Sharan, 12/2010, 162.390 km, Zentrum Krefeld. */
const SHARAN = {
  subject: { marke: 'VW', modell: 'Sharan', ez: '12/2010', mileage: 162390, leistungKw: 103 },
  plz: '47798',
  zentrum: { lat: 51.3333, lon: 6.5667 },
  radiusKm: 200,
  ezToleranzJahre: 3,
  kmToleranz: 32000,
  maxItemsProPortal: 40,
}

describe('AutoScout24', () => {
  const a = build(SHARAN).autoScout

  it('filtert den Umkreis am Portal', () => {
    // Im Code stand als Begründung wörtlich „kein PLZ-Umkreis am Actor".
    // Probelauf 1 hat das widerlegt: zehn Treffer, alle innerhalb 200 km.
    expect(a).toMatchObject({ lat: 51.3333, lon: 6.5667, radiusKm: 200 })
  })

  it('setzt Marke, Modell, Baujahr und Laufleistung', () => {
    expect(a).toMatchObject({
      make: 'volkswagen',
      model: 'sharan',
      countries: ['DE'],
      yearFrom: 2007,
      yearTo: 2013,
      mileageTo: 194390,
      includeDetails: true,
    })
  })

  it('setzt KEINE Bauart', () => {
    // Gemessen: mit bodyType "van" ein Treffer, ohne zehn. Bei AutoScout24
    // heisst `van` Nutzfahrzeug, nicht Großraumlimousine.
    expect(a).not.toHaveProperty('bodyType')
  })

  it('holt Detailseiten über Residential-Proxy — sonst fehlen GPS und Ausstattung', () => {
    expect(a.includeDetails).toBe(true)
    expect(a.proxyConfiguration.apifyProxyGroups).toContain('RESIDENTIAL')
  })
})

describe('mobile.de', () => {
  const m = build(SHARAN).mobileDe

  it('sucht über Marke und Modell statt über Freitext', () => {
    expect(m).toMatchObject({ make: 'VW', model: 'Sharan', category: 'CAR' })
  })

  it('filtert Umkreis, Baujahr und Laufleistung am Portal', () => {
    expect(m).toMatchObject({
      zipCode: '47798', radiusKm: 200,
      yearMin: 2007, yearMax: 2013,
      mileageMin: 130390, mileageMax: 194390,
    })
  })

  it('schliesst Unfallfahrzeuge und Bastlerangebote aus', () => {
    // mobile.de meldet den Unfallstatus nicht (0 von 10 im Probelauf) —
    // filtern ist deshalb besser als melden.
    expect(m.damageStatus).toBe('EXCLUDE')
    expect(m.excludeKeywords.words).toEqual(expect.arrayContaining(['export', 'bastler']))
  })

  it('setzt die Leistungsspanne in PS — so nimmt der Actor sie entgegen', () => {
    // 103 kW = 140 PS, ±20 %.
    expect(m.powerMin).toBe(112)
    expect(m.powerMax).toBe(168)
  })

  it('setzt KEINE Bauart', () => {
    expect(m).not.toHaveProperty('bodyType')
  })
})

describe('Kleinanzeigen', () => {
  const k = build(SHARAN).kleinanzeigen

  it('nutzt die Attributschlüssel des Portals, mit Typkürzel', () => {
    expect(k.attributeFilters).toEqual({
      'autos.marke_s': 'volkswagen',
      'autos.km_i': '130390,194390',
      'autos.ez_i': '2007,2013',
    })
  })

  it('holt in die Tiefe — sonst kommen ein bis zwei Fahrzeuge zurück', () => {
    // Gemessen: bei maxResults 10 zwei Fahrzeuge im Korb, bei 80 siebzehn.
    // `maxResults` zählt die GEHOLTEN Datensätze; der Umkreis filtert
    // danach lokal, und der Actor holt nicht nach.
    expect(k.maxResults).toBeGreaterThanOrEqual(80)
  })

  it('filtert den Umkreis über Koordinaten', () => {
    expect(k).toMatchObject({ lat: 51.3333, lon: 6.5667, radiusKm: 200, category: 'autos' })
  })

  it('setzt adType — auch wenn der Filter nachweislich nicht greift', () => {
    // In allen vier gemessenen Formen kamen Gesuche durch. Gesetzt bleibt er
    // trotzdem: er kostet nichts. Verworfen werden Gesuche nachträglich.
    expect(k.adType).toBe('angebote')
  })

  it('schliesst Teile und Bastlerangebote über den Titel aus', () => {
    // Ein Probelauf lieferte eine Rückbank für 50 € als „Fahrzeug".
    expect(k.whatExclude).toEqual(expect.arrayContaining(['rückbank', 'bastler']))
  })

  it('setzt KEINE Bauart', () => {
    // `autos.typ_s: bus` warf einen echten Sharan hinaus, den der Verkäufer
    // als „Kombi" eingetragen hatte.
    expect(JSON.stringify(k)).not.toMatch(/autos\.typ/)
  })
})

describe('Wenn Angaben fehlen', () => {
  it('ohne Zentrum kein Umkreisfilter — statt Koordinate null zu senden', () => {
    const ohne = build({ ...SHARAN, zentrum: null })
    expect(ohne.autoScout).not.toHaveProperty('lat')
    expect(ohne.kleinanzeigen).not.toHaveProperty('lat')
    // mobile.de kann den Umkreis über die PLZ, dafür braucht es keine Koordinate.
    expect(ohne.mobileDe.zipCode).toBe('47798')
  })

  it('ohne Laufleistung keine km-Spanne', () => {
    const ohne = build({ ...SHARAN, subject: { ...SHARAN.subject, mileage: null } })
    expect(ohne.autoScout).not.toHaveProperty('mileageTo')
    expect(ohne.kleinanzeigen.attributeFilters).not.toHaveProperty('autos.km_i')
  })

  it('eine unbekannte Marke wird durchgereicht, nicht verschluckt', () => {
    const exot = build({ ...SHARAN, subject: { ...SHARAN.subject, marke: 'Dacia', modell: 'Lodgy' } })
    expect(exot.autoScout.make).toBe('dacia')
    expect(exot.mobileDe.make).toBe('Dacia')
    expect(exot.kleinanzeigen.attributeFilters['autos.marke_s']).toBe('dacia')
  })
})

const { readFileSync } = require_('node:fs')
const providers = JSON.parse(
  readFileSync(new URL('../wbw-plugin/providers.json', import.meta.url), 'utf8'),
)

describe('Der Actor passt zum Eingabeblock', () => {
  /*
    Vorher stand bei Kleinanzeigen `fatihtahta/ebay-kleinanzeigen-scraper`.
    Der erwartet `queries`, `car_make`, `min_mileage`, `enrich_data`, `limit` —
    also keinen einzigen der Schlüssel, die hier gebaut werden. Unbekannte
    Schlüssel werden laut Schema „sent as-is" und filtern still nicht: die
    Suche wäre bundesweit und ungefiltert gelaufen, ohne dass irgendetwas
    danebengegangen aussieht.

    Actor und Eingabeblock gehören zusammen. Wer das eine ändert, muss das
    andere mitändern — dieser Test hält sie aneinander.
  */
  const actorFuer = (portal: string) =>
    providers.portale[portal].stufen.find((s: any) => s.adapter === 'apify')?.actor

  it('alle drei Stufen zeigen auf die gemessenen blackfalcondata-Actors', () => {
    expect(actorFuer('kleinanzeigen')).toBe('blackfalcondata/kleinanzeigen-scraper')
    expect(actorFuer('autoscout24')).toBe('blackfalcondata/autoscout24-scraper')
    expect(actorFuer('mobile.de')).toBe('blackfalcondata/mobile-de-scraper')
  })

  it('jeder Eingabeblock, den providers.json nennt, wird auch gebaut', () => {
    const gebaut = build(SHARAN)
    for (const [portal, konf] of Object.entries(providers.portale) as any) {
      expect(gebaut, `${portal}`).toHaveProperty(konf.inputKey)
    }
  })
})

describe('Gesuche kommen nicht in den Korb', () => {
  const { nurAngebote } = require_('../wbw-plugin/adapters/apify.js')
  const roh = JSON.parse(
    readFileSync(new URL('./fixtures/apify/kleinanzeigen.json', import.meta.url), 'utf8'),
  )

  it('die echten Prüfsteine enthalten nur Angebote — sie kommen aus einem gefilterten Lauf', () => {
    expect(nurAngebote(roh)).toHaveLength(roh.length)
  })

  it('ein Gesuch wird verworfen', () => {
    // Der echte Datensatz aus Probelauf 4: ein Wunschpreis von 11.000 € bei
    // 20.000 km, der ungefiltert in den Median gegangen wäre.
    const gesuch = { listingId: '3492457999', url: 'https://k/2', price: 2333, adType: 'WANTED' }
    expect(nurAngebote([...roh, gesuch])).toHaveLength(roh.length)
  })

  it('ein Actor ohne adType bleibt unberührt', () => {
    const as24 = JSON.parse(
      readFileSync(new URL('./fixtures/apify/autoscout24.json', import.meta.url), 'utf8'),
    )
    expect(as24.some((x: any) => 'adType' in x)).toBe(false)
    expect(nurAngebote(as24)).toHaveLength(as24.length)
  })

  it('kommt mit leer und mit Lücken zurecht', () => {
    expect(nurAngebote([])).toEqual([])
    expect(nurAngebote(null)).toEqual([])
  })
})
