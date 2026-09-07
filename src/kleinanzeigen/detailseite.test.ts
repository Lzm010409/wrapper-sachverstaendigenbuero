import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { adidAusUrl, leseInserat, leseOrt, lesePreis } from './detailseite'

const URL_ANZEIGE =
  'https://www.kleinanzeigen.de/s-anzeige/mercedes-glk-220-cdi-4matic-ahk-xenon-navi-pdc-tuev-service-neu/3455356908-216-2469'

const seite = readFileSync(
  join(process.cwd(), 'tests/fixtures/kleinanzeigen-inserat.html'),
  'utf8',
)

describe('Anzeige lesen', () => {
  const inserat = leseInserat(seite, URL_ANZEIGE)

  it('nimmt die Anzeigennummer von der Seite selbst', () => {
    expect(inserat.id).toBe('3455356908')
  })

  it('liest Titel und Preis', () => {
    expect(inserat.title).toBe('Mercedes GLK 220 CDI,4Matic,AHK,Xenon,Navi,PDC,TÜV+Service NEU')
    expect(inserat.price).toEqual({ amount: '10999', currency: '€', negotiable: false })
  })

  it('trennt Postleitzahl, Bundesland und Ort', () => {
    expect(inserat.location).toEqual({
      zip: '27755',
      city: 'Delmenhorst',
      state: 'Niedersachsen',
    })
  })

  it('liefert die Merkmale unter den Namen, die Kleinanzeigen vergibt', () => {
    // Genau diese Namen liest das WBW-Plugin — sie werden nicht übersetzt.
    expect(inserat.details).toMatchObject({
      Marke: 'Mercedes Benz',
      Modell: 'GLK 220',
      Kilometerstand: '210.000 km',
      Erstzulassung: 'März 2009',
      Kraftstoffart: 'Diesel',
      Leistung: '170 PS',
      Getriebe: 'Automatik',
      Fahrzeugtyp: 'SUV/Geländewagen',
      'Anzahl Türen': '4/5',
      Außenfarbe: 'Schwarz',
    })
  })

  it('liest die Ausstattung', () => {
    expect(inserat.features).toContain('Anhängerkupplung')
    expect(inserat.features).toContain('Sitzheizung')
    expect(inserat.features).toHaveLength(14)
  })

  it('behält die Absätze der Beschreibung', () => {
    expect(inserat.description).toContain('\n')
    expect(inserat.description).toContain('Mercedes GLK 220 CDI 4 Matic')
  })

  it('nimmt nur die Bilder dieser Anzeige', () => {
    // Auf der Seite stehen auch Vorschaubilder fremder Anzeigen. Ohne
    // Einschränkung auf die Galerie waren es 31 statt 19.
    expect(inserat.media.images.urls).toHaveLength(19)
    expect(inserat.media.images.urls.every((u) => u.includes('prod-ads'))).toBe(true)
  })

  it('liest das Einstelldatum', () => {
    expect(inserat.extra_info.created_at).toBe('10.07.2026')
  })
})

describe('Preis', () => {
  it('erkennt „VB" als verhandelbar', () => {
    expect(lesePreis('1.200 € VB')).toEqual({
      amount: '1200',
      currency: '€',
      negotiable: true,
    })
  })

  it('macht aus einem fehlenden Preis eine Null, keinen Absturz', () => {
    expect(lesePreis(null)).toEqual({ amount: '0', currency: '€', negotiable: false })
    expect(lesePreis('')).toEqual({ amount: '0', currency: '€', negotiable: false })
  })
})

describe('Ort', () => {
  it('kommt ohne Ortsteil aus', () => {
    expect(leseOrt('47798 Nordrhein-Westfalen')).toEqual({
      zip: '47798',
      city: '',
      state: 'Nordrhein-Westfalen',
    })
  })

  it('bleibt bei fehlender Angabe leer', () => {
    expect(leseOrt(null)).toEqual({ zip: '', city: '', state: '' })
  })
})

describe('Anzeigennummer aus der Adresse', () => {
  it('liest die lange Form', () => {
    expect(adidAusUrl(URL_ANZEIGE)).toBe('3455356908')
  })

  it('liest die Kurzform', () => {
    expect(adidAusUrl('https://www.kleinanzeigen.de/s-anzeige/3455356908')).toBe('3455356908')
  })

  it('gibt null zurück, wo keine steht', () => {
    expect(adidAusUrl('https://www.kleinanzeigen.de/s-autos/c216')).toBeNull()
  })
})
