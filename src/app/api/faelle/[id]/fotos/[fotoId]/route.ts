import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { fall } from '@/db/schema'
import { benutzerOderAntwort } from '@/app/api/wache'
import { clientAusUmgebung } from '@/autoixpert/client'
import { gutachtenSchema, type Fotoformat } from '@/autoixpert/typen'
import { ausSpeicher, inSpeicher } from '@/fotos/speicher'
import { protokolliereFehler } from '@/protokoll'

export const dynamic = 'force-dynamic'

/**
 * Liefert ein Gutachten-Foto aus autoiXpert.
 *
 * **Warum überhaupt über uns:** Die Schnittstelle verlangt einen Bearer-Token.
 * Den dem Browser zu geben hiesse, ihn jedem Besucher zu geben — also holt
 * der Server das Bild und reicht es weiter.
 *
 * **Warum über die Fall-ID und nicht die autoiXpert-ID:** So kann die Route
 * nur Fotos zu Fällen liefern, die im Cockpit stehen. Nähme sie die
 * autoiXpert-ID entgegen, wäre sie ein Fenster zu **jedem** Gutachten des
 * Büros für jeden Angemeldeten.
 *
 * **Was hier für den Speicherbedarf getan wird:** Der Körper der Antwort wird
 * durchgereicht, nicht gepuffert. `await antwort.arrayBuffer()` hielte ein
 * 3-MB-Original vollständig im Arbeitsspeicher — bei zehn gleichzeitigen
 * Abrufen 30 MB, die nur durchlaufen. So hält der Server immer nur den
 * gerade laufenden Abschnitt.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const FORMATE: Fotoformat[] = ['thumbnail', 'rendered', 'original']

/** Nur Vorschaubilder werden abgelegt — Originale füllen jede Platte. */
const WIRD_GESPEICHERT: Fotoformat = 'thumbnail'

export async function GET(
  anfrage: Request,
  { params }: { params: Promise<{ id: string; fotoId: string }> },
) {
  const benutzer = await benutzerOderAntwort()
  if (benutzer instanceof Response) return benutzer

  const { id, fotoId } = await params
  if (!UUID.test(id)) return new Response('Unbekannter Fall.', { status: 404 })
  // Die Foto-ID geht in eine URL. autoiXpert vergibt kurze Zeichenketten aus
  // Buchstaben und Ziffern; alles andere wird gar nicht erst weitergereicht.
  if (!/^[A-Za-z0-9_-]{4,64}$/.test(fotoId)) {
    return new Response('Unbekanntes Foto.', { status: 404 })
  }

  const gewuenscht = new URL(anfrage.url).searchParams.get('format') ?? 'thumbnail'
  const format: Fotoformat = FORMATE.includes(gewuenscht as Fotoformat)
    ? (gewuenscht as Fotoformat)
    : 'thumbnail'

  const [zeile] = await db
    .select({ daten: fall.daten })
    .from(fall)
    .where(eq(fall.id, id))
    .limit(1)
  if (!zeile?.daten) return new Response('Unbekannter Fall.', { status: 404 })

  const geprueft = gutachtenSchema.safeParse(zeile.daten)
  const reportId = geprueft.success ? geprueft.data.id || geprueft.data.external_id : null
  if (!reportId) return new Response('Zu diesem Fall fehlt die autoiXpert-Kennung.', { status: 404 })

  const client = clientAusUmgebung()
  if (!client) return new Response('autoiXpert ist nicht eingerichtet.', { status: 503 })

  // Aus dem Zwischenspeicher, wenn er etwas hat.
  if (format === WIRD_GESPEICHERT) {
    const abgelegt = await ausSpeicher(reportId, fotoId, format)
    if (abgelegt) {
      return new Response(abgelegt.strom, {
        headers: kopfzeilen('image/jpeg', String(abgelegt.laenge), true),
      })
    }
  }

  try {
    const datei = await client.holeFotoDatei(reportId, fotoId, format)
    if (!datei.koerper) return new Response('Das Foto kam ohne Inhalt.', { status: 502 })

    const koerper =
      format === WIRD_GESPEICHERT
        ? await inSpeicher(reportId, fotoId, format, datei.koerper)
        : datei.koerper

    // autoiXpert schickt beim Original `binary/octet-stream`; der Browser
    // böte das zum Herunterladen an, statt es zu zeigen.
    const typ = datei.typ.startsWith('image/') ? datei.typ : 'image/jpeg'
    return new Response(koerper, { headers: kopfzeilen(typ, datei.laenge, false) })
  } catch (fehler) {
    protokolliereFehler('fotos.laden', 'Das Foto liess sich nicht laden.', fehler, {
      fallId: id,
      benutzerId: benutzer.id,
      dienst: 'autoixpert',
      fotoId,
      format,
    })
    return new Response('Das Foto liess sich nicht laden.', { status: 502 })
  }
}

/**
 * `private`, weil das Bild einem Gutachten gehört und keinem
 * Zwischenspeicher unterwegs. Eine Stunde im Browser: Fotos ändern sich
 * praktisch nie, aber „immutable" wäre gelogen — ein neu hochgeladenes Bild
 * behält bei autoiXpert seine ID.
 */
function kopfzeilen(typ: string, laenge: string | null, ausSpeicherGeholt: boolean): HeadersInit {
  const kopf: Record<string, string> = {
    'Content-Type': typ,
    'Cache-Control': 'private, max-age=3600',
    'Content-Disposition': 'inline',
    // Nur zur Diagnose: woher das Bild kam.
    'X-Herkunft': ausSpeicherGeholt ? 'speicher' : 'autoixpert',
  }
  if (laenge) kopf['Content-Length'] = laenge
  return kopf
}
