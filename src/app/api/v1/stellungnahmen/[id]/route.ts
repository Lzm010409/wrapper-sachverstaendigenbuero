import { apiBenutzerOderAntwort, apiFehlerAntwort, apiJsonAntwort } from '@/app/api/wache'
import { istUuid } from '@/app/api/kennung'
import { erzeugeApiAusgabe } from '@/stellungnahme/api-ausgabe'

/**
 * Eine einzelne Stellungnahme per API — kompletter Klartext und gerendertes
 * PDF (Base64) in einer Antwort.
 *
 * Eine gesperrte Stellungnahme (sperrende Prüfungen, siehe
 * `src/stellungnahme/editor-aktionen.ts`) liefert 409: derselbe Fall, der
 * auch den bestehenden Word-Export sperrt — beide Ausgabewege folgen
 * derselben Regel. Fehlt das Schreiben ganz, liefert die Route 422; die
 * Befunde stehen im Antwortkörper, damit ein Aufrufer sieht, was zu tun ist.
 */
export async function GET(
  anfrage: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const wache = await apiBenutzerOderAntwort(anfrage)
  if (wache instanceof Response) return wache

  const { id } = await params
  if (!istUuid(id)) return apiFehlerAntwort(404, 'Diese Stellungnahme gibt es nicht.')

  const ergebnis = await erzeugeApiAusgabe(id)

  if (ergebnis === null) return apiFehlerAntwort(404, 'Diese Stellungnahme gibt es nicht.')
  if (ergebnis.art === 'gesperrt') {
    return apiFehlerAntwort(409, ergebnis.fehler, { befunde: ergebnis.befunde })
  }
  if (ergebnis.art === 'kein-dokument') return apiFehlerAntwort(422, ergebnis.fehler)

  return apiJsonAntwort({
    id,
    klartext: ergebnis.klartext,
    pdfBase64: ergebnis.pdfBase64,
    pdfName: ergebnis.pdfName,
    befunde: ergebnis.befunde,
  })
}
