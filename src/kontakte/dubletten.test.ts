import { describe, expect, it } from 'vitest'
import { gruppiere, normalisiere, type Kontakt } from './dubletten'

function kontakt(id: string, anzeige: string, belege = 0): Kontakt {
  return { id, anzeige, kundennummer: null, angelegtAm: null, belege }
}

describe('normalisiere', () => {
  it('führt Schreibweisen derselben Firma zusammen', () => {
    // Beide standen am 09.09.2026 als getrennte Kontakte im Konto.
    expect(normalisiere('Salt & Pictures GmbH')).toBe(normalisiere('Salt und Pictures GmbH'))
  })

  it('lässt sich vom weichen Trennzeichen nicht täuschen', () => {
    // In „Düsseldorf-­Reisholz" steckt ein weiches Trennzeichen, das man
    // dem Namen nicht ansieht.
    expect(normalisiere('Industrieterrains Düsseldorf-­Reisholz')).toBe(
      normalisiere('Industrieterrains Düsseldorf-Reisholz AG'),
    )
  })

  it('ignoriert Rechtsform, Komma und Grossschreibung', () => {
    expect(normalisiere('Deutsches Rotes Kreuz, Kreisverband Neuss e.V.')).toBe(
      normalisiere('Deutsches Rotes Kreuz Kreisverband Neuss'),
    )
    expect(normalisiere('TEST')).toBe(normalisiere('Test'))
  })

  it('setzt Vor- und Nachnamen zusammen', () => {
    expect(normalisiere(null, 'Luke', 'Gollenstede')).toBe('luke gollenstede')
  })

  it('hält verschiedene Firmen auseinander', () => {
    expect(normalisiere('Autohaus Meyer')).not.toBe(normalisiere('Autohaus Meier'))
  })

  it('gibt für nichts auch nichts zurück', () => {
    expect(normalisiere(null, undefined, '  ')).toBe('')
  })
})

describe('gruppiere', () => {
  it('nimmt nur auf, was mehr als einmal vorkommt', () => {
    const gruppen = gruppiere([kontakt('1', 'Alleinstehend'), kontakt('2', 'Auch allein')])
    expect(gruppen).toEqual([])
  })

  it('stellt die Einträge mit den meisten Belegen nach vorn', () => {
    const gruppen = gruppiere([
      kontakt('a', 'Arndt Automobile GmbH', 0),
      kontakt('b', 'Arndt Automobile', 25),
      kontakt('c', 'Arndt Automobile GmbH', 7),
    ])
    expect(gruppen[0]?.kontakte.map((k) => k.id)).toEqual(['b', 'c', 'a'])
  })

  it('nennt die leeren Einträge getrennt — nur sie lassen sich löschen', () => {
    const gruppen = gruppiere([
      kontakt('voll', 'Stadtwerke Neuss', 1),
      kontakt('leer', 'Stadtwerke Neuss GmbH', 0),
    ])
    expect(gruppen[0]?.leere.map((k) => k.id)).toEqual(['leer'])
    expect(gruppen[0]?.nurInSevdesk).toBe(false)
  })

  it('markiert Gruppen, in denen mehrere Einträge Belege tragen', () => {
    // Hier hilft die API nicht: Rechnungen lassen sich nicht umhängen.
    const gruppen = gruppiere([
      kontakt('a', 'Salt & Pictures GmbH', 1),
      kontakt('b', 'Salt und Pictures GmbH', 6),
    ])
    expect(gruppen[0]?.nurInSevdesk).toBe(true)
    expect(gruppen[0]?.leere).toEqual([])
  })

  it('zeigt die aufräumbaren Gruppen zuerst', () => {
    const gruppen = gruppiere([
      kontakt('s1', 'Salt & Pictures GmbH', 1),
      kontakt('s2', 'Salt und Pictures GmbH', 6),
      kontakt('a1', 'Arndt Automobile', 25),
      kontakt('a2', 'Arndt Automobile GmbH', 0),
      kontakt('a3', 'Arndt Automobile GmbH', 0),
    ])
    expect(gruppen[0]?.anzeige).toContain('Arndt')
  })

  it('nimmt den längsten Namen als Überschrift', () => {
    const gruppen = gruppiere([
      kontakt('1', 'Deutsches Rotes Kreuz Kreisverband Neuss', 1),
      kontakt('2', 'Deutsches Rotes Kreuz, Kreisverband Neuss e.V.', 1),
    ])
    expect(gruppen[0]?.anzeige).toBe('Deutsches Rotes Kreuz, Kreisverband Neuss e.V.')
  })
})
