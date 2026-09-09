import { describe, expect, it } from 'vitest'
import { leseSortierung, mitSortierung } from './sortierung'

const FELDER = ['datum', 'name'] as const

describe('leseSortierung', () => {
  it('nimmt ein bekanntes Feld mit aufsteigender Richtung an', () => {
    expect(leseSortierung({ sortiert: 'name', richtung: 'aufsteigend' }, FELDER)).toEqual({
      feld: 'name',
      richtung: 'aufsteigend',
    })
  })

  it('nimmt ein bekanntes Feld mit absteigender Richtung an', () => {
    expect(leseSortierung({ sortiert: 'name', richtung: 'absteigend' }, FELDER)).toEqual({
      feld: 'name',
      richtung: 'absteigend',
    })
  })

  it('faellt ohne Angabe auf die Standardsortierung zurueck', () => {
    expect(leseSortierung({}, FELDER)).toBeNull()
  })

  it('faellt bei unbekanntem Feld auf die Standardsortierung zurueck', () => {
    // Ein alter Verweis oder ein Tippfehler in der Adresse - keine leere
    // Seite, sondern die Standardsortierung, wie bei einem unbekannten Reiter.
    expect(leseSortierung({ sortiert: 'unbekannt' }, FELDER)).toBeNull()
    expect(leseSortierung({ sortiert: '__proto__' }, FELDER)).toBeNull()
  })

  it('nimmt jede fehlende oder falsche Richtung als aufsteigend', () => {
    expect(leseSortierung({ sortiert: 'name' }, FELDER)?.richtung).toBe('aufsteigend')
    expect(leseSortierung({ sortiert: 'name', richtung: 'seitwaerts' }, FELDER)?.richtung).toBe(
      'aufsteigend',
    )
  })
})

describe('mitSortierung', () => {
  it('setzt sortiert und richtung, ohne bestehende Parameter zu verlieren', () => {
    const bestehend = new URLSearchParams('suche=BMW&zustand=recorded')
    const naechste = mitSortierung(bestehend, { feld: 'datum', richtung: 'absteigend' })
    expect(naechste.get('suche')).toBe('BMW')
    expect(naechste.get('zustand')).toBe('recorded')
    expect(naechste.get('sortiert')).toBe('datum')
    expect(naechste.get('richtung')).toBe('absteigend')
  })

  it('nimmt sortiert und richtung wieder heraus, wenn der Stand null ist', () => {
    const bestehend = new URLSearchParams('suche=BMW&sortiert=datum&richtung=absteigend')
    const naechste = mitSortierung(bestehend, null)
    expect(naechste.get('suche')).toBe('BMW')
    expect(naechste.has('sortiert')).toBe(false)
    expect(naechste.has('richtung')).toBe(false)
  })

  it('laesst die uebergebenen Parameter unveraendert', () => {
    // `mitSortierung` baut eine neue Instanz - sonst aendert sich unter der
    // Hand ein Wert, den der Aufrufer (z.B. `useSearchParams()`) noch besitzt.
    const bestehend = new URLSearchParams('suche=BMW')
    mitSortierung(bestehend, { feld: 'datum', richtung: 'aufsteigend' })
    expect(bestehend.has('sortiert')).toBe(false)
  })
})
