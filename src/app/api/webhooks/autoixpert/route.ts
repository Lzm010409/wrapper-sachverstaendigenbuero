import { createHash, timingSafeEqual } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { clientAusUmgebung } from '@/autoixpert/client'
import { speichereFall } from '@/autoixpert/speichern'
import { verarbeiteWebhookEreignis } from '@/autoixpert/webhook'
import { protokolliereFehler } from '@/protokoll'

/**
 * Nimmt autoiXpert-Webhook-Ereignisse entgegen (`report.*`) und legt das
 * betroffene Gutachten sofort in der `fall`-Tabelle ab oder aktualisiert es
 * — siehe ARCHITEKTUR.md, Abschnitt „Webhook: Gutachten sofort übernehmen".
 *
 * autoiXpert signiert Webhooks nicht (siehe Doku „Webhooks"); abgesichert
 * wird ausschließlich über einen selbst festgelegten Header, dessen Wert
 * beim Einrichten des Webhooks in den autoiXpert-API-Einstellungen
 * hinterlegt wird — `AUTOIXPERT_WEBHOOK_GEHEIMNIS`.
 *
 * Geantwortet wird — solange Header und Anfragen-Körper plausibel sind —
 * immer mit 2xx, auch wenn das Nachladen scheitert. autoiXperts
 * Wiederholungsverhalten bei Fehlern ist nicht dokumentiert; ein 5xx könnte
 * ebenso gut dazu führen, dass der Webhook nach wiederholten Fehlschlägen
 * deaktiviert wird, wie zu einer hilfreichen Wiederholung. Was schiefgeht,
 * steht stattdessen im Protokoll — dieselbe Stelle, an der auch ein
 * fehlgeschlagener manueller Import landet.
 */
const HEADER_GEHEIMNIS = 'x-autoixpert-webhook-secret'

function alsDigest(wert: string): Buffer {
  return createHash('sha256').update(wert, 'utf8').digest()
}

/** Vergleich in konstanter Zeit — über den Hash, damit unterschiedliche Längen nicht vorab verraten, wie falsch der Header war. */
function geheimnisStimmtUeberein(erhalten: string, erwartet: string): boolean {
  return timingSafeEqual(alsDigest(erhalten), alsDigest(erwartet))
}

export async function POST(anfrage: Request): Promise<Response> {
  const erwartetesGeheimnis = process.env.AUTOIXPERT_WEBHOOK_GEHEIMNIS
  const erhaltenesGeheimnis = anfrage.headers.get(HEADER_GEHEIMNIS)

  if (!erwartetesGeheimnis) {
    protokolliereFehler(
      'autoixpert.webhook.route',
      'AUTOIXPERT_WEBHOOK_GEHEIMNIS ist nicht gesetzt — der Webhook kann niemanden zulassen.',
    )
    return Response.json({ fehler: 'Der Webhook ist nicht eingerichtet.' }, { status: 401 })
  }
  if (!erhaltenesGeheimnis || !geheimnisStimmtUeberein(erhaltenesGeheimnis, erwartetesGeheimnis)) {
    return Response.json({ fehler: 'Ungültiges oder fehlendes Geheimnis.' }, { status: 401 })
  }

  let koerper: unknown
  try {
    koerper = await anfrage.json()
  } catch {
    return Response.json({ fehler: 'Der Anfragen-Körper ist kein gültiges JSON.' }, { status: 400 })
  }

  const client = clientAusUmgebung()
  if (!client) {
    protokolliereFehler(
      'autoixpert.webhook.route',
      'AUTOIXPERT_API_TOKEN fehlt — das Gutachten kann nicht nachgeladen werden.',
    )
    return Response.json({ ignoriert: true }, { status: 200 })
  }

  const ergebnis = await verarbeiteWebhookEreignis(koerper, {
    holeGutachten: (reportId) => client.holeGutachten(reportId),
    speichereFall,
  })

  if (ergebnis.art === 'abgelehnt') {
    return Response.json({ fehler: ergebnis.meldung }, { status: ergebnis.status })
  }

  if (ergebnis.art === 'gespeichert') {
    revalidatePath('/faelle')
    revalidatePath(`/faelle/${ergebnis.fallId}`)
    return Response.json({ gespeichert: true, fallId: ergebnis.fallId, neu: ergebnis.neu })
  }

  return Response.json({ ignoriert: true, grund: ergebnis.grund })
}
