import 'server-only'
import { z } from 'zod'
import { protokolliereFehler, protokolliereInfo, protokolliereWarnung } from '@/protokoll'
import { AbrufregelVerletzt } from './abrufregel'
import { AutoixpertFehler } from './client'
import type { Gutachten } from './typen'
import type { GespeicherterFall } from './speichern'

/**
 * Payload, die autoiXpert für jedes `report.*`-Ereignis schickt (laut
 * Webhook-Dokumentation identisch für `report.created`, `report.locked`,
 * `report.unlocked`, `report.labels_updated`, `report.token_updated`,
 * `report.custom_field_updated`, `report.moved_to_trash`, `report.restored`,
 * `report.deleted`). `contact.*`- und `invoice.*`-Ereignisse tragen andere
 * Felder (`contactId`/`invoiceId` statt `reportId`) — die werden hier nicht
 * ausgewertet, sollen aber auch nicht am Schema scheitern, falls derselbe
 * Endpunkt später auch dafür eingetragen wird.
 */
export const webhookEreignisSchema = z
  .object({
    eventType: z.string(),
    teamId: z.string().nullish(),
    reportId: z.string().nullish(),
    reportExternalId: z.string().nullish(),
    customFieldName: z.string().nullish(),
  })
  .loose()

export type WebhookEreignis = z.infer<typeof webhookEreignisSchema>

/**
 * Was der Aufruf tatsächlich braucht — eingespeist, nicht importiert.
 *
 * Genau zwei Gründe: die Route soll ohne DB-Zugriff und ohne echten
 * autoiXpert-Zugang geprüft werden können (siehe `webhook.test.ts`), und ein
 * fehlender `AUTOIXPERT_API_TOKEN` ist eine Entscheidung der Route
 * (`clientAusUmgebung()` kann `null` liefern), nicht dieser Funktion.
 */
export interface WebhookAbhaengigkeiten {
  holeGutachten: (reportId: string) => Promise<Gutachten>
  speichereFall: (gutachten: Gutachten) => Promise<GespeicherterFall>
}

export type WebhookErgebnis =
  | ({ art: 'gespeichert' } & GespeicherterFall)
  | { art: 'ignoriert'; grund: string }
  | { art: 'abgelehnt'; meldung: string; status: 400 }

/**
 * Verarbeitet ein einzelnes Webhook-Ereignis: lädt das vollständige
 * Gutachten nach und legt es lokal ab oder aktualisiert es.
 *
 * **Fehlertoleranz ist der Kern dieser Funktion, nicht ein Sonderfall.**
 * Direkt nach `report.created` ist ein Gutachten oft fast leer — das ist
 * kein Fehler, `leseFalldaten` (über `speichereFall`) kommt damit klar.
 * Was hier abgefangen wird, sind die *anderen* erwartbaren Ausgänge eines
 * Webhook-Aufrufs: ein Ereignis, das kein Gutachten betrifft, ein
 * inzwischen gelöschtes Gutachten (404), ein durch die Abrufregel
 * ausgeschlossenes, oder autoiXpert, das gerade nicht antwortet. Keiner
 * davon ist ein Programmfehler — sie werden protokolliert und als
 * `ignoriert` gemeldet, nie als `abgelehnt`. `abgelehnt` bleibt für einen
 * Anfragen-Körper, mit dem sich gar nichts anfangen lässt (siehe die Route
 * für die einzige echte Fehlerantwort, den fehlenden Header).
 *
 * Wiederholte Zustellungen desselben Ereignisses sind unschädlich: die
 * Ablage erkennt den Fall über die autoiXpert-ID und aktualisiert dann nur.
 */
export async function verarbeiteWebhookEreignis(
  rohkoerper: unknown,
  abhaengigkeiten: WebhookAbhaengigkeiten,
): Promise<WebhookErgebnis> {
  const geprueft = webhookEreignisSchema.safeParse(rohkoerper)
  if (!geprueft.success) {
    return {
      art: 'abgelehnt',
      status: 400,
      meldung: `Der Anfragen-Körper hat nicht die erwartete Form: ${geprueft.error.issues
        .slice(0, 3)
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join('; ')}`,
    }
  }

  const ereignis = geprueft.data

  if (!ereignis.eventType.startsWith('report.')) {
    protokolliereInfo('autoixpert.webhook', 'Ereignis betrifft kein Gutachten, übersprungen.', {
      dienst: 'autoixpert',
      eventType: ereignis.eventType,
    })
    return { art: 'ignoriert', grund: `Ereignistyp „${ereignis.eventType}" ist nicht zuständig.` }
  }

  if (!ereignis.reportId) {
    return {
      art: 'abgelehnt',
      status: 400,
      meldung: `Ereignis „${ereignis.eventType}" trägt kein reportId.`,
    }
  }

  let gutachten: Gutachten
  try {
    gutachten = await abhaengigkeiten.holeGutachten(ereignis.reportId)
  } catch (fehler) {
    if (fehler instanceof AbrufregelVerletzt) {
      protokolliereInfo('autoixpert.webhook', 'Durch die Abrufregel ausgeschlossen.', {
        dienst: 'autoixpert',
        eventType: ereignis.eventType,
        reportId: ereignis.reportId,
        meldung: fehler.message,
      })
      return { art: 'ignoriert', grund: fehler.message }
    }
    if (fehler instanceof AutoixpertFehler) {
      // Ein 404 ist der Normalfall bei report.deleted/moved_to_trash — die
      // Meldung ist trotzdem dieselbe wie bei jedem anderen Ausgang: geloggt,
      // nicht gespeichert, kein Fehler an autoiXpert zurückgemeldet.
      protokolliereWarnung('autoixpert.webhook', 'Das Gutachten liess sich nicht nachladen.', {
        dienst: 'autoixpert',
        eventType: ereignis.eventType,
        reportId: ereignis.reportId,
        status: fehler.status,
        meldung: fehler.message,
      })
      return { art: 'ignoriert', grund: fehler.message }
    }
    const kennung = protokolliereFehler(
      'autoixpert.webhook',
      'Das Gutachten liess sich nicht nachladen.',
      fehler,
      { dienst: 'autoixpert', eventType: ereignis.eventType, reportId: ereignis.reportId },
    )
    return { art: 'ignoriert', grund: `Unerwarteter Fehler beim Nachladen. Kennung ${kennung}` }
  }

  const gespeichert = await abhaengigkeiten.speichereFall(gutachten)
  protokolliereInfo(
    'autoixpert.webhook',
    gespeichert.neu ? 'Fall neu angelegt.' : 'Fall aktualisiert.',
    { dienst: 'autoixpert', eventType: ereignis.eventType, fallId: gespeichert.fallId },
  )
  return { art: 'gespeichert', ...gespeichert }
}
