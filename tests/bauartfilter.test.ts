import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

/**
 * Der Bauartfilter — weich, mit Nachbarschaft und Untergrenze.
 *
 * **Der Fall.** Am 08.09.2026 landete ein VW Golf im Sharan-Korb, weil die
 * Bauart `null` war und der Filter Unbekanntes durchlässt. Das ist mit der
 * Feldkarte behoben: die Bauart kommt jetzt an. Damit tritt aber der
 * umgekehrte Fehler in den Vordergrund — der Filter verwirft echte
 * Vergleichsfahrzeuge, weil die Portale dieselbe Karosserie verschieden
 * benennen und Verkäufer sie falsch eintragen.
 *
 * **Gemessen an 75 echten Datensätzen:**
 *
 *   AutoScout24    Van, Station Wagon, Transporter, SUV/Off-Road/Pick-Up, Other
 *   mobile.de      VAN, ESTATE, SEDAN, OFFROAD, SMALL, OTHER
 *   Kleinanzeigen  Van/Bus, Kombi, Limousine, Andere Fahrzeugtypen, (fehlt)
 *
 * Im Berlingo-Korb aus 18 Fahrzeugen trugen **6 nicht „Van/Bus"** — darunter
 * eine „Limousine", was bei einem Berlingo schlicht falsch eingetragen ist.
 * Und AutoScout24 nannte denselben Sharan mal „Van", mal „Station Wagon".
 */
const require_ = createRequire(import.meta.url)
const { detectKarosserie, sindVerwandt } = require_('../wbw-plugin/ausstattung-matcher.js')
const { runPipeline } = require_('../wbw-plugin/pipeline.js')

describe('detectKarosserie kennt alle drei Vokabulare', () => {
  const erwartet: Array<[string, string | null]> = [
    // AutoScout24
    ['Van', 'Van'], ['Station Wagon', 'Kombi'], ['Transporter', 'Van'],
    ['SUV/Off-Road/Pick-Up', 'SUV'], ['Other', null],
    // mobile.de — englisch, versal
    ['VAN', 'Van'], ['ESTATE', 'Kombi'], ['SEDAN', 'Limousine'],
    ['OFFROAD', 'SUV'], ['SMALL', 'Kleinwagen'], ['OTHER', null],
    // Kleinanzeigen — deutsch
    ['Van/Bus', 'Van'], ['Kombi', 'Kombi'], ['Limousine', 'Limousine'],
    ['Andere Fahrzeugtypen', null],
  ]
  for (const [wert, soll] of erwartet) {
    it(`"${wert}" → ${soll}`, () => expect(detectKarosserie(wert)).toBe(soll))
  }

  it('die Sammelrubriken bleiben unbekannt — und unbekannt heisst behalten', () => {
    // "Other", "OTHER", "Andere Fahrzeugtypen": drei Portale, drei
    // Sammeltöpfe. Sie zu einer Bauart zu erklären hiesse raten.
    for (const w of ['Other', 'OTHER', 'Andere Fahrzeugtypen', '', null]) {
      expect(detectKarosserie(w)).toBeNull()
    }
  })
})

describe('Verwandte Bauarten schliessen einander nicht aus', () => {
  it('Van und Kombi sind verwandt — dasselbe Fahrzeug, zwei Portale', () => {
    // AutoScout24 führte denselben VW Sharan mal als "Van", mal als
    // "Station Wagon"; Kleinanzeigen einen Berlingo als "Kombi".
    expect(sindVerwandt('Van', 'Kombi')).toBe(true)
    expect(sindVerwandt('Kombi', 'Van')).toBe(true)
  })

  it('eine Bauart ist mit sich selbst verwandt', () => {
    expect(sindVerwandt('Van', 'Van')).toBe(true)
  })

  it('Cabrio und Van sind es nicht', () => {
    expect(sindVerwandt('Cabrio', 'Van')).toBe(false)
    expect(sindVerwandt('Limousine', 'Van')).toBe(false)
  })
})

/**
 * Ein Fahrzeug, wie normalize.js es liefert.
 *
 * Das Modell ist ein **Mercedes-Benz Citan** — mit Absicht. Der
 * Karosseriekatalog kennt Modellnamen ("sharan", "berlingo", "touran"), und
 * bei denen rettet der Titel die Bauart auch dann, wenn der Verkäufer sie
 * falsch eingetragen hat. Gemessen an 35 echten Kleinanzeigen-Datensätzen:
 * aus dem Bauartfeld allein kamen 29 Van, 1 Kombi, 1 Limousine und 4 ohne
 * Angabe — mit dem Titel dazu 34 Van und 1 Kombi.
 *
 * Genau deshalb taugt ein Berlingo nicht als Prüfstein für den Filter: bei
 * ihm greift schon der Titel. Der Citan steht in keiner Musterliste; hier
 * entscheidet allein das Feld, und hier muss die Weichheit tragen.
 *
 * Preis und Laufleistung wandern je Nummer — sonst hält die
 * Dublettenerkennung die Fahrzeuge für dasselbe Inserat und verschmilzt sie.
 */
const fzg = (n: number, bodyType: string | null, titel = 'Mercedes-Benz Citan 111 CDI') => ({
  id: `f${n}`,
  source: 'kleinanzeigen',
  url: `https://k/${n}`,
  title: titel,
  model: titel,
  bodyType,
  price: { total: { amount: 9000 + n * 500 } },
  attributes: { Mileage: 150000 + n * 2000, 'First Registration': '12/2010', Power: 103 },
  mileage: 150000 + n * 2000,
  ez: '12/2010',
  _ezYear: 2010,
  power: 103,
  features: [],
  description: '',
  images: [],
  zip: '47798',
  dealerDetails: { location: { latitude: 51.33, longitude: 6.57 } },
})

const lauf = (fahrzeuge: unknown[], extra = {}) =>
  runPipeline({
    subject: { marke: 'Mercedes-Benz', modell: 'Citan', ez: '12/2010', mileage: 160000, power: 103 },
    karosserie: 'Van', // beim Citan sagt der Modellname nichts — der SV gibt sie vor
    zentrum: { lat: 51.3333, lon: 6.5667 },
    radiusKm: 200,
    kmToleranz: 32000,
    ezToleranzJahre: 3,
    fahrzeuge,
    ...extra,
  })

describe('Der Titel rettet die Bauart, wo der Katalog das Modell kennt', () => {
  it('ein als Limousine eingetragener Berlingo bleibt ein Van', () => {
    // Echter Datensatz: bodyType "Limousine", Titel "Citroën Berlingo
    // Kasten Club M L1 AHK". Der Verkäufer hat sich vertan.
    expect(detectKarosserie('Limousine Citroën Berlingo Kasten Club M L1')).toBe('Van')
  })

  it('ein als Kombi eingetragener Berlingo bleibt Kombi — dafür gibt es die Verwandtschaft', () => {
    // Ebenfalls echt: "Citroën Berlingo Shine Panorama/AHK", bodyType Kombi.
    // Im Katalog steht Kombi vor Van, also gewinnt "Kombi" im Titel-Gemisch.
    // Hart gefiltert flöge dieses Fahrzeug aus einem Van-Korb.
    expect(detectKarosserie('Kombi Citroën Berlingo Shine Panorama/AHK')).toBe('Kombi')
    expect(sindVerwandt('Kombi', 'Van')).toBe(true)
  })
})

describe('Wo der Katalog das Modell nicht kennt, entscheidet das Feld', () => {
  it('ein fremdes Fahrzeug fliegt raus, ein verwandtes bleibt', () => {
    const korb = [
      fzg(1, 'Van/Bus'), fzg(2, 'Van/Bus'), fzg(3, 'Van/Bus'), fzg(4, 'Van/Bus'),
      fzg(5, 'Kombi'), // verwandt — bleibt
      fzg(6, 'Andere Fahrzeugtypen'), // Sammelrubrik, unbekannt — bleibt
      fzg(7, null), // gar keine Angabe — bleibt
      fzg(8, 'Cabrio'), // echter Unterschied — raus
    ]
    const e = lauf(korb)
    const drin = e.korb.map((x: any) => x.fahrzeug.id)
    expect(drin).toContain('f5')
    expect(drin).toContain('f6')
    expect(drin).toContain('f7')
    expect(drin).not.toContain('f8')
    expect(e.karoInfo.gefiltert).toBe(true)
  })
})

describe('Der Filter gibt nach, bevor er den Korb leert', () => {
  it('unter der Untergrenze wird die Bauart fallengelassen', () => {
    // Zwei Vans und drei Cabrios: hart gefiltert blieben zwei Fahrzeuge, und
    // zwei tragen keinen Median. Dann ist ein weiter Korb besser als ein
    // sauberer, der nichts aussagt — dieselbe Regel wie beim Linienfilter.
    const korb = [
      fzg(1, 'Van/Bus'), fzg(2, 'Van/Bus'),
      fzg(3, 'Cabrio'), fzg(4, 'Cabrio'), fzg(5, 'Cabrio'),
    ]
    const e = lauf(korb, { mindestKorb: 4 })
    expect(e.korb).toHaveLength(5)
    expect(e.karoInfo.aufgegeben).toBe(true)
    expect(e.karoInfo.gefiltert).toBe(false)
  })

  it('über der Untergrenze filtert er normal', () => {
    const korb = [
      fzg(1, 'Van/Bus'), fzg(2, 'Van/Bus'), fzg(3, 'Van/Bus'), fzg(4, 'Van/Bus'),
      fzg(5, 'Cabrio'),
    ]
    const e = lauf(korb, { mindestKorb: 4 })
    expect(e.korb).toHaveLength(4)
    expect(e.karoInfo.gefiltert).toBe(true)
    expect(e.karoInfo.aufgegeben).toBe(false)
  })

  it('warum er nachgegeben hat, steht im Ergebnis', () => {
    const korb = [fzg(1, 'Van/Bus'), fzg(2, 'Cabrio'), fzg(3, 'Cabrio')]
    const e = lauf(korb, { mindestKorb: 4 })
    expect(e.karoInfo.grund).toMatch(/Untergrenze von 4/)
  })
})
