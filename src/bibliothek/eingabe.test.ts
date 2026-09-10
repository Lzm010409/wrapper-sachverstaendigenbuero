import { describe, expect, it } from 'vitest'
import { bereichEnum } from '@/db/schema'
import { BEREICHE, BEREICHSNAMEN, pruefeEingabe } from './eingabe'

const vollstaendig = {
  bereich: 'kalkulation',
  abschnitt: '1. Ersatzteile',
  titel: 'Halterung Stoßfänger',
  typischeBegruendung: 'Die Halterung sei wiederverwendbar.',
  gegenargument: 'Die Halterung ist ein Einwegteil.',
  vorgehen: '',
  hinweise: '',
}

describe('BEREICHE', () => {
  it('deckt sich mit dem Aufzählungstyp der Datenbank', () => {
    // Läuft eines von beiden weg, nimmt das Formular einen Bereich an, den
    // die Spalte nicht kennt — der Fehler käme erst beim Speichern.
    expect([...BEREICHE]).toEqual([...bereichEnum.enumValues])
  })

  it('hat für jeden Bereich einen Anzeigenamen', () => {
    for (const b of BEREICHE) expect(BEREICHSNAMEN[b]).toBeTruthy()
  })
})

describe('pruefeEingabe', () => {
  it('nimmt eine vollständige Eingabe an', () => {
    const ergebnis = pruefeEingabe(vollstaendig)
    expect(ergebnis.fehler).toBeUndefined()
    expect(ergebnis.sauber).toMatchObject({
      bereich: 'kalkulation',
      abschnitt: '1. Ersatzteile',
      titel: 'Halterung Stoßfänger',
      gegenargument: 'Die Halterung ist ein Einwegteil.',
    })
  })

  it('macht aus leeren Feldern NULL statt einer leeren Zeichenkette', () => {
    const { sauber } = pruefeEingabe(vollstaendig)
    expect(sauber?.vorgehen).toBeNull()
    expect(sauber?.hinweise).toBeNull()
  })

  it('schneidet Leerraum an allen Rändern ab', () => {
    const { sauber } = pruefeEingabe({
      ...vollstaendig,
      titel: '  Halterung  ',
      abschnitt: ' 1. Ersatzteile ',
    })
    expect(sauber?.titel).toBe('Halterung')
    expect(sauber?.abschnitt).toBe('1. Ersatzteile')
  })

  it('weist einen unbekannten Bereich ab', () => {
    const { fehler, sauber } = pruefeEingabe({ ...vollstaendig, bereich: 'quatsch' })
    expect(fehler).toBeTruthy()
    expect(sauber).toBeUndefined()
  })

  it('verlangt einen Titel', () => {
    expect(pruefeEingabe({ ...vollstaendig, titel: '   ' }).fehler).toMatch(/Titel/)
  })

  it('verlangt einen Abschnitt', () => {
    expect(pruefeEingabe({ ...vollstaendig, abschnitt: '' }).fehler).toMatch(/Abschnitt/)
  })

  it('verlangt Gegenargument oder Vorgehen — sonst liefert der Eintrag nichts', () => {
    const ohne = { ...vollstaendig, gegenargument: '', vorgehen: '' }
    expect(pruefeEingabe(ohne).fehler).toBeTruthy()
  })

  it('lässt ein Vorgehen ohne Gegenargument zu', () => {
    const nurVorgehen = {
      ...vollstaendig,
      gegenargument: '',
      vorgehen: 'Farbmessprotokoll anfordern.',
    }
    expect(pruefeEingabe(nurVorgehen).fehler).toBeUndefined()
  })

  it('weist einen überlangen Titel ab', () => {
    const { fehler } = pruefeEingabe({ ...vollstaendig, titel: 'A'.repeat(201) })
    expect(fehler).toMatch(/Titel/)
  })
})
