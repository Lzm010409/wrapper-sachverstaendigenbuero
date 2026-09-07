import { describe, expect, it } from 'vitest'
import { leseAlleEintraege } from '@/bibliothek/migration'
import {
  begriffe,
  begriffePassen,
  bewerte,
  findeVorschlaege,
  laengsteGemeinsameFolge,
  stamm,
  type Bibliothekseintrag,
} from './treffer'
import { BUENDEL_MIT_HONORAR, EINFACHER_BERICHT } from '@/pruefbericht/fixtures'

/**
 * Die Treffer-Suche wird gegen den echten Bibliotheksbestand geprüft, nicht
 * gegen erfundene Einträge — sonst sagt der Test nichts darüber aus, ob die
 * Zuordnung im Alltag funktioniert.
 */
const BIBLIOTHEK: Bibliothekseintrag[] = leseAlleEintraege().map((e, i) => ({
  id: `e${i}`,
  nummer: e.nummer,
  titel: e.titel,
  bereich: e.bereich,
  abschnitt: e.abschnitt,
  typischeBegruendung: e.typischeBegruendung,
  gegenargument: e.gegenargument || null,
  vorgehen: e.vorgehen,
  status: 'freigegeben',
  haeufigkeitText: e.haeufigkeitText,
  varianten: e.varianten.map((v, j) => ({ id: `e${i}v${j}`, bezeichnung: v.bezeichnung, text: v.text })),
}))

describe('stamm', () => {
  it('führt Beugungen zusammen', () => {
    expect(stamm('halterungen')).toBe(stamm('halterung'))
    expect(stamm('lackierungen')).toBe(stamm('lackierung'))
    expect(stamm('ersatzteile')).toBe(stamm('ersatzteil'))
  })

  it('kürzt kurze Wörter nicht bis zur Unkenntlichkeit', () => {
    expect(stamm('lohn').length).toBeGreaterThanOrEqual(4)
    expect(stamm('teile').length).toBeGreaterThanOrEqual(4)
  })
})

describe('laengsteGemeinsameFolge', () => {
  it('misst das gemeinsame Mittelstück', () => {
    expect(laengsteGemeinsameFolge('lackmaterial', 'materialzuschlag')).toBe(8) // "material"
    expect(laengsteGemeinsameFolge('referenzwerkstatt', 'werkstattvergleich')).toBe(9)
    expect(laengsteGemeinsameFolge('', 'egal')).toBe(0)
  })
})

describe('begriffePassen', () => {
  it('erkennt Gleichheit und echte Komposita', () => {
    expect(begriffePassen('halterung', 'halterung')).toBe('gleich')
    // Eines steckt im anderen.
    expect(begriffePassen('stoßfänger', 'stoßfängerhalterung')).toBe('kompositum')
    // Nur ein gemeinsamer Kern — genau der Fall aus dem DEKRA-Bericht.
    expect(begriffePassen('lackmaterial', 'materialzuschlag')).toBe('kompositum')
  })

  it('verbindet nicht, was nur zufällig ähnlich aussieht', () => {
    expect(begriffePassen('lohn', 'lack')).toBe('nein')
    expect(begriffePassen('reifen', 'greifen')).toBe('nein')
    expect(begriffePassen('probe', 'probefahrt')).toBe('nein') // „probe" unter der Mindestlänge
  })
})

describe('begriffe', () => {
  it('lässt Füllwörter und kurze Wörter weg', () => {
    const b = begriffe('Die Beschädigung ist nicht nachvollziehbar und wird nur bei der Prüfung')
    expect(b).not.toContain('die')
    expect(b).not.toContain('nicht')
    expect(b.some((w) => w.startsWith('beschädig'))).toBe(true)
  })

  it('verkraftet leere Eingaben', () => {
    expect(begriffe(null)).toEqual([])
    expect(begriffe('')).toEqual([])
  })
})

describe('Zuordnung echter Positionen', () => {
  it('findet zur Halterung Stoßfänger den passenden Eintrag 1.2', () => {
    const position = EINFACHER_BERICHT.positionen[0]!
    const liste = findeVorschlaege(position, BIBLIOTHEK)

    expect(liste.kandidaten.length).toBeGreaterThan(0)
    const nummern = liste.kandidaten.map((k) => k.eintrag.nummer)
    expect(nummern, `gefunden: ${nummern.join(', ')}`).toContain('1.2')
    expect(liste.besteGuete).toBe('direkt')
  })

  it('findet zur Beilackierung den Eintrag 2.1 „Aus einem Guss"', () => {
    const position = EINFACHER_BERICHT.positionen[1]!
    const liste = findeVorschlaege(position, BIBLIOTHEK)
    const nummern = liste.kandidaten.map((k) => k.eintrag.nummer)
    expect(nummern, `gefunden: ${nummern.join(', ')}`).toContain('2.1')
  })

  it('findet zum Ersatzteilaufschlag den UPE-Eintrag 6.1', () => {
    const position = BUENDEL_MIT_HONORAR.positionen[4]!
    const liste = findeVorschlaege(position, BIBLIOTHEK)
    const nummern = liste.kandidaten.map((k) => k.eintrag.nummer)
    expect(nummern, `gefunden: ${nummern.join(', ')}`).toContain('6.1')
  })

  it('ordnet die Stundenverrechnungssätze dem Werkstattvergleich zu', () => {
    const position = BUENDEL_MIT_HONORAR.positionen[0]!
    const liste = findeVorschlaege(position, BIBLIOTHEK)
    const abschnitte = liste.kandidaten.map((k) => k.eintrag.abschnitt)
    expect(
      abschnitte.some((a) => /Werkstattvergleich|Referenzwerkstatt/i.test(a)),
      `gefunden: ${abschnitte.join(' | ')}`,
    ).toBe(true)
  })
})

describe('Einstufung', () => {
  it('macht aus einem Zufallstreffer keinen direkten Treffer', () => {
    const fremd = {
      bezeichnung: 'Regenschirm im Kofferraum',
      begruendungVersicherer: 'Gegenstand nicht unfallbedingt beschädigt.',
      typ: 'kalkulation',
    }
    const liste = findeVorschlaege(fremd, BIBLIOTHEK)
    expect(liste.besteGuete).not.toBe('direkt')
  })

  it('nennt die Begriffe, die den Treffer getragen haben', () => {
    const liste = findeVorschlaege(EINFACHER_BERICHT.positionen[0]!, BIBLIOTHEK)
    const bester = liste.kandidaten[0]!
    expect(bester.treffergruende.length).toBeGreaterThan(0)
    expect(bester.treffergruende.some((g) => g.startsWith('halterung') || g.startsWith('stoß')))
      .toBe(true)
  })

  it('straft einen Eintrag aus einem fremden Bereich ab', () => {
    const kalkulationsEintrag = BIBLIOTHEK.find((e) => e.nummer === '1.2' && e.bereich === 'kalkulation')!
    const alsWertminderung = {
      ...EINFACHER_BERICHT.positionen[0]!,
      typ: 'wertminderung',
    }
    const passend = bewerte(EINFACHER_BERICHT.positionen[0]!, kalkulationsEintrag)
    const unpassend = bewerte(alsWertminderung, kalkulationsEintrag)
    expect(unpassend.punkte).toBeLessThan(passend.punkte)
  })
})

describe('Varianten', () => {
  it('hebt Varianten hervor, deren Bezeichnung zur Position passt', () => {
    // Eintrag 1.3 führt acht Varianten nach Bauteilart, darunter Gummidichtungen.
    const position = {
      bezeichnung: 'Gummidichtung Rückleuchte',
      begruendungVersicherer: 'Beschädigung anhand der Unterlagen nicht nachvollziehbar.',
      typ: 'kalkulation',
    }
    const liste = findeVorschlaege(position, BIBLIOTHEK)
    const mitVarianten = liste.kandidaten.find((k) => k.passendeVarianten.length > 0)
    expect(mitVarianten, 'keine passende Variante erkannt').toBeDefined()
    expect(mitVarianten!.passendeVarianten.map((v) => v.bezeichnung).join(' ')).toMatch(
      /Gummidichtung/i,
    )
  })
})

describe('Vollständigkeit', () => {
  it('liefert für jede Position beider Testberichte mindestens einen Vorschlag', () => {
    const alle = [...BUENDEL_MIT_HONORAR.positionen, ...EINFACHER_BERICHT.positionen]
    const ohne = alle.filter((p) => findeVorschlaege(p, BIBLIOTHEK).kandidaten.length === 0)
    expect(ohne.map((p) => p.bezeichnung)).toEqual([])
  })
})
