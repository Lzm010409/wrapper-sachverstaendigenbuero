import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { DemoHinweis, EmptyState, LicensePlate, StatusChip } from "@/components/ui";
import { IconSuche } from "@/components/icons";
import { reportTypeLabels } from "@/lib/autoixpert/types";
import { fallKennungen } from "@/lib/autoixpert/aktenzeichen";
import { contactName, formatShortDate, werktageLabel } from "@/lib/format";
import { ladeFaelle } from "@/lib/faelle/service";

export const dynamic = "force-dynamic";

export default async function FaelleSeite() {
  const { reports, demo } = await ladeFaelle();

  return (
    <AppShell title="Meine Gutachten">
      {demo ? <DemoHinweis /> : null}

      <div className="overflow-hidden rounded-ax bg-ax-surface shadow-ax-card">
        <div className="flex flex-wrap items-center gap-3 border-b border-ax-divider px-4 py-3">
          <span className="text-sm text-ax-text-soft">Nach Auftragsdatum</span>
          <span className="rounded-full bg-ax-surface-muted px-2 py-0.5 text-xs text-ax-text-soft">
            {reports.length}
          </span>
          <label className="ml-auto flex min-w-52 flex-1 items-center gap-2 sm:max-w-sm">
            <IconSuche className="size-4 shrink-0 text-ax-label" />
            <span className="sr-only">Fälle durchsuchen</span>
            <input
              type="search"
              placeholder="Suchen"
              className="ax-field-input"
            />
          </label>
        </div>

        {reports.length === 0 ? (
          <EmptyState>Keine Fälle gefunden.</EmptyState>
        ) : (
          <ul>
            {reports.map((report) => {
              const { anzeige, pfad } = fallKennungen(report);
              return (
                <li key={report.id} className="border-b border-ax-divider last:border-0">
                  <Link
                    href={`/faelle/${encodeURIComponent(pfad)}`}
                    className="grid grid-cols-1 items-center gap-x-4 gap-y-2 px-4 py-3 transition-colors hover:bg-ax-surface-muted focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ax-primary md:grid-cols-[minmax(0,1.4fr)_minmax(0,1.2fr)_auto_auto_minmax(0,0.9fr)]"
                  >
                    <span className="truncate text-sm text-ax-text">
                      {contactName(report.claimant)}
                    </span>

                    <span className="flex flex-wrap gap-1.5">
                      {(report.labels ?? []).map((label, index) => (
                        <StatusChip
                          key={`${label.name}-${index}`}
                          label={label.name ?? "Label"}
                          color={label.color}
                        />
                      ))}
                    </span>

                    <span className="font-mono text-xs text-ax-text-soft">
                      {anzeige}
                    </span>

                    <LicensePlate value={report.car?.license_plate} />

                    <span className="text-xs text-ax-text-soft">
                      <span className="block">{formatShortDate(report.order_date)}</span>
                      <span className="block text-ax-label">
                        {werktageLabel(report.order_date)}
                      </span>
                      <span className="block text-ax-label">
                        {report.car?.make
                          ? `${report.car.make} ${report.car.model ?? ""}`.trim()
                          : reportTypeLabels[report.type]}
                      </span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </AppShell>
  );
}
