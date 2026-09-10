'use server'

import { redirect } from 'next/navigation'
import { eq, sql } from 'drizzle-orm'
import { db } from '@/db'
import { benutzer } from '@/db/schema'
import { pruefePasswort } from './passwort'
import { beendeSitzung, raeumeAbgelaufeneSitzungen, starteSitzung } from './sitzung'
import { STARTSEITE } from '@/auth/startseite'

export interface AnmeldeZustand {
  fehler?: string
}

/**
 * Passwortanmeldung als Rückfallebene neben Microsoft Entra.
 *
 * Die Fehlermeldung ist bewusst für alle Fälle gleich — ob eine Adresse
 * existiert, ist keine Auskunft, die eine Anmeldemaske geben sollte.
 */
export async function meldeAn(
  _zustand: AnmeldeZustand,
  formular: FormData,
): Promise<AnmeldeZustand> {
  const email = String(formular.get('email') ?? '')
    .trim()
    .toLowerCase()
  const passwort = String(formular.get('passwort') ?? '')

  if (!email || !passwort) return { fehler: 'Bitte Adresse und Passwort eingeben.' }

  const zeilen = await db
    .select()
    .from(benutzer)
    .where(sql`lower(${benutzer.email}) = ${email}`)
    .limit(1)

  const konto = zeilen[0]
  const gueltig =
    konto?.passwortHash && konto.aktiv ? await pruefePasswort(passwort, konto.passwortHash) : false

  if (!konto || !gueltig) {
    return { fehler: 'Adresse oder Passwort stimmen nicht.' }
  }

  await raeumeAbgelaufeneSitzungen()
  await starteSitzung(konto.id)
  await db.update(benutzer).set({ letzteAnmeldung: new Date() }).where(eq(benutzer.id, konto.id))

  redirect(STARTSEITE)
}

export async function meldeAb(): Promise<void> {
  await beendeSitzung()
  redirect('/anmelden')
}
