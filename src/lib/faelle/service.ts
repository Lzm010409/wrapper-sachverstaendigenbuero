import { autoixpert } from "@/lib/autoixpert/client";
import type { Report, ReportListFilter } from "@/lib/autoixpert/types";
import { demoMode } from "@/lib/env";
import { pipedrive, type Deal } from "@/lib/pipedrive/client";
import { demoReports } from "./demo";

export interface FallListe {
  reports: Report[];
  hasMore: boolean;
  nextPage?: string;
  /** true, wenn die Daten aus den Beispieldaten stammen und nicht aus autoiXpert. */
  demo: boolean;
}

export async function ladeFaelle(filter: ReportListFilter = {}): Promise<FallListe> {
  if (demoMode) {
    return { reports: demoReports, hasMore: false, demo: true };
  }
  const page = await autoixpert.listReports({
    sort: "order_date",
    sort_direction: "desc",
    limit: 50,
    ...filter,
  });
  return {
    reports: page.items,
    hasMore: page.has_more,
    nextPage: page.next_page,
    demo: false,
  };
}

export interface FallAkte {
  report: Report;
  deal?: Deal;
  demo: boolean;
}

export async function ladeFall(aktenzeichen: string): Promise<FallAkte | undefined> {
  if (demoMode) {
    const report = demoReports.find(
      (candidate) => candidate.external_id === aktenzeichen || candidate.id === aktenzeichen,
    );
    return report ? { report, demo: true } : undefined;
  }

  // Erst der direkte Weg (ein Lesezugriff), dann die Suche ueber das
  // Aktenzeichen - noetig fuer aeltere Faelle ohne nachgezogene externe ID.
  const report = await autoixpert.getReport(aktenzeichen).catch(async (fehler: unknown) => {
    const gefunden = await autoixpert.sucheUeberAktenzeichen(aktenzeichen);
    if (gefunden) return gefunden;
    throw fehler;
  });

  // Der Deal ist Beiwerk: faellt Pipedrive aus, bleibt die Akte trotzdem nutzbar.
  let deal: Deal | undefined;
  try {
    deal = await pipedrive.findDeal(report.token ?? report.external_id ?? report.id);
  } catch {
    deal = undefined;
  }

  return { report, deal, demo: false };
}
