import type { Gutachten } from './typen'

/**
 * Beispielgutachten nach der Struktur der offiziellen Dokumentation
 * (externalApi v1). Dient den Tests als Ersatz für die echte Schnittstelle
 * und dokumentiert zugleich, welche Felder die Anwendung auswertet.
 */
export const BEISPIEL_GUTACHTEN: Gutachten = {
  id: 'OmCMeaXCDs',
  external_id: null,
  token: 'GA-2026-0147',
  type: 'liability',
  state: 'recorded',
  created_at: '2026-03-02T09:14:00.000Z',
  updated_at: '2026-03-11T16:02:00.000Z',
  completion_date: '2026-03-10',
  order_date: '2026-03-02',
  responsible_assessor_id: 'tg',

  claimant: {
    salutation: 'Frau',
    first_name: 'Anna Marie',
    last_name: 'Meyer',
    organization_name: '',
    email: 'anna-marie@example.org',
    phone: '07308-8098980',
    street_and_housenumber_or_lockbox: 'Musterweg 13/1',
    zip: '54321',
    city: 'Musterhausen',
    case_number: null,
  },

  lawyer: {
    organization_name: 'Kanzlei Schmitt & Partner',
    first_name: 'Klaus',
    last_name: 'Schmitt',
    street_and_housenumber_or_lockbox: 'Rechtsweg 4',
    zip: '47798',
    city: 'Krefeld',
    case_number: 'RA-2026-889',
  },

  insurance: {
    organization_name: 'Musterversicherung AG',
    street_and_housenumber_or_lockbox: 'Versicherungsplatz 1',
    zip: '40213',
    city: 'Düsseldorf',
    case_number: 'SCH-77-2026-4412',
    contract_number: 'POL-889231',
  },

  garage: {
    organization_name: 'Autohaus Nord GmbH',
    zip: '47807',
    city: 'Krefeld',
  },

  author_of_damage: {
    first_name: 'Peter',
    last_name: 'Gegner',
    license_plate: 'D-XY-4711',
    zip: '40210',
    city: 'Düsseldorf',
  },

  car: {
    license_plate: 'KR-AM-123',
    vin: 'WVWZZZ1KZAW123456',
    make: 'Volkswagen',
    model: 'Passat Variant 2.0 TDI',
    shape: 'stationWagon',
    first_registration_date: '2021-06-15',
    mileage_meter: 68450,
    mileage_as_stated: 68000,
    mileage_estimated: 70000,
    mileage_unit: 'km',
    service_book_complete: true,
    last_service_date: '2025-11-04',
    repaired_previous_damage: 'Heckstoßfänger 2023 fachgerecht instandgesetzt',
    damage_description: 'Beschädigung Seitenwand hinten links, Tür hinten links',
  },

  accident: {
    date: '2026-02-27',
    location: 'Krefeld, Hauptstraße / Ecke Bahnstraße',
    circumstances: 'Auffahrunfall beim Abbiegen',
  },
}

/** Ein Gutachten ohne Anwalt — dann ist der Versicherer der Empfänger. */
export const GUTACHTEN_OHNE_ANWALT: Gutachten = {
  ...BEISPIEL_GUTACHTEN,
  id: 'ZweiterFall',
  token: 'GA-2026-0148',
  lawyer: null,
}

/** Ein sehr dünn gefülltes Gutachten — nichts darf erfunden werden. */
export const GUTACHTEN_MINIMAL: Gutachten = {
  id: 'Minimal01',
  token: null,
  external_id: 'FREMD-99',
}
