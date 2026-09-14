import 'server-only'
import { createHash, randomBytes } from 'node:crypto'
import { and, desc, eq, isNull } from 'drizzle-orm'
import { db } from '@/db'
import { apiToken, benutzer } from '@/db/schema'
import type { AngemeldeterBenutzer } from './sitzung'
import type { ApiTokenAblauf } from './api-token-typen'

// Weitergereicht, damit bestehende Importe von hier aus funktionieren; der
// Browser bezieht die Liste direkt aus `api-token-typen.ts` — siehe dort.
export type { ApiTokenAblauf }
export { API_TOKEN_ABLAEUFE } from './api-token-typen'

/**
 * Persönliche API-Tokens für `/api/v1/*`.
 *
 * Dasselbe Hashing-Muster wie das Sitzungscookie (`sitzung.ts`): in der
 * Datenbank liegt nur der SHA-256-Hash, das Klartext-Token gibt es genau
 * einmal — bei der Erzeugung — und danach nie wieder.
 *
 * Ein deutlich erkennbares Präfix (`cockpit_`) ist Absicht: ein Token, das
 * versehentlich in ein Protokoll oder einen Commit gerät, ist damit als
 * solches erkennbar. `schwaerzen.ts` greift trotzdem schon vorher — die
 * Regel für `Bearer <token>` im Kopf einer Anfrage kennt kein Präfix.
 */

const PRAEFIX = 'cockpit_'
/** So viele Zeichen des Klartextes stehen unverschlüsselt in der Liste. */
const SICHTBARE_STELLEN = 8

const TAG_MS = 24 * 60 * 60 * 1000

function ablaufDatum(ablauf: ApiTokenAblauf): Date | null {
  switch (ablauf) {
    case '90-tage':
      return new Date(Date.now() + 90 * TAG_MS)
    case '1-jahr':
      return new Date(Date.now() + 365 * TAG_MS)
    case 'nie':
      return null
  }
}

/** In der Datenbank liegt nur der Hash — wie beim Sitzungscookie. */
export function hasheApiToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export interface ErzeugtesApiToken {
  id: string
  /** Nur hier vorhanden — wird nie wieder ausgegeben. */
  klartext: string
  praefix: string
  laeuftAbAm: Date | null
}

export async function erzeugeApiToken(
  benutzerId: string,
  name: string,
  ablauf: ApiTokenAblauf,
): Promise<ErzeugtesApiToken> {
  const klartext = `${PRAEFIX}${randomBytes(32).toString('base64url')}`
  const laeuftAbAm = ablaufDatum(ablauf)

  const [zeile] = await db
    .insert(apiToken)
    .values({
      benutzerId,
      name: name.trim(),
      tokenHash: hasheApiToken(klartext),
      praefix: klartext.slice(0, PRAEFIX.length + SICHTBARE_STELLEN),
      laeuftAbAm,
    })
    .returning({ id: apiToken.id })

  return { id: zeile!.id, klartext, praefix: klartext.slice(0, PRAEFIX.length + SICHTBARE_STELLEN), laeuftAbAm }
}

export type ApiTokenStatus = 'aktiv' | 'abgelaufen' | 'widerrufen'

/** Reine Funktion — Grundlage der Anzeige und der Prüfung beim Zugriff. */
export function apiTokenStatus(t: {
  laeuftAbAm: Date | string | null
  widerrufenAm: Date | string | null
}): ApiTokenStatus {
  if (t.widerrufenAm) return 'widerrufen'
  if (t.laeuftAbAm && new Date(t.laeuftAbAm).getTime() <= Date.now()) return 'abgelaufen'
  return 'aktiv'
}

/** Alle Tokens eines Benutzers, neueste zuerst. */
export async function ladeApiTokens(benutzerId: string) {
  return db
    .select()
    .from(apiToken)
    .where(eq(apiToken.benutzerId, benutzerId))
    .orderBy(desc(apiToken.erstelltAm))
}

/**
 * Widerruft ein Token. Gibt `false`, wenn es nicht existiert, nicht dem
 * Benutzer gehört oder schon widerrufen ist — dieselbe Antwort für alle drei,
 * damit ein Zugriffsversuch auf ein fremdes Token nicht verrät, dass es
 * existiert.
 */
export async function widerrufeApiToken(benutzerId: string, tokenId: string): Promise<boolean> {
  const zeilen = await db
    .update(apiToken)
    .set({ widerrufenAm: new Date() })
    .where(
      and(
        eq(apiToken.id, tokenId),
        eq(apiToken.benutzerId, benutzerId),
        isNull(apiToken.widerrufenAm),
      ),
    )
    .returning({ id: apiToken.id })
  return zeilen.length > 0
}

/**
 * Liest den Benutzer zu einem Klartext-Token, oder `null`.
 *
 * Geprüft wird gegen den Hash, nie gegen den Klartext — ein hochentropisches
 * Zufallstoken braucht kein `scrypt` wie ein Passwort, ein einfacher
 * Hashvergleich reicht (dieselbe Abwägung wie beim Sitzungscookie).
 *
 * `letzteVerwendungAm` wird nachgetragen, aber bewusst nicht abgewartet: ein
 * API-Aufruf soll nicht auf eine reine Buchhaltungsspalte warten, und ein
 * gescheiterter Nebeneffekt darf die eigentliche Antwort nicht verzögern
 * oder gar verhindern.
 */
export async function benutzerZuApiToken(token: string): Promise<AngemeldeterBenutzer | null> {
  const hash = hasheApiToken(token)

  const zeilen = await db
    .select({
      tokenId: apiToken.id,
      laeuftAbAm: apiToken.laeuftAbAm,
      widerrufenAm: apiToken.widerrufenAm,
      id: benutzer.id,
      name: benutzer.name,
      email: benutzer.email,
      rolle: benutzer.rolle,
      aktiv: benutzer.aktiv,
    })
    .from(apiToken)
    .innerJoin(benutzer, eq(apiToken.benutzerId, benutzer.id))
    .where(eq(apiToken.tokenHash, hash))
    .limit(1)

  const treffer = zeilen[0]
  if (!treffer || !treffer.aktiv) return null
  if (apiTokenStatus(treffer) !== 'aktiv') return null

  db.update(apiToken)
    .set({ letzteVerwendungAm: new Date() })
    .where(eq(apiToken.id, treffer.tokenId))
    .catch(() => {
      // Reine Buchhaltung — ein Fehlschlag hier darf den Zugriff nicht rückgängig machen.
    })

  return { id: treffer.id, name: treffer.name, email: treffer.email, rolle: treffer.rolle }
}
