import 'server-only'
import { timingSafeEqual } from 'node:crypto'
import { aktuellerBenutzer } from '@/auth/sitzung'

/**
 * Wer die Kleinanzeigen-Schnittstelle des Cockpits benutzen darf.
 *
 * Zwei Aufrufer, zwei Wege:
 *
 * - **Das WBW-Plugin.** Es läuft als eigener Prozess im selben Container und
 *   spricht über `127.0.0.1` gegen dieselbe Anwendung. Ein Sitzungscookie hat
 *   es nicht; es weist sich mit `KA_API_USER`/`KA_API_PASS` aus — genau den
 *   beiden Variablen, mit denen es sich vorher beim ausgelagerten Dienst
 *   angemeldet hat. Am Plugin ändert sich dadurch nichts.
 * - **Ein angemeldeter Mensch**, der die Schnittstelle im Browser prüft.
 *
 * Ohne beides: 401. Die Anwendung steht unter einer öffentlichen Adresse; ein
 * offener Abrufdienst wäre eine Einladung, über unsere Anschrift fremde
 * Seiten zu holen.
 */

/** Vergleich ohne Laufzeitverrat. */
function gleich(a: string, b: string): boolean {
  const links = Buffer.from(a, 'utf8')
  const rechts = Buffer.from(b, 'utf8')
  if (links.length !== rechts.length) return false
  return timingSafeEqual(links, rechts)
}

/** Die hinterlegten Zugangsdaten, oder `null`, wenn keine gesetzt sind. */
function hinterlegt(): { benutzer: string; passwort: string } | null {
  const benutzer = process.env.KA_API_USER
  const passwort = process.env.KA_API_PASS
  if (!benutzer || !passwort) return null
  return { benutzer, passwort }
}

/** Liest `Authorization: Basic …`. */
function basisAnmeldung(anfrage: Request): { benutzer: string; passwort: string } | null {
  const kopf = anfrage.headers.get('authorization')
  if (!kopf?.toLowerCase().startsWith('basic ')) return null
  let entschluesselt: string
  try {
    entschluesselt = Buffer.from(kopf.slice(6).trim(), 'base64').toString('utf8')
  } catch {
    return null
  }
  const trenner = entschluesselt.indexOf(':')
  if (trenner === -1) return null
  return {
    benutzer: entschluesselt.slice(0, trenner),
    passwort: entschluesselt.slice(trenner + 1),
  }
}

/**
 * Gibt `null` zurück, wenn der Zugriff erlaubt ist — sonst die Absage.
 *
 * Aufruf immer nach diesem Muster:
 *
 *     const absage = await pruefeZugang(anfrage)
 *     if (absage) return absage
 */
export async function pruefeZugang(anfrage: Request): Promise<Response | null> {
  const soll = hinterlegt()
  const ist = basisAnmeldung(anfrage)
  if (soll && ist && gleich(soll.benutzer, ist.benutzer) && gleich(soll.passwort, ist.passwort)) {
    return null
  }

  if (await aktuellerBenutzer()) return null

  return new Response('Nicht angemeldet.', {
    status: 401,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'WWW-Authenticate': 'Basic realm="WBW-Beschaffung", charset="UTF-8"',
      'Cache-Control': 'no-store',
    },
  })
}
