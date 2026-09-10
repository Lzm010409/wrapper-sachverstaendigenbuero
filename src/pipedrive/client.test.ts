import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { monetaerWert, pipedrive, PIPELINE_AUFTRAG_ID } from './client'

describe('monetaerWert', () => {
  it('liest Geldfelder in beiden Schreibweisen', () => {
    // Pipedrive liefert je nach API-Fassung eine nackte Zahl oder ein Objekt.
    expect(monetaerWert(1234.5)).toBe(1234.5)
    expect(monetaerWert({ value: 99, currency: 'EUR' })).toBe(99)
  })

  it('gibt nichts zurueck, wo nichts steht', () => {
    expect(monetaerWert(undefined)).toBeUndefined()
    expect(monetaerWert(null)).toBeUndefined()
    expect(monetaerWert({ currency: 'EUR' })).toBeUndefined()
  })
})

/** Ein `fetch`-Ersatz, der `{ data }` zurückgibt, wie es `anfrage()` erwartet. */
function antwortMitDaten(data: unknown): Response {
  return { ok: true, status: 200, json: async () => ({ data }) } as Response
}

/** Wie `antwortMitDaten`, zusätzlich mit dem Blätter-Cursor von `GET /deals`. */
function antwortMitSeite(data: unknown, naechsterCursor: string | null = null): Response {
  return {
    ok: true,
    status: 200,
    json: async () => ({ data, additional_data: { next_cursor: naechsterCursor } }),
  } as Response
}

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('pipedrive.findeDeal', () => {
  beforeEach(() => {
    vi.stubEnv('PIPEDRIVE_API_TOKEN', 'geheim')
    vi.stubEnv('PIPEDRIVE_BASE_URL', 'https://api.pipedrive.com/api/v2')
  })

  it('fragt ohne Token gar nicht erst an', async () => {
    vi.stubEnv('PIPEDRIVE_API_TOKEN', '')
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    expect(await pipedrive.findeDeal('0926/2081TG')).toEqual({ art: 'ohne_treffer' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('sucht exakt am Titel, dann holt sie den vollen Deal per ID', async () => {
    const fetchMock = vi.fn(async (url: URL) => {
      if (url.pathname.endsWith('/deals/search')) {
        expect(url.searchParams.get('fields')).toBe('title')
        expect(url.searchParams.get('exact_match')).toBe('true')
        expect(url.searchParams.get('term')).toBe('0926/2081TG')
        return antwortMitDaten({
          items: [{ item: { id: 1166, title: '0926/2081TG', pipeline: { id: PIPELINE_AUFTRAG_ID } } }],
        })
      }
      if (url.pathname.endsWith('/deals/1166')) {
        return antwortMitDaten({ id: 1166, title: '0926/2081TG', stage_id: 7, pipeline_id: 2 })
      }
      throw new Error(`Unerwarteter Aufruf: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    expect(await pipedrive.findeDeal('0926/2081TG')).toEqual({
      art: 'gefunden',
      deal: { id: 1166, title: '0926/2081TG', stage_id: 7, pipeline_id: 2 },
    })
  })

  it('verwirft einen Treffer aus einer anderen Pipeline', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        antwortMitDaten({ items: [{ item: { id: 5, title: '0926/2081TG', pipeline: { id: 99 } } }] }),
      ),
    )
    expect(await pipedrive.findeDeal('0926/2081TG')).toEqual({ art: 'ohne_treffer' })
  })

  it('meldet zwei Treffer in derselben Pipeline als mehrdeutig, statt den ersten zu nehmen', async () => {
    const fetchMock = vi.fn(async () =>
      antwortMitDaten({
        items: [
          { item: { id: 1, title: '0926/2081TG', pipeline: { id: PIPELINE_AUFTRAG_ID } } },
          { item: { id: 2, title: '0926/2081TG', pipeline: { id: PIPELINE_AUFTRAG_ID } } },
        ],
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    expect(await pipedrive.findeDeal('0926/2081TG')).toEqual({
      art: 'mehrdeutig',
      treffer: [
        { id: 1, title: '0926/2081TG' },
        { id: 2, title: '0926/2081TG' },
      ],
    })
    // Bei Mehrdeutigkeit gibt es keinen zweiten Aufruf für einen vollen Deal.
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

describe('pipedrive Notizen und Mails', () => {
  beforeEach(() => {
    vi.stubEnv('PIPEDRIVE_API_TOKEN', 'geheim')
    vi.stubEnv('PIPEDRIVE_BASE_URL_V1', 'https://api.pipedrive.com/api/v1')
  })

  it('holt Notizen über die v1-Basis mit deal_id', async () => {
    const fetchMock = vi.fn(async (url: URL) => {
      expect(url.href.startsWith('https://api.pipedrive.com/api/v1/notes')).toBe(true)
      expect(url.searchParams.get('deal_id')).toBe('1166')
      return antwortMitDaten([{ id: 1, content: '<div>Hallo</div>', add_time: '2026-09-06 12:14:21' }])
    })
    vi.stubGlobal('fetch', fetchMock)

    expect(await pipedrive.listeNotizen(1166)).toHaveLength(1)
  })

  it('holt Mail-Metadaten über /deals/{id}/mailMessages und packt sie aus ihrer Hülle aus', async () => {
    // Jeder Eintrag kommt live als { object: 'mailMessage', data: {...} },
    // nicht flach — siehe Kommentar an `listeMails`.
    const fetchMock = vi.fn(async (url: URL) => {
      expect(url.pathname).toBe('/api/v1/deals/1166/mailMessages')
      expect(url.searchParams.get('include_body')).toBe('0')
      return antwortMitDaten([
        {
          object: 'mailMessage',
          data: { id: 24263, subject: 'Betreff', message_time: '2026-09-06 13:25:35' },
        },
      ])
    })
    vi.stubGlobal('fetch', fetchMock)

    const mails = await pipedrive.listeMails(1166)
    expect(mails).toEqual([{ id: 24263, subject: 'Betreff', message_time: '2026-09-06 13:25:35' }])
  })

  it('fragt den vollen Mailkörper über die Konto-Subdomain ab, nicht über api.pipedrive.com', async () => {
    // Live geprüft (08.09.2026): derselbe Aufruf über api.pipedrive.com
    // kommt als 404 zurück, nur über die Subdomain des Kontos klappt er.
    vi.stubEnv('PIPEDRIVE_COMPANY_DOMAIN', 'gollenstede')
    const fetchMock = vi.fn(async (url: URL) => {
      expect(url.href.startsWith('https://gollenstede.pipedrive.com/api/v1/mailbox/mailMessages/24263')).toBe(
        true,
      )
      expect(url.searchParams.get('include_body')).toBe('1')
      return antwortMitDaten({ id: 24263, deal_id: 1166, body: '<p>Text</p>' })
    })
    vi.stubGlobal('fetch', fetchMock)

    const mail = await pipedrive.holeMailBody(24263)
    expect(mail?.deal_id).toBe(1166)
    expect(mail?.body).toBe('<p>Text</p>')
  })

  it('meldet fehlende PIPEDRIVE_COMPANY_DOMAIN als klaren Fehler, statt an api.pipedrive.com zu scheitern', async () => {
    vi.stubEnv('PIPEDRIVE_COMPANY_DOMAIN', '')
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    await expect(pipedrive.holeMailBody(24263)).rejects.toThrow('PIPEDRIVE_COMPANY_DOMAIN')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('fragt ohne Token gar nicht erst an', async () => {
    vi.stubEnv('PIPEDRIVE_API_TOKEN', '')
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    expect(await pipedrive.listeNotizen(1166)).toEqual([])
    expect(await pipedrive.listeMails(1166)).toEqual([])
    expect(await pipedrive.holeMailBody(1)).toBeUndefined()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('pipedrive.listeOffeneDeals', () => {
  beforeEach(() => {
    vi.stubEnv('PIPEDRIVE_API_TOKEN', 'geheim')
    vi.stubEnv('PIPEDRIVE_BASE_URL', 'https://api.pipedrive.com/api/v2')
  })

  it('holt alle offenen Deals der Pipeline "Auftrag" in einem Aufruf, wenn eine Seite reicht', async () => {
    const fetchMock = vi.fn(async (url: URL) => {
      expect(url.pathname).toBe('/api/v2/deals')
      expect(url.searchParams.get('pipeline_id')).toBe(String(PIPELINE_AUFTRAG_ID))
      expect(url.searchParams.get('status')).toBe('open')
      return antwortMitSeite([
        { id: 1166, title: '0926/2081TG', stage_id: 8 },
        { id: 25, title: '1024/1368TG', stage_id: 8 },
      ])
    })
    vi.stubGlobal('fetch', fetchMock)

    const deals = await pipedrive.listeOffeneDeals()
    expect(deals).toHaveLength(2)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('blättert weiter, solange next_cursor gesetzt ist', async () => {
    let aufrufe = 0
    const fetchMock = vi.fn(async (url: URL) => {
      aufrufe++
      if (aufrufe === 1) {
        expect(url.searchParams.has('cursor')).toBe(false)
        return antwortMitSeite([{ id: 1, stage_id: 6 }], 'seite2')
      }
      expect(url.searchParams.get('cursor')).toBe('seite2')
      return antwortMitSeite([{ id: 2, stage_id: 7 }], null)
    })
    vi.stubGlobal('fetch', fetchMock)

    const deals = await pipedrive.listeOffeneDeals()
    expect(deals.map((d) => d.id)).toEqual([1, 2])
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('bricht nach einer Obergrenze an Seiten ab, statt endlos zu blättern', async () => {
    const fetchMock = vi.fn(async () => antwortMitSeite([{ id: 1 }], 'immer-weiter'))
    vi.stubGlobal('fetch', fetchMock)

    await pipedrive.listeOffeneDeals()
    expect(fetchMock.mock.calls.length).toBeLessThanOrEqual(5)
  })

  it('fragt ohne Token gar nicht erst an', async () => {
    vi.stubEnv('PIPEDRIVE_API_TOKEN', '')
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    expect(await pipedrive.listeOffeneDeals()).toEqual([])
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
