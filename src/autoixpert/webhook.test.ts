import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('@/protokoll', () => ({
  protokolliereFehler: vi.fn(() => 'TEST-1234'),
  protokolliereWarnung: vi.fn(),
  protokolliereInfo: vi.fn(),
}))

const { verarbeiteWebhookEreignis } = await import('./webhook')
const { AbrufregelVerletzt } = await import('./abrufregel')
const { AutoixpertFehler } = await import('./client')
const { BEISPIEL_GUTACHTEN, GUTACHTEN_MINIMAL } = await import('./fixtures')

function abhaengigkeiten(overrides: Partial<Parameters<typeof verarbeiteWebhookEreignis>[1]> = {}) {
  return {
    holeGutachten: vi.fn(async () => BEISPIEL_GUTACHTEN),
    speichereFall: vi.fn(async () => ({ fallId: 'fall-1', neu: true })),
    ...overrides,
  }
}

describe('verarbeiteWebhookEreignis', () => {
  it('lädt nach und speichert bei report.created', async () => {
    const deps = abhaengigkeiten()
    const ergebnis = await verarbeiteWebhookEreignis(
      { eventType: 'report.created', reportId: 'r1', teamId: 't1' },
      deps,
    )

    expect(deps.holeGutachten).toHaveBeenCalledWith('r1')
    expect(deps.speichereFall).toHaveBeenCalledWith(BEISPIEL_GUTACHTEN)
    expect(ergebnis).toEqual({ art: 'gespeichert', fallId: 'fall-1', neu: true })
  })

  it('kommt mit einem fast leeren Gutachten klar — der Regelfall direkt nach der Anlage', async () => {
    const deps = abhaengigkeiten({ holeGutachten: vi.fn(async () => GUTACHTEN_MINIMAL) })
    const ergebnis = await verarbeiteWebhookEreignis(
      { eventType: 'report.created', reportId: 'Minimal01' },
      deps,
    )

    expect(deps.speichereFall).toHaveBeenCalledWith(GUTACHTEN_MINIMAL)
    expect(ergebnis.art).toBe('gespeichert')
  })

  it('ignoriert Ereignisse, die kein Gutachten betreffen', async () => {
    const deps = abhaengigkeiten()
    const ergebnis = await verarbeiteWebhookEreignis(
      { eventType: 'contact.created', contactId: 'c1' },
      deps,
    )

    expect(ergebnis).toEqual({ art: 'ignoriert', grund: expect.stringContaining('contact.created') })
    expect(deps.holeGutachten).not.toHaveBeenCalled()
    expect(deps.speichereFall).not.toHaveBeenCalled()
  })

  it('weist ein report.*-Ereignis ohne reportId ab', async () => {
    const deps = abhaengigkeiten()
    const ergebnis = await verarbeiteWebhookEreignis({ eventType: 'report.locked' }, deps)

    expect(ergebnis).toMatchObject({ art: 'abgelehnt', status: 400 })
    expect(deps.holeGutachten).not.toHaveBeenCalled()
  })

  it('weist einen Körper ohne eventType ab', async () => {
    const deps = abhaengigkeiten()
    const ergebnis = await verarbeiteWebhookEreignis({ reportId: 'r1' }, deps)

    expect(ergebnis).toMatchObject({ art: 'abgelehnt', status: 400 })
  })

  it('ignoriert einen Verstoss gegen die Abrufregel, statt zu scheitern', async () => {
    const deps = abhaengigkeiten({
      holeGutachten: vi.fn(async () => {
        throw new AbrufregelVerletzt('zu alt')
      }),
    })
    const ergebnis = await verarbeiteWebhookEreignis(
      { eventType: 'report.created', reportId: 'r1' },
      deps,
    )

    expect(ergebnis).toEqual({ art: 'ignoriert', grund: 'zu alt' })
    expect(deps.speichereFall).not.toHaveBeenCalled()
  })

  it('ignoriert ein inzwischen gelöschtes Gutachten (404), statt zu scheitern', async () => {
    const deps = abhaengigkeiten({
      holeGutachten: vi.fn(async () => {
        throw new AutoixpertFehler('Nicht gefunden.', 404)
      }),
    })
    const ergebnis = await verarbeiteWebhookEreignis(
      { eventType: 'report.moved_to_trash', reportId: 'r1' },
      deps,
    )

    expect(ergebnis.art).toBe('ignoriert')
    expect(deps.speichereFall).not.toHaveBeenCalled()
  })

  it('fängt einen unerwarteten Fehler beim Nachladen ab, statt zu werfen', async () => {
    const deps = abhaengigkeiten({
      holeGutachten: vi.fn(async () => {
        throw new Error('boom')
      }),
    })
    const ergebnis = await verarbeiteWebhookEreignis(
      { eventType: 'report.created', reportId: 'r1' },
      deps,
    )

    expect(ergebnis.art).toBe('ignoriert')
    expect(deps.speichereFall).not.toHaveBeenCalled()
  })

  it('wiederholte Zustellung desselben Ereignisses bleibt unschädlich', async () => {
    const deps = abhaengigkeiten()
    await verarbeiteWebhookEreignis({ eventType: 'report.created', reportId: 'r1' }, deps)
    await verarbeiteWebhookEreignis({ eventType: 'report.created', reportId: 'r1' }, deps)

    expect(deps.speichereFall).toHaveBeenCalledTimes(2)
    expect(deps.speichereFall).toHaveBeenNthCalledWith(1, BEISPIEL_GUTACHTEN)
    expect(deps.speichereFall).toHaveBeenNthCalledWith(2, BEISPIEL_GUTACHTEN)
  })
})
