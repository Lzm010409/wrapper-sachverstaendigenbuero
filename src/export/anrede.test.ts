import { describe, expect, it } from 'vitest'
import { baueAnrede, istVorlagenAnrede, istVorlagenEinleitung } from './hausstil'

describe('baueAnrede', () => {
  it('macht aus einer Rechtsanwältin eine Frau', () => {
    expect(baueAnrede('Rechtsanwältin Claudia Busch')).toBe('Sehr geehrte Frau Busch,')
  })

  it('macht aus einem Rechtsanwalt einen Herrn', () => {
    expect(baueAnrede('Rechtsanwalt Peter Müller')).toBe('Sehr geehrter Herr Müller,')
  })

  it('nimmt „Frau" und „Herrn" genauso', () => {
    expect(baueAnrede('Frau Dr. Sabine Wenzel')).toBe('Sehr geehrte Frau Wenzel,')
    expect(baueAnrede('Herrn Jan Petersen')).toBe('Sehr geehrter Herr Petersen,')
  })

  /*
    Der wichtigste Fall, und der Grund für die ganze Zurückhaltung: aus
    einem Vornamen auf die Anrede zu schliessen geht regelmässig schief. Ein
    Brief, der den Empfänger falsch anredet, ist schlimmer als einer, der
    ihn gar nicht anredet — also lieber die Standardanrede.
  */
  it('rät nicht am Vornamen', () => {
    expect(baueAnrede('Claudia Busch')).toBeNull()
    expect(baueAnrede('Kim Berger')).toBeNull()
  })

  it('redet keine Firma an', () => {
    expect(baueAnrede('HUK-Coburg Versicherung AG')).toBeNull()
    expect(baueAnrede('Kanzlei Meier & Partner')).toBeNull()
    expect(baueAnrede('Autohaus Muster GmbH')).toBeNull()
    // Auch dann nicht, wenn eine Anredeform darin vorkommt.
    expect(baueAnrede('Rechtsanwalt Meier & Partner mbB')).toBeNull()
  })

  it('kommt mit Leerem zurecht', () => {
    expect(baueAnrede('')).toBeNull()
    expect(baueAnrede(null)).toBeNull()
    expect(baueAnrede('Frau')).toBeNull()
  })
})

describe('istVorlagenAnrede', () => {
  it('erkennt nur die unbeschriebene Vorlage', () => {
    expect(istVorlagenAnrede('Sehr geehrte Damen und Herren,')).toBe(true)
    expect(istVorlagenAnrede('')).toBe(true)
    expect(istVorlagenAnrede('   ')).toBe(true)
  })

  /*
    Der teuer bezahlte Fall. Eine Anrede auf einen Namen sieht aus wie
    etwas Gebautes — und ist doch meistens von Hand gesetzt. Wer sie
    ersetzt, nimmt jemandem seine Eingabe weg, nachdem die Anwendung
    „gespeichert" gemeldet hat.
  */
  it('hält eine Anrede auf einen Namen für Selbstgeschriebenes', () => {
    expect(istVorlagenAnrede('Sehr geehrter Herr Schmidt,')).toBe(false)
    expect(istVorlagenAnrede('Sehr geehrte Frau Busch,')).toBe(false)
    expect(istVorlagenAnrede('Liebe Frau Busch,')).toBe(false)
  })
})

describe('istVorlagenEinleitung', () => {
  it('erkennt den gebauten Satz', () => {
    expect(
      istVorlagenEinleitung(
        'mit der Mail vom 17.07.2026 überließen Sie uns das Abrechnungsschreiben des Versicherers mit der Bitte um Stellungnahme. Hierzu machen wir folgende Feststellungen:',
      ),
    ).toBe(true)
    expect(istVorlagenEinleitung('')).toBe(true)
  })

  it('lässt einen selbst geschriebenen Absatz stehen', () => {
    expect(istVorlagenEinleitung('wie am Telefon besprochen, hier unsere Stellungnahme.')).toBe(
      false,
    )
  })
})
