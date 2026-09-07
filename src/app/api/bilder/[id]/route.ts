import { benutzerOderAntwort } from '@/app/api/wache'
import { ladeBild } from '@/bilder/ablage'

/**
 * Liefert ein Bild aus.
 *
 * Nur angemeldet: in den Bildern stecken Kennzeichen, Schadennummern und
 * Kalkulationsauszüge. Zwischengespeichert wird trotzdem lange — ein Bild
 * ändert sich nie, es wird nur ersetzt, und das unter neuer Kennung.
 */
/**
 * Nur eine UUID kann eine Bildkennung sein. Ohne diese Prüfung ginge
 * `/api/bilder/unfug` als UUID-Vergleich an Postgres, der dort mit einem
 * Typfehler abbricht — und aus „das gibt es nicht" würde HTTP 500.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(
  _anfrage: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const wache = await benutzerOderAntwort()
  if (wache instanceof Response) return wache
  const { id } = await params
  if (!UUID.test(id)) return new Response('Nicht gefunden', { status: 404 })

  const gefunden = await ladeBild(id)
  if (!gefunden) return new Response('Nicht gefunden', { status: 404 })

  /*
    Ein Datensatz ohne Bytes ist kein Bild. Ausgeliefert als „200, 0 Bytes"
    zeigt der Browser ein kaputtes Symbol und die Anwendung behauptet
    weiterhin, alles sei in Ordnung. 404 ist die ehrlichere Antwort.
  */
  if (gefunden.daten.byteLength === 0) {
    return new Response('Zu diesem Bild sind keine Daten gespeichert.', { status: 404 })
  }

  return new Response(gefunden.daten as unknown as BodyInit, {
    headers: {
      'Content-Type': gefunden.mimetyp,
      'Content-Length': String(gefunden.daten.byteLength),
      'Cache-Control': 'private, max-age=31536000, immutable',
      'Content-Disposition': `inline; filename="${encodeURIComponent(gefunden.dateiname)}"`,
    },
  })
}
