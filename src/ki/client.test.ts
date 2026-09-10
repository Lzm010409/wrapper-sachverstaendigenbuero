import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const erzeuge = vi.fn()

vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = { create: erzeuge }
  },
}))
vi.mock('@/protokoll', () => ({ protokolliereInfo: vi.fn() }))

const { rufeFuerTextAuf, rufeMitWerkzeugAuf } = await import('./client')
const { protokolliereInfo } = await import('@/protokoll')
const notiere = vi.mocked(protokolliereInfo)

const WERKZEUG = {
  name: 'melde',
  description: 'Meldet etwas.',
  input_schema: {
    type: 'object' as const,
    additionalProperties: false,
    properties: { wert: { type: 'string' } },
    required: ['wert'],
  },
}

function verbrauch(mehr: Record<string, number> = {}) {
  return {
    input_tokens: 120,
    output_tokens: 40,
    cache_creation_input_tokens: 0,
    cache_read_input_tokens: 0,
    ...mehr,
  }
}

beforeEach(() => {
  process.env.ANTHROPIC_API_KEY = 'test-schluessel'
})

afterEach(() => {
  erzeuge.mockReset()
  notiere.mockReset()
})

/** Der letzte an das Modell geschickte Anfragekörper. */
function letzteAnfrage() {
  return erzeuge.mock.calls.at(-1)![0]
}

describe('Prompt Caching', () => {
  it('setzt den Haltepunkt auf den System-Block eines Werkzeugaufrufs', async () => {
    erzeuge.mockResolvedValue({
      content: [{ type: 'tool_use', name: 'melde', input: { wert: 'ja' } }],
      usage: verbrauch(),
    })

    await rufeMitWerkzeugAuf({
      modell: 'test-modell',
      system: 'Du bist ein Werkzeug.',
      inhalt: [{ type: 'text', text: 'Der veränderliche Teil.' }],
      werkzeug: WERKZEUG,
    })

    expect(letzteAnfrage().system).toEqual([
      {
        type: 'text',
        text: 'Du bist ein Werkzeug.',
        cache_control: { type: 'ephemeral' },
      },
    ])
  })

  it('setzt den Haltepunkt auch bei einem Textaufruf', async () => {
    erzeuge.mockResolvedValue({
      content: [{ type: 'text', text: 'Ein Absatz.' }],
      usage: verbrauch(),
    })

    await rufeFuerTextAuf({
      modell: 'test-modell',
      system: 'Du formulierst.',
      auftrag: 'Formuliere.',
    })

    expect(letzteAnfrage().system).toEqual([
      { type: 'text', text: 'Du formulierst.', cache_control: { type: 'ephemeral' } },
    ])
  })

  it('lässt den veränderlichen Teil hinter dem Haltepunkt ohne Attribut', async () => {
    erzeuge.mockResolvedValue({
      content: [{ type: 'tool_use', name: 'melde', input: { wert: 'ja' } }],
      usage: verbrauch(),
    })

    await rufeMitWerkzeugAuf({
      modell: 'test-modell',
      system: 'Du bist ein Werkzeug.',
      inhalt: [{ type: 'text', text: 'Der veränderliche Teil.' }],
      werkzeug: WERKZEUG,
    })

    const anfrage = letzteAnfrage()
    expect(anfrage.messages[0].content[0]).not.toHaveProperty('cache_control')
    // Auf oberster Ebene darf kein Attribut stehen: die automatische
    // Platzierung landete hinter dem veränderlichen Teil.
    expect(anfrage).not.toHaveProperty('cache_control')
  })
})

describe('Verbrauchsprotokoll', () => {
  it('hält fest, was aus dem Zwischenspeicher kam', async () => {
    erzeuge.mockResolvedValue({
      content: [{ type: 'tool_use', name: 'melde', input: { wert: 'ja' } }],
      usage: verbrauch({ input_tokens: 900, cache_read_input_tokens: 1700 }),
    })

    await rufeMitWerkzeugAuf({
      modell: 'test-modell',
      system: 'Du bist ein Werkzeug.',
      inhalt: [{ type: 'text', text: 'Inhalt.' }],
      werkzeug: WERKZEUG,
    })

    expect(notiere).toHaveBeenCalledWith(
      'ki.aufruf',
      expect.any(String),
      expect.objectContaining({
        dienst: 'anthropic',
        modell: 'test-modell',
        eingabe: 900,
        cacheGelesen: 1700,
        cacheGeschrieben: 0,
      }),
    )
  })

  it('verträgt fehlende Cache-Felder', async () => {
    erzeuge.mockResolvedValue({
      content: [{ type: 'text', text: 'Ein Absatz.' }],
      usage: {
        input_tokens: 50,
        output_tokens: 10,
        cache_creation_input_tokens: null,
        cache_read_input_tokens: null,
      },
    })

    await rufeFuerTextAuf({ modell: 'test-modell', system: 'System.', auftrag: 'Auftrag.' })

    expect(notiere).toHaveBeenCalledWith(
      'ki.aufruf',
      expect.any(String),
      expect.objectContaining({ cacheGelesen: 0, cacheGeschrieben: 0 }),
    )
  })

  it('protokolliert nichts, wenn der Aufruf scheitert', async () => {
    erzeuge.mockRejectedValue(new Error('überlastet'))

    await expect(
      rufeFuerTextAuf({ modell: 'test-modell', system: 'System.', auftrag: 'Auftrag.' }),
    ).rejects.toThrow(/überlastet/)

    expect(notiere).not.toHaveBeenCalled()
  })
})
