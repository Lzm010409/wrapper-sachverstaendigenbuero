import { z } from 'zod'

/**
 * Ausschnitt der autoiXpert-Gutachtenstruktur (externalApi v1).
 *
 * Bewusst nachsichtig: alle Felder sind optional und unbekannte Felder
 * bleiben erhalten. Die Schnittstelle wächst — ein zusätzliches Feld darf
 * einen Fallimport nicht scheitern lassen. Geprüft wird nur, was die
 * Anwendung tatsächlich auswertet.
 */

const kontakt = z
  .object({
    contact_id: z.string().nullish(),
    salutation: z.string().nullish(),
    first_name: z.string().nullish(),
    last_name: z.string().nullish(),
    organization_name: z.string().nullish(),
    email: z.string().nullish(),
    phone: z.string().nullish(),
    street_and_housenumber_or_lockbox: z.string().nullish(),
    zip: z.string().nullish(),
    city: z.string().nullish(),
    case_number: z.string().nullish(),
  })
  .loose()

const versicherung = kontakt.extend({
  contract_number: z.string().nullish(),
  deductible_partial_kasko: z.number().nullish(),
  deductible_full_kasko: z.number().nullish(),
})

const anwalt = kontakt

const fahrzeug = z
  .object({
    license_plate: z.string().nullish(),
    vin: z.string().nullish(),
    make: z.string().nullish(),
    model: z.string().nullish(),
    shape: z.string().nullish(),
    performance_kw: z.number().nullish(),
    performance_hp: z.number().nullish(),
    first_registration_date: z.string().nullish(),
    latest_registration_date: z.string().nullish(),
    mileage_estimated: z.number().nullish(),
    mileage_as_stated: z.number().nullish(),
    mileage_meter: z.number().nullish(),
    mileage_unit: z.string().nullish(),
    service_book_complete: z.boolean().nullish(),
    last_service_date: z.string().nullish(),
    general_condition: z.string().nullish(),
    paint_condition: z.string().nullish(),
    repaired_previous_damage: z.string().nullish(),
    unrepaired_previous_damage: z.string().nullish(),
    damage_description: z.string().nullish(),
  })
  .loose()

const unfall = z
  .object({
    location: z.string().nullish(),
    date: z.string().nullish(),
    time: z.string().nullish(),
    circumstances: z.string().nullish(),
    plausibility: z.string().nullish(),
    police_case_number: z.string().nullish(),
    police_department: z.string().nullish(),
  })
  .loose()

export const gutachtenSchema = z
  .object({
    id: z.string(),
    /** Fremdsystem-ID. In der URL anstelle der Gutachten-ID verwendbar. */
    external_id: z.string().nullish(),
    /** Das Aktenzeichen des Büros — NICHT external_id. */
    token: z.string().nullish(),
    type: z.string().nullish(),
    state: z.string().nullish(),
    created_at: z.string().nullish(),
    updated_at: z.string().nullish(),
    completion_date: z.string().nullish(),
    order_date: z.string().nullish(),
    responsible_assessor_id: z.string().nullish(),

    claimant: kontakt.nullish(),
    owner_of_claimants_car: kontakt.nullish(),
    author_of_damage: kontakt.extend({ license_plate: z.string().nullish() }).nullish(),
    insurance: versicherung.nullish(),
    lawyer: anwalt.nullish(),
    garage: kontakt.nullish(),

    car: fahrzeug.nullish(),
    accident: unfall.nullish(),

    custom_fields: z.record(z.string(), z.unknown()).nullish(),
  })
  .loose()

export type Gutachten = z.infer<typeof gutachtenSchema>

/** Antwort von `GET /reports/{report_id}`. */
export const einzelAntwortSchema = z.object({ report: gutachtenSchema })

/** Antwort von `GET /reports`. */
export const listenAntwortSchema = z.object({
  reports: z.array(gutachtenSchema),
  has_more: z.boolean().optional(),
  next_page: z.string().nullish(),
})

/** Für die Anzeige übersetzte Gutachtentypen. */
export const GUTACHTENTYPEN: Record<string, string> = {
  liability: 'Haftpflichtschaden',
  short_assessment: 'Kurzgutachten / Kostenvoranschlag',
  partial_kasko: 'Teilkasko',
  full_kasko: 'Vollkasko',
  valuation: 'Bewertung',
  oldtimer_valuation_small: 'Kleine Oldtimerbewertung',
  lease_return: 'Leasingrückläufer',
  used_vehicle_check: 'Gebrauchtwagencheck',
  invoice_audit: 'Rechnungsprüfung',
}

export const ZUSTAENDE: Record<string, string> = {
  recorded: 'aufgenommen',
  locked: 'abgeschlossen',
  deleted: 'gelöscht',
}
