import { describe, expect, it } from 'vitest'
import { erzeugeDokument } from './erzeugen'
import { dokumentNachAbsaetzen, leseStruktur } from './nach-absaetzen'
import { eintraegeJePosition, leseSpur, selbstGeschriebeneAbschnitte } from './spur'
import {
  BILD_BREITE_STANDARD,
  KNOTEN,
  abschnitte,
  abschnitteVollstaendig,
  bildknoten,
  herkunftsmarke,
  absatz,
  text,
  type Elementknoten,
} from './typen'
import { gesamttext, pruefBausteineAusDokument } from './pruefung'
import { setzeWerteEin } from './platzhalter'
import { alsKlartext } from '@/export/hausstil'
import { pruefeVorExport } from '@/export/waechter'

const quelle = {
  betreff: 'Betreff: Stellungnahme zum Prüfbericht',
  anrede: 'Sehr geehrte Damen und Herren,',
  einleitung: 'mit dem Schreiben vom 01.02.2026 überliessen Sie uns den Kürzungsbericht.',
  positionen: [
    {
      id: 'p1',
      bezeichnung: 'Verbringungskosten',
      behandlung: 'bestritten',
      bausteine: [
        {
          text: 'Die Verbringung ist erforderlich.\n\nEin zweiter Absatz dazu.',
          eintragId: 'e1',
          nummer: '2.3',
          titel: 'Verbringungskosten',
          herkunft: 'vorschlag',
        },
      ],
    },
    {
      id: 'p2',
      bezeichnung: 'Ersatzteilaufschlag',
      behandlung: 'bestritten',
      bausteine: [{ text: 'Eigener Gedanke dazu.', eintragId: null, herkunft: 'eigener_text' }],
    },
    { id: 'p3', bezeichnung: 'Kleinteile', behandlung: 'nicht_bestreiten', bausteine: [] },
  ],
  ergebnisAbsatz: null,
}

describe('erzeugeDokument', () => {
  it('baut Betreff, Anrede, Einleitung, Abschnitte, Ergebnis und Signatur', () => {
    const d = erzeugeDokument(quelle)
    const typen = (d.content ?? []).map((k) => k.type)
    expect(typen[0]).toBe(KNOTEN.betreff)
    expect(typen[1]).toBe(KNOTEN.anrede)
    expect(typen.at(-1)).toBe(KNOTEN.signatur)
    expect(typen.at(-2)).toBe(KNOTEN.ergebnis)
  })

  it('legt für jede Position einen Abschnitt an, nicht bestrittene ausgelassen', () => {
    const d = erzeugeDokument(quelle)
    expect(abschnitte(d).map((a) => [a.attrs?.positionId, a.attrs?.ausgelassen])).toEqual([
      ['p1', false],
      ['p2', false],
      ['p3', true],
    ])
  })

  it('zerlegt einen Baustein an Leerzeilen in mehrere Absätze', () => {
    const d = erzeugeDokument(quelle)
    const erster = abschnitte(d)[0]!
    // Überschrift plus zwei Absätze.
    expect(erster.content).toHaveLength(3)
  })
})

describe('leseStruktur', () => {
  it('nummeriert nach Reihenfolge, nicht nach Position', () => {
    const s = leseStruktur(erzeugeDokument(quelle))
    expect(s.abschnitte.map((a) => [a.nummer, a.ueberschrift])).toEqual([
      [1, 'Verbringungskosten'],
      [2, 'Ersatzteilaufschlag'],
    ])
  })

  it('überspringt Abschnitte ohne Text — eine leere Überschrift bekommt keine Nummer', () => {
    const d = erzeugeDokument({
      ...quelle,
      positionen: [
        { id: 'p0', bezeichnung: 'Noch nichts', behandlung: 'offen', bausteine: [] },
        ...quelle.positionen,
      ],
    })
    const s = leseStruktur(d)
    expect(s.abschnitte.map((a) => a.ueberschrift)).toEqual([
      'Verbringungskosten',
      'Ersatzteilaufschlag',
    ])
    expect(s.abschnitte[0]!.nummer).toBe(1)
  })

  it('nimmt die Einleitung mit', () => {
    const s = leseStruktur(erzeugeDokument(quelle))
    expect(s.einleitung).toEqual([quelle.einleitung])
  })
})

describe('dokumentNachAbsaetzen', () => {
  it('erzeugt eine Klartextfassung im Aufbau des Hausstils', () => {
    const klartext = alsKlartext(dokumentNachAbsaetzen(erzeugeDokument(quelle)))
    expect(klartext).toContain('Betreff: Stellungnahme zum Prüfbericht')
    expect(klartext).toContain('1. Verbringungskosten')
    expect(klartext).toContain('2. Ersatzteilaufschlag')
    expect(klartext).not.toContain('Kleinteile')
    expect(klartext).toContain('Mit freundlichen Grüßen')
  })

  it('trennt zwei Absätze derselben Position durch eine Leerzeile', () => {
    const klartext = alsKlartext(dokumentNachAbsaetzen(erzeugeDokument(quelle)))
    expect(klartext).toContain('Die Verbringung ist erforderlich.\n\nEin zweiter Absatz dazu.')
  })

  it('gibt Listen als Zeilen aus', () => {
    const d = erzeugeDokument(quelle)
    const erster = abschnitte(d)[0]!
    erster.content!.push({
      type: 'bulletList',
      content: [
        { type: 'listItem', content: [absatz('erster Punkt')] },
        { type: 'listItem', content: [absatz('zweiter Punkt')] },
      ],
    })
    const klartext = alsKlartext(dokumentNachAbsaetzen(d))
    expect(klartext).toContain('– erster Punkt')
    expect(klartext).toContain('– zweiter Punkt')
  })
})

describe('leseSpur', () => {
  it('findet den Eintrag hinter dem eingefügten Text', () => {
    const spur = leseSpur(erzeugeDokument(quelle))
    expect(spur.filter((s) => s.eintragId === 'e1')).toHaveLength(2)
    expect(eintraegeJePosition(erzeugeDokument(quelle)).get('p1')).toEqual(['e1'])
  })

  it('überlebt das Zerlegen eines Absatzes in viele Textknoten', () => {
    const d = erzeugeDokument(quelle)
    const marke = herkunftsmarke({
      eintragId: 'e1',
      nummer: '2.3',
      titel: 'Verbringungskosten',
      herkunft: 'vorschlag',
    })
    const abs = abschnitte(d)[0]!.content![1] as Elementknoten
    // So sieht ein Absatz aus, in dem jemand mitten im Satz weitergetippt hat.
    abs.content = [text('Die Verbringung ', [marke]), text('ist erforderlich.', [marke])]

    const stuecke = leseSpur(d).filter((s) => s.positionId === 'p1')
    expect(stuecke[0]!.text).toBe('Die Verbringung ist erforderlich.')
  })

  it('erkennt einen selbst geschriebenen Abschnitt', () => {
    const eigene = selbstGeschriebeneAbschnitte(erzeugeDokument(quelle))
    expect(eigene.map((e) => e.positionId)).toEqual(['p2'])
    expect(eigene[0]!.text).toBe('Eigener Gedanke dazu.')
  })
})

describe('Wächter am Dokument', () => {
  const mitPlatzhalter = erzeugeDokument({
    ...quelle,
    positionen: [
      {
        id: 'p1',
        bezeichnung: 'Verbringungskosten',
        behandlung: 'bestritten',
        bausteine: [
          {
            text: 'Abzüge in Höhe von [Betrag] € sind nicht nachvollziehbar. Sie haben Anspruch auf Erstattung.',
            eintragId: 'e1',
            nummer: '2.3',
            titel: 'Verbringungskosten',
            herkunft: 'vorschlag',
          },
        ],
      },
    ],
  })

  it('prüft abschnittsweise und behält die Nummer des Schreibens', () => {
    const bausteine = pruefBausteineAusDokument(mitPlatzhalter)
    expect(bausteine).toHaveLength(1)
    expect(bausteine[0]!.positionNummer).toBe(1)
    expect(bausteine[0]!.positionId).toBe('p1')
  })

  it('meldet Platzhalter und RDG-Grenze mit Fundstelle und Abschnitt', () => {
    const ergebnis = pruefeVorExport({
      bausteine: pruefBausteineAusDokument(mitPlatzhalter),
      belegteZahlen: [],
      gesamttext: gesamttext(mitPlatzhalter),
    })

    const r1 = ergebnis.befunde.find((b) => b.kennung === 'R1')
    expect(r1?.fundstelle).toBe('[Betrag]')
    expect(r1?.positionId).toBe('p1')
    expect(ergebnis.gesperrt).toBe(true)

    const r3 = ergebnis.befunde.find((b) => b.kennung === 'R3')
    expect(r3?.fundstelle).toMatch(/Anspruch/)
    expect(r3?.positionId).toBe('p1')
  })

  it('reicht die internen Hinweise des verwendeten Eintrags zur Prüfung durch', () => {
    const bausteine = pruefBausteineAusDokument(
      mitPlatzhalter,
      new Map([['e1', 'Funktioniert besonders gut bei kleinen Beträgen.']]),
    )
    expect(bausteine[0]!.interneHinweise).toMatch(/Funktioniert besonders gut/)
  })
})

describe('abschnitteVollstaendig', () => {
  it('erkennt einen Abschnitt, der seine Position verloren hat', () => {
    const d = erzeugeDokument(quelle)
    expect(abschnitteVollstaendig(d)).toBe(true)
    abschnitte(d)[0]!.attrs!.positionId = null
    expect(abschnitteVollstaendig(d)).toBe(false)
  })
})

describe('setzeWerteEin', () => {
  it('setzt bekannte Werte und lässt unbekannte stehen', () => {
    const stand = setzeWerteEin('Das [Fahrzeug] mit [Kennzeichen] und [Unbekannt].', {
      Fahrzeug: 'VW Passat',
      Kennzeichen: 'KR-AB 123',
    })
    expect(stand.text).toBe('Das VW Passat mit KR-AB 123 und [Unbekannt].')
    expect(stand.offen).toEqual(['Unbekannt'])
    expect(stand.gesetzt).toBe(2)
  })
})

describe('nicht bestrittene Abschnitte', () => {
  it('bleiben im Dokument, aber nicht im Schreiben', () => {
    const d = erzeugeDokument(quelle)
    // p3 ist nicht bestritten: der Abschnitt existiert …
    expect(abschnitte(d).map((a) => a.attrs?.positionId)).toEqual(['p1', 'p2', 'p3'])
    // … erscheint aber weder im Aufbau noch in der Nummerierung.
    expect(leseStruktur(d).abschnitte.map((a) => a.positionId)).toEqual(['p1', 'p2'])
  })

  it('geben ihre Nummer frei, sobald sie ausgelassen werden', () => {
    const d = erzeugeDokument(quelle)
    abschnitte(d)[0]!.attrs!.ausgelassen = true
    const s = leseStruktur(d)
    expect(s.abschnitte.map((a) => [a.nummer, a.positionId])).toEqual([[1, 'p2']])
  })

  it('verlieren ihren Text nicht', () => {
    const d = erzeugeDokument(quelle)
    abschnitte(d)[0]!.attrs!.ausgelassen = true
    expect(JSON.stringify(d)).toContain('Die Verbringung ist erforderlich.')
  })
})

describe('Bilder im Schreiben', () => {
  function mitBild(breite = BILD_BREITE_STANDARD, beschriftung = 'Auszug aus der Kalkulation') {
    const d = erzeugeDokument(quelle)
    const erster = abschnitte(d)[0]!
    erster.content!.push(
      bildknoten(
        {
          bildId: 'b1',
          breite,
          breitePx: 1600,
          hoehePx: 900,
          dateiname: 'kalkulation.png',
        },
        beschriftung,
      ),
    )
    return d
  }

  it('erscheint als eigener Block an seiner Stelle im Abschnitt', () => {
    const s = leseStruktur(mitBild())
    const arten = s.abschnitte[0]!.bloecke.map((b) => b.art)
    expect(arten).toEqual(['text', 'text', 'bild'])
  })

  it('nummeriert fortlaufend und schreibt den Marker in die Klartextfassung', () => {
    const klartext = alsKlartext(dokumentNachAbsaetzen(mitBild()))
    expect(klartext).toContain('[Bild 1: kalkulation.png – siehe Word-Dokument]')
    expect(klartext).toContain('Auszug aus der Kalkulation')
  })

  it('trägt Breite und Originalmasse in die Absatzfolge', () => {
    const absatz = dokumentNachAbsaetzen(mitBild(0.5)).find((a) => a.art === 'bild')
    expect(absatz?.bild).toMatchObject({
      bildId: 'b1',
      breite: 0.5,
      breitePx: 1600,
      hoehePx: 900,
      nummer: 1,
    })
  })

  it('zählt für den Wächter nur den Text, nicht den Bildmarker', () => {
    const bausteine = pruefBausteineAusDokument(mitBild())
    expect(bausteine[0]!.text).not.toContain('kalkulation.png')
    // Die Beschriftung ist Text des Schreibens und wird deshalb mitgeprüft.
    expect(gesamttext(mitBild())).toContain('Auszug aus der Kalkulation')
  })

  it('hält einen Abschnitt am Leben, der nur aus einem Bild besteht', () => {
    const d = erzeugeDokument({
      ...quelle,
      positionen: [{ id: 'p1', bezeichnung: 'Nur ein Bild', behandlung: 'bestritten', bausteine: [] }],
    })
    const erster = abschnitte(d)[0]!
    erster.content = [
      erster.content![0]!,
      bildknoten({
        bildId: 'b9',
        breite: 0.68,
        breitePx: 800,
        hoehePx: 600,
        dateiname: 'foto.jpg',
      }),
    ]
    const s = leseStruktur(d)
    expect(s.abschnitte).toHaveLength(1)
    expect(s.abschnitte[0]!.bloecke).toHaveLength(1)
  })
})
