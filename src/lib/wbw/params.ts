import type { Report } from "@/lib/autoixpert/types";

/**
 * Eingabedatei des WBW-Plugins (params.json).
 * Feldnamen und Voreinstellungen stammen aus dem Skill
 * "wbw-vergleichsfahrzeuge" (SKILL.md, Schritt 3).
 */
export interface WbwParams {
  subject: {
    marke: string;
    modell: string;
    variante: string;
    ez: string;
    mileage: number | null;
    power: number | null;
  };
  sollAusstattung: string[];
  plz: string;
  zentrum: null;
  radiusKm: number;
  kmToleranz: number;
  ezToleranzJahre: number;
  leistungToleranzKw: number;
  getriebe?: "Automatik" | "Manuell";
  tueren?: number;
  maxItemsProPortal: number;
  kleinanzeigenLocId: null;
  wbwOpts: { eurProKm: number; eurProEzMonat: number };
}

export interface WbwEingaben {
  variante?: string;
  plz?: string;
  getriebe?: "Automatik" | "Manuell" | "egal";
  tueren?: number;
  sollAusstattung?: string;
  radiusKm?: number;
  kmToleranz?: number;
  ezToleranzJahre?: number;
  leistungToleranzKw?: number;
  maxItemsProPortal?: number;
}

/** ISO-Datum zur Monatsangabe MM/JJJJ, wie das Plugin sie erwartet. */
export function toEzMonat(isoDate?: string): string {
  if (!isoDate) return "";
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return "";
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${month}/${date.getFullYear()}`;
}

/** Freitext mit Kommas oder Zeilenumbruechen in die Merkmalsliste zerlegen. */
export function parseAusstattung(input?: string): string[] {
  if (!input) return [];
  return input
    .split(/[,\n]/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

/**
 * Uebersetzt ein Gutachten in die Eingabedatei des WBW-Plugins.
 * Die Laufleistung nimmt den abgelesenen Wert, sonst den angegebenen, sonst den
 * geschaetzten - in genau dieser Reihenfolge, weil der abgelesene Wert der
 * belastbarste ist.
 */
export function reportToWbwParams(report: Report, eingaben: WbwEingaben = {}): WbwParams {
  const car = report.car ?? {};
  const mileage = car.mileage_meter ?? car.mileage_as_stated ?? car.mileage_estimated ?? null;

  const params: WbwParams = {
    subject: {
      marke: car.make ?? "",
      modell: car.model ?? "",
      variante: eingaben.variante ?? "",
      ez: toEzMonat(car.first_registration_date),
      mileage,
      power: car.performance_kw ?? null,
    },
    sollAusstattung: parseAusstattung(eingaben.sollAusstattung),
    plz: eingaben.plz ?? report.claimant?.zip ?? "",
    zentrum: null,
    radiusKm: eingaben.radiusKm ?? 200,
    kmToleranz: eingaben.kmToleranz ?? 25000,
    ezToleranzJahre: eingaben.ezToleranzJahre ?? 1,
    leistungToleranzKw: eingaben.leistungToleranzKw ?? 10,
    maxItemsProPortal: eingaben.maxItemsProPortal ?? 40,
    kleinanzeigenLocId: null,
    wbwOpts: { eurProKm: 0.1, eurProEzMonat: 120 },
  };

  // Das Plugin filtert nur, wenn das Feld gesetzt ist - "egal" heisst weglassen.
  if (eingaben.getriebe === "Automatik" || eingaben.getriebe === "Manuell") {
    params.getriebe = eingaben.getriebe;
  }
  if (eingaben.tueren) params.tueren = eingaben.tueren;

  return params;
}

/** Pflichtangaben nach SKILL.md; ohne sie wird der Korb beliebig. */
export function fehlendeAngaben(params: WbwParams): string[] {
  const fehlt: string[] = [];
  if (!params.subject.marke) fehlt.push("Hersteller");
  if (!params.subject.modell) fehlt.push("Modell");
  if (!params.subject.variante) fehlt.push("Variante bzw. Ausstattungslinie");
  if (!params.subject.ez) fehlt.push("Erstzulassung");
  if (!params.subject.mileage) fehlt.push("Laufleistung");
  if (!params.plz) fehlt.push("Zentrum-PLZ");
  return fehlt;
}
