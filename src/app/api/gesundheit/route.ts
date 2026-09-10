import { NextResponse } from 'next/server'
import { sql } from 'drizzle-orm'
import { db } from '@/db'
import { protokolliereFehler } from '@/protokoll'
import { sucheDrucker } from '@/wbw/drucker'

export const dynamic = 'force-dynamic'

/**
 * Zustandsauskunft für Coolify und den Container-Healthcheck.
 *
 * Prüft die Datenbankverbindung mit, weil eine erreichbare Oberfläche ohne
 * Datenbank für diese Anwendung nutzlos ist — der Container soll dann als
 * ungesund gelten und neu starten.
 *
 * **Der Drucker gehört zur Auskunft, nicht zum Urteil.** Ob ein Browser da
 * ist, steht im Feld `drucker`; der Zustand bleibt davon unberührt. Ein
 * fehlender Browser kostet die Belege, nicht die Anwendung — ein Container,
 * der deswegen dauernd neu startet, hilft niemandem. Am 08.09.2026 fiel das
 * Fehlen erst nach einer vollständigen WBW-Recherche auf; hier lässt es sich
 * jederzeit abfragen.
 */
export async function GET() {
  try {
    await db.execute(sql`select 1`)
    return NextResponse.json({
      zustand: 'ok',
      datenbank: 'erreichbar',
      drucker: (await sucheDrucker()) ?? 'nicht vorhanden',
    })
  } catch (fehler) {
    protokolliereFehler('gesundheit', 'Die Datenbank ist nicht erreichbar.', fehler)
    return NextResponse.json(
      { zustand: 'fehler', datenbank: 'nicht erreichbar' },
      { status: 503 },
    )
  }
}
