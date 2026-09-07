import Link from "next/link";

export const reiter = [
  { key: "beteiligte", label: "Unfall & Beteiligte" },
  { key: "fahrzeug", label: "Fahrzeugauswahl" },
  { key: "wbw", label: "Wiederbeschaffungswert" },
  { key: "vorgang", label: "Vorgang & Rechnung" },
] as const;

export type ReiterKey = (typeof reiter)[number]["key"];

export function istReiter(value: string | undefined): value is ReiterKey {
  return reiter.some((tab) => tab.key === value);
}

/** Reiterleiste des Falls, nachgebaut nach der autoiXpert-Gutachtenmaske. */
export function FallReiter({
  aktenzeichen,
  aktiv,
}: {
  aktenzeichen: string;
  aktiv: ReiterKey;
}) {
  return (
    <nav
      aria-label="Bereiche des Falls"
      className="mb-5 flex flex-wrap gap-1 rounded-ax bg-ax-surface p-1.5 shadow-ax-card"
    >
      {reiter.map((tab) => {
        const active = tab.key === aktiv;
        return (
          <Link
            key={tab.key}
            href={`/faelle/${encodeURIComponent(aktenzeichen)}?reiter=${tab.key}`}
            aria-current={active ? "page" : undefined}
            className={
              "rounded-ax px-4 py-2.5 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ax-primary " +
              (active
                ? "border border-ax-primary text-ax-primary"
                : "border border-transparent text-ax-text-soft hover:bg-ax-surface-muted")
            }
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
