import { benutzerOderAntwort } from '@/app/api/wache'
import { MAX_BYTES, legeAuswertungAn, verarbeiteImHintergrund } from '@/stellungnahme/auswertung'
import { kiVerfuegbar } from '@/ki/client'

/**
 * Nimmt einen Prüfbericht entgegen und legt die Stellungnahme an.
 *
 * Die Auswertung selbst läuft **nach** dieser Antwort weiter. Vorher hing
 * sie in der Anfrage: ein Bericht mit vierzig Seiten braucht Minuten, und
 * das Auslesen der Positionen ist ein einziger langer Aufruf an das
 * Sprachmodell, der dazwischen nichts meldet. Der Balken stand also
 * minutenlang bei wenigen Prozent, das Fenster musste offen bleiben, und
 * ein Verbindungsabbruch warf die ganze Arbeit weg.
 *
 * Jetzt antwortet die Route in Sekundenbruchteilen mit der Kennung der
 * frisch angelegten Stellungnahme. Der Benutzer landet auf ihrer Seite,
 * sieht den Stand der Verarbeitung — und kann inzwischen woanders
 * weiterarbeiten.
 *
 * Das `void` vor dem Aufruf ist Absicht und keine Nachlässigkeit: die
 * Antwort soll nicht auf die Verarbeitung warten. `verarbeiteImHintergrund`
 * fängt deshalb alles selbst ab und schreibt jeden Ausgang in die Zeile.
 */
export async function POST(anfrage: Request): Promise<Response> {
  const benutzer = await benutzerOderAntwort()
  if (benutzer instanceof Response) return benutzer

  const formular = await anfrage.formData()
  const datei = formular.get('pruefbericht')

  if (!(datei instanceof File) || datei.size === 0) {
    return Response.json({ fehler: 'Bitte einen Prüfbericht als PDF auswählen.' }, { status: 400 })
  }
  if (datei.size > MAX_BYTES) {
    return Response.json(
      { fehler: `Die Datei ist grösser als ${MAX_BYTES / 1024 / 1024} MB.` },
      { status: 413 },
    )
  }
  // Vor dem Anlegen prüfen, nicht danach: sonst stünde eine Stellungnahme
  // in der Übersicht, die von vornherein nicht fertig werden kann.
  if (!kiVerfuegbar()) {
    return Response.json(
      {
        fehler:
          'Die Auswertung braucht einen Zugang zum Sprachmodell. Bitte ANTHROPIC_API_KEY in ' +
          'den Umgebungsvariablen hinterlegen.',
      },
      { status: 503 },
    )
  }

  const fallId = String(formular.get('fallId') ?? '') || null
  const pdf = Buffer.from(await datei.arrayBuffer())

  const stellungnahmeId = await legeAuswertungAn({
    pdf,
    dateiname: datei.name,
    fallId,
    benutzerId: benutzer.id,
  })

  void verarbeiteImHintergrund(stellungnahmeId)

  return Response.json({ stellungnahmeId })
}
