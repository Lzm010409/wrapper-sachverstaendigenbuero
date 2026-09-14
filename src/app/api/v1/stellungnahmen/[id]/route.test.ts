import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const BENUTZER = { id: 'b1', name: 'Test', email: 't@example.com', rolle: 'ersteller' as const }

const erzeugeApiAusgabe = vi.fn()
vi.mock('@/stellungnahme/api-ausgabe', () => ({ erzeugeApiAusgabe }))

type WacheErgebnis = typeof BENUTZER | Response
const apiBenutzerOderAntwort = vi.fn<(anfrage: Request) => Promise<WacheErgebnis>>(
  async () => BENUTZER,
)
vi.mock('@/app/api/wache', async () => {
  const echte = await vi.importActual<typeof import('@/app/api/wache')>('@/app/api/wache')
  return { ...echte, apiBenutzerOderAntwort: (anfrage: Request) => apiBenutzerOderAntwort(anfrage) }
})

const { GET } = await import('./route')

const GUELTIGE_ID = 'a1b2c3d4-e5f6-4789-a123-0123456789ab'

function anfrage(id = GUELTIGE_ID): Request {
  return new Request(`https://cockpit.example/api/v1/stellungnahmen/${id}`, {
    headers: { authorization: 'Bearer cockpit_irrelevant' },
  })
}

describe('GET /api/v1/stellungnahmen/[id]', () => {
  it('antwortet 404 bei einer Adresse, die keine UUID ist — ohne die Datenbank zu fragen', async () => {
    erzeugeApiAusgabe.mockClear()
    const antwort = await GET(anfrage('unfug'), { params: Promise.resolve({ id: 'unfug' }) })
    expect(antwort.status).toBe(404)
    expect(erzeugeApiAusgabe).not.toHaveBeenCalled()
  })

  it('antwortet 404, wenn es die Stellungnahme nicht gibt', async () => {
    erzeugeApiAusgabe.mockResolvedValueOnce(null)
    const antwort = await GET(anfrage(), { params: Promise.resolve({ id: GUELTIGE_ID }) })
    expect(antwort.status).toBe(404)
    expect((await antwort.json()).fehler).toMatch(/gibt es nicht/)
  })

  it('antwortet 409 und liefert die Befunde, wenn sperrende Prüfungen die Ausgabe verhindern', async () => {
    erzeugeApiAusgabe.mockResolvedValueOnce({
      art: 'gesperrt',
      fehler: '1 Prüfung sperrt die Ausgabe.',
      befunde: [
        {
          kennung: 'R1',
          schwere: 'sperrt',
          titel: 'Offener Platzhalter',
          stelle: 'Position 1',
          text: 'Ein Platzhalter ist noch nicht ausgefüllt.',
        },
      ],
    })
    const antwort = await GET(anfrage(), { params: Promise.resolve({ id: GUELTIGE_ID }) })
    expect(antwort.status).toBe(409)
    const rumpf = await antwort.json()
    expect(rumpf.fehler).toMatch(/sperrt/)
    expect(rumpf.befunde).toHaveLength(1)
  })

  it('antwortet 422, wenn es noch kein Schreiben zu dieser Stellungnahme gibt', async () => {
    erzeugeApiAusgabe.mockResolvedValueOnce({
      art: 'kein-dokument',
      fehler: 'Zu dieser Stellungnahme gibt es noch kein Schreiben.',
    })
    const antwort = await GET(anfrage(), { params: Promise.resolve({ id: GUELTIGE_ID }) })
    expect(antwort.status).toBe(422)
  })

  it('liefert Klartext und PDF in einer Antwort', async () => {
    erzeugeApiAusgabe.mockResolvedValueOnce({
      art: 'fertig',
      klartext: 'Sehr geehrte Damen und Herren,\n\n…',
      pdfBase64: 'JVBERi0=',
      pdfName: 'Stellungnahme_Muster_2026-09-08.pdf',
      befunde: [],
    })
    const antwort = await GET(anfrage(), { params: Promise.resolve({ id: GUELTIGE_ID }) })
    expect(antwort.status).toBe(200)
    expect(antwort.headers.get('content-type')).toContain('application/json')
    const rumpf = await antwort.json()
    expect(rumpf.id).toBe(GUELTIGE_ID)
    expect(rumpf.klartext).toContain('Sehr geehrte Damen und Herren')
    expect(rumpf.pdfBase64).toBe('JVBERi0=')
    expect(rumpf.pdfName).toBe('Stellungnahme_Muster_2026-09-08.pdf')
  })

  it('gibt die Ablehnung der Wache unverändert weiter, wenn kein Token gültig ist', async () => {
    erzeugeApiAusgabe.mockClear()
    apiBenutzerOderAntwort.mockResolvedValueOnce(
      new Response(JSON.stringify({ fehler: 'Das API-Token ist ungültig, abgelaufen oder widerrufen.' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    const antwort = await GET(anfrage(), { params: Promise.resolve({ id: GUELTIGE_ID }) })
    expect(antwort.status).toBe(401)
    expect(erzeugeApiAusgabe).not.toHaveBeenCalled()
  })
})
