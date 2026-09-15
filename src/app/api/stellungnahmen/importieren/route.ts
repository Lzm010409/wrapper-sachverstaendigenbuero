import { benutzerOderAntwort } from '@/app/api/wache'
import { MAX_BYTES } from '@/stellungnahme/auswertung'
import { legeImportAn, verarbeiteImportImHintergrund } from '@/stellungnahme/import'
import { kiVerfuegbar } from '@/ki/client'

/**
 * Nimmt eine bereits verfasste Stellungnahme entgegen und legt sie an.
 *
 * Dasselbe Muster wie `/api/stellungnahmen/auswerten`: die Route antwortet
 * sofort mit der Kennung der angelegten Stellungnahme, die Auswertung läuft
 * dahinter im Hintergrund weiter (`void verarbeiteImportImHintergrund(...)`),
 * und die Detailseite zeigt währenddessen denselben Fortschrittsbalken wie
 * bei einem Prüfbericht.
 *
 * Anders als beim Prüfbericht ist der Fall hier Pflicht: eine hochgeladene
 * Stellungnahme ohne Fallzuordnung liesse sich später nirgends wiederfinden
 * — „Ohne Fallzuordnung" ist deshalb bewusst keine Option in der Maske, und
 * diese Route prüft es zusätzlich selbst nach.
 */
export async function POST(anfrage: Request): Promise<Response> {
  const benutzer = await benutzerOderAntwort()
  if (benutzer instanceof Response) return benutzer

  const formular = await anfrage.formData()
  const datei = formular.get('stellungnahme')

  if (!(datei instanceof File) || datei.size === 0) {
    return Response.json(
      { fehler: 'Bitte eine bestehende Stellungnahme als PDF auswählen.' },
      { status: 400 },
    )
  }
  if (datei.size > MAX_BYTES) {
    return Response.json(
      { fehler: `Die Datei ist grösser als ${MAX_BYTES / 1024 / 1024} MB.` },
      { status: 413 },
    )
  }

  const fallId = String(formular.get('fallId') ?? '').trim() || null
  if (!fallId) {
    return Response.json(
      { fehler: 'Bitte den Fall auswählen, dem diese Stellungnahme zugeordnet werden soll.' },
      { status: 400 },
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

  const pdf = Buffer.from(await datei.arrayBuffer())

  const stellungnahmeId = await legeImportAn({
    pdf,
    dateiname: datei.name,
    fallId,
    benutzerId: benutzer.id,
  })

  void verarbeiteImportImHintergrund(stellungnahmeId)

  return Response.json({ stellungnahmeId })
}
