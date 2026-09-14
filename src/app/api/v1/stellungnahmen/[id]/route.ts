import { apiBenutzerOderAntwort, apiFehlerAntwort, apiJsonAntwort } from '@/app/api/wache'
import { istUuid } from '@/app/api/kennung'
import { erzeugeApiAusgabe } from '@/stellungnahme/api-ausgabe'

/**
 * Eine einzelne Stellungnahme per API — kompletter Klartext und gerendertes
 * PDF (Base64) in einer Antwort, dazu die Kürzungspositionen mit ihren
 * Summen.
 *
 * Eine gesperrte Stellungnahme (sperrende Prüfungen, siehe
 * `src/stellungnahme/editor-aktionen.ts`) liefert 409: derselbe Fall, der
 * auch den bestehenden Word-Export sperrt — beide Ausgabewege folgen
 * derselben Regel. Fehlt das Schreiben ganz, liefert die Route 422; die
 * Befunde stehen im Antwortkörper, damit ein Aufrufer sieht, was zu tun ist.
 * Die Kürzungspositionen stehen in allen drei Fällen im Antwortkörper — sie
 * hängen nicht am Erfolg der Textausgabe.
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

  // Erstellungs- und Versanddatum sowie die Kürzungspositionen stehen
  // unabhängig davon fest, ob die Ausgabe selbst gelingt — sie gehören zum
  // Datensatz, nicht zum Ergebnis.
  const basis = {
    erstelltAm: ergebnis.erstelltAm,
    versendetAm: ergebnis.versendetAm,
    fallAktenzeichen: ergebnis.fallAktenzeichen,
    kuerzungspositionen: ergebnis.kuerzungspositionen,
    kuerzungssummen: ergebnis.kuerzungssummen,
  }

  if (ergebnis.art === 'gesperrt') {
    return apiFehlerAntwort(409, ergebnis.fehler, { ...basis, befunde: ergebnis.befunde })
  }
  if (ergebnis.art === 'kein-dokument') return apiFehlerAntwort(422, ergebnis.fehler, basis)

  return apiJsonAntwort({
    id,
    ...basis,
    klartext: ergebnis.klartext,
    pdfBase64: ergebnis.pdfBase64,
    pdfName: ergebnis.pdfName,
    befunde: ergebnis.befunde,
  })
}
