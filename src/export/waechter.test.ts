import { describe, expect, it } from 'vitest'
import {
  findeOffeneKlammern,
  findeZahlen,
  normalisiereZahl,
  pruefeVorExport,
  type PruefEingabe,
} from './waechter'

function eingabe(text: string, zusatz: Partial<PruefEingabe> = {}): PruefEingabe {
  return {
    bausteine: [{ positionNummer: 1, positionBezeichnung: 'Halterung Stoßfänger', text }],
    belegteZahlen: [],
    gesamttext: text,
    ...zusatz,
  }
}

describe('R1 — offene Platzhalter', () => {
  it('sperrt bei einem nicht ersetzten Wert', () => {
    const e = pruefeVorExport(eingabe('Abzüge in Höhe von [Betrag]€ netto.'))
    expect(e.gesperrt).toBe(true)
    expect(e.befunde[0]!.kennung).toBe('R1')
    expect(e.befunde[0]!.text).toMatch(/\[Betrag\]/)
  })

  it('sperrt auch bei einer stehen gebliebenen Regieanweisung', () => {
    const e = pruefeVorExport(
      eingabe('Der Halter ist erforderlich. [Mit Screenshots aus dem Kalkulationsprogramm belegen.]'),
    )
    expect(e.gesperrt).toBe(true)
  })

  it('lässt einen sauberen Text durch', () => {
    const e = pruefeVorExport(eingabe('Die Halterung ist schadenbedingt zu erneuern.'))
    expect(e.gesperrt).toBe(false)
    expect(e.befunde).toEqual([])
  })

  it('hält einen Markdown-Link nicht für einen Platzhalter', () => {
    expect(findeOffeneKlammern('siehe [die Doku](https://example.org)')).toEqual([])
  })
})

describe('R4 — interne Hinweise', () => {
  it('sperrt bei einer Wendung aus den Feldnotizen', () => {
    const e = pruefeVorExport(
      eingabe(
        'Die Halterung ist zu erneuern. Funktioniert besonders gut, wenn der Kürzungsbetrag klein ist.',
      ),
    )
    expect(e.gesperrt).toBe(true)
    expect(e.befunde.some((b) => b.kennung === 'R4')).toBe(true)
  })

  it('erkennt einen wörtlich übernommenen Hinweis des Eintrags', () => {
    const hinweis =
      'Eine der häufigsten Einzelpositionen überhaupt und funktioniert vor allem bei kleinen Beträgen.'
    const e = pruefeVorExport({
      bausteine: [
        {
          positionNummer: 1,
          positionBezeichnung: 'Halterung',
          text: `Die Halterung ist zu erneuern. ${hinweis}`,
          interneHinweise: hinweis,
        },
      ],
      belegteZahlen: [],
      gesamttext: '',
    })
    expect(e.befunde.filter((b) => b.kennung === 'R4').length).toBeGreaterThan(0)
    expect(e.gesperrt).toBe(true)
  })

  it('schlägt bei einem normalen Fachtext nicht an', () => {
    const e = pruefeVorExport(
      eingabe(
        'Die Kunststoffhalterungen fixieren die Verkleidung formschlüssig an der Karosserie und ' +
          'sind nach Demontage nicht wiederverwendbar.',
      ),
    )
    expect(e.befunde.filter((b) => b.kennung === 'R4')).toEqual([])
  })
})

describe('R2 — Zahlen ohne Beleg', () => {
  it('warnt bei einem Betrag, der im Fall nicht vorkommt', () => {
    const e = pruefeVorExport(
      eingabe('Abzüge in Höhe von 55,00€ netto.', { belegteZahlen: ['179,75', '169,25'] }),
    )
    const zahlen = e.befunde.filter((b) => b.kennung === 'R2')
    expect(zahlen).toHaveLength(1)
    expect(zahlen[0]!.schwere).toBe('warnt')
    expect(e.gesperrt).toBe(false)
  })

  it('schweigt, wenn der Betrag belegt ist', () => {
    const e = pruefeVorExport(
      eingabe('Der Satz von 179,75 € ist maßgeblich.', { belegteZahlen: ['179,75'] }),
    )
    expect(e.befunde.filter((b) => b.kennung === 'R2')).toEqual([])
  })

  it('erkennt dieselbe Zahl in verschiedener Schreibweise', () => {
    const e = pruefeVorExport(
      eingabe('Insgesamt 2.983,64 € netto.', { belegteZahlen: ['2983.64'] }),
    )
    expect(e.befunde.filter((b) => b.kennung === 'R2')).toEqual([])
  })

  it('stört sich nicht an Aufzählungen und Jahreszahlen', () => {
    const e = pruefeVorExport(eingabe('Der Vorschaden aus 2023 betraf 3 Bauteile.'))
    expect(e.befunde.filter((b) => b.kennung === 'R2')).toEqual([])
  })
})

describe('R3 — RDG-Grenze', () => {
  it('warnt bei einer Anspruchsfeststellung und nennt eine Alternative', () => {
    const e = pruefeVorExport(eingabe('Sie haben Anspruch auf Erstattung der vollen Kosten.'))
    const rdg = e.befunde.filter((b) => b.kennung === 'R3')
    expect(rdg.length).toBeGreaterThan(0)
    expect(rdg[0]!.text).toMatch(/technisch/)
  })

  it('warnt bei behaupteter Rechtspflicht des Versicherers', () => {
    const e = pruefeVorExport(eingabe('Damit ist der Versicherer verpflichtet, den Betrag zu zahlen.'))
    expect(e.befunde.some((b) => b.kennung === 'R3')).toBe(true)
  })

  it('warnt bei weichen Formulierungen', () => {
    const e = pruefeVorExport(eingabe('Die Erneuerung könnte erforderlich sein.'))
    const weich = e.befunde.filter((b) => b.titel === 'Weiche Formulierung')
    expect(weich).toHaveLength(1)
    expect(weich[0]!.text).toMatch(/ist erforderlich/)
  })

  it('lässt die bestimmte Formulierung des Hausstils in Ruhe', () => {
    const e = pruefeVorExport(
      eingabe(
        'Die Erneuerung ist schadenbedingt erforderlich. Die Kürzung ist aus Sachverständigensicht ' +
          'nicht nachvollziehbar.',
      ),
    )
    expect(e.befunde.filter((b) => b.kennung === 'R3')).toEqual([])
  })

  it('sperrt bei RDG-Befunden nicht, sondern warnt', () => {
    const e = pruefeVorExport(eingabe('Sie haben Anspruch auf Erstattung.'))
    expect(e.gesperrt).toBe(false)
    expect(e.zusammenfassung.warnt).toBeGreaterThan(0)
  })
})

describe('Hilfsfunktionen', () => {
  it('normalisiert deutsche Zahlschreibweise', () => {
    expect(normalisiereZahl('2.983,64')).toBe('2983.64')
    expect(normalisiereZahl('179,75')).toBe('179.75')
    expect(normalisiereZahl('22')).toBe('22')
    expect(normalisiereZahl('1.234')).toBe('1234')
  })

  it('lässt eine bereits normalisierte Zahl unverändert', () => {
    // Aus den Falldaten kommen Beträge mit Punkt als Dezimaltrennzeichen.
    // Würde er als Tausenderpunkt gelesen, wäre der Wert hundertfach zu gross.
    expect(normalisiereZahl('2983.64')).toBe('2983.64')
    expect(normalisiereZahl('179.75')).toBe('179.75')
  })

  it('findet Beträge im Fliesstext', () => {
    const z = findeZahlen('Von 2.983,64 € auf 2.706,19 € gekürzt, Differenz 277,45 €.')
    expect(z).toContain('2.983,64')
    expect(z).toContain('277,45')
  })
})

describe('Zusammenspiel', () => {
  it('sammelt Befunde über mehrere Positionen und zählt sie', () => {
    const e = pruefeVorExport({
      bausteine: [
        { positionNummer: 1, positionBezeichnung: 'A', text: 'Abzug von [Betrag]€.' },
        { positionNummer: 2, positionBezeichnung: 'B', text: 'Sie haben Anspruch auf Erstattung.' },
        { positionNummer: 3, positionBezeichnung: 'C', text: 'Die Erneuerung ist erforderlich.' },
      ],
      belegteZahlen: [],
      gesamttext: '',
    })
    expect(e.zusammenfassung.sperrt).toBe(1)
    expect(e.zusammenfassung.warnt).toBeGreaterThanOrEqual(1)
    expect(e.gesperrt).toBe(true)
    expect(e.befunde.map((b) => b.stelle)).toContain('Position 1 — A')
  })
})
