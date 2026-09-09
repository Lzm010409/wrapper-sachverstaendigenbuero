import 'server-only'
import { and, desc, eq, gte, ilike, or, sql, type SQL } from 'drizzle-orm'
import { db } from '@/db'
import { ereignis } from '@/db/schema'
import { ergaenzeAusgang, type Eintrag, type Stufe } from './index'

/**
 * Der zweite Ausgang des Protokolls: die Fehlerliste in der Anwendung.
 *
 * **Warum neben dem Containerprotokoll.** Der Strom nach stdout ist für den
 * Betrieb: vollständig, sofort, aber flüchtig — ein Neustart wirft ihn weg,
 * und lesbar ist er nur über Coolify. Diese Tabelle ist für die Nacharbeit:
 * sie steht morgen noch da, sie lässt sich durchsuchen, und ein Benutzer
 * kann mit „Kennung K7M2-QP4X" hereinkommen und bekommt genau eine Zeile.
 *
 * **Was hier bewusst nicht landet:** Auskünfte (`info`). Sie sind der
 * gewöhnliche Betrieb; in einer Liste, die man bei einer Störung durchsieht,
 * wären sie das Rauschen, in dem die zwei wichtigen Zeilen untergehen.
 */

/** Nur was auffällt — Auskünfte bleiben im Strom. */
const AUFGEHOBEN: Stufe[] = ['fehler', 'warnung']

/**
 * Was aus dem Zusammenhang in eigene Spalten wandert.
 *
 * Nur diese beiden, weil nur nach ihnen gesucht wird. Der Rest bleibt als
 * JSON beisammen — eine Spalte je Feld wäre eine Tabelle, die bei jedem neuen
 * Protokollaufruf wächst.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function alsUuid(wert: unknown): string | null {
  return typeof wert === 'string' && UUID.test(wert) ? wert : null
}

/**
 * Meldet die Fehlerliste als Ausgang an.
 *
 * Wird beim Start **einmal** gerufen (siehe `instrumentation.ts`). Der
 * Schreibvorgang ist abgekoppelt: das Protokollieren darf nicht auf die
 * Datenbank warten, und ein Datenbankfehler darf den Vorgang nicht
 * mitnehmen, über den berichtet wird.
 */
export function meldeFehlerlisteAn(): void {
  // Der Name macht den Aufruf wiederholbar: Next lädt `instrumentation.ts`
  // in eigenen Bündeln je Laufzeit, und ohne ihn stünde jeder Fehler so oft
  // in der Liste, wie sie geladen wurde.
  ergaenzeAusgang((eintrag: Eintrag) => {
    if (!AUFGEHOBEN.includes(eintrag.stufe)) return
    void schreibe(eintrag).catch((fehler) => {
      // Bewusst `console.error` und nicht der Protokollierer selbst: sonst
      // erzeugte ein dauerhaft kaputter Schreibweg eine Schleife.
      console.error(
        JSON.stringify({
          zeit: new Date().toISOString(),
          stufe: 'fehler',
          stelle: 'protokoll.ablage',
          meldung: 'Ein Protokolleintrag liess sich nicht ablegen.',
          grund: fehler instanceof Error ? fehler.message : String(fehler),
        }),
      )
    })
  }, 'fehlerliste')
}

async function schreibe(eintrag: Eintrag): Promise<void> {
  const { zeit, stufe, stelle, meldung, kennung, fehler, ...rest } = eintrag
  void zeit
  await db.insert(ereignis).values({
    kennung: kennung ?? null,
    stufe,
    stelle,
    meldung,
    fehlerName: fehler?.name ?? null,
    fehlerMeldung: fehler?.meldung ?? null,
    spur: fehler?.spur ?? null,
    zusammenhang: Object.keys(rest).length > 0 ? rest : null,
    benutzerId: alsUuid(rest.benutzerId),
    fallId: alsUuid(rest.fallId),
  })
}

export interface Ereigniszeile {
  id: string
  kennung: string | null
  stufe: Stufe
  stelle: string
  meldung: string
  fehlerName: string | null
  fehlerMeldung: string | null
  spur: string | null
  zusammenhang: Record<string, unknown> | null
  erstelltAm: string
}

export interface Suchfilter {
  /** Kennung, Stelle, Meldungstext oder der `digest` der Fehlerseite. */
  suche?: string
  stufe?: Stufe
  /** Nur die letzten N Tage. */
  tage?: number
}

/** Die Bedingungen eines Filters. Ausgelagert, damit Liste und Zählung dieselben nehmen. */
function ereignisBedingungen(filter: Suchfilter): SQL[] {
  const bedingungen: SQL[] = []

  const suche = filter.suche?.trim()
  if (suche) {
    const muster = `%${suche}%`
    const oder = or(
      ilike(ereignis.kennung, muster),
      ilike(ereignis.stelle, muster),
      ilike(ereignis.meldung, muster),
      ilike(ereignis.fehlerMeldung, muster),
      // Der `digest` ist die Kennung, die der Benutzer auf der Fehlerseite
      // vor sich hat — die eigene kennt er nicht. Wer ihn eintippt, muss
      // seine Zeile finden, sonst ist die Kennung dort wertlos.
      sql`${ereignis.zusammenhang}->>'digest' ilike ${muster}`,
    )
    if (oder) bedingungen.push(oder)
  }
  if (filter.stufe) bedingungen.push(eq(ereignis.stufe, filter.stufe))
  if (filter.tage && filter.tage > 0) {
    bedingungen.push(gte(ereignis.erstelltAm, new Date(Date.now() - filter.tage * 86_400_000)))
  }

  return bedingungen
}

/** Die Fehlerliste, jüngste zuerst. */
export async function ereignisse(
  filter: Suchfilter = {},
  hoechstens = 100,
  versatz = 0,
): Promise<Ereigniszeile[]> {
  const bedingungen = ereignisBedingungen(filter)

  const zeilen = await db
    .select()
    .from(ereignis)
    .where(bedingungen.length > 0 ? and(...bedingungen) : undefined)
    .orderBy(desc(ereignis.erstelltAm))
    .limit(hoechstens)
    .offset(versatz)

  return zeilen.map((z) => ({
    id: z.id,
    kennung: z.kennung,
    stufe: z.stufe,
    stelle: z.stelle,
    meldung: z.meldung,
    fehlerName: z.fehlerName,
    fehlerMeldung: z.fehlerMeldung,
    spur: z.spur,
    zusammenhang: (z.zusammenhang as Record<string, unknown> | null) ?? null,
    erstelltAm: z.erstelltAm.toISOString(),
  }))
}

/**
 * Wie viele Ereignisse der Filter trifft.
 *
 * Getrennt von der Liste, weil die bei `hoechstens` abschneidet — dieselbe
 * Begründung wie bei den Fällen und Stellungnahmen.
 */
export async function zaehleEreignisse(filter: Suchfilter = {}): Promise<number> {
  const bedingungen = ereignisBedingungen(filter)
  const zeilen = await db
    .select({ anzahl: sql<number>`count(*)`.mapWith(Number) })
    .from(ereignis)
    .where(bedingungen.length > 0 ? and(...bedingungen) : undefined)
  return zeilen[0]?.anzahl ?? 0
}
