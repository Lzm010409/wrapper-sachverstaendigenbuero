import 'server-only'
import { and, asc, count, eq, ilike, or, sql, type SQL } from 'drizzle-orm'
import { db } from '@/db'
import {
  beleg,
  eintrag,
  eintragErgaenzung,
  eintragPlatzhalter,
  eintragVariante,
  eintragVorbedingung,
} from '@/db/schema'

/**
 * Qualifizierter Verweis auf die Zeile der äußeren Abfrage.
 *
 * In rohem SQL rendert Drizzle eine Spaltenreferenz wie `eintrag.id` als
 * unqualifiziertes `"id"`. In einer korrelierten Unterabfrage trifft das auf
 * die gleichnamige Spalte der Untertabelle: die Bedingung ist dann nie
 * erfüllt und liefert still 0, ohne dass ein Fehler entstünde. Deshalb wird
 * der Bezug hier ausdrücklich mit dem Tabellennamen qualifiziert.
 */
const EINTRAG_ID = sql`${sql.identifier('eintrag')}.${sql.identifier('id')}`

export type Bereich = 'kalkulation' | 'wertminderung' | 'wbw' | 'restwert' | 'sonderfall'
export type EintragStatus = 'entwurf' | 'pruefung' | 'freigegeben' | 'zurueckgezogen'

export interface Suchfilter {
  suche?: string
  bereich?: Bereich
  status?: EintragStatus
  abschnitt?: string
}

/**
 * Volltextsuche über die Bibliothek.
 *
 * Bewusst über `ILIKE` statt über einen Vektorindex: bei 68 Einträgen ist das
 * augenblicklich schnell, braucht keinen externen Einbettungsdienst und
 * liefert vorhersagbare Treffer. Die semantische Suche kommt dazu, wenn die
 * Bibliothek dafür groß genug ist — das Feld dafür ist im Schema angelegt.
 */
/**
 * Macht aus einem eingetippten Begriff ein ILIKE-Muster.
 *
 * `%` und `_` sind für ILIKE Jokerzeichen. Ungeprüft übernommen hiess das:
 * die Suche nach „%" lieferte die ganze Bibliothek, „Aufschlag_neu" fand
 * „Aufschlag neu". Beides sieht nicht nach einem Fehler aus, sondern nach
 * einem unverständlichen Ergebnis — und „30 %" ist ein Begriff, nach dem in
 * dieser Bibliothek durchaus jemand sucht. Der Backslash ist in Postgres das
 * vorgegebene Fluchtzeichen von LIKE; er muss deshalb selbst mit.
 */
function musterFuerSuche(begriff: string): string {
  return `%${begriff.replace(/[\\%_]/g, (z) => `\\${z}`)}%`
}

/**
 * Die Bedingung „irgendwo in diesem Eintrag steht der Begriff".
 *
 * Ausgelagert, weil `ladeAbschnitte` dieselbe Bedingung braucht: sonst
 * versprechen die Zahlen in den Abschnitts-Optionen etwas anderes, als die
 * Liste danach zeigt.
 */
function volltextBedingung(begriff: string): SQL | undefined {
  const muster = musterFuerSuche(begriff)
  return or(
    ilike(eintrag.titel, muster),
    ilike(eintrag.nummer, muster),
    ilike(eintrag.gegenargument, muster),
    ilike(eintrag.typischeBegruendung, muster),
    ilike(eintrag.vorgehen, muster),
    ilike(eintrag.abschnitt, muster),
    // Die Hinweise gehörten von Anfang an dazu — dort steht, worauf im
    // Einzelfall zu achten ist („Farbmessprotokoll anfordern"). Wer sich
    // daran erinnert, fand den Eintrag bisher nicht.
    ilike(eintrag.hinweise, muster),
    // Auch Varianten durchsuchen — dort stecken die Bauteilbezeichnungen,
    // nach denen man am ehesten sucht.
    sql`exists (
      select 1 from ${eintragVariante} v
      where v.eintrag_id = ${EINTRAG_ID}
        and (v.bezeichnung ilike ${muster} or v.text ilike ${muster})
    )`,
    // Und die Fundstellen: „LG Musterstadt" oder ein Aktenzeichen ist oft
    // das Einzige, was vom Argument im Gedächtnis geblieben ist.
    sql`exists (
      select 1 from ${beleg} b
      where b.eintrag_id = ${EINTRAG_ID}
        and (b.gericht ilike ${muster} or b.aktenzeichen ilike ${muster}
             or b.fundstelle ilike ${muster} or b.kernaussage ilike ${muster})
    )`,
  )
}

/** Die Filterbedingungen ohne den Abschnitt — den setzt der Aufrufer dazu. */
function grundbedingungen(filter: Suchfilter): SQL[] {
  const bedingungen: SQL[] = []
  if (filter.bereich) bedingungen.push(eq(eintrag.bereich, filter.bereich))
  if (filter.status) bedingungen.push(eq(eintrag.status, filter.status))

  const suche = filter.suche?.trim()
  if (suche) {
    const treffer = volltextBedingung(suche)
    if (treffer) bedingungen.push(treffer)
  }
  return bedingungen
}

export async function sucheEintraege(filter: Suchfilter) {
  const bedingungen = grundbedingungen(filter)
  if (filter.abschnitt) bedingungen.push(eq(eintrag.abschnitt, filter.abschnitt))

  const wo = bedingungen.length > 0 ? and(...bedingungen) : undefined

  const zeilen = await db
    .select({
      id: eintrag.id,
      nummer: eintrag.nummer,
      titel: eintrag.titel,
      bereich: eintrag.bereich,
      abschnitt: eintrag.abschnitt,
      status: eintrag.status,
      typischeBegruendung: eintrag.typischeBegruendung,
      gegenargument: eintrag.gegenargument,
      vorgehen: eintrag.vorgehen,
      haeufigkeitText: eintrag.haeufigkeitText,
      platzhalterOffen: sql<number>`(
        select count(*) from ${eintragPlatzhalter} p where p.eintrag_id = ${EINTRAG_ID}
      )`.mapWith(Number),
      belegeUnverifiziert: sql<number>`(
        select count(*) from ${beleg} b
        where b.eintrag_id = ${EINTRAG_ID} and b.verifiziert_am is null
      )`.mapWith(Number),
      vorbedingungen: sql<number>`(
        select count(*) from ${eintragVorbedingung} v where v.eintrag_id = ${EINTRAG_ID}
      )`.mapWith(Number),
    })
    .from(eintrag)
    .where(wo)
    .orderBy(asc(eintrag.bereich), asc(sortierSchluessel()))

  return zeilen
}

/**
 * Sortiert Gliederungsnummern natürlich: „1.2" vor „1.10", „11.1" nach „2.1".
 * Ohne diese Umformung würde alphabetisch sortiert und die Bibliothek läge
 * in einer Reihenfolge, die niemand erwartet.
 */
function sortierSchluessel(): SQL {
  return sql`(
    select string_agg(lpad(teil, 4, '0'), '.' order by ordnung)
    from unnest(string_to_array(regexp_replace(${eintrag.nummer}, '^[A-Z]\\.', ''), '.'))
      with ordinality as t(teil, ordnung)
  )`
}

/**
 * Die Abschnitte für das Auswahlfeld, mit der Zahl der Einträge dahinter.
 *
 * Die Zahl zählte früher nur über den Bereich. Standen daneben eine Suche
 * oder ein Status, versprach die Option „(18)" und die Liste zeigte danach
 * 16 — bei einer Suche auch schon mal 1. Eine Zahl, die nicht sagt, was die
 * Wahl bringt, ist schlimmer als gar keine; deshalb bekommt die Abfrage
 * jetzt denselben Filter wie die Liste, nur ohne den Abschnitt selbst.
 */
export async function ladeAbschnitte(filter: Suchfilter = {}) {
  const bedingungen = grundbedingungen(filter)
  const zeilen = await db
    .select({ abschnitt: eintrag.abschnitt, anzahl: count() })
    .from(eintrag)
    .where(bedingungen.length > 0 ? and(...bedingungen) : undefined)
    .groupBy(eintrag.abschnitt)
    .orderBy(asc(eintrag.abschnitt))
  return zeilen
}

export async function zaehleNachStatus() {
  const zeilen = await db
    .select({ status: eintrag.status, anzahl: count() })
    .from(eintrag)
    .groupBy(eintrag.status)
  return Object.fromEntries(zeilen.map((z) => [z.status, z.anzahl])) as Record<
    EintragStatus,
    number | undefined
  >
}

/** Lädt einen Eintrag mit allen Unterdatensätzen. */
export async function ladeEintrag(id: string) {
  const zeilen = await db.select().from(eintrag).where(eq(eintrag.id, id)).limit(1)
  const treffer = zeilen[0]
  if (!treffer) return null

  const [varianten, ergaenzungen, platzhalter, vorbedingungen, belege] = await Promise.all([
    db
      .select()
      .from(eintragVariante)
      .where(eq(eintragVariante.eintragId, id))
      .orderBy(asc(eintragVariante.reihenfolge)),
    db
      .select()
      .from(eintragErgaenzung)
      .where(eq(eintragErgaenzung.eintragId, id))
      .orderBy(asc(eintragErgaenzung.reihenfolge)),
    db
      .select()
      .from(eintragPlatzhalter)
      .where(eq(eintragPlatzhalter.eintragId, id))
      .orderBy(asc(eintragPlatzhalter.schluessel)),
    db.select().from(eintragVorbedingung).where(eq(eintragVorbedingung.eintragId, id)),
    db.select().from(beleg).where(eq(beleg.eintragId, id)),
  ])

  return { ...treffer, varianten, ergaenzungen, platzhalter, vorbedingungen, belege }
}

export type EintragMitDetails = NonNullable<Awaited<ReturnType<typeof ladeEintrag>>>
export type EintragListe = Awaited<ReturnType<typeof sucheEintraege>>
