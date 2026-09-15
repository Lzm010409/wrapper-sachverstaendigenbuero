import { describe, expect, it, vi } from 'vitest'

const BENUTZER = { id: 'b1', name: 'Test', email: 't@example.com', rolle: 'ersteller' as const }

type WacheErgebnis = typeof BENUTZER | Response
const benutzerOderAntwort = vi.fn<() => Promise<WacheErgebnis>>(async () => BENUTZER)
vi.mock('@/app/api/wache', () => ({ benutzerOderAntwort: () => benutzerOderAntwort() }))

const legeImportAn = vi.fn<(auftrag: unknown) => Promise<string>>(async () => 's1')
const verarbeiteImportImHintergrund = vi.fn<(id: string) => Promise<void>>(async () => {})
vi.mock('@/stellungnahme/import', () => ({
  legeImportAn: (auftrag: unknown) => legeImportAn(auftrag),
  verarbeiteImportImHintergrund: (id: string) => verarbeiteImportImHintergrund(id),
}))

const kiVerfuegbar = vi.fn(() => true)
vi.mock('@/ki/client', () => ({ kiVerfuegbar: () => kiVerfuegbar() }))

const { POST } = await import('./route')

function formularAnfrage(felder: Record<string, string | File>): Request {
  const formular = new FormData()
  for (const [schluessel, wert] of Object.entries(felder)) formular.set(schluessel, wert)
  return new Request('https://cockpit.example/api/stellungnahmen/importieren', {
    method: 'POST',
    body: formular,
  })
}

function pdfDatei(bytes = 10): File {
  return new File([new Uint8Array(bytes)], 'stellungnahme.pdf', { type: 'application/pdf' })
}

describe('POST /api/stellungnahmen/importieren', () => {
  it('legt die Stellungnahme an, stösst die Verarbeitung im Hintergrund an und antwortet sofort', async () => {
    const antwort = await POST(formularAnfrage({ stellungnahme: pdfDatei(), fallId: 'fall-1' }))

    expect(antwort.status).toBe(200)
    const rumpf = await antwort.json()
    expect(rumpf).toEqual({ stellungnahmeId: 's1' })

    expect(legeImportAn).toHaveBeenCalledWith(
      expect.objectContaining({ dateiname: 'stellungnahme.pdf', fallId: 'fall-1', benutzerId: 'b1' }),
    )
    // Die Verarbeitung läuft nach der Antwort weiter — das ist der ganze
    // Sinn dieser Route. Der Mock kann hier nur bezeugen, dass sie
    // angestossen wurde, nicht dass sie schon durch ist.
    expect(verarbeiteImportImHintergrund).toHaveBeenCalledWith('s1')
  })

  it('lehnt die Anfrage ohne Fall ab, bevor irgendetwas angelegt wird', async () => {
    legeImportAn.mockClear()
    const antwort = await POST(formularAnfrage({ stellungnahme: pdfDatei() }))
    expect(antwort.status).toBe(400)
    const rumpf = await antwort.json()
    expect(rumpf.fehler).toMatch(/Fall/)
    expect(legeImportAn).not.toHaveBeenCalled()
  })

  it('lehnt die Anfrage ohne Datei ab', async () => {
    legeImportAn.mockClear()
    const antwort = await POST(formularAnfrage({ fallId: 'fall-1' }))
    expect(antwort.status).toBe(400)
    expect(legeImportAn).not.toHaveBeenCalled()
  })

  it('lehnt ab, wenn kein Zugang zum Sprachmodell besteht', async () => {
    legeImportAn.mockClear()
    kiVerfuegbar.mockReturnValueOnce(false)
    const antwort = await POST(formularAnfrage({ stellungnahme: pdfDatei(), fallId: 'fall-1' }))
    expect(antwort.status).toBe(503)
    expect(legeImportAn).not.toHaveBeenCalled()
  })

  it('gibt die Ablehnung der Wache unverändert weiter, wenn niemand angemeldet ist', async () => {
    legeImportAn.mockClear()
    benutzerOderAntwort.mockResolvedValueOnce(new Response('Nicht angemeldet.', { status: 401 }))
    const antwort = await POST(formularAnfrage({ stellungnahme: pdfDatei(), fallId: 'fall-1' }))
    expect(antwort.status).toBe(401)
    expect(legeImportAn).not.toHaveBeenCalled()
  })
})
