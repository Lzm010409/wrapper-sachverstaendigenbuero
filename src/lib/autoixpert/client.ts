import { env } from "@/lib/env";
import {
  AbrufregelVerletzt,
  pflichtfilter,
  pruefeGutachten,
  pruefeSchreibzugriff,
} from "./abrufregel";
import { abrufreihenfolge } from "./aktenzeichen";
import type { Page, Report, ReportListFilter } from "./types";

/**
 * Fehler der autoiXpert-Schnittstelle. Die API liefert einen sprechenden
 * error_code (siehe Doku "Authentifizierung"); den behalten wir, damit die
 * Oberflaeche zwischen "Schluessel fehlt" und "Gutachten gibt es nicht"
 * unterscheiden kann, statt ueberall dasselbe rote Kaestchen zu zeigen.
 */
export class AutoixpertError extends Error {
  readonly statusCode: number;
  readonly errorCode: string;
  readonly endpoint: string;

  constructor(statusCode: number, errorCode: string, endpoint: string, message: string) {
    super(message);
    this.name = "AutoixpertError";
    this.statusCode = statusCode;
    this.errorCode = errorCode;
    this.endpoint = endpoint;
  }
}

interface ApiErrorBody {
  status_code?: number;
  error_code?: string;
  error_message?: string;
  endpoint?: string;
}

type Query = Record<string, string | number | boolean | undefined>;

function buildUrl(path: string, query?: Query): string {
  const url = new URL(env.autoixpertBaseUrl + path);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }
  return url.toString();
}

async function request<T>(
  path: string,
  init: RequestInit & { query?: Query } = {},
): Promise<T> {
  const { query, ...rest } = init;
  const url = buildUrl(path, query);

  const response = await fetch(url, {
    ...rest,
    headers: {
      Authorization: `Bearer ${env.autoixpertApiKey}`,
      Accept: "application/json",
      ...(rest.body ? { "Content-Type": "application/json" } : {}),
      ...rest.headers,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    let body: ApiErrorBody = {};
    try {
      body = (await response.json()) as ApiErrorBody;
    } catch {
      // Manche Fehler kommen ohne JSON-Koerper zurueck.
    }
    throw new AutoixpertError(
      body.status_code ?? response.status,
      body.error_code ?? "UNKNOWN",
      body.endpoint ?? path,
      body.error_message ?? `${response.status} ${response.statusText}`,
    );
  }

  return (await response.json()) as T;
}

/**
 * Die API nennt das Array je Endpunkt anders ("reports", "contacts", ...) und
 * dokumentiert das nicht durchgaengig - in den Beispielen der Doku steht sogar
 * bei GET /reports ein Feld "contacts". Deshalb nehmen wir das erste Array im
 * Antwortobjekt, statt auf einen festen Namen zu vertrauen.
 */
export function extractPage<T>(body: Record<string, unknown>): Page<T> {
  const items =
    (Object.values(body).find((value) => Array.isArray(value)) as T[] | undefined) ?? [];
  return {
    items,
    has_more: body.has_more === true,
    next_page: typeof body.next_page === "string" ? body.next_page : undefined,
  };
}

export const autoixpert = {
  /**
   * Eine Seite Gutachten. Die Pflichtfilter der Abrufregel werden immer
   * gesetzt und lassen sich vom Aufrufer nicht ueberschreiben - sie stehen
   * bewusst hinter dem uebergebenen Filter.
   */
  async listReports(filter: ReportListFilter = {}): Promise<Page<Report>> {
    const body = await request<Record<string, unknown>>("/reports", {
      query: { ...filter, ...pflichtfilter() },
    });
    return extractPage<Report>(body);
  },

  /**
   * Ein Gutachten ueber Aktenzeichen, externe ID oder technische ID.
   *
   * Die externe ID (`0926_2081TG`) wird zuerst versucht, weil sie in der URL
   * erlaubt ist; die Anzeigeform mit Schraegstrich (`0926/2081TG`) steht nur
   * im Feld `token` und ist ueber den Pfad nicht erreichbar. Aeltere Faelle
   * haben gar keine externe ID - dafuer gibt es `sucheUeberAktenzeichen`.
   *
   * Jeder Treffer wird gegen die Abrufregel geprueft: der Einzelabruf kennt
   * keine Filterparameter, die Pruefung im Nachgang ist die einzige Sperre.
   */
  async getReport(eingabe: string): Promise<Report> {
    let letzterFehler: unknown;

    for (const weg of abrufreihenfolge(eingabe)) {
      try {
        const report = await request<Report>(`/reports/${encodeURIComponent(weg)}`);
        pruefeGutachten(report);
        return report;
      } catch (fehler) {
        // Eine Regelverletzung ist ein Ergebnis, kein Fehlschlag des Weges -
        // weitersuchen wuerde dieselbe Sperre nur erneut ausloesen.
        if (fehler instanceof AbrufregelVerletzt) throw fehler;
        letzterFehler = fehler;
      }
    }

    throw letzterFehler;
  },

  /**
   * Sucht ein Gutachten ueber das Aktenzeichen (`token`). Die Schnittstelle
   * bietet dafuer keinen Filter, deshalb wird die - durch die Abrufregel
   * bereits eingeengte - Liste durchgesehen. Nur fuer Faelle ohne externe ID.
   */
  async sucheUeberAktenzeichen(aktenzeichen: string): Promise<Report | undefined> {
    const { vergleichsform } = await import("./aktenzeichen");
    const gesucht = vergleichsform(aktenzeichen);
    const seite = await this.listReports({ limit: 50, sort: "created_at", sort_direction: "desc" });
    return seite.items.find((report) => vergleichsform(report.token ?? "") === gesucht);
  },

  /** Einzelne Felder aendern. PUT waere ein Ersetzen und ist laut Doku zu vermeiden. */
  async patchReport(idOrExternalId: string, patch: Partial<Report>): Promise<Report> {
    pruefeSchreibzugriff(`PATCH /reports/${idOrExternalId}`);
    return request<Report>(`/reports/${encodeURIComponent(idOrExternalId)}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    });
  },

  /** Gesamt-PDF fuer einen Empfaenger, z. B. "claimant" oder "insurance". */
  async downloadFullDocument(
    idOrExternalId: string,
    recipientRole: string,
  ): Promise<ArrayBuffer> {
    const url = buildUrl(
      `/reports/${encodeURIComponent(idOrExternalId)}/full-documents/${encodeURIComponent(recipientRole)}`,
    );
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${env.autoixpertApiKey}` },
      cache: "no-store",
    });
    if (!response.ok) {
      throw new AutoixpertError(
        response.status,
        "DOCUMENT_DOWNLOAD_FAILED",
        url,
        `Gesamtdokument konnte nicht geladen werden (${response.status}).`,
      );
    }
    return response.arrayBuffer();
  },
};
