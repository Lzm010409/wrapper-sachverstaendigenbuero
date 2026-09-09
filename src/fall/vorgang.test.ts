import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const findeDeal = vi.fn()
const listeOffeneDeals = vi.fn()

vi.mock('@/pipedrive/client', async () => {
  const echt = await vi.importActual<typeof import('@/pipedrive/client')>('@/pipedrive/client')
  return { ...echt, pipedrive: { findeDeal, listeOffeneDeals } }
})

const { ladePhasenFuerListe, ladeVorgang } = await import('./vorgang')

/*
  Die Umgebung wird gestellt, nicht vorausgesetzt.

  `delete process.env.PIPEDRIVE_API_TOKEN` reichte nicht: auf einem Rechner,
  auf dem der Token echt gesetzt ist, sah der erste Test ihn - und der Test
  fuer "nicht eingerichtet" schlug fehl, obwohl der Code stimmte. Ein Test,
  dessen Ergebnis von der Umgebung des Ausfuehrenden abhaengt, prueft nichts.
*/
beforeEach(() => {
  vi.stubEnv('PIPEDRIVE_API_TOKEN', '')
})

afterEach(() => {
  findeDeal.mockReset()
  listeOffeneDeals.mockReset()
  vi.unstubAllEnvs()
})

/**
 * Die vier Ausgaenge muessen unterscheidbar bleiben. Sie alle als
 * "kein Deal gefunden" zu zeigen ist die gefaehrlichste Auskunft: wer sie
 * liest, schliesst daraus, der Vorgang stehe nicht in Pipedrive - und legt
 * ihn womoeglich ein zweites Mal an.
 */
describe('ladeVorgang', () => {
  it('meldet einen fehlenden Zugang als solchen, ohne anzufragen', async () => {
    const ergebnis = await ladeVorgang('0926/2081TG')
    expect(ergebnis.stand).toBe('nicht_eingerichtet')
    expect(findeDeal).not.toHaveBeenCalled()
  })

  it('fragt ohne Aktenzeichen gar nicht erst an', async () => {
    vi.stubEnv('PIPEDRIVE_API_TOKEN', 'geheim')
    expect((await ladeVorgang(null)).stand).toBe('ohne_treffer')
    expect((await ladeVorgang('   ')).stand).toBe('ohne_treffer')
    expect(findeDeal).not.toHaveBeenCalled()
  })

  it('unterscheidet einen Ausfall von einem leeren Treffer', async () => {
    vi.stubEnv('PIPEDRIVE_API_TOKEN', 'geheim')

    findeDeal.mockResolvedValueOnce({ art: 'ohne_treffer' })
    expect((await ladeVorgang('0926/2081TG')).stand).toBe('ohne_treffer')

    findeDeal.mockRejectedValueOnce(new Error('Pipedrive antwortete mit 502'))
    const kaputt = await ladeVorgang('0926/2081TG')
    expect(kaputt.stand).toBe('fehler')
    expect(kaputt.meldung).toContain('502')
  })

  it('bildet einen Treffer auf die Anzeigewerte ab', async () => {
    vi.stubEnv('PIPEDRIVE_API_TOKEN', 'geheim')
    findeDeal.mockResolvedValueOnce({
      art: 'gefunden',
      deal: {
        id: 1,
        title: 'Beispiel GmbH',
        stage_id: 8,
        status: 'open',
        custom_fields: {
          adb0956f0161f534c04d43a1627acb23e692fea6: { value: 8490.71, currency: 'EUR' },
          c4ae5d687eacc0bbe5c05a1d70ec447644d4eb3f: 120,
          d8863fcbcb97aeb225a9418261b5508c0410783f: 'RE-2026-0042',
        },
      },
    })

    const ergebnis = await ladeVorgang('0926/2081TG')
    expect(ergebnis.stand).toBe('gefunden')
    expect(ergebnis.deal).toEqual({
      dealId: 1,
      titel: 'Beispiel GmbH',
      phase: 'Versendet',
      dealStatus: 'Offen',
      dealStatusKlasse: 'm-entwurf',
      schadenhoeheBrutto: 8490.71,
      ausgebuchterBetrag: 120,
      sevdeskRechnungId: 'RE-2026-0042',
    })
  })

  it('nennt eine unbekannte Phase unbekannt, statt eine zu erfinden', async () => {
    vi.stubEnv('PIPEDRIVE_API_TOKEN', 'geheim')
    findeDeal.mockResolvedValueOnce({ art: 'gefunden', deal: { id: 2, stage_id: 999 } })
    expect((await ladeVorgang('0926/2081TG')).deal?.phase).toBe('unbekannt')
  })

  it('bildet den Deal-Status unabhängig von der Phase ab', async () => {
    vi.stubEnv('PIPEDRIVE_API_TOKEN', 'geheim')

    findeDeal.mockResolvedValueOnce({ art: 'gefunden', deal: { id: 4, status: 'won' } })
    expect((await ladeVorgang('0926/2081TG')).deal).toMatchObject({
      dealStatus: 'Gewonnen',
      dealStatusKlasse: 'm-freigegeben',
    })

    findeDeal.mockResolvedValueOnce({ art: 'gefunden', deal: { id: 5, status: 'lost' } })
    expect((await ladeVorgang('0926/2081TG')).deal).toMatchObject({
      dealStatus: 'Verloren',
      dealStatusKlasse: 'm-zurueckgezogen',
    })

    findeDeal.mockResolvedValueOnce({ art: 'gefunden', deal: { id: 6 } })
    expect((await ladeVorgang('0926/2081TG')).deal).toMatchObject({
      dealStatus: 'unbekannt',
      dealStatusKlasse: 'm-entwurf',
    })
  })

  it('macht aus einem leeren Rechnungsfeld nichts, nicht einen leeren Text', async () => {
    vi.stubEnv('PIPEDRIVE_API_TOKEN', 'geheim')
    findeDeal.mockResolvedValueOnce({
      art: 'gefunden',
      deal: { id: 3, custom_fields: { d8863fcbcb97aeb225a9418261b5508c0410783f: '   ' } },
    })
    expect((await ladeVorgang('0926/2081TG')).deal?.sevdeskRechnungId).toBeNull()
  })

  it('meldet mehrere Treffer als eigenen Zustand, statt den ersten stillschweigend zu nehmen', async () => {
    vi.stubEnv('PIPEDRIVE_API_TOKEN', 'geheim')
    findeDeal.mockResolvedValueOnce({
      art: 'mehrdeutig',
      treffer: [
        { id: 1, title: '0926/2081TG' },
        { id: 2, title: '0926/2081TG' },
      ],
    })
    const ergebnis = await ladeVorgang('0926/2081TG')
    expect(ergebnis.stand).toBe('mehrdeutig')
    expect(ergebnis.treffer).toHaveLength(2)
  })
})

describe('ladePhasenFuerListe', () => {
  it('fragt ohne Zugang oder ohne Aktenzeichen gar nicht erst an', async () => {
    expect(await ladePhasenFuerListe(['0926/2081TG'])).toEqual(new Map())
    expect(listeOffeneDeals).not.toHaveBeenCalled()

    vi.stubEnv('PIPEDRIVE_API_TOKEN', 'geheim')
    expect(await ladePhasenFuerListe([null, undefined, '  '])).toEqual(new Map())
    expect(listeOffeneDeals).not.toHaveBeenCalled()
  })

  it('ordnet die Phase über den Titel zu, nur für gesuchte Aktenzeichen', async () => {
    vi.stubEnv('PIPEDRIVE_API_TOKEN', 'geheim')
    listeOffeneDeals.mockResolvedValueOnce([
      { id: 1, title: '0926/2081TG', stage_id: 8 },
      { id: 2, title: 'nicht gesucht', stage_id: 6 },
    ])

    const phasen = await ladePhasenFuerListe(['0926/2081TG', '0926/9999XX'])
    expect(phasen.get('0926/2081TG')).toBe('Versendet')
    expect(phasen.has('0926/9999XX')).toBe(false)
    expect(phasen.has('nicht gesucht')).toBe(false)
  })

  it('lässt ein doppelt vergebenes Aktenzeichen ohne Phase, statt eine zu raten', async () => {
    vi.stubEnv('PIPEDRIVE_API_TOKEN', 'geheim')
    listeOffeneDeals.mockResolvedValueOnce([
      { id: 1, title: '0926/2081TG', stage_id: 7 },
      { id: 2, title: '0926/2081TG', stage_id: 8 },
    ])

    const phasen = await ladePhasenFuerListe(['0926/2081TG'])
    expect(phasen.has('0926/2081TG')).toBe(false)
  })

  it('gibt eine leere Zuordnung zurück, wenn der Abruf scheitert, statt zu werfen', async () => {
    vi.stubEnv('PIPEDRIVE_API_TOKEN', 'geheim')
    listeOffeneDeals.mockRejectedValueOnce(new Error('Pipedrive antwortete mit 502'))

    const phasen = await ladePhasenFuerListe(['0926/2081TG'])
    expect(phasen).toEqual(new Map())
  })
})
