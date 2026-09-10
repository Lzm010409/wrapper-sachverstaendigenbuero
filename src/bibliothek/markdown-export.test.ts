import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  baueReferenzdatei,
  formatiereNummer,
  vergleicheNummern,
  type ExportEintrag,
} from './markdown-export'
import { STANDARD_DATEIEN, parseReferenzdatei, type GeparsterEintrag } from './parser'

const REF = join(process.cwd(), 'skills', 'stellungnahme-erstellen', 'references')

/** Bildet einen geparsten Eintrag auf die Exportform ab. */
function alsExport(e: GeparsterEintrag): ExportEintrag {
  return {
    nummer: e.nummer,
    titel: e.titel,
    abschnitt: e.abschnitt,
    typischeBegruendung: e.typischeBegruendung,
    gegenargument: e.gegenargument || null,
    vorgehen: e.vorgehen,
    hinweise: e.hinweise,
    varianten: e.varianten.map((v, i) => ({ ...v, reihenfolge: i })),
    ergaenzungen: e.ergaenzungen.map((x, i) => ({ ...x, reihenfolge: i })),
  }
}

describe('formatiereNummer', () => {
  it('hält die Schreibweise der Quelldateien ein', () => {
    expect(formatiereNummer('1')).toBe('1.')
    expect(formatiereNummer('1.2')).toBe('1.2')
    expect(formatiereNummer('B.7')).toBe('B.7')
    expect(formatiereNummer('')).toBe('')
  })
})

describe('vergleicheNummern', () => {
  it('sortiert nach Gliederung statt alphabetisch', () => {
    const roh = ['1.10', '1.2', '2.1', '1.1', '11.1']
    expect([...roh].sort(vergleicheNummern)).toEqual(['1.1', '1.2', '1.10', '2.1', '11.1'])
  })

  it('hält Buchstabenpräfixe zusammen', () => {
    expect([...['B.10', 'B.2', 'B.1']].sort(vergleicheNummern)).toEqual(['B.1', 'B.2', 'B.10'])
  })
})

describe('Hin- und Rückweg', () => {
  for (const konfig of STANDARD_DATEIEN) {
    it(`erhält alle Inhalte von ${konfig.datei}`, () => {
      const original = parseReferenzdatei(
        readFileSync(join(REF, konfig.datei), 'utf8'),
        konfig,
      )

      const markdown = baueReferenzdatei({
        titel: 'Argumentbibliothek',
        einleitung: 'Rückexport aus der Datenbank.',
        eintragEbene: konfig.eintragEbene,
        eintraege: original.map(alsExport),
      })

      const erneut = parseReferenzdatei(markdown, konfig)

      expect(erneut).toHaveLength(original.length)

      for (const [i, o] of original.entries()) {
        const n = erneut[i]!
        const wo = `${o.nummer} ${o.titel}`
        expect(n.nummer, wo).toBe(o.nummer)
        expect(n.titel, wo).toBe(o.titel)
        expect(n.abschnitt, wo).toBe(o.abschnitt)
        expect(n.typischeBegruendung, wo).toBe(o.typischeBegruendung)
        expect(n.gegenargument, wo).toBe(o.gegenargument)
        expect(n.vorgehen, wo).toBe(o.vorgehen)
        expect(n.hinweise, wo).toBe(o.hinweise)
        expect(n.varianten.length, `${wo} — Varianten`).toBe(o.varianten.length)
        expect(n.ergaenzungen.length, `${wo} — Ergänzungen`).toBe(o.ergaenzungen.length)
      }
    })
  }

  it('behält die Platzhalter über den Rückweg', () => {
    const konfig = STANDARD_DATEIEN[0]!
    const original = parseReferenzdatei(readFileSync(join(REF, konfig.datei), 'utf8'), konfig)
    const markdown = baueReferenzdatei({
      titel: 'Argumentbibliothek',
      einleitung: '',
      eintragEbene: 3,
      eintraege: original.map(alsExport),
    })
    const erneut = parseReferenzdatei(markdown, konfig)

    const zaehle = (l: GeparsterEintrag[]) => l.reduce((s, e) => s + e.platzhalter.length, 0)
    expect(zaehle(erneut)).toBe(zaehle(original))
  })
})
