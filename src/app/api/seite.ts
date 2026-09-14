import 'server-only'

/**
 * Seitenparameter für die Listen unter `/api/v1/*` — `limit` und `versatz`,
 * dasselbe Vokabular wie in `sucheEintraege`/`ladeStellungnahmen`.
 *
 * Es gibt hier bewusst keine neue Konvention: die Listen im angemeldeten
 * Bereich schneiden ebenfalls bei einer festen Grenze ab und lassen sich
 * über `hoechstens`/`versatz` weiterblättern — ein ungefiltertes
 * Durchblättern grosser Listen ist an keiner Stelle dieser Anwendung
 * vorgesehen (siehe ARCHITEKTUR.md, Abrufregel).
 */
export interface Seitenparameter {
  limit: number
  versatz: number
}

export function leseSeitenparameter(
  url: URL,
  optionen: { standard?: number; hoechstens?: number } = {},
): Seitenparameter {
  const standard = optionen.standard ?? 50
  const hoechstens = optionen.hoechstens ?? 100

  const limitRoh = Number(url.searchParams.get('limit'))
  const limit = Number.isFinite(limitRoh) && limitRoh > 0 ? Math.min(limitRoh, hoechstens) : standard

  const versatzRoh = Number(url.searchParams.get('versatz'))
  const versatz = Number.isFinite(versatzRoh) && versatzRoh > 0 ? Math.floor(versatzRoh) : 0

  return { limit: Math.floor(limit), versatz }
}
