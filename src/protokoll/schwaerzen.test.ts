import { describe, expect, it } from 'vitest'
import { schwaerze, schwaerzeText } from './schwaerzen'

/**
 * Die Beispiele stammen aus echten Daten dieser Anwendung: das Kennzeichen
 * und die Fahrgestellnummer des Falls 0926/2081TG, ein Bearer-Token in der
 * Form, in der autoiXpert ihn erwartet, eine Kleinanzeigen-URL mit
 * Zugangsdaten.
 */

describe('Was nicht ins Protokoll gehört', () => {
  it('schwärzt die Fahrgestellnummer', () => {
    expect(schwaerzeText('Fahrzeug WDD2130611A553209 geprüft')).toBe('Fahrzeug «VIN» geprüft')
  })

  it('schwärzt das Kennzeichen', () => {
    expect(schwaerzeText('Fall zu K-MO 3119')).toBe('Fall zu «Kennzeichen»')
    expect(schwaerzeText('Kennzeichen K-MO-3119.')).toBe('Kennzeichen «Kennzeichen».')
  })

  it('schwärzt E-Mail-Adressen', () => {
    expect(schwaerzeText('Anmeldung von probe@test.local fehlgeschlagen')).toBe(
      'Anmeldung von «E-Mail» fehlgeschlagen',
    )
  })

  it('schwärzt Bearer- und Basic-Token', () => {
    expect(schwaerzeText('Authorization: Bearer 6pnjMm2CEMuw')).toBe(
      'Authorization: Bearer «geschwärzt»',
    )
    expect(schwaerzeText('Basic Y29ja3BpdDpnZWhlaW0=')).toBe('Basic «geschwärzt»')
  })

  it('schwärzt Zugangsdaten im Fragezeichenteil einer Adresse', () => {
    expect(schwaerzeText('GET https://dienst.de/x?api_key=abc123&format=json')).toBe(
      'GET https://dienst.de/x?api_key=«geschwärzt»&format=json',
    )
  })

  /*
   * Aus einem echten Vorfall vom 08.09.2026: die Datenbank fiel mitten im
   * Betrieb aus, die Abfrage der angemeldeten Sitzung scheiterte, und
   * Drizzle hängte ihre Parameter an die Fehlermeldung. Damit stand der Hash
   * des Sitzungstokens im Protokoll.
   */
  it('schwärzt die Parameter einer gescheiterten Datenbankabfrage', () => {
    const meldung =
      'Failed query: select "benutzer"."id" from "sitzung" where "token_hash" = $1 limit $2\n' +
      'params: 6a807aacce734c69b1d39917bb28d8aff92919c2e4d4982189d670d9f333524b,1'
    const geschwaerzt = schwaerzeText(meldung)
    expect(geschwaerzt).toContain('Failed query: select')
    expect(geschwaerzt).toContain('params: «geschwärzt»')
    expect(geschwaerzt).not.toContain('6a807aacce')
  })

  it('lässt die Stapelspur hinter den Parametern stehen', () => {
    // Die Spur ist das Wertvollste am Eintrag — die Schwärzung darf nur bis
    // zum Zeilenende greifen, nicht bis zum Ende des Textes.
    const text = 'Failed query: select 1\nparams: geheim\n    at abfrage (src/db.ts:12:3)'
    expect(schwaerzeText(text)).toBe(
      'Failed query: select 1\nparams: «geschwärzt»\n    at abfrage (src/db.ts:12:3)',
    )
  })

  it('schwärzt eine lange Hexkette — sie ist immer ein Hash, nie ein Fachdatum', () => {
    expect(
      schwaerzeText('Sitzung 6a807aacce734c69b1d39917bb28d8aff92919c2e4d4982189d670d9f333524b'),
    ).toBe('Sitzung «Hash»')
  })

  it('lässt die fachlichen Suchparameter stehen', () => {
    // Sie dokumentieren, WAS gesucht wurde, und gehören ins Protokoll.
    const url = 'https://www.kleinanzeigen.de/s-autos/c216+autos.marke_s:mercedes_benz?radius=200'
    expect(schwaerzeText(url)).toBe(url)
  })
})

describe('Was stehen bleiben muss', () => {
  it('lässt die Fall-ID durch — sie ist die Brücke zur Anwendung', () => {
    const text = 'Lauf cc91a067-c89e-48be-947e-cbae40f337b6 abgebrochen'
    expect(schwaerzeText(text)).toBe(text)
  })

  it('lässt Aktenzeichen und Beträge durch', () => {
    expect(schwaerzeText('0926/2081TG: 8490.71 EUR netto')).toBe('0926/2081TG: 8490.71 EUR netto')
  })

  it('lässt die Kennung der Fehlerseite durch — sonst findet sie niemand wieder', () => {
    // Der `digest` von Next ist eine reine Ziffernfolge und die einzige
    // Kennung, die der Benutzer vor sich hat.
    expect(schwaerzeText('digest 242442235')).toBe('digest 242442235')
  })

  it('hält eine gewöhnliche Meldung unverändert', () => {
    const text = 'Für die PLZ 50997 liess sich kein Ort bestimmen.'
    expect(schwaerzeText(text)).toBe(text)
  })
})

describe('Objekte', () => {
  it('schwärzt heikle Felder am Namen, nicht am Inhalt', () => {
    expect(
      schwaerze({ benutzer: 'Probe', passwort: 'egal', token: 'x', kennzeichen: 'K-MO 3119' }),
    ).toEqual({
      benutzer: 'Probe',
      passwort: '«geschwärzt»',
      token: '«geschwärzt»',
      kennzeichen: '«geschwärzt»',
    })
  })

  it('geht in die Tiefe', () => {
    expect(schwaerze({ fall: { fahrzeug: { vin: 'WDD2130611A553209' } } })).toEqual({
      fall: { fahrzeug: { vin: '«geschwärzt»' } },
    })
  })

  it('kürzt lange Zeichenketten statt eine 400-KB-Antwort mitzuschleppen', () => {
    const lang = schwaerze('x'.repeat(5000)) as string
    expect(lang.length).toBeLessThan(1100)
    expect(lang.endsWith('«gekürzt»')).toBe(true)
  })

  it('kürzt lange Listen und sagt, wie viele fehlen', () => {
    const liste = schwaerze(Array.from({ length: 30 }, (_, i) => i)) as unknown[]
    expect(liste).toHaveLength(21)
    expect(liste[20]).toBe('… und 10 weitere')
  })

  it('bricht bei zu tiefer Verschachtelung ab, statt sich zu verlaufen', () => {
    let tief: unknown = 'ende'
    for (let i = 0; i < 10; i++) tief = { rein: tief }
    expect(JSON.stringify(schwaerze(tief))).toContain('zu tief')
  })

  it('verträgt null und undefined', () => {
    expect(schwaerze(null)).toBeNull()
    expect(schwaerze(undefined)).toBeUndefined()
  })
})
