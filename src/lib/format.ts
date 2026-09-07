/** Anzeigehelfer. Deutsche Formate, weil die Oberflaeche deutsch ist. */

const dateFormat = new Intl.DateTimeFormat("de-DE", {
  weekday: "short",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

const shortDateFormat = new Intl.DateTimeFormat("de-DE", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

const euroFormat = new Intl.NumberFormat("de-DE", {
  style: "currency",
  currency: "EUR",
});

export function formatDate(value?: string): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return dateFormat.format(date);
}

export function formatShortDate(value?: string): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return shortDateFormat.format(date);
}

export function formatEuro(value?: number): string {
  if (value === undefined || Number.isNaN(value)) return "—";
  return euroFormat.format(value);
}

export function formatKilometers(value?: number, unit = "km"): string {
  if (value === undefined) return "—";
  return `${new Intl.NumberFormat("de-DE").format(value)} ${unit}`;
}

/**
 * Werktage zwischen zwei Tagen (Samstag und Sonntag zaehlen nicht mit).
 * autoiXpert zeigt diesen Wert in der Gutachtenliste als Alterskennzeichen;
 * Feiertage bleiben unberuecksichtigt, wie dort auch.
 */
export function werktageSeit(from: string | Date, to: string | Date = new Date()): number {
  const start = new Date(from);
  const end = new Date(to);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0;

  start.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);
  if (end <= start) return 0;

  let count = 0;
  const cursor = new Date(start);
  while (cursor < end) {
    cursor.setDate(cursor.getDate() + 1);
    const day = cursor.getDay();
    if (day !== 0 && day !== 6) count += 1;
  }
  return count;
}

export function werktageLabel(from?: string): string {
  if (!from) return "";
  const days = werktageSeit(from);
  if (days === 0) return "heute";
  if (days === 1) return "1 Werktag";
  return `${days} Werktage`;
}

/** Anzeigename eines Beteiligten: Firma schlaegt Personennamen, wie in autoiXpert. */
export function contactName(contact?: {
  organization_name?: string;
  first_name?: string;
  last_name?: string;
}): string {
  if (!contact) return "—";
  if (contact.organization_name) return contact.organization_name;
  const name = [contact.first_name, contact.last_name].filter(Boolean).join(" ");
  return name || "—";
}
