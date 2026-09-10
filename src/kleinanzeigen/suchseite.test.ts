import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  leseGesamtzahl,
  leseSeitenzahl,
  leseTreffer,
  leseZeitpunkt,
  setzeSeite,
} from './suchseite'

/**
 * Geprüft wird gegen die **echte** Antwort von Kleinanzeigen vom 07.09.2026
 * (siehe `tests/fixtures/LIESMICH.md`). Eine erfundene Seite würde nur
 * beweisen, dass der Leser die Erfindung versteht.
 */
const seite = readFileSync(
  join(process.cwd(), 'tests/fixtures/kleinanzeigen-suchseite.html'),
  'utf8',
)

describe('Trefferliste', () => {
  const treffer = leseTreffer(seite)

  it('findet alle Trefferkarten', () => {
    expect(treffer).toHaveLength(5)
  })

  it('liest den Titel aus der Überschrift, nicht aus dem Bildverweis', () => {
    // Der Bildverweis trägt als Text nur die Anzahl der Fotos („15"). Wer
    // den ersten Anker nimmt, bekommt genau das als Titel.
    expect(treffer[0]?.title).toBe('Mercedes-Benz W123 300 D Limo (1978) 1. Hand, Serie 1 !!!!!')
    expect(treffer.map((t) => t.title)).not.toContain('15')
  })

  it('liest Nummer und Adresse der Anzeige', () => {
    expect(treffer[1]?.adid).toBe('3455356908')
    expect(treffer[1]?.url).toBe(
      'https://www.kleinanzeigen.de/s-anzeige/mercedes-glk-220-cdi-4matic-ahk-xenon-navi-pdc-tuev-service-neu/3455356908-216-2469',
    )
  })

  it('liest Preis und Ort', () => {
    expect(treffer[1]?.price).toBe('10999')
    expect(treffer[1]?.location).toBe('27755 Delmenhorst')
  })

  it('lässt den Preis leer, wo die Anzeige nur „VB" nennt', () => {
    const ohnePreis = treffer.find((t) => t.adid === '3484742177')
    expect(ohnePreis?.price).toBe('')
  })

  it('nimmt auch lange Ortsnamen mit', () => {
    // 46 Zeichen — bei einer Schranke von 40 fiel dieser Ort still heraus.
    const lang = treffer.find((t) => t.adid === '3506599396')
    expect(lang?.location).toBe('81477 Thalk.Obersendl.-Forsten-Fürstenr.-Solln')
  })

  it('trägt Laufleistung und Erstzulassung schon in der Liste', () => {
    // Der ausgelagerte Dienst musste dafür je Anzeige eine Detailseite holen.
    expect(treffer[1]?.kilometerstand).toBe(210_000)
    expect(treffer[1]?.erstzulassung).toBe('03/2009')
    expect(treffer.every((t) => t.kilometerstand !== null)).toBe(true)
  })

  it('nimmt die Beschreibung aus der eingebetteten Beschreibung der Karte', () => {
    expect(treffer[1]?.description).toContain('Mercedes GLK 220 CDI 4 Matic')
  })
})

describe('Zusammenfassung und Seitenzahl', () => {
  it('liest die Gesamtzahl der Treffer', () => {
    // „1 - 25 von 93.071 Mercedes Benz Gebrauchtwagen in Deutschland"
    expect(leseGesamtzahl(seite)).toBe(93_071)
  })

  it('liest die höchste angebotene Seite aus der Nummerierung', () => {
    expect(leseSeitenzahl(seite)).toBe(10)
  })

  it('gibt null zurück, wo keine Zusammenfassung steht', () => {
    expect(leseGesamtzahl('<html><body>nichts</body></html>')).toBeNull()
    expect(leseSeitenzahl('<html><body>nichts</body></html>')).toBeNull()
  })
})

describe('Zeitpunkt', () => {
  const heute = new Date(2026, 8, 7, 12, 0, 0)

  it('rechnet „Heute" und „Gestern" um', () => {
    expect(leseZeitpunkt('Heute, 21:20', heute)).toBe('2026-09-07T21:20:00')
    expect(leseZeitpunkt('Gestern, 09:05', heute)).toBe('2026-09-06T09:05:00')
  })

  it('versteht ein ausgeschriebenes Datum', () => {
    expect(leseZeitpunkt('26.04.2026', heute)).toBe('2026-04-26T00:00:00')
  })

  it('lässt Unverständliches null', () => {
    expect(leseZeitpunkt('vor kurzem', heute)).toBeNull()
    expect(leseZeitpunkt('', heute)).toBeNull()
  })

  it('liest den Zeitpunkt aus der Karte', () => {
    const treffer = leseTreffer(seite, heute)
    expect(treffer[2]?.published_at).toBe('2026-09-07T21:21:00')
  })
})

describe('Seitenzahl in die Such-URL setzen', () => {
  const basis = 'https://www.kleinanzeigen.de/s-autos/c216+autos.marke_s:mercedes_benz'

  it('setzt sie vor den Filterabschnitt', () => {
    expect(setzeSeite(basis, 2)).toBe(
      'https://www.kleinanzeigen.de/s-autos/seite:2/c216+autos.marke_s:mercedes_benz',
    )
  })

  it('lässt Seite 1 unverändert', () => {
    expect(setzeSeite(basis, 1)).toBe(basis)
  })

  it('ersetzt eine vorhandene Seitenangabe', () => {
    const mitSeite = 'https://www.kleinanzeigen.de/s-autos/seite:5/c216+autos.marke_s:mercedes_benz'
    expect(setzeSeite(mitSeite, 3)).toBe(
      'https://www.kleinanzeigen.de/s-autos/seite:3/c216+autos.marke_s:mercedes_benz',
    )
  })

  it('behält Umkreis-Parameter im Fragezeichenteil', () => {
    const mitUmkreis = `${basis}?locationStr=47798&radius=200`
    expect(setzeSeite(mitUmkreis, 2)).toBe(
      'https://www.kleinanzeigen.de/s-autos/seite:2/c216+autos.marke_s:mercedes_benz?locationStr=47798&radius=200',
    )
  })

  it('hängt bei einer Stichwortsuche ohne Filterabschnitt an', () => {
    expect(setzeSeite('https://www.kleinanzeigen.de/s-mercedes/k0', 2)).toBe(
      'https://www.kleinanzeigen.de/s-mercedes/k0/s-seite:2',
    )
  })
})
