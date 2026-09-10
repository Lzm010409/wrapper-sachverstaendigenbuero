import 'server-only'
import { and, desc, eq, isNotNull, or, sql } from 'drizzle-orm'
import { db } from '@/db'
import { bild, stellungnahme } from '@/db/schema'

/**
 * Die Bildbibliothek.
 *
 * Dieselbe Idee wie bei den Argumenten: was einmal gebraucht wurde, wird
 * beschriftet, mit Themen versehen und ist beim nächsten Mal wieder da.
 * Ein DAT-Auszug zur Beilackierung, das Vergleichsfoto zweier
 * Lackierbereiche, die Skizze zur Verbringung — alles Dinge, die man
 * einmal sauber aufbereitet und danach immer wieder braucht.
 *
 * Anders als bei den Argumenten gibt es hier keine Freigabestrecke. Ein
 * Bild behauptet nichts; es zeigt etwas. Die Verantwortung liegt bei dem,
 * der es in ein Schreiben setzt — und das ist ein Mensch.
 */

export interface Bibliotheksbild {
  id: string
  titel: string | null
  beschreibung: string | null
  themen: string[]
  dateiname: string
  mimetyp: string
  breitePx: number
  hoehePx: number
  bytes: number
  inBibliothek: boolean
  stellungnahmeId: string | null
  /** Betreff der Stellungnahme, aus der das Bild stammt. */
  herkunft: string | null
  erstelltAm: Date
}

const FELDER = {
  id: bild.id,
  titel: bild.titel,
  beschreibung: bild.beschreibung,
  themen: bild.themen,
  dateiname: bild.dateiname,
  mimetyp: bild.mimetyp,
  breitePx: bild.breitePx,
  hoehePx: bild.hoehePx,
  bytes: bild.bytes,
  inBibliothek: bild.inBibliothek,
  stellungnahmeId: bild.stellungnahmeId,
  herkunft: stellungnahme.betreff,
  erstelltAm: bild.erstelltAm,
}

/**
 * Sucht in der Bildbibliothek.
 *
 * Gesucht wird über Titel, Beschreibung, Dateiname **und** Themen — wer
 * „Beilackierung" eingibt, soll das Bild finden, egal ob das Wort im Titel
 * oder in den Schlagworten steht.
 */
/*
  `%` und `_` sind für ILIKE Jokerzeichen. Ungeprüft übernommen lieferte die
  Suche nach „%" die ganze Bibliothek — ein Ergebnis, das aussieht wie ein
  Fehler der Suche und keiner ist. Der Backslash ist in Postgres das
  Fluchtzeichen von LIKE und muss deshalb selbst mit.
*/
function musterFuerSuche(begriff: string): string {
  return `%${begriff.replace(/[\\%_]/g, (z) => `\\${z}`)}%`
}

/** Die Filterbedingungen der Bildsuche. Ausgelagert, damit Liste und Zählung dieselben nehmen. */
function bilderBedingungen(begriff: string, thema: string) {
  const gesucht = begriff.trim()
  const muster = musterFuerSuche(gesucht)

  const bedingungen = [eq(bild.inBibliothek, true)]
  if (gesucht) {
    bedingungen.push(
      or(
        sql`${bild.titel} ilike ${muster}`,
        sql`${bild.beschreibung} ilike ${muster}`,
        sql`${bild.dateiname} ilike ${muster}`,
        sql`exists (select 1 from unnest(${bild.themen}) t where t ilike ${muster})`,
      )!,
    )
  }
  if (thema.trim()) {
    bedingungen.push(sql`${bild.themen} @> array[${thema.trim()}]::text[]`)
  }
  return bedingungen
}

export async function sucheBilder(
  begriff = '',
  thema = '',
  hoechstens = 60,
  versatz = 0,
): Promise<Bibliotheksbild[]> {
  const bedingungen = bilderBedingungen(begriff, thema)

  return db
    .select(FELDER)
    .from(bild)
    .leftJoin(stellungnahme, eq(bild.stellungnahmeId, stellungnahme.id))
    .where(and(...bedingungen))
    .orderBy(desc(bild.erstelltAm))
    .limit(hoechstens)
    .offset(versatz)
}

/** Wie viele Bilder der Bibliothekssuche der Filter trifft. */
export async function zaehleBilder(begriff = '', thema = ''): Promise<number> {
  const bedingungen = bilderBedingungen(begriff, thema)
  const zeilen = await db
    .select({ anzahl: sql<number>`count(*)`.mapWith(Number) })
    .from(bild)
    .where(and(...bedingungen))
  return zeilen[0]?.anzahl ?? 0
}

/**
 * Bilder, die in einem Schreiben hochgeladen wurden und noch nicht in der
 * Bibliothek stehen.
 *
 * Der natürliche Weg, wie sich die Bibliothek füllt: nicht durch Vorratshaltung,
 * sondern aus der Arbeit heraus — genau wie bei den Argumenten (F9).
 */
export async function nochNichtUebernommen(
  hoechstens = 40,
  versatz = 0,
): Promise<Bibliotheksbild[]> {
  return db
    .select(FELDER)
    .from(bild)
    .leftJoin(stellungnahme, eq(bild.stellungnahmeId, stellungnahme.id))
    .where(and(eq(bild.inBibliothek, false), isNotNull(bild.stellungnahmeId)))
    .orderBy(desc(bild.erstelltAm))
    .limit(hoechstens)
    .offset(versatz)
}

/** Wie viele Bilder aus Schreiben noch nicht in die Bibliothek übernommen sind. */
export async function zaehleNochNichtUebernommen(): Promise<number> {
  const zeilen = await db
    .select({ anzahl: sql<number>`count(*)`.mapWith(Number) })
    .from(bild)
    .where(and(eq(bild.inBibliothek, false), isNotNull(bild.stellungnahmeId)))
  return zeilen[0]?.anzahl ?? 0
}

/**
 * Alle vergebenen Themen mit ihrer Häufigkeit — die Filterleiste.
 *
 * Mit dem laufenden Suchbegriff, sonst versprechen die Zahlen etwas
 * anderes, als die Wahl danach bringt: „Lackierung (12)" bei einer Suche,
 * nach der nur zwei Bilder übrig sind.
 */
export async function alleThemen(begriff = ''): Promise<{ thema: string; anzahl: number }[]> {
  const gesucht = begriff.trim()
  const muster = musterFuerSuche(gesucht)
  const suchbedingung = gesucht
    ? sql`and (${bild.titel} ilike ${muster} or ${bild.beschreibung} ilike ${muster}
              or ${bild.dateiname} ilike ${muster}
              or exists (select 1 from unnest(${bild.themen}) s where s ilike ${muster}))`
    : sql``

  const zeilen = await db.execute<{ thema: string; anzahl: string }>(sql`
    select t as thema, count(*)::text as anzahl
    from ${bild}, unnest(${bild.themen}) t
    where ${bild.inBibliothek} = true ${suchbedingung}
    group by t
    order by count(*) desc, t asc
    limit 60
  `)
  return [...zeilen].map((z) => ({ thema: z.thema, anzahl: Number(z.anzahl) }))
}

export async function ladeBibliotheksbild(id: string): Promise<Bibliotheksbild | null> {
  const [zeile] = await db
    .select(FELDER)
    .from(bild)
    .leftJoin(stellungnahme, eq(bild.stellungnahmeId, stellungnahme.id))
    .where(eq(bild.id, id))
    .limit(1)
  return zeile ?? null
}

/**
 * Zählt, in wie vielen Schreiben ein Bild vorkommt.
 *
 * Gesucht wird in den gespeicherten Dokumentbäumen. Ein Bild, das noch in
 * einem Schreiben steht, darf nicht verschwinden — sonst klafft dort eine
 * Lücke, die erst beim Erzeugen des Word-Dokuments auffällt.
 */
export async function wirdVerwendet(bildId: string): Promise<number> {
  const zeilen = await db.execute<{ anzahl: string }>(sql`
    select count(*)::text as anzahl
    from ${stellungnahme}
    where ${stellungnahme.dokument}::text like ${'%' + bildId + '%'}
  `)
  return Number([...zeilen][0]?.anzahl ?? 0)
}
