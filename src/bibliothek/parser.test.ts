import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  STANDARD_DATEIEN,
  findeBelege,
  findePlatzhalter,
  klassifiziereKlammerausdruck,
  parseReferenzdatei,
  parseSonderfaelle,
  teileUeberschrift,
  extrahiereHaeufigkeit,
  type DateiKonfiguration,
} from './parser'

const REF = join(process.cwd(), 'skills', 'stellungnahme-erstellen', 'references')
const SONDERFALL_DATEI = 'allgemeine-vorbemerkung-und-sonderfaelle.md'

function lade(konfig: DateiKonfiguration) {
  return parseReferenzdatei(readFileSync(join(REF, konfig.datei), 'utf8'), konfig)
}

function ladeSonderfaelle() {
  return parseSonderfaelle(readFileSync(join(REF, SONDERFALL_DATEI), 'utf8'), SONDERFALL_DATEI)
}

describe('klassifiziereKlammerausdruck', () => {
  it('erkennt einzusetzende Werte', () => {
    expect(klassifiziereKlammerausdruck('Betrag')).toBe('wert')
    expect(klassifiziereKlammerausdruck('Bauteilseite')).toBe('wert')
    expect(klassifiziereKlammerausdruck('Monat/Jahr')).toBe('wert')
    expect(klassifiziereKlammerausdruck('Frontverkleidung/Heckverkleidung/o.ä.')).toBe('wert')
  })

  it('erkennt Arbeitsaufträge an den Schreibenden', () => {
    expect(
      klassifiziereKlammerausdruck(
        'Mit Screenshots aus dem Kalkulationsprogramm belegen, die die Behauptung des Prüfdienstleisters widerlegen.',
      ),
    ).toBe('regieanweisung')
    expect(
      klassifiziereKlammerausdruck('Bezug auf konkretes Foto/Bild-Nr. aus dem Gutachten'),
    ).toBe('regieanweisung')
  })
})

describe('findePlatzhalter', () => {
  it('sammelt ohne Dubletten', () => {
    const p = findePlatzhalter('Abzug von [Betrag]€ und nochmal [Betrag]€ bei [Datum].')
    expect(p.map((x) => x.schluessel).sort()).toEqual(['Betrag', 'Datum'])
  })

  it('ignoriert Markdown-Links', () => {
    expect(findePlatzhalter('siehe [die Doku](https://example.org)')).toHaveLength(0)
  })
})

describe('teileUeberschrift', () => {
  it('trennt Nummer und Titel', () => {
    expect(teileUeberschrift('1.2 Halterung Stoßfänger')).toEqual({
      nummer: '1.2',
      titel: 'Halterung Stoßfänger',
    })
    expect(teileUeberschrift('B.7 Grundlagenfehler prüfen')).toEqual({
      nummer: 'B.7',
      titel: 'Grundlagenfehler prüfen',
    })
    expect(teileUeberschrift('3. Wertminderung grundsätzlich verneint')).toEqual({
      nummer: '3',
      titel: 'Wertminderung grundsätzlich verneint',
    })
  })
})

describe('findeBelege', () => {
  it('erkennt Gerichte mit Ortsangabe', () => {
    const b = findeBelege('vgl. LG Düsseldorf, AG Paderborn und AG Limburg')
    expect(b.map((x) => x.gericht)).toContain('LG Düsseldorf')
    expect(b.map((x) => x.gericht)).toContain('AG Paderborn')
  })

  it('nimmt ein direkt folgendes Aktenzeichen mit', () => {
    const b = findeBelege('BGH Karlsruhe, Az.: 6 U 123/21 zur Beilackierung')
    expect(b[0]?.aktenzeichen).toBe('6 U 123/21')
  })
})

describe('extrahiereHaeufigkeit', () => {
  it('liest Häufigkeitsangaben aus der Prosa', () => {
    expect(extrahiereHaeufigkeit('Eine der häufigsten Einzelpositionen überhaupt (in über 10 Fällen).'))
      .toMatch(/häufigsten/i)
    expect(extrahiereHaeufigkeit('Sehr häufige, breit anwendbare Position.')).toMatch(/häufige/i)
  })
})

describe('Kalkulationsdatei', () => {
  const konfig = STANDARD_DATEIEN[0]!
  const eintraege = lade(konfig)

  it('findet alle 62 Einträge', () => {
    expect(eintraege).toHaveLength(62)
  })

  it('vergibt für jeden Eintrag Nummer, Titel und Abschnitt', () => {
    for (const e of eintraege) {
      expect(e.nummer, `Eintrag „${e.titel}"`).not.toBe('')
      expect(e.titel).not.toBe('')
      expect(e.abschnitt).not.toBe('')
    }
  })

  it('hat für jeden Eintrag einen Gegenargument-Text', () => {
    const ohne = eintraege.filter((e) => !e.gegenargument.trim())
    expect(ohne.map((e) => `${e.nummer} ${e.titel}`)).toEqual([])
  })

  it('trennt bei 1.2 Begründung, Gegenargument, Hinweise und Ergänzung', () => {
    const e = eintraege.find((x) => x.nummer === '1.2')
    expect(e).toBeDefined()
    expect(e!.titel).toMatch(/Halterung Stoßfänger/)
    expect(e!.typischeBegruendung).toMatch(/Keine sichtbare Beschädigung/)
    expect(e!.gegenargument).toMatch(/Kunststoffhalterungen/)
    expect(e!.gegenargument).not.toMatch(/^>/m)
    expect(e!.hinweise).toMatch(/häufigsten Einzelpositionen/)
    expect(e!.ergaenzungen.some((x) => /Widerhaken/i.test(x.titel))).toBe(true)
    expect(e!.platzhalter.map((p) => p.schluessel)).toContain('Betrag')
  })

  it('liest die acht Bauteil-Varianten unter 1.3', () => {
    const e = eintraege.find((x) => x.nummer === '1.3')
    expect(e!.varianten.length).toBeGreaterThanOrEqual(8)
    expect(e!.varianten.every((v) => v.text.length > 0)).toBe(true)
    expect(e!.varianten.map((v) => v.bezeichnung).join(' ')).toMatch(/Gummidichtungen/)
  })

  it('erkennt die Regieanweisung in 1.1 als solche', () => {
    const e = eintraege.find((x) => x.nummer === '1.1')
    const regie = e!.platzhalter.filter((p) => p.art === 'regieanweisung')
    expect(regie.length).toBeGreaterThan(0)
    expect(regie.some((p) => /Screenshot/i.test(p.schluessel))).toBe(true)
  })

  it('ordnet Einträge dem umgebenden Themenabschnitt zu', () => {
    const e = eintraege.find((x) => x.nummer === '5.3')
    expect(e!.abschnitt).toMatch(/Nebenkosten/)
    expect(e!.titel).toMatch(/Verbringungskosten/)
  })
})

describe('Wertminderungsdatei', () => {
  const konfig = STANDARD_DATEIEN[1]!
  const eintraege = lade(konfig)

  it('liest die Einträge trotz abweichender Überschriftenebene', () => {
    expect(eintraege).toHaveLength(4)
    expect(eintraege[0]!.nummer).toBe('1')
    expect(eintraege.every((e) => e.bereich === 'wertminderung')).toBe(true)
  })

  it('trägt bei 3 und 4 ein Vorgehen statt eines Gegenarguments', () => {
    // Diese beiden Einträge halten fest, dass die Kürzung in der Praxis
    // meist hinzunehmen ist — sie haben bewusst keinen fertigen Text.
    for (const nummer of ['3', '4']) {
      const e = eintraege.find((x) => x.nummer === nummer)!
      expect(e.gegenargument, `Eintrag ${nummer}`).toBe('')
      expect(e.vorgehen, `Eintrag ${nummer}`).toMatch(/nicht bestritten/i)
      expect(e.warnungen).toEqual([])
    }
  })

  it('trägt bei 1 und 2 ein echtes Gegenargument', () => {
    for (const nummer of ['1', '2']) {
      expect(eintraege.find((x) => x.nummer === nummer)!.gegenargument.length).toBeGreaterThan(50)
    }
  })
})

describe('Sonderfälle', () => {
  const eintraege = ladeSonderfaelle()

  it('erfasst den Vorbemerkungsblock als eigenen Eintrag', () => {
    const a = eintraege.find((x) => x.nummer === 'A')
    expect(a).toBeDefined()
    expect(a!.gegenargument.length).toBeGreaterThan(100)
    expect(a!.abschnitt).toMatch(/Teil A/)
    // Die ausführlichere Fassung mit Gerichtszitaten und der Zusatzbaustein
    // zur automatisierten Erstellung hängen als Varianten daran.
    expect(a!.varianten).toHaveLength(2)
    expect(a!.varianten[0]!.bezeichnung).toMatch(/Gerichtszitate/)
    expect(a!.varianten[1]!.bezeichnung).toMatch(/Sachbearbeiter/)
  })

  it('erfasst B.1 bis B.8 als Prüfhandlungen', () => {
    const nummern = eintraege.map((e) => e.nummer)
    for (const n of ['B.1', 'B.2', 'B.3', 'B.4', 'B.5', 'B.6', 'B.7', 'B.8']) {
      expect(nummern, `Sonderfall ${n} fehlt`).toContain(n)
    }
    const b7 = eintraege.find((x) => x.nummer === 'B.7')!
    expect(b7.titel).toMatch(/Grundlagenfehler/)
    expect(b7.vorgehen).toBeTruthy()
    expect(b7.gegenargument).toBe('')
  })

  it('liefert genau neun Einträge', () => {
    expect(eintraege).toHaveLength(9)
  })
})

describe('Gesamtbestand', () => {
  const alle = [...STANDARD_DATEIEN.flatMap(lade), ...ladeSonderfaelle()]

  it('überführt 90 Einträge', () => {
    expect(alle).toHaveLength(90)
  })

  it('lässt keinen Eintrag ohne Gegenargument und ohne Vorgehen zurück', () => {
    const leer = alle.filter((e) => !e.gegenargument.trim() && !e.vorgehen?.trim())
    expect(leer.map((e) => `${e.bereich}/${e.nummer} ${e.titel}`)).toEqual([])
  })

  it('vergibt je Bereich eindeutige Nummern', () => {
    const gesehen = new Set<string>()
    const doppelt: string[] = []
    for (const e of alle) {
      const schluessel = `${e.bereich}/${e.nummer}`
      if (gesehen.has(schluessel)) doppelt.push(schluessel)
      gesehen.add(schluessel)
    }
    expect(doppelt).toEqual([])
  })

  it('vergibt überall eine Gliederungsnummer', () => {
    expect(alle.filter((e) => !e.nummer).map((e) => e.titel)).toEqual([])
  })
})
