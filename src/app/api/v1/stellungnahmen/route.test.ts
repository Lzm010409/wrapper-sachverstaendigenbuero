import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const BENUTZER = { id: 'b1', name: 'Test', email: 't@example.com', rolle: 'ersteller' as const }

type WacheErgebnis = typeof BENUTZER | Response
const apiBenutzerOderAntwort = vi.fn<(anfrage: Request) => Promise<WacheErgebnis>>(
  async () => BENUTZER,
)
vi.mock('@/app/api/wache', async () => {
  const echte = await vi.importActual<typeof import('@/app/api/wache')>('@/app/api/wache')
  return { ...echte, apiBenutzerOderAntwort: (anfrage: Request) => apiBenutzerOderAntwort(anfrage) }
})

const ladeStellungnahmenApiListe = vi.fn()
const zaehleStellungnahmen = vi.fn()
const ladePositionenZuStellungnahmen = vi.fn()
vi.mock('@/stellungnahme/abfragen', () => ({
  ladeStellungnahmenApiListe: (...args: unknown[]) => ladeStellungnahmenApiListe(...args),
  zaehleStellungnahmen: () => zaehleStellungnahmen(),
  ladePositionenZuStellungnahmen: (...args: unknown[]) => ladePositionenZuStellungnahmen(...args),
}))

const { GET } = await import('./route')

function anfrage(): Request {
  return new Request('https://cockpit.example/api/v1/stellungnahmen', {
    headers: { authorization: 'Bearer cockpit_irrelevant' },
  })
}

function position(werte: { id: string; stellungnahmeId: string }) {
  return {
    ...werte,
    bezeichnung: 'Lackierlohn',
    seite: 3,
    betragGutachten: '150.56',
    betragGekuerzt: '100',
    differenz: '50.56',
    begruendungVersicherer: 'UPE-Aufschlag nicht üblich',
    behandlung: 'bestritten',
    reihenfolge: 0,
  }
}

describe('GET /api/v1/stellungnahmen', () => {
  it('reichert jede Zeile mit ihren Kürzungspositionen und -summen an', async () => {
    ladeStellungnahmenApiListe.mockResolvedValueOnce([
      { id: 's1', betreff: 'Erste' },
      { id: 's2', betreff: 'Zweite' },
    ])
    zaehleStellungnahmen.mockResolvedValueOnce(2)
    ladePositionenZuStellungnahmen.mockResolvedValueOnce(
      new Map([['s1', [position({ id: 'p1', stellungnahmeId: 's1' })]], ['s2', []]]),
    )

    const antwort = await GET(anfrage())
    expect(antwort.status).toBe(200)
    const rumpf = await antwort.json()

    expect(ladePositionenZuStellungnahmen).toHaveBeenCalledWith(['s1', 's2'])
    expect(rumpf.daten).toHaveLength(2)
    expect(rumpf.daten[0].kuerzungspositionen).toEqual([
      expect.objectContaining({ id: 'p1', betragGutachten: 150.56 }),
    ])
    expect(rumpf.daten[0].kuerzungssummen).toEqual({
      summeGutachten: 150.56,
      summeGekuerzt: 100,
      summeDifferenz: 50.56,
    })
    expect(rumpf.daten[1].kuerzungspositionen).toEqual([])
    expect(rumpf.daten[1].kuerzungssummen).toEqual({
      summeGutachten: 0,
      summeGekuerzt: 0,
      summeDifferenz: 0,
    })
    expect(rumpf.gesamt).toBe(2)
  })

  it('gibt die Ablehnung der Wache unverändert weiter, wenn kein Token gültig ist', async () => {
    ladeStellungnahmenApiListe.mockClear()
    apiBenutzerOderAntwort.mockResolvedValueOnce(
      new Response(JSON.stringify({ fehler: 'Das API-Token ist ungültig, abgelaufen oder widerrufen.' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    const antwort = await GET(anfrage())
    expect(antwort.status).toBe(401)
    expect(ladeStellungnahmenApiListe).not.toHaveBeenCalled()
  })
})
