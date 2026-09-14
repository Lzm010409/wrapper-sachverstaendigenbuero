import { describe, expect, it } from 'vitest'
import {
  BULK_HOECHSTGRENZE,
  UNDO_FENSTER_SEKUNDEN,
  bewerteBereichswechsel,
  bewerteFreigabe,
  bewerteStatuswechsel,
  eintragUnveraendertSeitLauf,
  laufNochRueckgaengigMachbar,
  pruefeBulkAuswahl,
} from './bulk-regeln'

describe('pruefeBulkAuswahl', () => {
  it('weist eine leere Auswahl ab', () => {
    const ergebnis = pruefeBulkAuswahl([])
    expect('fehler' in ergebnis && ergebnis.fehler).toBeTruthy()
  })

  it('entfernt Duplikate', () => {
    const ergebnis = pruefeBulkAuswahl(['a', 'b', 'a'])
    expect('ids' in ergebnis && ergebnis.ids).toEqual(['a', 'b'])
  })

  it('weist eine Auswahl über der Obergrenze ab, ohne Teilausführung', () => {
    const ids = Array.from({ length: BULK_HOECHSTGRENZE + 1 }, (_, i) => `id-${i}`)
    const ergebnis = pruefeBulkAuswahl(ids)
    expect('fehler' in ergebnis && ergebnis.fehler).toContain(String(BULK_HOECHSTGRENZE))
  })

  it('nimmt die Auswahl genau an der Obergrenze an', () => {
    const ids = Array.from({ length: BULK_HOECHSTGRENZE }, (_, i) => `id-${i}`)
    const ergebnis = pruefeBulkAuswahl(ids)
    expect('ids' in ergebnis && ergebnis.ids).toHaveLength(BULK_HOECHSTGRENZE)
  })
})

describe('bewerteStatuswechsel', () => {
  const basis = { id: '1', nummer: '1.1', titel: 'Beispiel', version: 1 }

  it('lässt einen Entwurf in die Prüfung', () => {
    const { bearbeitbar, uebersprungen } = bewerteStatuswechsel(
      [{ ...basis, status: 'entwurf' }],
      'pruefung',
      false,
    )
    expect(bearbeitbar).toHaveLength(1)
    expect(uebersprungen).toHaveLength(0)
  })

  it('überspringt einen Eintrag, der schon auf dem Zielstatus steht', () => {
    const { bearbeitbar, uebersprungen } = bewerteStatuswechsel(
      [{ ...basis, status: 'pruefung' }],
      'pruefung',
      false,
    )
    expect(bearbeitbar).toHaveLength(0)
    expect(uebersprungen).toHaveLength(1)
  })

  it('verlangt für die Rücknahme einer Freigabe die Rolle „Freigeber"', () => {
    const ohneRecht = bewerteStatuswechsel([{ ...basis, status: 'freigegeben' }], 'entwurf', false)
    expect(ohneRecht.bearbeitbar).toHaveLength(0)
    expect(ohneRecht.uebersprungen[0]?.grund).toMatch(/Freigeber/)

    const mitRecht = bewerteStatuswechsel([{ ...basis, status: 'freigegeben' }], 'entwurf', true)
    expect(mitRecht.bearbeitbar).toHaveLength(1)
  })
})

describe('bewerteFreigabe', () => {
  const basis = { id: '1', nummer: '1.1', titel: 'Beispiel', version: 1 }

  it('gibt einen vollständigen Eintrag in Prüfung frei', () => {
    const { bearbeitbar, uebersprungen } = bewerteFreigabe([
      { ...basis, status: 'pruefung', hatText: true, unbestaetigteBelege: 0 },
    ])
    expect(bearbeitbar).toHaveLength(1)
    expect(uebersprungen).toHaveLength(0)
  })

  it('überspringt einen Entwurf — Bulk-Freigabe verlangt vorherige Prüfung', () => {
    const { bearbeitbar, uebersprungen } = bewerteFreigabe([
      { ...basis, status: 'entwurf', hatText: true, unbestaetigteBelege: 0 },
    ])
    expect(bearbeitbar).toHaveLength(0)
    expect(uebersprungen[0]?.grund).toMatch(/Prüfung/)
  })

  it('überspringt bei unbestätigten Fundstellen', () => {
    const { uebersprungen } = bewerteFreigabe([
      { ...basis, status: 'pruefung', hatText: true, unbestaetigteBelege: 2 },
    ])
    expect(uebersprungen[0]?.grund).toContain('2 unbestätigte')
  })

  it('überspringt ohne Gegenargument oder Vorgehen', () => {
    const { uebersprungen } = bewerteFreigabe([
      { ...basis, status: 'pruefung', hatText: false, unbestaetigteBelege: 0 },
    ])
    expect(uebersprungen[0]?.grund).toMatch(/Gegenargument/)
  })
})

describe('bewerteBereichswechsel', () => {
  const basis = { id: '1', nummer: '1.1', titel: 'Beispiel', version: 1 }

  it('lässt einen Wechsel in einen anderen Bereich zu', () => {
    const { bearbeitbar, uebersprungen } = bewerteBereichswechsel(
      [{ ...basis, bereich: 'kalkulation' }],
      'restwert',
    )
    expect(bearbeitbar).toHaveLength(1)
    expect(uebersprungen).toHaveLength(0)
  })

  it('überspringt, wer schon im Zielbereich steht', () => {
    const { bearbeitbar, uebersprungen } = bewerteBereichswechsel(
      [{ ...basis, bereich: 'restwert' }],
      'restwert',
    )
    expect(bearbeitbar).toHaveLength(0)
    expect(uebersprungen).toHaveLength(1)
  })
})

describe('laufNochRueckgaengigMachbar', () => {
  it('lässt Undo innerhalb des Zeitfensters zu', () => {
    const erstelltAm = new Date('2026-01-01T12:00:00Z')
    const jetzt = new Date(erstelltAm.getTime() + (UNDO_FENSTER_SEKUNDEN - 1) * 1000)
    expect(laufNochRueckgaengigMachbar(erstelltAm, jetzt)).toBe(true)
  })

  it('sperrt Undo nach Ablauf des Zeitfensters', () => {
    const erstelltAm = new Date('2026-01-01T12:00:00Z')
    const jetzt = new Date(erstelltAm.getTime() + (UNDO_FENSTER_SEKUNDEN + 1) * 1000)
    expect(laufNochRueckgaengigMachbar(erstelltAm, jetzt)).toBe(false)
  })
})

describe('eintragUnveraendertSeitLauf', () => {
  it('erkennt einen unveränderten Eintrag', () => {
    const zeit = new Date('2026-01-01T12:00:00Z')
    expect(eintragUnveraendertSeitLauf(zeit, zeit)).toBe(true)
  })

  it('erkennt eine Änderung nach dem Lauf', () => {
    const gesetzt = new Date('2026-01-01T12:00:00Z')
    const aktuell = new Date('2026-01-01T12:05:00Z')
    expect(eintragUnveraendertSeitLauf(aktuell, gesetzt)).toBe(false)
  })
})
