import { NextResponse } from 'next/server'
import { sql } from 'drizzle-orm'
import { db } from '@/db'

export const dynamic = 'force-dynamic'

/**
 * Zustandsauskunft für Coolify und den Container-Healthcheck.
 *
 * Prüft die Datenbankverbindung mit, weil eine erreichbare Oberfläche ohne
 * Datenbank für diese Anwendung nutzlos ist — der Container soll dann als
 * ungesund gelten und neu starten.
 */
export async function GET() {
  try {
    await db.execute(sql`select 1`)
    return NextResponse.json({ zustand: 'ok', datenbank: 'erreichbar' })
  } catch (fehler) {
    console.error('Gesundheitsprüfung fehlgeschlagen:', fehler)
    return NextResponse.json(
      { zustand: 'fehler', datenbank: 'nicht erreichbar' },
      { status: 503 },
    )
  }
}
