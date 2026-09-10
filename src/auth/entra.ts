import 'server-only'
import { createHash, randomBytes } from 'node:crypto'
import { createRemoteJWKSet, jwtVerify } from 'jose'

/**
 * Anmeldung über Microsoft Entra ID mit OpenID Connect
 * (Authorization Code Flow mit PKCE).
 *
 * Bewusst ohne Fremdbibliothek für den Ablauf selbst: es sind zwei
 * HTTP-Aufrufe und eine Token-Prüfung, und so bleibt nachvollziehbar,
 * was mit den Anmeldedaten passiert. Die Signaturprüfung des ID-Tokens
 * übernimmt `jose` gegen den öffentlichen Schlüsselsatz des Tenants.
 */

export interface EntraKonfiguration {
  tenantId: string
  clientId: string
  clientSecret: string
  /** Vollständige Rückleit-URL, muss in Entra hinterlegt sein. */
  redirectUri: string
  /**
   * Ob unbekannte Konten aus dem Tenant automatisch angelegt werden.
   * Standard ist aus: dann kann sich nur anmelden, wer vorher in der
   * Benutzerverwaltung eingetragen wurde.
   */
  autoAnlegen: boolean
}

export function leseEntraKonfiguration(): EntraKonfiguration | null {
  const tenantId = process.env.ENTRA_TENANT_ID
  const clientId = process.env.ENTRA_CLIENT_ID
  const clientSecret = process.env.ENTRA_CLIENT_SECRET
  const basis = process.env.APP_BASIS_URL

  if (!tenantId || !clientId || !clientSecret || !basis) return null

  return {
    tenantId,
    clientId,
    clientSecret,
    redirectUri: new URL('/api/auth/entra/callback', basis).toString(),
    autoAnlegen: process.env.ENTRA_AUTO_ANLEGEN === 'true',
  }
}

export function istEntraAktiv(): boolean {
  return leseEntraKonfiguration() !== null
}

function basisUrl(tenantId: string): string {
  return `https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/oauth2/v2.0`
}

/** Zufallswert für `state`, `nonce` und den PKCE-Verifier. */
export function zufallswert(): string {
  return randomBytes(32).toString('base64url')
}

/** PKCE: S256-Ableitung des Verifiers. */
export function codeChallenge(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url')
}

export function baueAnmeldeUrl(
  konfig: EntraKonfiguration,
  args: { state: string; nonce: string; verifier: string },
): string {
  const url = new URL(`${basisUrl(konfig.tenantId)}/authorize`)
  url.searchParams.set('client_id', konfig.clientId)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('redirect_uri', konfig.redirectUri)
  url.searchParams.set('response_mode', 'query')
  url.searchParams.set('scope', 'openid profile email')
  url.searchParams.set('state', args.state)
  url.searchParams.set('nonce', args.nonce)
  url.searchParams.set('code_challenge', codeChallenge(args.verifier))
  url.searchParams.set('code_challenge_method', 'S256')
  return url.toString()
}

export interface EntraKonto {
  oid: string
  email: string
  name: string
}

const jwksZwischenspeicher = new Map<string, ReturnType<typeof createRemoteJWKSet>>()

function jwks(tenantId: string) {
  const schluessel = tenantId
  let vorhanden = jwksZwischenspeicher.get(schluessel)
  if (!vorhanden) {
    vorhanden = createRemoteJWKSet(
      new URL(`https://login.microsoftonline.com/${tenantId}/discovery/v2.0/keys`),
    )
    jwksZwischenspeicher.set(schluessel, vorhanden)
  }
  return vorhanden
}

/**
 * Tauscht den Autorisierungscode gegen Tokens und prüft das ID-Token:
 * Signatur gegen den Schlüsselsatz des Tenants, Aussteller, Zielgruppe und
 * `nonce`. Erst danach gilt das Konto als bestätigt.
 */
export async function tauscheCodeGegenKonto(
  konfig: EntraKonfiguration,
  args: { code: string; verifier: string; nonce: string },
): Promise<EntraKonto> {
  const antwort = await fetch(`${basisUrl(konfig.tenantId)}/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: konfig.clientId,
      client_secret: konfig.clientSecret,
      grant_type: 'authorization_code',
      code: args.code,
      redirect_uri: konfig.redirectUri,
      code_verifier: args.verifier,
      scope: 'openid profile email',
    }),
  })

  if (!antwort.ok) {
    const text = await antwort.text().catch(() => '')
    throw new Error(
      `Entra hat den Code nicht angenommen (HTTP ${antwort.status}). ${text.slice(0, 300)}`,
    )
  }

  const daten = (await antwort.json()) as { id_token?: string }
  if (!daten.id_token) throw new Error('Entra hat kein ID-Token geliefert.')

  const { payload } = await jwtVerify(daten.id_token, jwks(konfig.tenantId), {
    issuer: `https://login.microsoftonline.com/${konfig.tenantId}/v2.0`,
    audience: konfig.clientId,
  })

  if (payload.nonce !== args.nonce) {
    throw new Error('Die nonce des ID-Tokens passt nicht zur Anfrage.')
  }

  const oid = typeof payload.oid === 'string' ? payload.oid : null
  if (!oid) throw new Error('Das ID-Token enthält keine Objekt-ID (oid).')

  // Entra liefert die Adresse je nach Kontotyp unter `email`, `preferred_username`
  // oder `upn`. Der erste brauchbare Wert gewinnt.
  const email =
    [payload.email, payload.preferred_username, payload.upn]
      .find((w): w is string => typeof w === 'string' && w.includes('@'))
      ?.toLowerCase() ?? null

  if (!email) throw new Error('Das ID-Token enthält keine Mailadresse.')

  const name =
    (typeof payload.name === 'string' && payload.name.trim()) || email.split('@')[0] || email

  return { oid, email, name }
}
