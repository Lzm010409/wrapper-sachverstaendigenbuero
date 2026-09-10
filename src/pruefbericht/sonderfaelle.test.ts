import { describe, expect, it } from 'vitest'
import { findeKennzeichen, pruefeSonderfaelle } from './sonderfaelle'
import { BUENDEL_MIT_HONORAR, EINFACHER_BERICHT } from './fixtures'
import { differenz, gesamtdifferenz } from './schema'

function finde(befunde: ReturnType<typeof pruefeSonderfaelle>, kennung: string) {
  return befunde.find((b) => b.kennung === kennung)
}

describe('B.1 — Bündelung mit unfallfremden Abschnitten', () => {
  it('meldet die Honorarkürzung als nicht zur Stellungnahme gehörend', () => {
    const b = finde(pruefeSonderfaelle(BUENDEL_MIT_HONORAR, 'VW Passat, XX-YY 111'), 'B.1')
    expect(b).toBeDefined()
    expect(b!.dringlichkeit).toBe('wichtig')
    expect(b!.befund).toMatch(/Sachverständigenhonorar/i)
    expect(b!.befund).toMatch(/S\. 1–2/)
  })

  it('schweigt, wenn die Sendung nur den Prüfbericht enthält', () => {
    expect(finde(pruefeSonderfaelle(EINFACHER_BERICHT, null), 'B.1')).toBeUndefined()
  })
})

describe('findeKennzeichen', () => {
  it('findet gängige Schreibweisen', () => {
    expect(findeKennzeichen('Amtl. Kennzeichen: KR-AR 225')).toBe('KR-AR 225')
    expect(findeKennzeichen('D-XY-4711 beteiligt')).toBe('D-XY-4711')
    expect(findeKennzeichen('Fahrzeug XX YY 111')).toBe('XX YY 111')
    expect(findeKennzeichen('Elektro: B-AX 2025E')).toBe('B-AX 2025E')
  })

  it('hält eine Typbezeichnung nicht für ein Kennzeichen', () => {
    // Genau dieser Text steht im DEKRA-Bericht und hat eine lockerere
    // Fassung dieser Erkennung zu einem Fehlalarm verleitet.
    expect(findeKennzeichen('Passat Variant (3B6 ab 11.00)')).toBeNull()
    expect(findeKennzeichen('Golf VII 2.0 TDI')).toBeNull()
    expect(findeKennzeichen('')).toBeNull()
    expect(findeKennzeichen(null)).toBeNull()
  })
})

describe('B.7 — Grundlagenfehler durch falsches Fahrzeug', () => {
  it('schlägt bei abweichendem Kennzeichen an', () => {
    const b = finde(pruefeSonderfaelle(BUENDEL_MIT_HONORAR, 'VW Passat, KR-AB 999'), 'B.7')
    expect(b).toBeDefined()
    expect(b!.dringlichkeit).toBe('wichtig')
    expect(b!.befund).toMatch(/XX-YY 111/)
    expect(b!.befund).toMatch(/KR-AB 999/)
  })

  it('schweigt bei übereinstimmendem Kennzeichen', () => {
    expect(finde(pruefeSonderfaelle(BUENDEL_MIT_HONORAR, 'VW Passat Variant XX-YY 111'), 'B.7'))
      .toBeUndefined()
  })

  it('ist unempfindlich gegen Bindestrich und Leerzeichen', () => {
    expect(finde(pruefeSonderfaelle(BUENDEL_MIT_HONORAR, 'Passat XX YY 111'), 'B.7'))
      .toBeUndefined()
  })

  it('meldet, wenn sich gar nicht abgleichen lässt', () => {
    const b = finde(pruefeSonderfaelle(BUENDEL_MIT_HONORAR, null), 'B.7')
    expect(b?.dringlichkeit).toBe('hinweis')
    expect(b?.befund).toMatch(/kein Kennzeichen/)
  })
})

describe('B.4 — Sammelpositionen', () => {
  it('meldet eine Position aus mehreren Zeilen', () => {
    const b = finde(pruefeSonderfaelle(EINFACHER_BERICHT, null), 'B.4')
    expect(b).toBeDefined()
    expect(b!.befund).toMatch(/Beilackierung/)
    expect(b!.handlung).toMatch(/Teilsplit/)
  })
})

describe('Summenabgleich', () => {
  it('meldet, wenn die Positionen die ausgewiesene Kürzung nicht erklären', () => {
    // Beim Werkstattvergleich verteilt sich die Kürzung über die ganze
    // Kalkulation: 277,45 € Gesamtkürzung, die Sätze allein ergeben weniger.
    const b = finde(pruefeSonderfaelle(BUENDEL_MIT_HONORAR, null), 'Summen')
    expect(b).toBeDefined()
    expect(b!.befund).toMatch(/277\.45|277,45/)
    expect(b!.handlung).toMatch(/Werkstattvergleich/)
  })

  it('schweigt, wenn die Summen aufgehen', () => {
    // 55 + 65 = 120 = 1000 − 880
    expect(finde(pruefeSonderfaelle(EINFACHER_BERICHT, null), 'Summen')).toBeUndefined()
  })
})

describe('Beträge', () => {
  it('meldet Positionen ohne bezifferte Kürzung', () => {
    const ohneBetrag = {
      ...EINFACHER_BERICHT,
      positionen: [
        { ...EINFACHER_BERICHT.positionen[0]!, betragGekuerzt: null },
        EINFACHER_BERICHT.positionen[1]!,
      ],
    }
    const b = finde(pruefeSonderfaelle(ohneBetrag, null), 'Beträge')
    expect(b).toBeDefined()
    expect(b!.befund).toMatch(/1 von 2/)
  })
})

describe('Reihenfolge', () => {
  it('stellt Wichtiges nach vorn', () => {
    const befunde = pruefeSonderfaelle(BUENDEL_MIT_HONORAR, 'VW Passat, KR-AB 999')
    expect(befunde[0]!.dringlichkeit).toBe('wichtig')
    const raenge = befunde.map((b) => b.dringlichkeit)
    expect(raenge.indexOf('hinweis') === -1 || raenge.indexOf('hinweis') > raenge.indexOf('pruefen'))
      .toBe(true)
  })
})

describe('Beträge rechnen', () => {
  it('bildet die Differenz je Position', () => {
    expect(differenz(EINFACHER_BERICHT.positionen[0]!)).toBe(55)
    expect(differenz({ ...EINFACHER_BERICHT.positionen[0]!, betragGutachten: null })).toBeNull()
  })

  it('summiert ohne Rundungsfehler', () => {
    expect(gesamtdifferenz(EINFACHER_BERICHT.positionen)).toBe(120)
    expect(gesamtdifferenz(BUENDEL_MIT_HONORAR.positionen)).toBe(53.99)
  })
})
