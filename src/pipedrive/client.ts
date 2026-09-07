
/**
 * Pipedrive-Zugriff, bewusst schmal gehalten: der Wrapper liest den Deal zu einem
 * Fall, um Phase, Kanzlei und Rechnungsverweis in der Fallakte zu zeigen.
 * Geschrieben wird hier nichts - das erledigen weiterhin eure n8n-Workflows.
 *
 * Die Feldschluessel stammen aus GET /dealFields eures Kontos (abgefragt am
 * 07.09.2026). Sie sind kontospezifisch und muessen mitgezogen werden, falls
 * ein Feld neu angelegt wird.
 */
export const dealFields = {
  autoixpertId: "f6970a4fb3ed5c0520ba2ff1c84ec3becb422659",
  autoixpertLink: "102c6f8c0eb82cace7aa8ed3e77c06dcd3485a2a",
  schadennummer: "21378b56f922a8095b261f1fcefb056bdf0c3ecf",
  kennzeichen: "00e9babb88454e04c01ae593a6402e8f9c401fb8",
  schadenhoeheBrutto: "adb0956f0161f534c04d43a1627acb23e692fea6",
  schadenhoeheNetto: "4ceb36746f5a9faa66cce4e2aa68f9191d43d7dc",
  sevdeskRechnungId: "d8863fcbcb97aeb225a9418261b5508c0410783f",
  sevdeskRechnungLink: "ee8bc622d857b546eca74c56a303f1373b05047c",
  ausgebuchterBetrag: "c4ae5d687eacc0bbe5c05a1d70ec447644d4eb3f",
  ausgebuchterBetragGrund: "a037653e87dd01a3ab9946c9741ff2db41de64f3",
} as const;

/** Phasen der Pipeline "Auftrag" (ID 2), abgefragt am 07.09.2026. */
export const stageNames: Record<number, string> = {
  6: "Aufgenommen",
  7: "In Bearbeitung",
  8: "Versendet",
  9: "Teilbezahlt",
  10: "Bezahlt",
  11: "Klage",
};

export interface Deal {
  id: number;
  title?: string;
  stage_id?: number;
  status?: string;
  value?: number;
  currency?: string;
  custom_fields?: Record<string, unknown>;
  [key: string]: unknown;
}

function token(): string {
  return process.env.PIPEDRIVE_API_TOKEN ?? "";
}

function basisUrl(): string {
  return process.env.PIPEDRIVE_BASE_URL ?? "https://api.pipedrive.com/api/v2";
}

/** Der Wert eines Pipedrive-Geldfeldes steckt je nach API-Version unterschiedlich tief. */
export function monetaryValue(raw: unknown): number | undefined {
  if (typeof raw === "number") return raw;
  if (raw && typeof raw === "object" && "value" in raw) {
    const value = (raw as { value: unknown }).value;
    if (typeof value === "number") return value;
  }
  return undefined;
}

async function request<T>(path: string, query: Record<string, string | number> = {}) {
  const url = new URL(basisUrl() + path);
  for (const [key, value] of Object.entries(query)) url.searchParams.set(key, String(value));
  url.searchParams.set("api_token", token());

  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Pipedrive antwortete mit ${response.status} auf ${path}.`);
  }
  const body = (await response.json()) as { data?: T };
  return body.data;
}

export const pipedrive = {
  /**
   * Sucht den Deal zu einem Fall. Der Volltextindex trifft Aktenzeichen, Kennzeichen
   * und Titel - genau die Signale, die euer Deal-Index-Workflow ohnehin pflegt.
   */
  async findDeal(searchTerm: string): Promise<Deal | undefined> {
    if (!token() || !searchTerm) return undefined;
    const data = await request<{ items?: { item: Deal }[] }>("/deals/search", {
      term: searchTerm,
      limit: 1,
    });
    return data?.items?.[0]?.item;
  },
};
