import { benutzerOderAntwort } from '@/app/api/wache'
import { speichereBild } from '@/bilder/ablage'
import { Bildfehler } from '@/bilder/lesen'

/**
 * Nimmt ein Bild zu einer Stellungnahme entgegen.
 *
 * Antwortet mit Kennung und Originalmassen — der Editor braucht das
 * Seitenverhältnis, um das Bild sofort richtig zu zeigen, ohne es erst
 * laden zu müssen.
 */
export async function POST(
  anfrage: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const benutzer = await benutzerOderAntwort()
  if (benutzer instanceof Response) return benutzer
  const { id } = await params

  const formular = await anfrage.formData()
  const datei = formular.get('bild')

  if (!(datei instanceof File) || datei.size === 0) {
    return Response.json(
      {
        fehler:
          datei instanceof File
            ? 'Die ausgewählte Datei ist leer.'
            : 'Keine Bilddatei erhalten.',
      },
      { status: 400 },
    )
  }

  try {
    const gespeichert = await speichereBild({
      stellungnahmeId: id,
      dateiname: datei.name,
      daten: new Uint8Array(await datei.arrayBuffer()),
      benutzerId: benutzer.id,
    })
    return Response.json(gespeichert)
  } catch (fehler) {
    if (fehler instanceof Bildfehler) {
      return Response.json({ fehler: fehler.message }, { status: 415 })
    }
    console.error('Bild konnte nicht gespeichert werden:', fehler)
    return Response.json({ fehler: 'Das Bild liess sich nicht speichern.' }, { status: 500 })
  }
}
