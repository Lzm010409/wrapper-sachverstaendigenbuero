import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { fall } from '@/db/schema'
import { benutzerOderAntwort } from '@/app/api/wache'
import { pipedrive } from '@/pipedrive/client'
import { pruefeMailGehoertZuDeal } from '@/fall/vorgangsschritte'
import { protokolliereFehler } from '@/protokoll'

export const dynamic = 'force-dynamic'

/**
 * Lädt den vollen Textkörper einer einzelnen Pipedrive-Mail nach — erst beim
 * Aufklappen im Reiter „Vorgang", nicht schon beim Laden der Fallseite.
 *
 * **Warum die Deal-Zugehörigkeit hier geprüft wird, nicht erst im
 * Browser:** die Mail-ID ist eine kleine Zahl. Ohne diese Prüfung liesse
 * sich über eine erratene ID der Mailinhalt aus dem Fall eines anderen
 * Mandanten abfragen — der Fall in der URL entscheidet also nicht allein.
 * Die Route löst den Deal selbst neu auf und akzeptiert nur eine Mail-ID,
 * die in dessen eigener Mailliste (`GET /deals/{id}/mailMessages`) steht;
 * siehe `pruefeMailGehoertZuDeal`, warum nicht einfach ein Feld an der Mail
 * selbst verglichen wird.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const ZAHL = /^\d+$/

export async function GET(
  _anfrage: Request,
  { params }: { params: Promise<{ id: string; mailId: string }> },
) {
  const benutzer = await benutzerOderAntwort()
  if (benutzer instanceof Response) return benutzer

  const { id, mailId } = await params
  if (!UUID.test(id)) return Response.json({ fehler: 'Unbekannter Fall.' }, { status: 404 })
  if (!ZAHL.test(mailId)) return Response.json({ fehler: 'Unbekannte Nachricht.' }, { status: 404 })

  const [zeile] = await db
    .select({ aktenzeichen: fall.aktenzeichen })
    .from(fall)
    .where(eq(fall.id, id))
    .limit(1)
  if (!zeile?.aktenzeichen) {
    return Response.json({ fehler: 'Unbekannter Fall.' }, { status: 404 })
  }

  let dealErgebnis
  try {
    dealErgebnis = await pipedrive.findeDeal(zeile.aktenzeichen)
  } catch (fehler) {
    const kennung = protokolliereFehler('pipedrive.findeDeal', 'Pipedrive war nicht erreichbar.', fehler, {
      dienst: 'pipedrive',
      fallId: id,
      benutzerId: benutzer.id,
    })
    return Response.json({ fehler: `Pipedrive war nicht erreichbar (Kennung ${kennung}).` }, { status: 502 })
  }
  if (dealErgebnis.art !== 'gefunden') {
    return Response.json({ fehler: 'Zu diesem Fall steht kein eindeutiger Deal in Pipedrive.' }, { status: 404 })
  }

  let mailsDesDeals
  try {
    mailsDesDeals = await pipedrive.listeMails(dealErgebnis.deal.id)
  } catch (fehler) {
    const kennung = protokolliereFehler('pipedrive.listeMails', 'Die Mailliste liess sich nicht laden.', fehler, {
      dienst: 'pipedrive',
      fallId: id,
      benutzerId: benutzer.id,
    })
    return Response.json({ fehler: `Die Mail liess sich nicht laden (Kennung ${kennung}).` }, { status: 502 })
  }

  const angefragteMailId = Number(mailId)
  if (!pruefeMailGehoertZuDeal(angefragteMailId, mailsDesDeals)) {
    return Response.json({ fehler: 'Unbekannte Nachricht.' }, { status: 404 })
  }

  let mail
  try {
    mail = await pipedrive.holeMailBody(angefragteMailId)
  } catch (fehler) {
    const kennung = protokolliereFehler('pipedrive.holeMailBody', 'Die Mail liess sich nicht laden.', fehler, {
      dienst: 'pipedrive',
      fallId: id,
      benutzerId: benutzer.id,
    })
    return Response.json({ fehler: `Die Mail liess sich nicht laden (Kennung ${kennung}).` }, { status: 502 })
  }
  if (!mail) {
    return Response.json({ fehler: 'Unbekannte Nachricht.' }, { status: 404 })
  }

  return Response.json(
    {
      id: mail.id,
      betreff: mail.subject ?? null,
      zeitpunkt: mail.message_time ?? mail.add_time ?? null,
      absender: mail.from?.[0]?.name ?? mail.from?.[0]?.email_address ?? null,
      body: mail.body ?? '',
    },
    { headers: { 'Cache-Control': 'private, no-store' } },
  )
}
