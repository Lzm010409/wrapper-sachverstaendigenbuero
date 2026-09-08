import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('@/db', () => ({ db: {} }))
vi.mock('@/protokoll', () => ({ protokolliereFehler: vi.fn(() => 'TEST-1234') }))
vi.mock('./lauf', () => ({ rufeSkript: vi.fn() }))

const { auswahlparameter, gespeicherteAuswahl } = await import('./korb')

const ENG = {
  subject: { marke: 'Mercedes-Benz', modell: 'E 53 AMG' },
  zentrum: { lat: 50.8651, lon: 6.9506 },
  radiusKm: 200,
  kmToleranz: 25000,
  ezToleranzJahre: 2,
  leistungToleranzKw: 30,
  getriebe: 'Automatik',
  tueren: 4,
  karosserie: 'sedan',
}

async function ordnerMit(dateien: Record<string, unknown>): Promise<string> {
  const ordner = await mkdtemp(join(tmpdir(), 'korb-test-'))
  for (const [name, inhalt] of Object.entries(dateien)) {
    await writeFile(join(ordner, name), JSON.stringify(inhalt), 'utf8')
  }
  return ordner
}

describe('Gespeicherte Auswahl lesen', () => {
  it('unterscheidet „noch nicht entschieden" von „nichts gewählt"', () => {
    // Der Unterschied trägt die Vorbelegung: `null` heisst, die Urteile
    // entscheiden; eine leere Liste ist eine Entscheidung.
    expect(gespeicherteAuswahl(null)).toBeNull()
    expect(gespeicherteAuswahl(undefined)).toBeNull()
    expect(gespeicherteAuswahl([])).toEqual([])
  })

  it('wirft heraus, was keine Kennung ist', () => {
    expect(gespeicherteAuswahl(['a', 42, null, 'b'])).toEqual(['a', 'b'])
  })
})

describe('Parameter der Gutachtenanlage', () => {
  it('öffnet die Toleranzen — die Auswahl von Hand ist der Filter', async () => {
    const ordner = await ordnerMit({ 'params-eng.json': ENG })
    const params = await auswahlparameter(ordner)

    // Mit den Toleranzen des ersten Zyklus würfe die Auswertung genau die
    // Fahrzeuge heraus, für die in Zyklus 2 und 3 geweitet wurde.
    expect(Number(params.kmToleranz)).toBeGreaterThan(ENG.kmToleranz)
    expect(Number(params.radiusKm)).toBeGreaterThan(ENG.radiusKm)
    expect(Number(params.ezToleranzJahre)).toBeGreaterThan(ENG.ezToleranzJahre)
    expect(params.getriebe).toBeUndefined()
    expect(params.tueren).toBeUndefined()
    expect(params.karosserie).toBeUndefined()
  })

  it('behält Subjekt und Zentrum unverändert', () => {
    // Sie beschreiben, wogegen verglichen wird — das ändert die Auswahl nicht.
    return ordnerMit({ 'params-eng.json': ENG }).then(async (ordner) => {
      const params = await auswahlparameter(ordner)
      expect(params.subject).toEqual(ENG.subject)
      expect(params.zentrum).toEqual(ENG.zentrum)
    })
  })

  it('rettet die Inserate ohne Händlerkoordinate', async () => {
    // Sonst fiel ein handverlesenes Fahrzeug still aus der Anlage — am
    // 08.09.2026 drei gewählt, zwei in der Anlage, ohne einen Hinweis.
    const ordner = await ordnerMit({ 'params-eng.json': ENG })
    expect((await auswahlparameter(ordner)).kleinanzeigenGeoConstrained).toBe(true)
  })

  it('nimmt den weitesten Zyklus, der gelaufen ist', async () => {
    const ordner = await ordnerMit({
      'params-eng.json': { ...ENG, marke: 'eng' },
      'params-geweitet.json': { ...ENG, marke: 'geweitet' },
      'params-weit.json': { ...ENG, marke: 'weit' },
    })
    expect((await auswahlparameter(ordner)).marke).toBe('weit')
  })

  it('versteht auch einen Lauf von vor der Umstellung auf Zyklen', async () => {
    // Ältere Läufe haben `params.json` — sie sollen sich weiter ausdrucken
    // lassen.
    const ordner = await ordnerMit({ 'params.json': { ...ENG, marke: 'alt' } })
    expect((await auswahlparameter(ordner)).marke).toBe('alt')
  })

  it('sagt es, wenn gar keine Parameterdatei mehr da ist', async () => {
    const ordner = await ordnerMit({ 'raw-autoscout.json': { items: [] } })
    await expect(auswahlparameter(ordner)).rejects.toThrow(/Parameterdatei/)
  })
})
