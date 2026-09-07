import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { FallReiter, istReiter, type ReiterKey } from "@/components/FallReiter";
import { Card, DemoHinweis, Field, LicensePlate, StatusChip } from "@/components/ui";
import { reportTypeLabels } from "@/lib/autoixpert/types";
import { AutoixpertError } from "@/lib/autoixpert/client";
import { ladeFall } from "@/lib/faelle/service";
import { dealFields, monetaryValue, stageNames } from "@/lib/pipedrive/client";
import { contactName, formatDate, formatEuro, formatKilometers, formatShortDate } from "@/lib/format";
import { WbwFormular } from "@/components/WbwFormular";

export const dynamic = "force-dynamic";

export default async function FallSeite({
  params,
  searchParams,
}: {
  params: Promise<{ aktenzeichen: string }>;
  searchParams: Promise<{ reiter?: string }>;
}) {
  const { aktenzeichen } = await params;
  const { reiter: reiterParam } = await searchParams;
  const aktiv: ReiterKey = istReiter(reiterParam) ? reiterParam : "beteiligte";

  const akte = await ladeFall(decodeURIComponent(aktenzeichen)).catch((error: unknown) => {
    if (error instanceof AutoixpertError && error.statusCode === 404) return undefined;
    throw error;
  });
  if (!akte) notFound();

  const { report, deal, demo } = akte;
  const az = report.external_id ?? report.token ?? report.id;

  return (
    <AppShell title={contactName(report.claimant)} badge={az}>
      {demo ? <DemoHinweis /> : null}
      <FallReiter aktenzeichen={az} aktiv={aktiv} />

      {aktiv === "beteiligte" ? (
        <div className="grid gap-5 lg:grid-cols-3">
          <Card title="Anspruchsteller">
            <div className="space-y-3">
              <Field label="Firma" value={report.claimant?.organization_name} />
              <div className="grid grid-cols-3 gap-3">
                <Field label="Anrede" value={report.claimant?.salutation} />
                <Field label="Vorname" value={report.claimant?.first_name} />
                <Field label="Nachname" value={report.claimant?.last_name} />
              </div>
              <Field
                label="Straße & Hausnr. oder Postfach"
                value={report.claimant?.street_and_housenumber_or_lockbox}
              />
              <div className="grid grid-cols-3 gap-3">
                <Field label="PLZ" value={report.claimant?.zip} />
                <Field
                  label="Ort"
                  value={report.claimant?.city}
                  className="col-span-2"
                />
              </div>
              <Field label="Telefon" value={report.claimant?.phone} />
              <Field label="E-Mail" value={report.claimant?.email} />
              <div className="pt-2">
                <LicensePlate value={report.car?.license_plate} />
              </div>
              <ul className="space-y-1 pt-2 text-sm text-ax-text-soft">
                <li>{report.claimant?.is_owner ? "✓" : "—"} Ist Fahrzeughalter</li>
                <li>
                  {report.claimant?.represented_by_lawyer ? "✓" : "—"} Durch Anwalt vertreten
                </li>
                <li>
                  {report.claimant?.may_deduct_taxes ? "✓" : "—"} Vorsteuerabzugsberechtigt
                </li>
              </ul>
              {report.lawyer ? (
                <div className="border-t border-ax-divider pt-3">
                  <p className="mb-2 text-[11px] uppercase tracking-wider text-ax-label">
                    Rechtsanwalt
                  </p>
                  <Field label="Kanzlei" value={contactName(report.lawyer)} />
                </div>
              ) : null}
            </div>
          </Card>

          <div className="space-y-5">
            <Card title="Unfalldaten">
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Unfalltag" value={formatShortDate(report.accident?.date)} />
                  <Field
                    label="Uhrzeit"
                    value={
                      report.accident?.time
                        ? new Date(report.accident.time).toLocaleTimeString("de-DE", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : undefined
                    }
                  />
                </div>
                <Field label="Unfallort" value={report.accident?.location} />
                <p className="text-sm text-ax-text-soft">
                  {report.accident?.police_recorded ? "✓" : "—"} Polizeilich erfasst
                </p>
                <Field label="Aktenzeichen Polizei" value={report.accident?.police_case_number} />
                <Field label="Polizeibehörde" value={report.accident?.police_department} />
                <Field label="Schadenhergang" value={report.accident?.circumstances} />
              </div>
            </Card>

            <Card title="Besichtigungen">
              {report.visits?.length ? (
                <div className="space-y-4">
                  {report.visits.map((visit, index) => (
                    <div key={visit.id ?? index} className="space-y-3">
                      <Field label="Straße & Hausnr." value={visit.street} />
                      <div className="grid grid-cols-3 gap-3">
                        <Field label="PLZ" value={visit.zip} />
                        <Field label="Ort" value={visit.city} className="col-span-2" />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <Field label="Datum" value={formatShortDate(visit.date)} />
                        <Field label="Bedingungen" value={visit.conditions} />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-center text-sm text-ax-label">
                  Keine Besichtigung hinterlegt.
                </p>
              )}
            </Card>
          </div>

          <div className="space-y-5">
            <Card title="Unfallgegner">
              <div className="space-y-3">
                <Field label="Firma" value={report.author_of_damage?.organization_name} />
                <div className="grid grid-cols-3 gap-3">
                  <Field label="Anrede" value={report.author_of_damage?.salutation} />
                  <Field label="Vorname" value={report.author_of_damage?.first_name} />
                  <Field label="Nachname" value={report.author_of_damage?.last_name} />
                </div>
                <div className="border-t border-ax-divider pt-3">
                  <p className="mb-2 text-[11px] uppercase tracking-wider text-ax-label">
                    Versicherung
                  </p>
                  <Field label="Versicherung" value={contactName(report.insurance)} />
                  <div className="mt-3 grid grid-cols-2 gap-3">
                    <Field label="PLZ" value={report.insurance?.zip} />
                    <Field label="Ort" value={report.insurance?.city} />
                  </div>
                  <div className="mt-3">
                    <Field label="Schadennummer" value={report.insurance?.claim_number} />
                  </div>
                </div>
              </div>
            </Card>

            <Card title="Auftrag">
              <div className="space-y-3">
                <Field label="Gutachtentyp" value={reportTypeLabels[report.type]} />
                <Field label="Auftragsdatum" value={formatDate(report.order_date)} />
                <Field
                  label="Status"
                  value={report.state === "locked" ? "Abgeschlossen" : "In Bearbeitung"}
                />
                <Field label="Fertigstellung" value={formatShortDate(report.completion_date)} />
              </div>
            </Card>
          </div>
        </div>
      ) : null}

      {aktiv === "fahrzeug" ? (
        <div className="grid gap-5 lg:grid-cols-2">
          <Card title="Basisdaten">
            <div className="space-y-3">
              <Field label="Fahrgestellnummer (VIN)" value={report.car?.vin} />
              <Field label="Hersteller" value={report.car?.make} />
              <Field label="Haupttyp" value={report.car?.model} />
              <div className="grid grid-cols-2 gap-3">
                <Field label="Leistung (KW)" value={report.car?.performance_kw} />
                <Field label="Leistung (PS)" value={report.car?.performance_hp} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field
                  label="Erstzulassung"
                  value={formatShortDate(report.car?.first_registration_date)}
                />
                <Field
                  label="Letzte Zulassung"
                  value={formatShortDate(report.car?.latest_registration_date)}
                />
              </div>
              <Field
                label="Laufleistung (abgelesen)"
                value={formatKilometers(report.car?.mileage_meter, report.car?.mileage_unit)}
              />
              <div className="pt-1">
                <LicensePlate value={report.car?.license_plate} />
              </div>
            </div>
          </Card>

          <Card title="Zustand & Schaden">
            <div className="space-y-3">
              <Field label="Schadenbeschreibung" value={report.car?.damage_description} />
              <Field
                label="Reparierte Vorschäden"
                value={report.car?.repaired_previous_damage}
              />
              <Field
                label="Unreparierte Altschäden"
                value={report.car?.unrepaired_previous_damage}
              />
              <Field label="Allgemeinzustand" value={report.car?.general_condition} />
              <Field label="Bemerkungen" value={report.car?.condition_comment} />
            </div>
          </Card>
        </div>
      ) : null}

      {aktiv === "wbw" ? <WbwFormular report={report} /> : null}

      {aktiv === "vorgang" ? (
        <div className="grid gap-5 lg:grid-cols-2">
          <Card title="Pipedrive">
            {deal ? (
              <div className="space-y-3">
                <div>
                  <p className="text-[11px] text-ax-label">Phase</p>
                  <p className="mt-1">
                    <StatusChip
                      label={stageNames[deal.stage_id ?? -1] ?? "Unbekannt"}
                      color="var(--color-ax-primary)"
                    />
                  </p>
                </div>
                <Field label="Deal" value={deal.title} />
                <Field
                  label="Schadenhöhe brutto"
                  value={formatEuro(
                    monetaryValue(deal.custom_fields?.[dealFields.schadenhoeheBrutto]),
                  )}
                />
                <Field
                  label="Ausgebuchter Betrag"
                  value={formatEuro(
                    monetaryValue(deal.custom_fields?.[dealFields.ausgebuchterBetrag]),
                  )}
                />
                <Field
                  label="Rechnung (sevDesk)"
                  value={String(deal.custom_fields?.[dealFields.sevdeskRechnungId] ?? "")}
                />
              </div>
            ) : (
              <p className="text-center text-sm text-ax-label">
                {demo
                  ? "Im Demomodus wird kein Pipedrive-Deal geladen."
                  : "Zu diesem Aktenzeichen wurde kein Deal gefunden."}
              </p>
            )}
          </Card>

          <Card title="Kürzungen">
            <p className="text-center text-sm text-ax-label">
              Das Kürzungscockpit wird integriert, sobald das vorhandene Projekt vorliegt.
              Bis dahin bleibt sevDesk die Buchhaltung und autoiXpert die führende
              Rechnungsquelle.
            </p>
          </Card>
        </div>
      ) : null}

      <p className="mt-6 text-center text-xs text-ax-label">
        <Link href="/faelle" className="underline underline-offset-2 hover:text-ax-primary">
          Zurück zur Fallübersicht
        </Link>
      </p>
    </AppShell>
  );
}
