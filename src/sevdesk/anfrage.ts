import 'server-only'

/**
 * Der gemeinsame Weg zu sevDesk.
 *
 * Vorher stand die Anfragefunktion zweimal da — einmal für die Rechnungen,
 * einmal für die Kontakte. Zwei Stellen mit demselben Zeitlimit, demselben
 * Kopfzeilenaufbau und derselben Fehlermeldung sind zwei Stellen, an denen
 * das nächste Mal nur eine geändert wird.
 *
 * **Der Token geht als `authorization` ohne „Bearer".** So verlangt es
 * sevDesk; mit Präfix kommt eine 401 zurück, die nach einem falschen Token
 * aussieht.
 */

const ZEITLIMIT_MS = 30_000

export class SevdeskAnfragefehler extends Error {
  constructor(
    nachricht: string,
    readonly status: number | undefined,
    /** Die Antwort von sevDesk, gekürzt — sie nennt oft den eigentlichen Grund. */
    readonly antwort?: string,
  ) {
    super(nachricht)
    this.name = 'SevdeskAnfragefehler'
  }
}

export function basisUrl(): string {
  return process.env.SEVDESK_BASIS_URL ?? 'https://my.sevdesk.de/api/v1'
}

export function eingerichtet(): boolean {
  return Boolean(process.env.SEVDESK_API_TOKEN)
}

async function ruf(pfad: string, optionen: RequestInit = {}): Promise<unknown> {
  const token = process.env.SEVDESK_API_TOKEN
  if (!token) throw new SevdeskAnfragefehler('sevDesk ist auf diesem Server nicht eingerichtet.', undefined)

  let antwort: Response
  try {
    antwort = await fetch(basisUrl() + pfad, {
      ...optionen,
      headers: { authorization: token, ...(optionen.headers ?? {}) },
      signal: AbortSignal.timeout(ZEITLIMIT_MS),
    })
  } catch (fehler) {
    const abgelaufen = fehler instanceof Error && fehler.name === 'TimeoutError'
    throw new SevdeskAnfragefehler(
      abgelaufen
        ? `sevDesk hat nicht innerhalb von ${ZEITLIMIT_MS / 1000} Sekunden geantwortet.`
        : `sevDesk ist nicht erreichbar: ${fehler instanceof Error ? fehler.message : String(fehler)}`,
      undefined,
    )
  }

  const text = await antwort.text()
  if (!antwort.ok) {
    throw new SevdeskAnfragefehler(
      `sevDesk antwortete mit ${antwort.status} auf ${pfad}.`,
      antwort.status,
      text.slice(0, 400),
    )
  }
  try {
    return text ? JSON.parse(text) : null
  } catch {
    throw new SevdeskAnfragefehler(`Die Antwort auf ${pfad} war kein JSON.`, antwort.status, text.slice(0, 200))
  }
}

/** Ein GET. */
export function holeJson(pfad: string): Promise<unknown> {
  return ruf(pfad)
}

/**
 * Ein schreibender Aufruf.
 *
 * Bewusst mit ausgeschriebener Methode statt einer eigenen Funktion je Verb:
 * so steht an der Aufrufstelle, was passiert, und niemand muss raten, ob
 * `aendere()` nun PUT oder PATCH schickt.
 */
export function schreibeJson(
  pfad: string,
  methode: 'PUT' | 'POST' | 'DELETE',
  rumpf?: unknown,
): Promise<unknown> {
  return ruf(pfad, {
    method: methode,
    ...(rumpf === undefined
      ? {}
      : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(rumpf) }),
  })
}

/** Die `objects` einer Listenantwort, ohne Rücksicht auf ihren Inhalt. */
export function objekte(roh: unknown): unknown[] {
  if (roh && typeof roh === 'object' && 'objects' in roh) {
    const inhalt = (roh as { objects: unknown }).objects
    if (Array.isArray(inhalt)) return inhalt
    if (inhalt && typeof inhalt === 'object') return [inhalt]
  }
  return []
}
