import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setzeSchlangeZurueck } from './abruf'
import { holeInserat, istKleinanzeigenUrl, sucheUeberUrl } from './dienst'

const suchseite = readFileSync(
  join(process.cwd(), 'tests/fixtures/kleinanzeigen-suchseite.html'),
  'utf8',
)
const anzeige = readFileSync(
  join(process.cwd(), 'tests/fixtures/kleinanzeigen-inserat.html'),
  'utf8',
)

function antwort(rumpf: string, url: string, status = 200): Response {
  const a = new Response(rumpf, { status })
  Object.defineProperty(a, 'url', { value: url })
  return a
}

const ohneWarten = async () => {}

describe('Adressprüfung', () => {
  it('lässt nur Kleinanzeigen durch', () => {
    expect(istKleinanzeigenUrl('https://www.kleinanzeigen.de/s-autos/c216')).toBe(true)
    expect(istKleinanzeigenUrl('https://kleinanzeigen.de/s-autos/c216')).toBe(true)
  })

  it('weist alles andere ab — sonst wäre die Route ein offener Weiterleiter', () => {
    expect(istKleinanzeigenUrl('https://example.com/')).toBe(false)
    expect(istKleinanzeigenUrl('http://www.kleinanzeigen.de/s-autos')).toBe(false)
    expect(istKleinanzeigenUrl('https://www.kleinanzeigen.de.example.com/')).toBe(false)
    expect(istKleinanzeigenUrl('file:///etc/passwd')).toBe(false)
    expect(istKleinanzeigenUrl('keine adresse')).toBe(false)
  })
})

describe('Suche über eine fertige URL', () => {
  beforeEach(() => {
    setzeSchlangeZurueck()
    vi.stubEnv('KLEINANZEIGEN_ABSTAND_MS', '0')
  })
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  const basis = 'https://www.kleinanzeigen.de/s-autos/c216+autos.marke_s:mercedes_benz'

  it('liefert die Antwortform des bisherigen Dienstes', async () => {
    const ergebnis = await sucheUeberUrl(basis, 1, {
      hole: async (eingang) => antwort(suchseite, String(eingang)),
      warte: ohneWarten,
    })
    expect(ergebnis.success).toBe(true)
    expect(ergebnis.unique_results).toBe(5)
    expect(ergebnis.results).toHaveLength(5)
    expect(ergebnis.total_results).toBe(93_071)
  })

  it('holt mehrere Seiten und zählt jede Anzeige nur einmal', async () => {
    const gefragt: string[] = []
    const ergebnis = await sucheUeberUrl(basis, 3, {
      hole: async (eingang) => {
        gefragt.push(String(eingang))
        // Dieselbe Seite dreimal: die oberen Plätze wiederholen sich real.
        return antwort(suchseite, String(eingang))
      },
      warte: ohneWarten,
    })
    expect(gefragt).toEqual([
      basis,
      'https://www.kleinanzeigen.de/s-autos/seite:2/c216+autos.marke_s:mercedes_benz',
      'https://www.kleinanzeigen.de/s-autos/seite:3/c216+autos.marke_s:mercedes_benz',
    ])
    expect(ergebnis.unique_results).toBe(5)
  })

  it('hört auf, wenn eine Seite keine Treffer mehr hat', async () => {
    let aufrufe = 0
    const ergebnis = await sucheUeberUrl(basis, 5, {
      hole: async (eingang) => {
        aufrufe++
        return antwort(aufrufe === 1 ? suchseite : '<html></html>', String(eingang))
      },
      warte: ohneWarten,
    })
    expect(aufrufe).toBe(2)
    expect(ergebnis.warnungen).toContain('Seite 2: keine Treffer — Abbruch')
  })

  it('weist eine fremde Adresse ab, bevor irgendetwas geholt wird', async () => {
    await expect(sucheUeberUrl('https://example.com/', 1)).rejects.toThrow(
      /Keine Kleinanzeigen-Adresse/,
    )
  })
})

describe('Einzelne Anzeige', () => {
  beforeEach(() => {
    setzeSchlangeZurueck()
    vi.stubEnv('KLEINANZEIGEN_ABSTAND_MS', '0')
  })
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('holt sie über die Kurzform der Adresse', async () => {
    let gefragt = ''
    const ergebnis = await holeInserat('3455356908', {
      hole: async (eingang) => {
        gefragt = String(eingang)
        return antwort(anzeige, gefragt)
      },
      warte: ohneWarten,
    })
    expect(gefragt).toBe('https://www.kleinanzeigen.de/s-anzeige/3455356908')
    expect(ergebnis.success).toBe(true)
    if (ergebnis.success) expect(ergebnis.data.details['Kilometerstand']).toBe('210.000 km')
  })

  it('meldet eine gelöschte Anzeige als gelöscht, nicht als Fehler', async () => {
    const ergebnis = await holeInserat('3455356908', {
      hole: async () => antwort('weg', 'https://www.kleinanzeigen.de/s-anzeige/1', 404),
      warte: ohneWarten,
    })
    expect(ergebnis).toEqual({ success: false, not_found: true, status: 'deleted' })
  })

  it('erkennt die Weiterleitung fort von der Anzeige als gelöscht', async () => {
    const ergebnis = await holeInserat('3455356908', {
      hole: async () => antwort('<html></html>', 'https://www.kleinanzeigen.de/s-autos/c216'),
      warte: ohneWarten,
    })
    expect(ergebnis.success).toBe(false)
  })

  it('nimmt keine erfundene Anzeigennummer an', async () => {
    await expect(holeInserat('../etc/passwd')).rejects.toThrow(/Keine gültige Anzeigennummer/)
  })
})
