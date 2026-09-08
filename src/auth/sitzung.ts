import 'server-only'
import { createHash, randomBytes } from 'node:crypto'
import { cookies } from 'next/headers'
import { and, eq, gt, lt } from 'drizzle-orm'
import { db } from '@/db'
import { benutzer, sitzung } from '@/db/schema'

export { COOKIE_NAME } from './sitzung-name'
import { COOKIE_NAME } from './sitzung-name'
const GUELTIGKEIT_TAGE = 14

/**
 * Ob das Sitzungscookie als `Secure` gesetzt wird.
 *
 * Ausschlaggebend ist die tatsächliche Adresse der Anwendung, nicht
 * `NODE_ENV`: ein Produktionsbau hinter einem Proxy ohne TLS würde sonst ein
 * `Secure`-Cookie senden, das der Browser verwirft — die Anmeldung schlüge
 * stumm fehl, ohne erkennbare Ursache.
 */
export function nurUeberHttps(): boolean {
  const basis = process.env.APP_BASIS_URL
  if (basis) return basis.startsWith('https://')
  return process.env.NODE_ENV === 'production'
}

export type Rolle = 'ersteller' | 'freigeber' | 'admin'

export interface AngemeldeterBenutzer {
  id: string
  name: string
  email: string
  rolle: Rolle
}

/**
 * In der Datenbank liegt nur der Hash des Sitzungstokens. Wer die Datenbank
 * liest, kann damit keine Sitzung übernehmen.
 */
function hasheToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

/** Legt eine Sitzung an und setzt das Cookie. Gibt das Rohtoken zurück. */
export async function starteSitzung(benutzerId: string): Promise<void> {
  const token = randomBytes(32).toString('base64url')
  const laeuftAbAm = new Date(Date.now() + GUELTIGKEIT_TAGE * 24 * 60 * 60 * 1000)

  await db.insert(sitzung).values({
    benutzerId,
    tokenHash: hasheToken(token),
    laeuftAbAm,
  })

  const speicher = await cookies()
  speicher.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: nurUeberHttps(),
    path: '/',
    expires: laeuftAbAm,
  })
}

/** Liest den angemeldeten Benutzer, oder `null`. */
export async function aktuellerBenutzer(): Promise<AngemeldeterBenutzer | null> {
  const speicher = await cookies()
  const token = speicher.get(COOKIE_NAME)?.value
  if (!token) return null

  const zeilen = await db
    .select({
      id: benutzer.id,
      name: benutzer.name,
      email: benutzer.email,
      rolle: benutzer.rolle,
      aktiv: benutzer.aktiv,
    })
    .from(sitzung)
    .innerJoin(benutzer, eq(sitzung.benutzerId, benutzer.id))
    .where(and(eq(sitzung.tokenHash, hasheToken(token)), gt(sitzung.laeuftAbAm, new Date())))
    .limit(1)

  const treffer = zeilen[0]
  if (!treffer || !treffer.aktiv) return null

  return {
    id: treffer.id,
    name: treffer.name,
    email: treffer.email,
    rolle: treffer.rolle,
  }
}

/**
 * Wie `aktuellerBenutzer`, wirft aber statt `null` zurückzugeben. Für Server
 * Actions, die ohne Anmeldung nichts tun dürfen.
 */
export async function verlangeBenutzer(): Promise<AngemeldeterBenutzer> {
  const b = await aktuellerBenutzer()
  if (!b) throw new Error('Nicht angemeldet.')
  return b
}

/*
  Hier stand `verlangeFreigeber()` — die einzige Rechteprüfung, die es im
  ganzen Code gab. Sie fragte die Rolle direkt ab und liess `freigeber` und
  `admin` durch.

  Ersetzt durch `verlangeRecht('bibliothek.freigeben')` aus
  `src/rechte/zugriff.ts`. Der Unterschied ist nicht die Strenge, sondern die
  Beweglichkeit: die Freigabe hängt jetzt an einem **Recht**, das eine Rolle
  mitbringt — und das man einem einzelnen Ersteller zusätzlich geben kann,
  ohne ihn zum Freigeber zu machen. Konzept E5 bleibt: kein KI-Aufruf
  erreicht diesen Weg, der Statuswechsel geht ausschliesslich über die
  Oberfläche.
*/

export async function beendeSitzung(): Promise<void> {
  const speicher = await cookies()
  const token = speicher.get(COOKIE_NAME)?.value
  if (token) {
    await db.delete(sitzung).where(eq(sitzung.tokenHash, hasheToken(token)))
  }
  speicher.delete(COOKIE_NAME)
}

/** Räumt abgelaufene Sitzungen weg. Wird beim Anmelden mitgenommen. */
export async function raeumeAbgelaufeneSitzungen(): Promise<void> {
  await db.delete(sitzung).where(lt(sitzung.laeuftAbAm, new Date()))
}
