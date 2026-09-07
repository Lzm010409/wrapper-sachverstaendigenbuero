/**
 * Datentypen der autoiXpert-Schnittstelle (externalApi/v1).
 * Quelle: die abgelegte API-Dokumentation unter "Autoixpert API/".
 * Bewusst nur die Felder, die der Wrapper wirklich benutzt - der Rest bleibt
 * ueber den Indexzugriff erreichbar, ohne dass wir ihn hier pflegen muessen.
 */

export type ReportType =
  | "liability"
  | "short_assessment"
  | "partial_kasko"
  | "full_kasko"
  | "valuation"
  | "oldtimer_valuation_small"
  | "lease_return"
  | "used_vehicle_check"
  | "invoice_audit";

export const reportTypeLabels: Record<ReportType, string> = {
  liability: "Haftpflichtschaden",
  short_assessment: "Kurzgutachten",
  partial_kasko: "Teilkasko",
  full_kasko: "Vollkasko",
  valuation: "Bewertung",
  oldtimer_valuation_small: "Kleine Oldtimerbewertung",
  lease_return: "Leasingrückläufer",
  used_vehicle_check: "Gebrauchtwagencheck",
  invoice_audit: "Rechnungsprüfung",
};

export type ReportState = "recorded" | "locked" | "deleted";

export interface Contact {
  contact_id?: string;
  salutation?: string;
  first_name?: string;
  last_name?: string;
  organization_name?: string;
  email?: string;
  phone?: string;
  phone2?: string;
  street_and_housenumber_or_lockbox?: string;
  zip?: string;
  city?: string;
  notes?: string;
  is_owner?: boolean;
  may_deduct_taxes?: boolean;
  represented_by_lawyer?: boolean;
  iban?: string;
  vat_id?: string;
}

export interface Car {
  license_plate?: string;
  vin?: string;
  make?: string;
  model?: string;
  shape?: string;
  custom_shape_label?: string;
  performance_kw?: number;
  performance_hp?: number;
  first_registration_date?: string;
  latest_registration_date?: string;
  next_general_inspection_date?: string;
  mileage_estimated?: number;
  mileage_as_stated?: number;
  mileage_meter?: number;
  mileage_unit?: string;
  general_condition?: string;
  paint_condition?: string;
  body_condition?: string;
  interior_condition?: string;
  condition_comment?: string;
  repaired_previous_damage?: string;
  unrepaired_previous_damage?: string;
  roadworthiness?: string;
  damage_description?: string;
}

export interface Accident {
  location?: string;
  date?: string;
  time?: string;
  police_recorded?: boolean;
  police_case_number?: string;
  police_department?: string;
  circumstances?: string;
  plausibility?: string;
}

export interface Visit {
  id?: string;
  location_name?: string;
  street?: string;
  zip?: string;
  city?: string;
  date?: string;
  dateTime?: string;
  assessor_id?: string;
  conditions?: string;
  auxiliary_devices?: string[];
}

export interface Photo {
  id?: string;
  description?: string;
  position?: number;
}

export interface Label {
  id?: string;
  name?: string;
  color?: string;
}

export interface Report {
  id: string;
  external_id?: string;
  type: ReportType;
  state: ReportState;
  created_at?: string;
  updated_at?: string;
  completion_date?: string;
  order_date?: string;
  token?: string;
  responsible_assessor_id?: string;
  location_id?: string;
  claimant?: Contact;
  owner_of_claimants_car?: Contact;
  lawyer?: Contact;
  author_of_damage?: Contact;
  insurance?: Contact & { insurance_number?: string; claim_number?: string };
  garage?: Contact;
  car?: Car;
  accident?: Accident;
  visits?: Visit[];
  photos?: Photo[];
  labels?: Label[];
  custom_fields?: Record<string, string | number | boolean>;
}

/** Listenantworten der API sind Cursor-paginiert. */
export interface Page<T> {
  items: T[];
  has_more: boolean;
  next_page?: string;
}

export interface ReportListFilter {
  is_done?: boolean;
  is_open?: boolean;
  report_type?: ReportType;
  responsible_assessor_id?: string;
  location_id?: string;
  created_at_gte?: string;
  created_at_lte?: string;
  sort?: "report_token" | "completion_date" | "order_date" | "updated_at" | "created_at";
  sort_direction?: "asc" | "desc";
  limit?: number;
  starting_after?: string;
}
