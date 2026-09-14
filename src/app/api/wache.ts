import 'server-only'
import { aktuellerBenutzer, type AngemeldeterBenutzer } from '@/auth/sitzung'
import { benutzerZuApiToken } from '@/auth/api-token'

/**
 * Die Anmeldeprüfung für Routen — mit einer ehrlichen Antwort.
 *
 * `verlangeBenutzer()` wirft. In einer Server Action ist das richtig: der
 * Fehler landet in der Rückmeldung des Formulars. In einer Route wird daraus
 * eine unbehandelte Ausnahme und damit HTTP 500 — die Auskunft „auf unserer
 * Seite ist etwas kaputt", wo in Wahrheit nur die Anmeldung fehlt. Wer ein
 * Bild in einem zweiten Tab öffnet, nachdem die Sitzung abgelaufen ist, sah
 * genau das.
 *
 * Deshalb hier: 401 statt 500. Aufruf immer nach diesem Muster —
 *
 *     const benutzer = await benutzerOderAntwort()
 *     if (benutzer instanceof Response) return benutzer
 *
 * danach ist `benutzer` für TypeScript der angemeldete Benutzer.
 */
export async function benutzerOderAntwort(): Promise<AngemeldeterBenutzer | Response> {
  const b = await aktuellerBenutzer()
  if (b) return b

  return new Response('Nicht angemeldet.', {
    status: 401,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  })
}

/**
 * Die Anmeldeprüfung für die JSON-API unter `/api/v1/*`.
 *
 * Anders als `benutzerOderAntwort()` erwartet diese Wache kein Sitzungscookie,
 * sondern den Kopf `Authorization: Bearer <token>` — Konsumenten dieser API
 * sind Skripte und Automatisierungen, keine Browser mit einer Sitzung. Und
 * anders als die Session-Wache antwortet sie bei Ablehnung als JSON, nicht
 * als Klartext: wer eine API aufruft, erwartet JSON, auch im Fehlerfall.
 *
 * Aufruf immer nach demselben Muster wie `benutzerOderAntwort()`:
 *
 *     const benutzer = await apiBenutzerOderAntwort(anfrage)
 *     if (benutzer instanceof Response) return benutzer
 */
export async function apiBenutzerOderAntwort(
  anfrage: Request,
): Promise<AngemeldeterBenutzer | Response> {
  const kopf = anfrage.headers.get('authorization') ?? ''
  const treffer = /^Bearer\s+(.+)$/i.exec(kopf.trim())
  const token = treffer?.[1]?.trim()

  if (!token) {
    return apiFehlerAntwort(
      401,
      'Kein API-Token übergeben. Erwartet wird der Kopf "Authorization: Bearer <token>".',
    )
  }

  const benutzer = await benutzerZuApiToken(token)
  if (!benutzer) {
    return apiFehlerAntwort(401, 'Das API-Token ist ungültig, abgelaufen oder widerrufen.')
  }

  return benutzer
}

/** Eine erfolgreiche JSON-Antwort der API. */
export function apiJsonAntwort(daten: unknown, status = 200): Response {
  return new Response(JSON.stringify(daten), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  })
}

/** Eine JSON-Fehlerantwort der API — `{ "fehler": "…" }`, plus optionale Zusatzfelder. */
export function apiFehlerAntwort(
  status: number,
  fehler: string,
  zusatz?: Record<string, unknown>,
): Response {
  return apiJsonAntwort({ fehler, ...zusatz }, status)
}
