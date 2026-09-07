import { cookies } from 'next/headers'
import { NextResponse, type NextRequest } from 'next/server'
import { eq, sql } from 'drizzle-orm'
import { db } from '@/db'
import { benutzer } from '@/db/schema'
import { leseEntraKonfiguration, tauscheCodeGegenKonto } from '@/auth/entra'
import { raeumeAbgelaufeneSitzungen, starteSitzung } from '@/auth/sitzung'
import { STARTSEITE } from '@/auth/startseite'

function zurueck(grund: string): NextResponse {
  const basis = process.env.APP_BASIS_URL ?? 'http://localhost:3000'
  return NextResponse.redirect(new URL(`/anmelden?fehler=${encodeURIComponent(grund)}`, basis))
}

export async function GET(anfrage: NextRequest) {
  const konfig = leseEntraKonfiguration()
  if (!konfig) return zurueck('entra-nicht-konfiguriert')

  const suche = anfrage.nextUrl.searchParams
  if (suche.get('error')) return zurueck(suche.get('error') ?? 'entra-abbruch')

  const code = suche.get('code')
  const state = suche.get('state')

  const speicher = await cookies()
  const erwarteterState = speicher.get('entra_state')?.value
  const nonce = speicher.get('entra_nonce')?.value
  const verifier = speicher.get('entra_verifier')?.value

  // Die Einmalwerte gelten nur für diesen Versuch.
  for (const name of ['entra_state', 'entra_nonce', 'entra_verifier']) {
    speicher.delete({ name, path: '/api/auth/entra' })
  }

  if (!code || !state || !erwarteterState || !nonce || !verifier) {
    return zurueck('entra-sitzung-abgelaufen')
  }
  if (state !== erwarteterState) return zurueck('entra-state-ungueltig')

  let konto
  try {
    konto = await tauscheCodeGegenKonto(konfig, { code, verifier, nonce })
  } catch (fehler) {
    console.error('Entra-Anmeldung fehlgeschlagen:', fehler)
    return zurueck('entra-pruefung-fehlgeschlagen')
  }

  // Zuerst über die unveränderliche Objekt-ID suchen, dann über die Adresse:
  // so wird ein vorab angelegtes Konto beim ersten Anmelden verknüpft.
  const nachOid = await db
    .select()
    .from(benutzer)
    .where(eq(benutzer.entraOid, konto.oid))
    .limit(1)

  let konto_ = nachOid[0]

  if (!konto_) {
    const nachEmail = await db
      .select()
      .from(benutzer)
      .where(sql`lower(${benutzer.email}) = ${konto.email}`)
      .limit(1)
    konto_ = nachEmail[0]

    if (konto_) {
      await db
        .update(benutzer)
        .set({ entraOid: konto.oid, name: konto.name })
        .where(eq(benutzer.id, konto_.id))
    }
  }

  if (!konto_) {
    if (!konfig.autoAnlegen) return zurueck('kein-konto')
    const [angelegt] = await db
      .insert(benutzer)
      .values({
        email: konto.email,
        name: konto.name,
        entraOid: konto.oid,
        // Neue Konten bekommen immer die geringste Berechtigung. Freigeben
        // darf erst, wer die Rolle ausdrücklich zugewiesen bekommt (E5).
        rolle: 'ersteller',
      })
      .returning()
    konto_ = angelegt
  }

  if (!konto_ || !konto_.aktiv) return zurueck('konto-gesperrt')

  await raeumeAbgelaufeneSitzungen()
  await starteSitzung(konto_.id)
  await db
    .update(benutzer)
    .set({ letzteAnmeldung: new Date() })
    .where(eq(benutzer.id, konto_.id))

  const basis = process.env.APP_BASIS_URL ?? 'http://localhost:3000'
  return NextResponse.redirect(new URL(STARTSEITE, basis))
}
