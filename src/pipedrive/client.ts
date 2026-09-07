/**
 * Pipedrive-Zugriff, bewusst schmal: das Cockpit liest den Deal zu einem Fall,
 * um Phase, Schadenhöhe und den Rechnungsverweis in der Fallakte zu zeigen.
 *
 * **Geschrieben wird hier nichts.** Das erledigen weiterhin die vorhandenen
 * n8n-Workflows — zwei Stellen, die denselben Deal pflegen, wären zwei
 * Wahrheiten über denselben Vorgang.
 *
 * Die Feldschlüssel stammen aus `GET /dealFields` des Kontos (abgefragt am
 * 07.09.2026). Sie sind kontospezifisch: wird ein Feld in Pipedrive neu
 * angelegt, bekommt es einen neuen Schlüssel, und dieser hier muss mit.
 */

export const dealFelder = {
  autoixpertId: 'f6970a4fb3ed5c0520ba2ff1c84ec3becb422659',
  autoixpertLink: '102c6f8c0eb82cace7aa8ed3e77c06dcd3485a2a',
  schadennummer: '21378b56f922a8095b261f1fcefb056bdf0c3ecf',
  kennzeichen: '00e9babb88454e04c01ae593a6402e8f9c401fb8',
  schadenhoeheBrutto: 'adb0956f0161f534c04d43a1627acb23e692fea6',
  schadenhoeheNetto: '4ceb36746f5a9faa66cce4e2aa68f9191d43d7dc',
  sevdeskRechnungId: 'd8863fcbcb97aeb225a9418261b5508c0410783f',
  sevdeskRechnungLink: 'ee8bc622d857b546eca74c56a303f1373b05047c',
  ausgebuchterBetrag: 'c4ae5d687eacc0bbe5c05a1d70ec447644d4eb3f',
  ausgebuchterBetragGrund: 'a037653e87dd01a3ab9946c9741ff2db41de64f3',
} as const

/** Phasen der Pipeline „Auftrag" (ID 2), abgefragt am 07.09.2026. */
export const phasenNamen: Record<number, string> = {
  6: 'Aufgenommen',
  7: 'In Bearbeitung',
  8: 'Versendet',
  9: 'Teilbezahlt',
  10: 'Bezahlt',
  11: 'Klage',
}

export interface Deal {
  id: number
  title?: string
  stage_id?: number
  status?: string
  value?: number
  currency?: string
  custom_fields?: Record<string, unknown>
  [key: string]: unknown
}

/**
 * Der Wert eines Pipedrive-Geldfeldes steckt je nach API-Fassung
 * unterschiedlich tief: mal als Zahl, mal als `{ value, currency }`.
 */
export function monetaerWert(roh: unknown): number | undefined {
  if (typeof roh === 'number') return roh
  if (roh && typeof roh === 'object' && 'value' in roh) {
    const wert = (roh as { value: unknown }).value
    if (typeof wert === 'number') return wert
  }
  return undefined
}

function token(): string {
  return process.env.PIPEDRIVE_API_TOKEN ?? ''
}

function basisUrl(): string {
  return process.env.PIPEDRIVE_BASE_URL ?? 'https://api.pipedrive.com/api/v2'
}

async function anfrage<T>(pfad: string, suche: Record<string, string | number> = {}) {
  const url = new URL(basisUrl() + pfad)
  for (const [schluessel, wert] of Object.entries(suche)) {
    url.searchParams.set(schluessel, String(wert))
  }
  url.searchParams.set('api_token', token())

  const antwort = await fetch(url, { cache: 'no-store' })
  if (!antwort.ok) {
    throw new Error(`Pipedrive antwortete mit ${antwort.status} auf ${pfad}.`)
  }
  const rumpf = (await antwort.json()) as { data?: T }
  return rumpf.data
}

export const pipedrive = {
  /**
   * Sucht den Deal zu einem Fall. Der Volltextindex trifft Aktenzeichen,
   * Kennzeichen und Titel — genau die Signale, die der Deal-Index-Workflow
   * ohnehin nächtlich pflegt.
   *
   * Ohne Zugangsdaten oder ohne Suchbegriff wird gar nicht erst angefragt:
   * eine Anfrage ohne Token käme als Fehler zurück und stünde dann als
   * „kein Deal gefunden" in der Akte — was etwas anderes bedeutet.
   */
  async findeDeal(suchbegriff: string): Promise<Deal | undefined> {
    if (!token() || !suchbegriff.trim()) return undefined
    const daten = await anfrage<{ items?: { item: Deal }[] }>('/deals/search', {
      term: suchbegriff,
      limit: 1,
    })
    return daten?.items?.[0]?.item
  },
}
