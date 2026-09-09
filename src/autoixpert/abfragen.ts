import 'server-only'
import { and, asc, desc, eq, gte, ilike, lte, or, sql, type SQL } from 'drizzle-orm'
import { db } from '@/db'
import { fall } from '@/db/schema'
import type { Sortierstand } from '@/app/teile/sortierung'

/**
 * Lesende Abfragen auf die abgelegten Fälle.
 *
 * **Warum sie hier stehen und nicht in `aktionen.ts`:** Jede exportierte
 * Funktion einer Datei mit `'use server'` ist ein aufrufbarer Endpunkt. Diese
 * drei standen dort — ohne jede Anmeldeprüfung. Wer die Kennung der Aktion
 * aus dem Browserpaket las, bekam mit einem einzigen Aufruf die letzten 100
 * Fälle samt Aktenzeichen, Anspruchsteller, Kennzeichen und der vollständigen
 * autoiXpert-Antwort — ohne Cookie, ohne Konto.
 *
 * Es ist derselbe Austritt, den `src/auth/wache.ts` für die **Seiten**
 * geschlossen hat, nur eine Ebene tiefer. Und die Lehre daraus ist dieselbe:
 * eine vergessene Prüfung fällt nicht auf. Deshalb steht hier nicht bloss
 * eine Prüfung mehr — die Funktionen sind gar kein Endpunkt mehr. Sie werden
 * nur von Serverkomponenten aufgerufen, und die verlangen die Anmeldung
 * bereits als erste Anweisung.
 *
 * `import 'server-only'` sorgt dafür, dass ein versehentlicher Import aus
 * einer Client-Komponente den Bau abbricht statt die Datei ins Browserpaket
 * zu ziehen.
 */

/**
 * Wonach sich die Fallliste einschränken lässt.
 *
 * **Warum in der Datenbank und nicht im Browser.** Die Liste holte bisher
 * die letzten hundert Fälle und zeigte sie; wer den einhundertersten suchte,
 * fand ihn nicht. Ein Filter, der erst im Browser greift, ändert daran
 * nichts — er filtert dieselben hundert. Gefiltert wird deshalb in der
 * Abfrage, und die Grenze von hundert gilt für das *Ergebnis*.
 *
 * **Warum aus dem JSON und nicht aus eigenen Spalten.** Kennzeichen, Marke
 * und Erstzulassung stehen in der autoiXpert-Antwort, die als Ganzes abgelegt
 * ist. Eigene Spalten daneben wären schneller, müssten aber bei jedem Abruf
 * mitgepflegt werden und wären für die bereits abgelegten Fälle leer, bis
 * jeder einzelne neu geladen ist. Bei der Grössenordnung dieses Hauses —
 * einige tausend Fälle — trägt der Zugriff über den JSON-Pfad.
 */
export interface Fallfilter {
  /** Aktenzeichen, Anspruchsteller, Kennzeichen oder Fahrgestellnummer. */
  suche?: string
  /** `recorded`, `locked` oder `deleted` — die Zustände von autoiXpert. */
  zustand?: string
  /** Abgerufen ab diesem Tag, `JJJJ-MM-TT`. */
  von?: string
  /** Abgerufen bis einschliesslich diesem Tag, `JJJJ-MM-TT`. */
  bis?: string
  marke?: string
  modell?: string
  /** Baujahr aus der Erstzulassung, vierstellig. */
  baujahr?: string
}

/** Ob überhaupt etwas eingeschränkt wurde — für „keine Treffer" gegen „noch nichts da". */
export function filterGesetzt(filter: Fallfilter | undefined): boolean {
  if (!filter) return false
  return Object.values(filter).some((wert) => typeof wert === 'string' && wert.trim() !== '')
}

/** Die Bedingungen eines Filters. Ausgelagert, damit Liste und Zählung dieselben nehmen. */
function bedingungen(filter: Fallfilter = {}): SQL[] {
  const alle: SQL[] = []

  const suche = filter.suche?.trim()
  if (suche) {
    const muster = `%${suche}%`
    /*
     * Ein Feld, vier Fundstellen. Das Kennzeichen wird beim Suchen mal mit,
     * mal ohne Bindestrich getippt (`OL-AB 123` / `OL AB 123` / `OLAB123`);
     * verglichen wird deshalb auf beiden Seiten ohne Trennzeichen. Ohne das
     * fand `OLAB123` den Fall `OL-AB 123` nicht — und genau so tippt man ein
     * Kennzeichen, wenn man es schnell sucht.
     */
    const ohneTrenner = suche.replace(/[\s-]/g, '')
    const oder = or(
      ilike(fall.aktenzeichen, muster),
      sql`${fall.daten}->'car'->>'vin' ilike ${muster}`,
      sql`replace(replace(coalesce(${fall.daten}->'car'->>'license_plate', ''), '-', ''), ' ', '') ilike ${`%${ohneTrenner}%`}`,
      sql`concat_ws(' ',
        ${fall.daten}->'claimant'->>'organization_name',
        ${fall.daten}->'claimant'->>'first_name',
        ${fall.daten}->'claimant'->>'last_name'
      ) ilike ${muster}`,
    )
    if (oder) alle.push(oder)
  }

  if (filter.zustand?.trim()) {
    alle.push(sql`${fall.daten}->>'state' = ${filter.zustand.trim()}`)
  }
  if (filter.von?.trim()) {
    alle.push(gte(fall.abgerufenAm, new Date(`${filter.von.trim()}T00:00:00`)))
  }
  if (filter.bis?.trim()) {
    // Bis einschliesslich: der Tag selbst gehört dazu, sonst findet ein
    // Zeitraum „bis heute" nichts von heute.
    alle.push(lte(fall.abgerufenAm, new Date(`${filter.bis.trim()}T23:59:59.999`)))
  }
  if (filter.marke?.trim()) {
    alle.push(sql`${fall.daten}->'car'->>'make' ilike ${`%${filter.marke.trim()}%`}`)
  }
  if (filter.modell?.trim()) {
    alle.push(sql`${fall.daten}->'car'->>'model' ilike ${`%${filter.modell.trim()}%`}`)
  }
  if (filter.baujahr?.trim()) {
    // Die erste vierstellige Zahl der Erstzulassung. Trägt beide
    // Schreibweisen, die vorkommen: `2021-06-15` und `15.06.2021`.
    alle.push(
      sql`substring(coalesce(${fall.daten}->'car'->>'first_registration_date', '') from '\d{4}') = ${filter.baujahr.trim()}`,
    )
  }

  return alle
}

/**
 * Wonach sich die Fallliste sortieren lässt.
 *
 * Nur `aktenzeichen` und `abgerufenAm` sind eigene Spalten; der Rest steht
 * im JSON-Feld `daten` (siehe die Begründung an `Fallfilter` oben) und wird
 * über den JSON-Pfad sortiert — bei „einige tausend Fälle" ohne eigenen
 * Index tragbar, siehe `fallSortierAusdruck`.
 */
export type FallSortierfeld =
  | 'abgerufenAm'
  | 'aktenzeichen'
  | 'anspruchsteller'
  | 'marke'
  | 'modell'
  | 'gutachtentyp'
  | 'versicherung'
  | 'zustand'

export const FALL_SORTIERFELDER: { wert: FallSortierfeld; text: string }[] = [
  { wert: 'abgerufenAm', text: 'Datum' },
  { wert: 'aktenzeichen', text: 'Aktenzeichen' },
  { wert: 'anspruchsteller', text: 'Anspruchsteller' },
  { wert: 'marke', text: 'Marke' },
  { wert: 'modell', text: 'Modell' },
  { wert: 'gutachtentyp', text: 'Gutachtentyp' },
  { wert: 'versicherung', text: 'Versicherung' },
  { wert: 'zustand', text: 'Zustand' },
]

/**
 * Der SQL-Ausdruck je Sortierfeld.
 *
 * `anspruchsteller` und `versicherung` sind in der Anzeige zusammengesetzte
 * Namen (siehe `beteiligter()` in `felder.ts`); hier steht ein Näherungswert
 * aus denselben JSON-Pfaden — `anspruchsteller` teilt sich den Ausdruck
 * bewusst mit der Suche in `bedingungen()`, damit beide dasselbe meinen.
 */
function fallSortierAusdruck(feld: FallSortierfeld): SQL {
  switch (feld) {
    case 'aktenzeichen':
      return sql`${fall.aktenzeichen}`
    case 'anspruchsteller':
      return sql`concat_ws(' ',
        ${fall.daten}->'claimant'->>'organization_name',
        ${fall.daten}->'claimant'->>'first_name',
        ${fall.daten}->'claimant'->>'last_name'
      )`
    case 'marke':
      return sql`${fall.daten}->'car'->>'make'`
    case 'modell':
      return sql`${fall.daten}->'car'->>'model'`
    case 'gutachtentyp':
      return sql`${fall.daten}->>'type'`
    case 'versicherung':
      return sql`coalesce(
        nullif(${fall.daten}->'insurance'->>'organization_name', ''),
        nullif(trim(concat_ws(' ',
          ${fall.daten}->'insurance'->>'first_name',
          ${fall.daten}->'insurance'->>'last_name'
        )), '')
      )`
    case 'zustand':
      return sql`${fall.daten}->>'state'`
    default:
      return sql`${fall.abgerufenAm}`
  }
}

/** Die zuletzt abgerufenen Fälle, eingeschränkt durch den Filter. */
export function ladeFaelle(
  filter?: Fallfilter,
  sortierung?: Sortierstand<FallSortierfeld>,
  hoechstens = 100,
  versatz = 0,
) {
  const wo = bedingungen(filter)
  const ordnung = sortierung
    ? sortierung.richtung === 'absteigend'
      ? desc(fallSortierAusdruck(sortierung.feld))
      : asc(fallSortierAusdruck(sortierung.feld))
    : desc(fall.abgerufenAm)

  return db
    .select({
      id: fall.id,
      aktenzeichen: fall.aktenzeichen,
      autoixpertId: fall.autoixpertId,
      daten: fall.daten,
      abgerufenAm: fall.abgerufenAm,
    })
    .from(fall)
    .where(wo.length > 0 ? and(...wo) : undefined)
    .orderBy(ordnung)
    .limit(hoechstens)
    .offset(versatz)
}

/**
 * Wie viele Fälle der Filter trifft.
 *
 * Getrennt von der Liste, weil die Liste bei hundert abschneidet: „100 Fälle"
 * unter einer Liste aus hundert Zeilen wäre eine Behauptung, die schon bei
 * hunderteins falsch ist.
 */
export async function zaehleGefilterte(filter?: Fallfilter): Promise<number> {
  const wo = bedingungen(filter)
  const zeilen = await db
    .select({ anzahl: sql<number>`count(*)`.mapWith(Number) })
    .from(fall)
    .where(wo.length > 0 ? and(...wo) : undefined)
  return zeilen[0]?.anzahl ?? 0
}

/**
 * Die Marken, die in den abgelegten Fällen vorkommen — für die Auswahlliste.
 *
 * Eine feste Markenliste wäre entweder zu lang (jede Marke der Welt) oder zu
 * kurz (die, an die jemand beim Bauen dachte). Was hier steht, ist genau das,
 * wonach sich in diesem Bestand überhaupt filtern lässt.
 */
export async function vorhandeneMarken(): Promise<string[]> {
  const zeilen = await db
    .selectDistinct({ marke: sql<string | null>`${fall.daten}->'car'->>'make'` })
    .from(fall)
  return zeilen
    .map((z) => z.marke?.trim())
    .filter((m): m is string => Boolean(m))
    .sort((a, b) => a.localeCompare(b, 'de'))
}

export async function ladeFall(id: string) {
  const zeilen = await db.select().from(fall).where(eq(fall.id, id)).limit(1)
  return zeilen[0] ?? null
}

export async function zaehleFaelle(): Promise<number> {
  const zeilen = await db.select({ anzahl: sql<number>`count(*)`.mapWith(Number) }).from(fall)
  return zeilen[0]?.anzahl ?? 0
}
