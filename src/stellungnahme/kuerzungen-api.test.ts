import { describe, expect, it } from 'vitest'
import type { behandlungEnum } from '@/db/schema'
import { kuerzungspositionenApi } from './kuerzungen-api'

function position(werte: {
  id: string
  bezeichnung: string
  seite?: number | null
  betragGutachten?: string | null
  betragGekuerzt?: string | null
  differenz?: string | null
  begruendungVersicherer?: string | null
  behandlung?: (typeof behandlungEnum.enumValues)[number]
}): {
  id: string
  bezeichnung: string
  seite: number | null
  betragGutachten: string | null
  betragGekuerzt: string | null
  differenz: string | null
  begruendungVersicherer: string | null
  behandlung: (typeof behandlungEnum.enumValues)[number]
} {
  return {
    seite: null,
    betragGutachten: null,
    betragGekuerzt: null,
    differenz: null,
    begruendungVersicherer: null,
    behandlung: 'offen',
    ...werte,
  }
}

describe('kuerzungspositionenApi', () => {
  it('liefert eine leere Liste und Nullsummen ohne Positionen', () => {
    const ergebnis = kuerzungspositionenApi([])
    expect(ergebnis.kuerzungspositionen).toEqual([])
    expect(ergebnis.kuerzungssummen).toEqual({
      summeGutachten: 0,
      summeGekuerzt: 0,
      summeDifferenz: 0,
    })
  })

  it('wandelt DB-Strings in gerundete Zahlen um und summiert über alle Positionen', () => {
    const ergebnis = kuerzungspositionenApi([
      position({
        id: 'p1',
        bezeichnung: 'Lackierlohn',
        seite: 3,
        betragGutachten: '150.555',
        betragGekuerzt: '100',
        differenz: '50.555',
        begruendungVersicherer: 'UPE-Aufschlag nicht üblich',
        behandlung: 'bestritten',
      }),
      position({
        id: 'p2',
        bezeichnung: 'Wertminderung',
        betragGutachten: '500',
        betragGekuerzt: '500',
        differenz: '0',
        behandlung: 'anerkannt',
      }),
    ])

    expect(ergebnis.kuerzungspositionen).toEqual([
      {
        id: 'p1',
        bezeichnung: 'Lackierlohn',
        seite: 3,
        betragGutachten: 150.56,
        betragGekuerzt: 100,
        differenz: 50.56,
        begruendungVersicherer: 'UPE-Aufschlag nicht üblich',
        behandlung: 'bestritten',
      },
      {
        id: 'p2',
        bezeichnung: 'Wertminderung',
        seite: null,
        betragGutachten: 500,
        betragGekuerzt: 500,
        differenz: 0,
        begruendungVersicherer: null,
        behandlung: 'anerkannt',
      },
    ])
    expect(ergebnis.kuerzungssummen).toEqual({
      summeGutachten: 650.56,
      summeGekuerzt: 600,
      summeDifferenz: 50.56,
    })
  })

  it('zählt eine fehlende Position mit 0 in die Summe, lässt sie in der Position selbst aber null', () => {
    const ergebnis = kuerzungspositionenApi([
      position({ id: 'p1', bezeichnung: 'Noch nicht beziffert' }),
      position({
        id: 'p2',
        bezeichnung: 'Kleinteile',
        betragGutachten: '20',
        betragGekuerzt: '10',
        differenz: '10',
      }),
    ])

    expect(ergebnis.kuerzungspositionen[0]).toMatchObject({
      betragGutachten: null,
      betragGekuerzt: null,
      differenz: null,
    })
    expect(ergebnis.kuerzungssummen).toEqual({
      summeGutachten: 20,
      summeGekuerzt: 10,
      summeDifferenz: 10,
    })
  })
})
