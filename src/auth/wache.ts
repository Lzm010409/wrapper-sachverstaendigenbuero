import 'server-only'
import { redirect } from 'next/navigation'
import { aktuellerBenutzer, type AngemeldeterBenutzer } from './sitzung'

/**
 * Die Anmeldeprüfung für **Seiten** — vor jedem Laden von Daten aufzurufen.
 *
 * Warum es nicht reicht, das im Layout zu tun:
 *
 * Im App Router rendert Next Layout und Seite **gleichzeitig**. Die Prüfung
 * im Layout warf zwar die Umleitung, die Seite hatte ihre Daten zu diesem
 * Zeitpunkt aber längst geladen und gerendert — und das Ergebnis ging als
 * RSC-Nutzlast im Rumpf der 307-Antwort mit hinaus.
 *
 * Nachgemessen am 07.09.2026 an der laufenden Anwendung: ein `curl` auf
 * `/faelle` **ohne jedes Cookie** lieferte HTTP 307 und im Rumpf Aktenzeichen,
 * Name des Anspruchstellers, Kennzeichen und Gutachtentyp im Klartext. Der
 * Browser folgt der Umleitung und zeigt davon nichts — jeder andere
 * HTTP-Client sieht alles.
 *
 * Deshalb steht die Prüfung jetzt **in der Seite, vor dem ersten Ladevorgang**.
 * `redirect()` bricht die Ausführung sofort ab; es wird nichts geladen, und es
 * entsteht keine Nutzlast, die hinausgehen könnte.
 *
 *     export default async function Seite() {
 *       await verlangeAnmeldung()
 *       const daten = await lade…()   // erst jetzt
 *     }
 *
 * Die Prüfung im Layout bleibt zusätzlich stehen: sie fängt Seiten ab, bei
 * denen der Aufruf hier vergessen wurde. Zwei Riegel, weil das Vergessen die
 * wahrscheinlichste Ursache eines Rückfalls ist.
 */
export async function verlangeAnmeldung(): Promise<AngemeldeterBenutzer> {
  const benutzer = await aktuellerBenutzer()
  if (!benutzer) redirect('/anmelden')
  return benutzer
}
