import 'server-only'
import type { AutoixpertClient } from '@/autoixpert/client'
import { ausSpeicher, inSpeicher } from './speicher'
import type { Bildpaket } from './assistent'
import { protokolliereWarnung } from '@/protokoll'

/**
 * Vorschaubilder als base64 — für den Weg zum Sprachmodell.
 *
 * **Warum über denselben Zwischenspeicher wie das Raster.** Wer den
 * Fotos-Reiter geöffnet hat, hat die Vorschaubilder schon auf der Platte
 * liegen; der Knopf „Fotos analysieren" steht genau dort. Im Normalfall ist
 * das hier also ein Plattenzugriff und kein Abruf bei autoiXpert. Ein
 * eigener Speicher daneben hätte dieselben Bilder ein zweites Mal geholt.
 *
 * **Warum nacheinander.** Ein Paket sind zwölf Bilder. Sie nebeneinander zu
 * holen brächte im warmen Fall nichts — die Platte ist schnell genug — und
 * im kalten Fall zwölf gleichzeitige Abrufe an autoiXpert für einen einzigen
 * Knopfdruck.
 */

/** Was ein Vorschaubild höchstens haben darf, bevor es übersprungen wird. */
const HOECHSTENS_BYTES = 4 * 1024 * 1024

export async function holeVorschaubilder(
  client: AutoixpertClient,
  reportId: string,
  fotoIds: string[],
): Promise<Bildpaket[]> {
  const bilder: Bildpaket[] = []
  for (const fotoId of fotoIds) {
    const bild = await holeEines(client, reportId, fotoId)
    if (bild) bilder.push(bild)
  }
  return bilder
}

async function holeEines(
  client: AutoixpertClient,
  reportId: string,
  fotoId: string,
): Promise<Bildpaket | null> {
  try {
    const abgelegt = await ausSpeicher(reportId, fotoId, 'thumbnail')
    if (abgelegt) {
      if (abgelegt.laenge > HOECHSTENS_BYTES) return null
      return zuPaket(fotoId, await alsPuffer(abgelegt.strom), 'image/jpeg')
    }

    const datei = await client.holeFotoDatei(reportId, fotoId, 'thumbnail')
    if (!datei.koerper) return null
    // Derselbe Weg wie in der Bildroute: der Strom wird geteilt, ein Zweig
    // geht auf die Platte. Sonst holte der nächste Lauf dasselbe Bild erneut.
    const strom = await inSpeicher(reportId, fotoId, 'thumbnail', datei.koerper)
    const puffer = await alsPuffer(strom)
    if (puffer.length > HOECHSTENS_BYTES) return null
    return zuPaket(fotoId, puffer, datei.typ.startsWith('image/png') ? 'image/png' : 'image/jpeg')
  } catch (fehler) {
    protokolliereWarnung('fotos.vorschaubilder', 'Ein Vorschaubild liess sich nicht holen.', {
      dienst: 'autoixpert',
      reportId,
      fotoId,
      grund: fehler instanceof Error ? fehler.message : String(fehler),
    })
    return null
  }
}

function zuPaket(fotoId: string, puffer: Buffer, typ: 'image/jpeg' | 'image/png'): Bildpaket | null {
  if (puffer.length === 0) return null
  return { fotoId, daten: puffer.toString('base64'), typ }
}

async function alsPuffer(strom: ReadableStream<Uint8Array>): Promise<Buffer> {
  const teile: Uint8Array[] = []
  const leser = strom.getReader()
  for (;;) {
    const { done, value } = await leser.read()
    if (done) break
    if (value) teile.push(value)
  }
  return Buffer.concat(teile)
}
