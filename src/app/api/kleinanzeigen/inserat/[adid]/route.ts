import { NextResponse } from 'next/server'
import { pruefeZugang } from '@/kleinanzeigen/zugang'
import { holeInserat } from '@/kleinanzeigen/dienst'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

/**
 * Eine einzelne Anzeige — Form wie beim bisherigen Dienst:
 * `{success, data:{…}}`, und bei einer gelöschten Anzeige HTTP 404.
 *
 * `batch_id` nimmt die Route entgegen und schreibt sie ins Protokoll. Der
 * bisherige Dienst verlangte sie (sonst HTTP 422); hier ist sie freiwillig,
 * denn das Plugin schickt sie ohnehin mit und ein fehlender Ordnungsbegriff
 * ist kein Grund, eine Auskunft zu verweigern.
 */
export async function GET(
  anfrage: Request,
  { params }: { params: Promise<{ adid: string }> },
) {
  const absage = await pruefeZugang(anfrage)
  if (absage) return absage

  const { adid } = await params
  if (!/^\d{4,}$/.test(adid)) {
    return NextResponse.json(
      { success: false, error: 'Keine gültige Anzeigennummer.' },
      { status: 400 },
    )
  }

  try {
    const ergebnis = await holeInserat(adid)
    if (!ergebnis.success) {
      return NextResponse.json(
        { success: false, error: 'Anzeige nicht gefunden oder gelöscht.', status: 'deleted' },
        { status: 404 },
      )
    }
    return NextResponse.json(ergebnis)
  } catch (fehler) {
    console.error(`Kleinanzeigen-Abruf ${adid} fehlgeschlagen:`, fehler)
    return NextResponse.json(
      { success: false, error: fehler instanceof Error ? fehler.message : 'Unbekannter Fehler.' },
      { status: 502 },
    )
  }
}
