import { env } from "@/lib/env";
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
  /** Eine Seite Gutachten. Fuer Folgeseiten `starting_after` aus `next_page` setzen. */
  async listReports(filter: ReportListFilter = {}): Promise<Page<Report>> {
    const body = await request<Record<string, unknown>>("/reports", {
      query: { ...filter },
    });
    return extractPage<Report>(body);
  },

  /**
   * Ein Gutachten. `idOrExternalId` darf laut Doku auch die externe ID sein -
   * bei uns also das Aktenzeichen, sofern es nachgezogen wurde.
   */
  async getReport(idOrExternalId: string): Promise<Report> {
    return request<Report>(`/reports/${encodeURIComponent(idOrExternalId)}`);
  },

  /** Einzelne Felder aendern. PUT waere ein Ersetzen und ist laut Doku zu vermeiden. */
  async patchReport(idOrExternalId: string, patch: Partial<Report>): Promise<Report> {
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
