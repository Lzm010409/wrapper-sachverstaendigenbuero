import { NextResponse } from 'next/server'
import { pruefeZugang } from '@/kleinanzeigen/zugang'
import { istKleinanzeigenUrl, sucheUeberUrl } from '@/kleinanzeigen/dienst'

export const dynamic = 'force-dynamic'
/** Mehrere Seiten mit Abstand dazwischen brauchen Zeit. */
export const maxDuration = 300

/**
 * Die Trefferliste — an derselben Stelle und in derselben Form wie beim
 * bisherigen, ausgelagerten Dienst.
 *
 *     POST /api/kleinanzeigen/inserate-by-url
 *     { "url": "https://www.kleinanzeigen.de/s-autos/c216+autos.marke_s:…",
 *       "max_pages": 3 }
 *
 * Antwort: `{success, results[], unique_results, total_results, time_taken}`.
 * Das WBW-Plugin liest genau diese Felder; es merkt den Wechsel nicht.
 */
export async function POST(anfrage: Request) {
  const absage = await pruefeZugang(anfrage)
  if (absage) return absage

  let rumpf: unknown
  try {
    rumpf = await anfrage.json()
  } catch {
    return NextResponse.json({ success: false, error: 'Kein gültiges JSON.' }, { status: 400 })
  }

  const daten = rumpf as { url?: unknown; max_pages?: unknown }
  const url = typeof daten.url === 'string' ? daten.url : ''
  if (!istKleinanzeigenUrl(url)) {
    return NextResponse.json(
      { success: false, error: 'url fehlt oder zeigt nicht auf kleinanzeigen.de.' },
      { status: 400 },
    )
  }

  const seiten =
    typeof daten.max_pages === 'number' && Number.isFinite(daten.max_pages)
      ? Math.trunc(daten.max_pages)
      : 1

  try {
    return NextResponse.json(await sucheUeberUrl(url, seiten))
  } catch (fehler) {
    console.error('Kleinanzeigen-Suche fehlgeschlagen:', fehler)
    return NextResponse.json(
      {
        success: false,
        error: fehler instanceof Error ? fehler.message : 'Unbekannter Fehler.',
      },
      { status: 502 },
    )
  }
}
