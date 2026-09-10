import { describe, expect, it } from 'vitest'
import { naechsteNummer, zerlegeNummer } from './nummer'

describe('zerlegeNummer', () => {
  it('liest die zweistufige Gliederung „1.2"', () => {
    expect(zerlegeNummer('1.2')).toEqual({ praefix: '', teile: [1, 2] })
  })

  it('liest die einstufige Gliederung „7"', () => {
    expect(zerlegeNummer('7')).toEqual({ praefix: '', teile: [7] })
  })

  it('behält den Buchstabenteil der Sonderfall-Notation „B.7"', () => {
    expect(zerlegeNummer('B.7')).toEqual({ praefix: 'B.', teile: [7] })
  })

  it('liest die dreistufige Gliederung „1.2.3"', () => {
    // `teileUeberschrift` im Parser lässt beliebig viele Ebenen zu; eine
    // Vergabe, die nur zwei kennt, würde daraus einen neuen Hauptzweig machen.
    expect(zerlegeNummer('1.2.3')).toEqual({ praefix: '', teile: [1, 2, 3] })
  })

  it('liest den blossen Buchstaben „A" — den trägt die Vorbemerkung', () => {
    expect(zerlegeNummer('A')).toEqual({ praefix: 'A.', teile: [] })
  })

  it('gibt null zurück, wenn keine Nummer erkennbar ist', () => {
    expect(zerlegeNummer('')).toBeNull()
    expect(zerlegeNummer('Vorbemerkung')).toBeNull()
  })

  it('weist unsinnig grosse Zahlen ab, statt sie in Gleitkomma zu verlieren', () => {
    // `Number('10000000000000000000000')` ist 1e22: die Nummer liesse sich
    // weder darstellen noch hochzählen — `1e22 + 1 === 1e22`.
    expect(zerlegeNummer('10000000000000000000000')).toBeNull()
  })
})

describe('naechsteNummer', () => {
  const kalkulation = [
    { nummer: '1.1', abschnitt: '1. Ersatzteile' },
    { nummer: '1.2', abschnitt: '1. Ersatzteile' },
    { nummer: '1.10', abschnitt: '1. Ersatzteile' },
    { nummer: '2.1', abschnitt: '2. Lackierung' },
  ]

  it('zählt im bestehenden Abschnitt die Unternummer hoch', () => {
    expect(naechsteNummer(kalkulation, '1. Ersatzteile')).toBe('1.11')
  })

  it('zählt dabei numerisch, nicht alphabetisch', () => {
    // Alphabetisch stünde „1.9" hinter „1.10" und die nächste wäre fälschlich „1.10".
    const mit9 = [...kalkulation, { nummer: '1.9', abschnitt: '1. Ersatzteile' }]
    expect(naechsteNummer(mit9, '1. Ersatzteile')).toBe('1.11')
  })

  it('eröffnet für einen neuen Abschnitt die nächste Hauptnummer', () => {
    expect(naechsteNummer(kalkulation, '3. Verbringung')).toBe('3.1')
  })

  it('vergibt in einem leeren Bereich die erste Nummer', () => {
    expect(naechsteNummer([], '1. Irgendwas')).toBe('1.1')
  })

  it('bleibt bei einstufiger Gliederung einstufig', () => {
    const sonderfaelle = [
      { nummer: 'B.7', abschnitt: 'Teil B: Strukturelle Sonderfälle' },
      { nummer: 'B.8', abschnitt: 'Teil B: Strukturelle Sonderfälle' },
    ]
    expect(naechsteNummer(sonderfaelle, 'Teil B: Strukturelle Sonderfälle')).toBe('B.9')
  })

  it('setzt eine dreistufige Gliederung dreistufig fort', () => {
    const tief = [
      { nummer: '1.1', abschnitt: '1. Ersatzteile' },
      { nummer: '1.2.1', abschnitt: '1.2 Halterungen' },
      { nummer: '1.2.2', abschnitt: '1.2 Halterungen' },
    ]
    expect(naechsteNummer(tief, '1.2 Halterungen')).toBe('1.2.3')
  })

  it('weicht dem Bestand aus, wenn die errechnete Nummer schon vergeben ist', () => {
    // 1.3 gehört zu einem anderen Abschnitt — die Nummer ist trotzdem belegt,
    // und der eindeutige Index über (Bereich, Nummer) würde das Anlegen
    // abweisen.
    const schief = [
      { nummer: '1.1', abschnitt: '1. Ersatzteile' },
      { nummer: '1.2', abschnitt: '1. Ersatzteile' },
      { nummer: '1.3', abschnitt: '2. Lackierung' },
    ]
    expect(naechsteNummer(schief, '1. Ersatzteile')).toBe('1.4')
  })

  it('erkennt den Abschnitt unabhängig von Leerraum und Grossschreibung', () => {
    expect(naechsteNummer(kalkulation, '  1. ersatzteile  ')).toBe('1.11')
  })

  /*
    Die Fälle, die der Bestand dieses Repos tatsächlich hergibt oder die
    beim Gegenlesen aufgefallen sind.
  */

  it('hält einen Abschnitt nicht für neu, nur weil seine Nummer unlesbar ist', () => {
    // Der Bereich `sonderfall` enthält genau das: Eintrag „A" im Abschnitt
    // „Teil A: Vorbemerkung" (parser.ts). Wurde er übergangen, sah der
    // Abschnitt leer aus und der neue Eintrag bekam die Fortsetzung von
    // Teil B — eine Nummer aus einem fremden Abschnitt.
    const sonderfaelle = [
      { nummer: 'A', abschnitt: 'Teil A: Vorbemerkung' },
      { nummer: 'B.7', abschnitt: 'Teil B: Strukturelle Sonderfälle' },
      { nummer: 'B.8', abschnitt: 'Teil B: Strukturelle Sonderfälle' },
    ]
    expect(naechsteNummer(sonderfaelle, 'Teil A: Vorbemerkung')).toBe('A.1')
  })

  it('führt einen Abschnitt fort, in dem gar keine Nummer lesbar ist', () => {
    const ohneNummern = [{ nummer: 'Vorbemerkung', abschnitt: 'Teil A' }]
    expect(naechsteNummer(ohneNummern, 'Teil A')).toBe('1.1')
  })

  it('liefert dasselbe, in welcher Reihenfolge der Bestand auch kommt', () => {
    // Die Abfrage liest ohne festgelegte Reihenfolge; Postgres darf sie nach
    // einem UPDATE oder VACUUM ändern. Eine Vergabe, die davon abhängt, ist
    // nicht nachvollziehbar.
    const gemischt = [
      { nummer: 'A.1', abschnitt: 'Teil A' },
      { nummer: 'A.2', abschnitt: 'Teil A' },
      { nummer: 'B.1', abschnitt: 'Teil B' },
      { nummer: 'B.2', abschnitt: 'Teil B' },
    ]
    const vorwaerts = naechsteNummer(gemischt, 'Teil C')
    const rueckwaerts = naechsteNummer([...gemischt].reverse(), 'Teil C')
    expect(rueckwaerts).toBe(vorwaerts)
  })

  it('hängt einen neuen Abschnitt hinter den letzten, nicht in einen früheren hinein', () => {
    // „A.4" wäre frei, läge aber mitten in Teil A — ein neuer Abschnitt
    // gehört ans Ende der Gliederung, nicht in die Mitte einer fremden.
    const gemischt = [
      { nummer: 'A.1', abschnitt: 'Teil A' },
      { nummer: 'A.2', abschnitt: 'Teil A' },
      { nummer: 'A.3', abschnitt: 'Teil A' },
      { nummer: 'B.1', abschnitt: 'Teil B' },
      { nummer: 'B.2', abschnitt: 'Teil B' },
    ]
    expect(naechsteNummer(gemischt, 'Teil C')).toBe('B.3')
  })

  it('richtet sich im Abschnitt nach dessen höchster Nummer, nicht nach der Mehrheit', () => {
    const uneinheitlich = [
      { nummer: '1.1', abschnitt: 'Ersatzteile' },
      { nummer: '1.2', abschnitt: 'Ersatzteile' },
      { nummer: '2.5', abschnitt: 'Ersatzteile' },
      { nummer: '2.6', abschnitt: 'Ersatzteile' },
      { nummer: '2.7', abschnitt: 'Ersatzteile' },
      { nummer: '1.3', abschnitt: 'Lackierung' },
    ]
    expect(naechsteNummer(uneinheitlich, 'Ersatzteile')).toBe('2.8')
  })

  it('bleibt bei einer unsinnig grossen Nummer im Bestand stehen statt sich aufzuhängen', () => {
    // Eine solche Zeichenkette käme durch `teileUeberschrift` und stünde in
    // der Textspalte. Sie wird übergangen; früher entstand daraus „1e+22"
    // und danach eine Schleife, die nie endet.
    const kaputt = [
      { nummer: '10000000000000000000000', abschnitt: 'X' },
      { nummer: '1.1', abschnitt: 'X' },
    ]
    expect(naechsteNummer(kaputt, 'X')).toBe('1.2')
  })

  it('liefert immer eine Nummer, die dem Muster des Parsers genügt', () => {
    const muster = /^(?:[A-Z]\.)?\d+(?:\.\d+)*$/
    const bestaende = [
      [],
      [{ nummer: 'A', abschnitt: 'Teil A' }],
      [{ nummer: 'Unfug', abschnitt: 'Teil A' }],
      [{ nummer: '9'.repeat(30), abschnitt: 'Teil A' }],
      [{ nummer: '1.2.3.4.5', abschnitt: 'Tief' }],
    ]
    for (const bestand of bestaende) {
      for (const abschnitt of ['Teil A', 'Ganz neu', 'Tief']) {
        expect(naechsteNummer(bestand, abschnitt)).toMatch(muster)
      }
    }
  })
})
