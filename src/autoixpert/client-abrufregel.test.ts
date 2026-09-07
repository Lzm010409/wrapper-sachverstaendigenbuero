import { describe, expect, it, vi } from 'vitest'
import { AutoixpertClient } from './client'
import { AbrufregelVerletzt, type Abrufregel } from './abrufregel'
import { BEISPIEL_GUTACHTEN } from './fixtures'

/**
 * Belegt, dass die Abrufregel im Client wirkt und nicht nur im Aufrufer.
 * Der Betreiber hat den Zugriff eingegrenzt; eine Sperre, die sich durch
 * einen anderen Aufruf umgehen laesst, waere keine.
 */

const ENG: Abrufregel = {
  nurOffene: true,
  fruehestensErstellt: '2026-05-01T00:00:00.000Z',
  schreibenErlaubt: false,
}

const BASIS = 'https://api.test/externalApi/v1'

function stelleFetch(antwort: (url: URL) => { status?: number; koerper?: unknown }) {
  const aufrufe: URL[] = []
  const hole = vi.fn(async (eingabe: string | URL | Request) => {
    const url = new URL(String(eingabe))
    aufrufe.push(url)
    const { status = 200, koerper = {} } = antwort(url)
    return new Response(JSON.stringify(koerper), {
      status,
      headers: { 'content-type': 'application/json' },
    })
  }) as unknown as typeof fetch
  return { hole, aufrufe }
}

describe('Abrufregel im Client', () => {
  it('haengt die Pflichtfilter an jede Listenabfrage', async () => {
    const { hole, aufrufe } = stelleFetch(() => ({ koerper: { reports: [] } }))
    const client = new AutoixpertClient({ token: 't', basisUrl: BASIS, hole, regel: ENG })

    await client.listeGutachten({ limit: 10 })

    expect(aufrufe[0]!.searchParams.get('is_open')).toBe('true')
    expect(aufrufe[0]!.searchParams.get('created_at_gte')).toBe(
      '2026-05-01T00:00:00.000Z',
    )
  })

  it('laesst die Filter vom Aufrufer nicht ueberschreiben', async () => {
    const { hole, aufrufe } = stelleFetch(() => ({ koerper: { reports: [] } }))
    const client = new AutoixpertClient({ token: 't', basisUrl: BASIS, hole, regel: ENG })

    // Ein Aufrufer, der die Sperre aufweichen will - absichtlich.
    await client.listeGutachten({ limit: 10 } as never)
    const url = aufrufe[0]!
    expect(url.searchParams.get('is_open')).toBe('true')
  })

  it('weist ein Gutachten ausserhalb der Regel auch beim Einzelabruf ab', async () => {
    // Das Beispielgutachten stammt aus Maerz 2026 - vor der Grenze.
    const { hole } = stelleFetch(() => ({ koerper: { report: BEISPIEL_GUTACHTEN } }))
    const client = new AutoixpertClient({ token: 't', basisUrl: BASIS, hole, regel: ENG })

    await expect(client.holeGutachten('OmCMeaXCDs')).rejects.toBeInstanceOf(
      AbrufregelVerletzt,
    )
  })

  it('versucht beim Aktenzeichen zuerst die externe ID mit Unterstrich', async () => {
    // Der Schraegstrich in `token` ist im Pfad kein gueltiges Zeichen. Traefe
    // der Client ihn zuerst, liefe er in die teure Listensuche.
    const gutachten = {
      ...BEISPIEL_GUTACHTEN,
      created_at: '2026-09-06T08:00:00.000Z',
      state: 'recorded',
    }
    const { hole, aufrufe } = stelleFetch((url) =>
      url.pathname.endsWith('0926_2081TG')
        ? { koerper: { report: gutachten } }
        : { status: 404 },
    )
    const client = new AutoixpertClient({ token: 't', basisUrl: BASIS, hole, regel: ENG })

    const ergebnis = await client.loeseAuf('0926/2081TG')

    expect(ergebnis.weg).toBe('id_oder_external_id')
    expect(ergebnis.gelesendeSeiten).toBe(0)
    expect(aufrufe).toHaveLength(1)
    expect(decodeURIComponent(aufrufe[0]!.pathname)).toContain('0926_2081TG')
  })
})
