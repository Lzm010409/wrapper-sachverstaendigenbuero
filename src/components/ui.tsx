import type { ReactNode } from "react";

/** Weisse Karte mit gesperrter Grossbuchstaben-Ueberschrift - das Grundelement der Oberflaeche. */
export function Card({
  title,
  icon,
  actions,
  children,
  className = "",
}: {
  title?: string;
  icon?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-ax bg-ax-surface p-5 shadow-ax-card ${className}`}
    >
      {title ? (
        <header className="mb-5 flex items-center justify-center gap-2">
          {icon}
          <h2 className="text-center text-[13px] font-medium uppercase tracking-[0.09em] text-ax-text-soft">
            {title}
          </h2>
          {actions ? <div className="ml-auto">{actions}</div> : null}
        </header>
      ) : null}
      {children}
    </section>
  );
}

/**
 * Feld im autoiXpert-Stil: winziges graues Label ueber einem Wert auf Unterstrich.
 * Rein darstellend - `editable` schaltet auf ein echtes Eingabefeld um, sobald
 * schreibende Masken dazukommen.
 */
export function Field({
  label,
  value,
  name,
  editable = false,
  className = "",
}: {
  label: string;
  value?: string | number | null;
  name?: string;
  editable?: boolean;
  className?: string;
}) {
  const shown = value === undefined || value === null || value === "" ? "" : String(value);
  return (
    <div className={className}>
      <label
        className="block text-[11px] leading-4 text-ax-label"
        htmlFor={name ?? undefined}
      >
        {label}
      </label>
      {editable ? (
        <input
          id={name}
          name={name}
          defaultValue={shown}
          className="ax-field-input"
        />
      ) : (
        <p className="ax-field-input min-h-[26px] whitespace-pre-wrap">
          {shown || <span className="text-ax-label">—</span>}
        </p>
      )}
    </div>
  );
}

/** Statuskennzeichen der Gutachtenliste: farbiger Punkt, grauer Text, helle Pille. */
export function StatusChip({ label, color }: { label: string; color?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-ax bg-ax-surface-muted px-2 py-1 text-xs text-ax-text-soft">
      <span
        className="size-1.5 shrink-0 rounded-full"
        style={{ background: color ?? "var(--color-ax-chip-blue)" }}
        aria-hidden="true"
      />
      {label}
    </span>
  );
}

/** Kennzeichen als Schild mit blauem EU-Streifen, wie in autoiXpert. */
export function LicensePlate({ value }: { value?: string }) {
  if (!value) {
    return <span className="text-xs italic text-ax-label">Kein Kennzeichen</span>;
  }
  return (
    <span className="inline-flex items-stretch overflow-hidden rounded-[3px] border border-ax-text/70 bg-white font-semibold tracking-wide">
      <span className="flex w-3.5 items-end justify-center bg-[#1a4ba0] pb-0.5 text-[6px] text-white">
        D
      </span>
      <span className="px-1.5 py-0.5 text-[13px] text-ax-text">{value}</span>
    </span>
  );
}

/** Betrag: Hauptwert gruen, Sekundaerwert klein und grau darunter - wie in der Kalkulation. */
export function Amount({
  primary,
  secondary,
  label,
}: {
  primary: string;
  secondary?: string;
  label?: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2">
      {label ? <span className="text-sm text-ax-text-soft">{label}</span> : null}
      <span className="text-right">
        <span className="block text-sm font-medium text-ax-value">{primary}</span>
        {secondary ? (
          <span className="block text-xs text-ax-label">{secondary}</span>
        ) : null}
      </span>
    </div>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-ax bg-ax-surface p-8 text-center text-sm text-ax-text-soft shadow-ax-card">
      {children}
    </p>
  );
}

export function DemoHinweis() {
  return (
    <p className="mb-4 rounded-ax border-l-4 border-ax-warn bg-ax-surface px-4 py-3 text-sm text-ax-text-soft shadow-ax-card">
      <strong className="font-medium text-ax-text">Demomodus:</strong> Es ist kein
      autoiXpert-Zugangsschlüssel hinterlegt (<code>AUTOIXPERT_API_KEY</code>). Angezeigt
      werden Beispieldaten, keine echten Fälle.
    </p>
  );
}
