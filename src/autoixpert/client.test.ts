import { describe, expect, it, vi } from 'vitest'
import { AutoixpertClient, AutoixpertFehler, normalisiere } from './client'
import { OHNE_EINSCHRAENKUNG } from './abrufregel'
import { BEISPIEL_GUTACHTEN, GUTACHTEN_OHNE_ANWALT } from './fixtures'
import type { Gutachten } from './typen'

/** Baut ein `fetch`, das auf feste Pfade antwortet. */
function stelleFetch(
  antworten: (url: URL) => { status?: number; koerper?: unknown },
): { hole: typeof fetch; aufrufe: URL[] } {
  const aufrufe: URL[] = []
  const hole = vi.fn(async (eingabe: string | URL | Request) => {
    const url = new URL(String(eingabe))
    aufrufe.push(url)
    const { status = 200, koerper = {} } = antworten(url)
    return new Response(JSON.stringify(koerper), {
      status,
      headers: { 'content-type': 'application/json' },
    })
  }) as unknown as typeof fetch
  return { hole, aufrufe }
}

const BASIS = 'https://api.test/externalApi/v1'

describe('normalisiere', () => {
  it('macht Aktenzeichen vergleichbar', () => {
    expect(normalisiere(' GA-2026-0147 ')).toBe('ga-2026-0147')
    expect(normalisiere('ga 2026 0147')).toBe('ga20260147')
  })
})

describe('holeGutachten', () => {
  it('holt über den Pfad und schickt den Bearer-Token', async () => {
    const { hole, aufrufe } = stelleFetch(() => ({ koerper: { report: BEISPIEL_GUTACHTEN } }))
    const client = new AutoixpertClient({ token: 'geheim', basisUrl: BASIS, hole, regel: OHNE_EINSCHRAENKUNG })

    const g = await client.holeGutachten('OmCMeaXCDs')

    expect(g.token).toBe('GA-2026-0147')
    expect(aufrufe[0]!.pathname).toBe('/externalApi/v1/reports/OmCMeaXCDs')
  })

  it('meldet einen abgelehnten Zugang verständlich', async () => {
    const { hole } = stelleFetch(() => ({ status: 401 }))
    const client = new AutoixpertClient({ token: 'falsch', basisUrl: BASIS, hole, regel: OHNE_EINSCHRAENKUNG })

    await expect(client.holeGutachten('x')).rejects.toThrow(/Zugang wurde abgelehnt/)
  })

  it('meldet das Anfragenlimit gesondert', async () => {
    const { hole } = stelleFetch(() => ({ status: 429 }))
    const client = new AutoixpertClient({ token: 't', basisUrl: BASIS, hole, regel: OHNE_EINSCHRAENKUNG })

    await expect(client.holeGutachten('x')).rejects.toThrow(/Anfragenlimit/)
  })

  it('beanstandet eine Antwort ohne Gutachten-ID', async () => {
    const { hole } = stelleFetch(() => ({ koerper: { report: { token: 'ohne-id' } } }))
    const client = new AutoixpertClient({ token: 't', basisUrl: BASIS, hole, regel: OHNE_EINSCHRAENKUNG })

    await expect(client.holeGutachten('x')).rejects.toThrow(/unerwartete Form/)
  })

  it('lässt unbekannte Felder durch, statt daran zu scheitern', async () => {
    const { hole } = stelleFetch(() => ({
      koerper: { report: { ...BEISPIEL_GUTACHTEN, brandneues_feld: { a: 1 } } },
    }))
    const client = new AutoixpertClient({ token: 't', basisUrl: BASIS, hole, regel: OHNE_EINSCHRAENKUNG })

    await expect(client.holeGutachten('x')).resolves.toMatchObject({ id: 'OmCMeaXCDs' })
  })
})

describe('loeseAuf', () => {
  it('nimmt zuerst den direkten Pfadzugriff', async () => {
    const { hole, aufrufe } = stelleFetch(() => ({ koerper: { report: BEISPIEL_GUTACHTEN } }))
    const client = new AutoixpertClient({ token: 't', basisUrl: BASIS, hole, regel: OHNE_EINSCHRAENKUNG })

    const ergebnis = await client.loeseAuf('OmCMeaXCDs')

    expect(ergebnis.weg).toBe('id_oder_external_id')
    // Genau ein Lesezugriff — die Liste wird gar nicht erst angefasst.
    expect(aufrufe).toHaveLength(1)
  })

  it('findet über das Aktenzeichen, wenn der Pfad ins Leere läuft', async () => {
    const { hole, aufrufe } = stelleFetch((url) => {
      if (url.pathname.endsWith('/reports')) {
        return { koerper: { reports: [GUTACHTEN_OHNE_ANWALT, BEISPIEL_GUTACHTEN], has_more: false } }
      }
      return { status: 404 }
    })
    const client = new AutoixpertClient({ token: 't', basisUrl: BASIS, hole, regel: OHNE_EINSCHRAENKUNG })

    const ergebnis = await client.loeseAuf('GA-2026-0147')

    expect(ergebnis.weg).toBe('aktenzeichen_suche')
    expect(ergebnis.gutachten.id).toBe('OmCMeaXCDs')
    // Die Suche sortiert nach Aktenzeichen, damit sie früh abbrechen kann.
    expect(aufrufe[1]!.searchParams.get('sort')).toBe('report_token')
  })

  it('blättert weiter, solange has_more gesetzt ist', async () => {
    const spaeter: Gutachten = { ...BEISPIEL_GUTACHTEN, id: 'SpaeteSeite', token: 'GA-2026-0999' }
    let seite = 0
    const { hole } = stelleFetch((url) => {
      if (!url.pathname.endsWith('/reports')) return { status: 404 }
      seite++
      if (seite === 1) {
        return { koerper: { reports: [GUTACHTEN_OHNE_ANWALT], has_more: true, next_page: 'S2' } }
      }
      return { koerper: { reports: [spaeter], has_more: false } }
    })
    const client = new AutoixpertClient({ token: 't', basisUrl: BASIS, hole, regel: OHNE_EINSCHRAENKUNG })

    const ergebnis = await client.loeseAuf('GA-2026-0999')

    expect(ergebnis.gutachten.id).toBe('SpaeteSeite')
    expect(ergebnis.gelesendeSeiten).toBe(2)
  })

  it('bricht die Suche nach zehn Seiten ab und sagt das auch', async () => {
    const { hole } = stelleFetch((url) => {
      if (!url.pathname.endsWith('/reports')) return { status: 404 }
      return { koerper: { reports: [GUTACHTEN_OHNE_ANWALT], has_more: true, next_page: 'weiter' } }
    })
    const client = new AutoixpertClient({ token: 't', basisUrl: BASIS, hole, regel: OHNE_EINSCHRAENKUNG })

    // Ohne Obergrenze liefe die Suche endlos und würde jedes berührte
    // Gutachten kostenpflichtig lesen.
    await expect(client.loeseAuf('gibtesnicht')).rejects.toThrow(/abgebrochen/)
  })

  it('ist unempfindlich gegen Schreibweise und Leerraum', async () => {
    const { hole } = stelleFetch((url) => {
      if (url.pathname.endsWith('/reports')) {
        return { koerper: { reports: [BEISPIEL_GUTACHTEN], has_more: false } }
      }
      return { status: 404 }
    })
    const client = new AutoixpertClient({ token: 't', basisUrl: BASIS, hole, regel: OHNE_EINSCHRAENKUNG })

    await expect(client.loeseAuf(' ga-2026-0147 ')).resolves.toMatchObject({
      gutachten: { id: 'OmCMeaXCDs' },
    })
  })

  it('meldet klar, wenn es den Fall nicht gibt', async () => {
    const { hole } = stelleFetch((url) => {
      if (url.pathname.endsWith('/reports')) return { koerper: { reports: [], has_more: false } }
      return { status: 404 }
    })
    const client = new AutoixpertClient({ token: 't', basisUrl: BASIS, hole, regel: OHNE_EINSCHRAENKUNG })

    await expect(client.loeseAuf('XYZ')).rejects.toThrow(AutoixpertFehler)
    // Die Meldung nennt alle drei Wege, damit klar ist, was geprüft wurde.
    await expect(client.loeseAuf('XYZ')).rejects.toThrow(
      /Kein Gutachten mit dem Aktenzeichen, der ID oder der externen ID/,
    )
  })

  it('reicht einen Netzfehler als solchen weiter', async () => {
    const hole = vi.fn(async () => {
      throw new TypeError('fetch failed')
    }) as unknown as typeof fetch
    const client = new AutoixpertClient({ token: 't', basisUrl: BASIS, hole, regel: OHNE_EINSCHRAENKUNG })

    await expect(client.loeseAuf('x')).rejects.toThrow(/nicht erreichbar/)
  })
})
