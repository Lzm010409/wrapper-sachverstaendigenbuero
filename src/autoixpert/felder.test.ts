import { describe, expect, it } from 'vitest'
import {
  formatiereDatum,
  leseFalldaten,
  platzhalterWerte,
  schlageEmpfaengerVor,
} from './felder'
import { BEISPIEL_GUTACHTEN, GUTACHTEN_MINIMAL, GUTACHTEN_OHNE_ANWALT } from './fixtures'

describe('leseFalldaten', () => {
  const d = leseFalldaten(BEISPIEL_GUTACHTEN)

  it('nimmt das Aktenzeichen aus token, nicht aus external_id', () => {
    expect(d.aktenzeichen).toBe('GA-2026-0147')
    expect(d.externeId).toBeNull()
  })

  it('übersetzt Gutachtentyp und Zustand', () => {
    expect(d.gutachtenTyp).toBe('Haftpflichtschaden')
    expect(d.zustand).toBe('aufgenommen')
  })

  it('bevorzugt bei Beteiligten den Firmennamen', () => {
    expect(d.anwalt?.name).toBe('Kanzlei Schmitt & Partner')
    expect(d.versicherung?.name).toBe('Musterversicherung AG')
  })

  it('setzt bei Privatpersonen den Personennamen', () => {
    expect(d.anspruchsteller?.name).toBe('Anna Marie Meyer')
  })

  it('nimmt die abgelesene Laufleistung vor der angegebenen und geschätzten', () => {
    expect(d.fahrzeug.laufleistung).toBe(68450)
  })

  it('liest die Schadennummer der Versicherung', () => {
    expect(d.versicherung?.schadennummer).toBe('SCH-77-2026-4412')
  })

  it('erfindet nichts, wenn das Gutachten leer ist', () => {
    const m = leseFalldaten(GUTACHTEN_MINIMAL)
    expect(m.aktenzeichen).toBeNull()
    expect(m.anspruchsteller).toBeNull()
    expect(m.anwalt).toBeNull()
    expect(m.versicherung).toBeNull()
    expect(m.fahrzeug.hersteller).toBeNull()
    expect(m.unfall.datum).toBeNull()
    expect(m.externeId).toBe('FREMD-99')
  })
})

describe('formatiereDatum', () => {
  it('wandelt ISO nach deutscher Schreibweise', () => {
    expect(formatiereDatum('2026-02-27')).toBe('27.02.2026')
    expect(formatiereDatum('2026-02-27T11:01:31.667Z')).toBe('27.02.2026')
  })

  it('lässt Unbekanntes unverändert und Leeres leer', () => {
    expect(formatiereDatum(null)).toBeNull()
    expect(formatiereDatum('unklar')).toBe('unklar')
  })
})

describe('platzhalterWerte', () => {
  const werte = platzhalterWerte(leseFalldaten(BEISPIEL_GUTACHTEN))

  it('füllt die Platzhalter der Bibliothek', () => {
    expect(werte.Marke).toBe('Volkswagen')
    expect(werte.Kennzeichen).toBe('KR-AM-123')
    expect(werte.Erstzulassung).toBe('15.06.2021')
    expect(werte.Laufleistung).toBe('68.450 km')
    expect(werte.Unfalltag).toBe('27.02.2026')
    expect(werte.Schadennummer).toBe('SCH-77-2026-4412')
  })

  it('lässt fehlende Werte weg, statt sie leer zu setzen', () => {
    const leer = platzhalterWerte(leseFalldaten(GUTACHTEN_MINIMAL))
    expect(Object.keys(leer)).toHaveLength(0)
  })
})

describe('schlageEmpfaengerVor', () => {
  it('schlägt die Kanzlei vor, wenn eine hinterlegt ist', () => {
    const v = schlageEmpfaengerVor(leseFalldaten(BEISPIEL_GUTACHTEN))
    expect(v.herkunft).toBe('anwalt')
    expect(v.empfaenger?.name).toBe('Kanzlei Schmitt & Partner')
    expect(v.betreff).toBe('Stellungnahme Abrechnung Anna Marie Meyer')
  })

  it('weicht auf die Versicherung aus, wenn keine Kanzlei da ist', () => {
    const v = schlageEmpfaengerVor(leseFalldaten(GUTACHTEN_OHNE_ANWALT))
    expect(v.herkunft).toBe('versicherung')
    expect(v.empfaenger?.name).toBe('Musterversicherung AG')
  })

  it('schlägt niemanden vor, wenn nichts hinterlegt ist', () => {
    const v = schlageEmpfaengerVor(leseFalldaten(GUTACHTEN_MINIMAL))
    expect(v.empfaenger).toBeNull()
    expect(v.herkunft).toBeNull()
    expect(v.betreff).toBeNull()
  })
})
