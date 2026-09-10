import 'server-only'
import { aktuellerBenutzer, type AngemeldeterBenutzer } from '@/auth/sitzung'

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
