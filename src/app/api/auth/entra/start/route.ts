import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { baueAnmeldeUrl, leseEntraKonfiguration, zufallswert } from '@/auth/entra'
import { nurUeberHttps } from '@/auth/sitzung'

/** Startet die Anmeldung: erzeugt state, nonce und PKCE-Verifier. */
export async function GET() {
  const konfig = leseEntraKonfiguration()
  if (!konfig) {
    return NextResponse.redirect(
      new URL('/anmelden?fehler=entra-nicht-konfiguriert', process.env.APP_BASIS_URL ?? 'http://localhost:3000'),
    )
  }

  const state = zufallswert()
  const nonce = zufallswert()
  const verifier = zufallswert()

  const speicher = await cookies()
  const gemeinsam = {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: nurUeberHttps(),
    path: '/api/auth/entra',
    // Kurz gültig: der Umweg über Entra dauert selten länger als ein paar Minuten.
    maxAge: 600,
  }
  speicher.set('entra_state', state, gemeinsam)
  speicher.set('entra_nonce', nonce, gemeinsam)
  speicher.set('entra_verifier', verifier, gemeinsam)

  return NextResponse.redirect(baueAnmeldeUrl(konfig, { state, nonce, verifier }))
}
