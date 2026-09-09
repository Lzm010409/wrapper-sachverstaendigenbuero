import 'server-only'
import { z } from 'zod'
import { holeJson, objekte } from './anfrage'
import type { Adresse, Anhang, Kontaktanhaenge, Objektart, Weg } from '@/kontakte/plan'

/**
 * Was an einem sevDesk-Kontakt hängt.
 *
 * **Warum vier Objektarten abgefragt werden, obwohl heute nur zwei
 * vorkommen.** Im Konto lagen am 09.09.2026 weder Aufträge noch
 * Gutschriften — an Kontakten hängen ausschliesslich Rechnungen und
 * Belege. Abgefragt werden trotzdem alle vier: die Liste entscheidet
 * darüber, ob ein Kontakt gelöscht werden darf, und „ich habe nicht
 * nachgesehen" ist dafür die falsche Grundlage. Umgehängt wird nur, was es
 * gibt; taucht später ein Auftrag auf, verhindert er das Löschen, statt
 * verwaist zu werden.
 *
 * **Warum nicht `getTabsItemCount`.** Der Zähler nennt durchweg höhere
 * Zahlen als die Einzelabfragen (Kontakt 1118: 25 gegen 14 Rechnungen) — er
 * zählt offenbar mehr als das, was sich umhängen lässt. Für die Frage „ist
 * hier noch etwas?" ist er als vorsichtige Schranke brauchbar, für „was
 * genau muss weg?" nicht.
 */

/** Die Filterform von sevDesk für eingebettete Objekte. */
function kontaktfilter(kontaktId: string): string {
  return `contact[id]=${encodeURIComponent(kontaktId)}&contact[objectName]=Contact`
}

const anhangSchema = z
  .object({
    id: z.union([z.string(), z.number()]),
    enshrined: z.string().nullish(),
    invoiceNumber: z.string().nullish(),
    voucherNumber: z.string().nullish(),
    orderNumber: z.string().nullish(),
    creditNoteNumber: z.string().nullish(),
    description: z.string().nullish(),
    supplierNameAtSave: z.string().nullish(),
  })
  .loose()

const adresseSchema = z
  .object({
    id: z.union([z.string(), z.number()]),
    street: z.string().nullish(),
    zip: z.string().nullish(),
    city: z.string().nullish(),
  })
  .loose()

const wegSchema = z
  .object({
    id: z.union([z.string(), z.number()]),
    type: z.string().nullish(),
    value: z.string().nullish(),
  })
  .loose()

/** Die Bezeichnung, unter der ein Anhang im Protokoll wiederzufinden ist. */
function bezeichnung(roh: z.infer<typeof anhangSchema>): string {
  return (
    roh.invoiceNumber?.trim() ||
    roh.voucherNumber?.trim() ||
    roh.orderNumber?.trim() ||
    roh.creditNoteNumber?.trim() ||
    roh.description?.trim() ||
    roh.supplierNameAtSave?.trim() ||
    `#${String(roh.id)}`
  )
}

const ARTEN: Objektart[] = ['Invoice', 'Voucher', 'Order', 'CreditNote']

/**
 * Was an einem Kontakt hängt — sechs Abfragen, nebeneinander.
 *
 * **Warum hier nebeneinander und anderswo nacheinander.** Es sind genau
 * sechs Anfragen zu **einem** Kontakt, ausgelöst von einem Menschen, der
 * auf das Ergebnis wartet. Nacheinander waren das gemessene sechs Sekunden
 * je Kontakt und für die Arndt-Gruppe knapp eine Minute — eine Wartezeit,
 * in der die Oberfläche nichts zu sagen hatte. Die Ratenbegrenzung von
 * sevDesk sieht sechs gleichzeitige Lesezugriffe nicht einmal.
 */
export async function holeAnhaenge(kontaktId: string, anzeige: string): Promise<Kontaktanhaenge> {
  const [belege, roheAdressen, roheWege] = await Promise.all([
    Promise.all(
      ARTEN.map(async (art) => ({
        art,
        eintraege: objekte(await holeJson(`/${art}?limit=1000&${kontaktfilter(kontaktId)}`)),
      })),
    ),
    holeJson(`/Contact/${encodeURIComponent(kontaktId)}/getAddresses`).then(objekte),
    holeJson(`/Contact/${encodeURIComponent(kontaktId)}/getCommunicationWays`).then(objekte),
  ])

  const anhaenge: Anhang[] = []
  for (const { art, eintraege } of belege) {
    for (const eintrag of eintraege) {
      const geprueft = anhangSchema.safeParse(eintrag)
      if (!geprueft.success) continue
      anhaenge.push({
        art,
        id: String(geprueft.data.id),
        bezeichnung: bezeichnung(geprueft.data),
        // sevDesk trägt hier den Zeitpunkt der Festschreibung ein, nicht `true`.
        festgeschrieben: Boolean(geprueft.data.enshrined),
      })
    }
  }

  const adressen: Adresse[] = []
  for (const eintrag of roheAdressen) {
    const geprueft = adresseSchema.safeParse(eintrag)
    if (!geprueft.success) continue
    adressen.push({
      id: String(geprueft.data.id),
      strasse: geprueft.data.street?.trim() || null,
      plz: geprueft.data.zip?.trim() || null,
      ort: geprueft.data.city?.trim() || null,
    })
  }

  const wege: Weg[] = []
  for (const eintrag of roheWege) {
    const geprueft = wegSchema.safeParse(eintrag)
    if (!geprueft.success) continue
    const wert = geprueft.data.value?.trim()
    if (!wert) continue
    wege.push({ id: String(geprueft.data.id), typ: geprueft.data.type?.trim() || 'SONSTIGES', wert })
  }

  return { kontaktId, anzeige, anhaenge, adressen, wege }
}

/**
 * Ob an einem Kontakt nachweislich nichts mehr hängt.
 *
 * Die Frage steht unmittelbar vor einem `DELETE`, deshalb ist sie
 * absichtlich streng: jede der vier Arten wird frisch abgefragt, und ein
 * Fehler beim Abfragen bedeutet **nicht leer**. Eine Störung darf nicht die
 * Erlaubnis zum Löschen erzeugen.
 */
export async function istLeer(kontaktId: string): Promise<boolean> {
  const zahlen = await Promise.all(
    ARTEN.map(async (art) => objekte(await holeJson(`/${art}?limit=1&${kontaktfilter(kontaktId)}`)).length),
  )
  return zahlen.every((n) => n === 0)
}
