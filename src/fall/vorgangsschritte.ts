import { alsText } from '@/autoixpert/reichtext'
import { pipedrive, type MailMetadaten } from '@/pipedrive/client'
import { protokolliereFehler } from '@/protokoll'

/**
 * Die Vorgangsschritte im Reiter „Vorgang" — Notizen und zugeordnete Mails
 * aus Pipedrive, zu einem Verlauf gemischt.
 *
 * **Zwei Quellen, ein Ausfall schlägt die andere nicht tot.** Notizen und
 * Mails kommen aus getrennten Pipedrive-Aufrufen (`Promise.allSettled`).
 * Scheitert einer, zeigt der Reiter trotzdem, was die andere Quelle
 * geliefert hat, dazu einen kurzen Hinweis mit Fehlerkennung — statt den
 * ganzen Block als Fehler zu zeigen, nur weil eine von zwei Quellen ausfiel.
 *
 * **Automatisiertes Rauschen fällt weg.** n8n legt Notizen an, die nur eine
 * Webhook-URL enthalten (Beleg dafür: Fall 0926/2081TG, geprüft am
 * 08.09.2026) — dem Sachbearbeiter sagen sie nichts. Eine Notiz gilt als
 * inhaltsleer, wenn nach dem Herauslösen des Texts aus dem HTML und dem
 * Entfernen jeder URL nichts mehr übrig bleibt.
 *
 * **Immer live.** Wie der Statusabruf in `vorgang.ts` wird hier nichts
 * zwischengespeichert — keine zweite Wahrheit über den Fall.
 */

export type Vorgangsschritt =
  | { art: 'notiz'; id: number; zeitpunkt: string; autor: string | null; inhalt: string }
  | { art: 'mail'; id: number; zeitpunkt: string; absender: string | null; betreff: string | null }

export interface VorgangsschritteAnsicht {
  schritte: Vorgangsschritt[]
  /** Gesetzt, wenn die Notizen nicht geladen werden konnten — die Mails stehen trotzdem da. */
  notizenFehler?: string
  /** Gesetzt, wenn die Mails nicht geladen werden konnten — die Notizen stehen trotzdem da. */
  mailsFehler?: string
}

export async function ladeVorgangsschritte(dealId: number): Promise<VorgangsschritteAnsicht> {
  const [notizenErgebnis, mailsErgebnis] = await Promise.allSettled([
    pipedrive.listeNotizen(dealId),
    pipedrive.listeMails(dealId),
  ])

  const schritte: Vorgangsschritt[] = []
  let notizenFehler: string | undefined
  let mailsFehler: string | undefined

  if (notizenErgebnis.status === 'fulfilled') {
    for (const notiz of notizenErgebnis.value) {
      if (istInhaltsleer(notiz.content)) continue
      schritte.push({
        art: 'notiz',
        id: notiz.id,
        zeitpunkt: notiz.add_time,
        autor: notiz.user?.name ?? null,
        inhalt: notiz.content,
      })
    }
  } else {
    const kennung = protokolliereFehler(
      'pipedrive.listeNotizen',
      'Notizen liessen sich nicht laden.',
      notizenErgebnis.reason,
      { dienst: 'pipedrive', dealId },
    )
    notizenFehler = `Notizen konnten nicht geladen werden (Kennung ${kennung}).`
  }

  if (mailsErgebnis.status === 'fulfilled') {
    for (const mail of mailsErgebnis.value) {
      schritte.push({
        art: 'mail',
        id: mail.id,
        zeitpunkt: mail.message_time ?? mail.add_time ?? '',
        absender: mail.from?.[0]?.name ?? mail.from?.[0]?.email_address ?? null,
        betreff: mail.subject ?? null,
      })
    }
  } else {
    const kennung = protokolliereFehler(
      'pipedrive.listeMails',
      'E-Mails liessen sich nicht laden.',
      mailsErgebnis.reason,
      { dienst: 'pipedrive', dealId },
    )
    mailsFehler = `E-Mails konnten nicht geladen werden (Kennung ${kennung}).`
  }

  // Neueste zuerst — Notizen und Mails haben beide ein sortierbares
  // Zeitformat (ISO oder „JJJJ-MM-TT HH:MM:SS"), ein Datumsobjekt braucht es
  // dafür nicht.
  schritte.sort((a, b) => (a.zeitpunkt < b.zeitpunkt ? 1 : a.zeitpunkt > b.zeitpunkt ? -1 : 0))

  return { schritte, notizenFehler, mailsFehler }
}

function istInhaltsleer(html: string): boolean {
  const text = alsText(html)
    .replace(/https?:\/\/\S+/g, '')
    .trim()
  return text.length === 0
}

/**
 * Schützt die Route, die den vollen Mailkörper nachlädt.
 *
 * **Warum ein Abgleich mit der Mailliste des Deals, nicht ein Feld an der
 * Mail selbst.** Naheliegend wäre, `deal_id` aus der Antwort von
 * `holeMailBody` zu lesen und zu vergleichen — genau das lieferte in einem
 * Testlauf gegen den echten Account jedoch kein solches Feld (geprüft am
 * 08.09.2026, Mail 24263 in Fall 0926/2081TG: `GET
 * /mailbox/mailMessages/{id}` kennt `mail_thread_id`, aber keine `deal_id`).
 * Verlässlich ist dagegen `GET /deals/{id}/mailMessages` — Pipedrive filtert
 * dort selbst nach Deal. Eine Mail-ID gilt deshalb nur dann als zu diesem
 * Fall gehörig, wenn sie in genau dieser deal-gebundenen Liste auftaucht.
 * Ohne diese Prüfung liesse sich über eine erratene Mail-ID der Inhalt aus
 * dem Fall eines anderen Mandanten abfragen.
 */
export function pruefeMailGehoertZuDeal(mailId: number, mailsDesDeals: MailMetadaten[]): boolean {
  return mailsDesDeals.some((mail) => mail.id === mailId)
}
