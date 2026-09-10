'use server'

import { verlangeBenutzer } from '@/auth/sitzung'
import { sucheUeberall } from './global'
import type { Suchergebnis } from './typen'

/**
 * Die übergreifende Suche als Serveraktion.
 *
 * Die Anmeldung wird als erste Anweisung verlangt — ohne sie gäbe dieser
 * eine Aufruf Aktenzeichen, Namen und Kennzeichen des ganzen Hauses heraus.
 * Genau dieser Austritt war am 07.09.2026 in `autoixpert/aktionen.ts` offen.
 */
export async function sucheGlobal(begriff: string): Promise<Suchergebnis> {
  await verlangeBenutzer()
  return sucheUeberall(begriff)
}
