/**
 * Zugangsdaten und Schalter. Alles ueber Umgebungsvariablen, nichts im Code.
 * Fehlt eine Variable, laeuft die Anwendung im Demomodus mit Beispieldaten weiter,
 * statt beim Start abzustuerzen - so ist die Oberflaeche auch ohne Zugaenge pruefbar.
 */
export const env = {
  autoixpertApiKey: process.env.AUTOIXPERT_API_KEY ?? "",
  autoixpertBaseUrl:
    process.env.AUTOIXPERT_BASE_URL ?? "https://app.autoixpert.de/externalApi/v1",
  pipedriveApiToken: process.env.PIPEDRIVE_API_TOKEN ?? "",
  pipedriveBaseUrl: process.env.PIPEDRIVE_BASE_URL ?? "https://api.pipedrive.com/api/v2",
  pipedriveCompanyDomain: process.env.PIPEDRIVE_COMPANY_DOMAIN ?? "",
} as const;

/** Ohne API-Schluessel liefert die Anwendung Beispieldaten statt Fehlermeldungen. */
export const demoMode = !env.autoixpertApiKey;
