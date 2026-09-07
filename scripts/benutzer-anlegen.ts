/**
 * Legt einen Zugang an oder ändert ihn.
 *
 *   pnpm benutzer:anlegen --email a@b.de --name "Thorsten Gollenstede" \
 *                         --rolle admin [--passwort geheim]
 *
 * Ohne `--passwort` wird kein lokales Passwort gesetzt: der Zugang ist dann
 * ausschließlich über Microsoft Entra nutzbar. Das ist der Normalfall — ein
 * Passwort braucht nur, wer sich auch ohne Tenant anmelden können muss.
 */
import { eq, sql } from 'drizzle-orm'
import { db } from '../src/db'
import { benutzer } from '../src/db/schema'
import { hashePasswort } from '../src/auth/passwort'

function argument(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] : undefined
}

const ROLLEN = ['ersteller', 'freigeber', 'admin'] as const
type Rolle = (typeof ROLLEN)[number]

async function main() {
  const email = argument('email')?.trim().toLowerCase()
  const name = argument('name')?.trim()
  const rolleRoh = argument('rolle') ?? 'ersteller'
  const passwort = argument('passwort')

  if (!email || !name) {
    console.error(
      'Aufruf: pnpm benutzer:anlegen --email a@b.de --name "Vorname Nachname" ' +
        '[--rolle ersteller|freigeber|admin] [--passwort geheim]',
    )
    process.exit(1)
  }

  if (!ROLLEN.includes(rolleRoh as Rolle)) {
    console.error(`Unbekannte Rolle „${rolleRoh}". Erlaubt: ${ROLLEN.join(', ')}`)
    process.exit(1)
  }
  const rolle = rolleRoh as Rolle

  const passwortHash = passwort ? await hashePasswort(passwort) : null

  // Der Eindeutigkeitsindex liegt auf `lower(email)` und lässt sich nicht als
  // Konfliktziel angeben. Deshalb erst suchen, dann anlegen oder ändern.
  const vorhanden = await db
    .select({ id: benutzer.id })
    .from(benutzer)
    .where(sql`lower(${benutzer.email}) = ${email}`)
    .limit(1)

  const bestehend = vorhanden[0]
  if (bestehend) {
    await db
      .update(benutzer)
      .set({ name, rolle, ...(passwortHash ? { passwortHash } : {}) })
      .where(eq(benutzer.id, bestehend.id))
  } else {
    await db.insert(benutzer).values({ email, name, rolle, passwortHash })
  }

  console.log(
    `  ${bestehend ? 'Geändert' : 'Angelegt'}: ${email} · ${name} · Rolle ${rolle} · ` +
      (passwortHash ? 'mit Passwort' : 'nur über Microsoft Entra'),
  )
  process.exit(0)
}

main().catch((fehler) => {
  console.error(fehler)
  process.exit(1)
})
