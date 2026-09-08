import { describe, expect, it } from 'vitest'
import { korbgroesse, vereineRohtreffer } from './lauf'

/**
 * Der Lauf vom 08.09.2026, Fall 0826/2072TG (VW Sharan).
 *
 * Zyklus 1 holte 15 Treffer bei AutoScout24 und 40 bei Kleinanzeigen,
 * Zyklus 2 weitere 40 bei Kleinanzeigen — 94 verschiedene Inserate, alle von
 * der KI geprüft, 8 davon aufnehmbar. Der Trichter der Auswertung begann
 * trotzdem bei **55**.
 *
 * Der Grund lag in `run-report.js`: die Quellen werden dort nach Portalnamen
 * abgelegt (`rawBySource[src] = loadItems(file)`), und zwei Zyklen desselben
 * Portals überschreiben einander. Ein ganzer Kleinanzeigen-Zyklus fiel weg,
 * ohne dass irgendeine Zahl im Protokoll es verriet.
 *
 * Deshalb geht je Portal nur noch **eine** Datei in die Auswertung.
 */
const A = { url: 'https://www.kleinanzeigen.de/s-anzeige/sharan-a/1', preis: 9990 }
const B = { url: 'https://www.kleinanzeigen.de/s-anzeige/sharan-b/2', preis: 8500 }
const C = { url: 'https://www.kleinanzeigen.de/s-anzeige/sharan-c/3', preis: 7200 }

describe('vereineRohtreffer', () => {
  it('vereint die Zyklen desselben Portals, statt sie zu ersetzen', () => {
    expect(vereineRohtreffer([A], [B, C])).toEqual([A, B, C])
  })

  it('lässt ein Fahrzeug nicht zweimal in den Korb', () => {
    // Zyklus 2 sucht mit weiteren Toleranzen und findet die Fahrzeuge aus
    // Zyklus 1 erneut. Ohne Abgleich stünde jedes doppelt im Median.
    expect(vereineRohtreffer([A, B], [B, C])).toEqual([A, B, C])
  })

  it('erkennt dasselbe Fahrzeug an der id, wo die Adresse fehlt', () => {
    const mitId = { id: 4711, titel: 'Sharan' }
    expect(vereineRohtreffer([mitId], [{ id: 4711, titel: 'Sharan (aktualisiert)' }])).toEqual([
      mitId,
    ])
  })

  it('behält das erste Vorkommen — der frühere Zyklus hat die engeren Toleranzen', () => {
    const frueh = { url: 'https://x/1', preis: 9990 }
    const spaet = { url: 'https://x/1', preis: 1 }
    expect(vereineRohtreffer([frueh], [spaet])).toEqual([frueh])
  })

  it('kommt mit leeren Listen zurecht', () => {
    expect(vereineRohtreffer([], [])).toEqual([])
    expect(vereineRohtreffer([], [A])).toEqual([A])
    expect(vereineRohtreffer([A], [])).toEqual([A])
  })

  it('wirft nichts weg, was keine Kennung hat', () => {
    // Zwei verschiedene Inserate ohne Adresse und ohne id dürfen nicht zu
    // einem verschmelzen, nur weil beide keine Kennung tragen.
    const ohne1 = { titel: 'Sharan 2.0 TDI', preis: 9990 }
    const ohne2 = { titel: 'Sharan 1.4 TSI', preis: 8500 }
    expect(vereineRohtreffer([ohne1], [ohne2])).toHaveLength(2)
  })
})

describe('korbgroesse', () => {
  /*
    Warum das gebraucht wird: die Abbruchbedingung zaehlte bisher, was die
    KI-Pruefung fuer brauchbar hielt. Im Lauf vom 08.09.2026 meldete sie
    "8 brauchbare Vergleichsfahrzeuge — weitere Zyklen nicht noetig", waehrend
    im Korb ein einziges Fahrzeug stand. Die KI urteilt fachlich, der Korb
    entsteht aus Toleranz-, Linien-, Karosserie- und Getriebefilter — zwei
    verschiedene Zahlen, und nur die zweite steht am Ende im Gutachten.
  */
  it('liest die Zahl aus der Statistik der Auswertung', () => {
    expect(korbgroesse({ statistik: { imKorb: 7 }, korb: [1, 2] })).toBe(7)
  })

  it('faellt auf die Laenge des Korbs zurueck', () => {
    expect(korbgroesse({ korb: [1, 2, 3] })).toBe(3)
  })

  it('nimmt eine unbrauchbare Auswertung als leeren Korb', () => {
    expect(korbgroesse(null)).toBe(0)
    expect(korbgroesse({})).toBe(0)
    expect(korbgroesse({ statistik: { imKorb: 'viele' } })).toBe(0)
  })
})
