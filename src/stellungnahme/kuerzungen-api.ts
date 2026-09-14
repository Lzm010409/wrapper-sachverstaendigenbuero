import type { position } from '@/db/schema'

/**
 * Kürzungspositionen und ihre Summen für die Stellungnahmen-API.
 *
 * Datenquelle ist die `position`-Tabelle — der bearbeitete Stand der
 * Stellungnahme inklusive Behandlungsstatus (offen/bestritten/anerkannt/
 * nicht_bestreiten), nicht die rohe KI-Extraktion aus dem Prüfbericht
 * (`Extraktion` in `@/pruefbericht/schema`). Beide bilden unterschiedliche
 * Dinge ab: die Extraktion den ursprünglichen Befund, diese Positionen den
 * aktuellen Bearbeitungsstand.
 */

/** Eine Kürzungsposition, wie sie über die API ausgegeben wird. */
export interface KuerzungspositionApi {
  id: string
  bezeichnung: string
  seite: number | null
  betragGutachten: number | null
  betragGekuerzt: number | null
  differenz: number | null
  begruendungVersicherer: string | null
  behandlung: string
}

/** Summen über alle Kürzungspositionen einer Stellungnahme. */
export interface Kuerzungssummen {
  summeGutachten: number
  summeGekuerzt: number
  summeDifferenz: number
}

type PositionZeile = Pick<
  typeof position.$inferSelect,
  | 'id'
  | 'bezeichnung'
  | 'seite'
  | 'betragGutachten'
  | 'betragGekuerzt'
  | 'differenz'
  | 'begruendungVersicherer'
  | 'behandlung'
>

function runde(wert: number): number {
  return Math.round(wert * 100) / 100
}

/** DB-`numeric` (String) zu gerundeter Zahl — `null` bleibt `null`. */
function alsZahl(wert: string | null): number | null {
  if (wert === null) return null
  const zahl = Number(wert)
  return Number.isNaN(zahl) ? null : runde(zahl)
}

/**
 * Wandelt geladene `position`-Zeilen in die API-Form um und bildet die
 * Summen darüber.
 *
 * Ein fehlender Betrag zählt als 0 in den Summen — in der einzelnen
 * Position bleibt er `null`, damit sichtbar bleibt, was noch nicht befüllt
 * ist.
 */
export function kuerzungspositionenApi(positionen: PositionZeile[]): {
  kuerzungspositionen: KuerzungspositionApi[]
  kuerzungssummen: Kuerzungssummen
} {
  const kuerzungspositionen = positionen.map((p) => ({
    id: p.id,
    bezeichnung: p.bezeichnung,
    seite: p.seite,
    betragGutachten: alsZahl(p.betragGutachten),
    betragGekuerzt: alsZahl(p.betragGekuerzt),
    differenz: alsZahl(p.differenz),
    begruendungVersicherer: p.begruendungVersicherer,
    behandlung: p.behandlung,
  }))

  const summiere = (feld: 'betragGutachten' | 'betragGekuerzt' | 'differenz') =>
    runde(kuerzungspositionen.reduce((summe, p) => summe + (p[feld] ?? 0), 0))

  return {
    kuerzungspositionen,
    kuerzungssummen: {
      summeGutachten: summiere('betragGutachten'),
      summeGekuerzt: summiere('betragGekuerzt'),
      summeDifferenz: summiere('differenz'),
    },
  }
}
