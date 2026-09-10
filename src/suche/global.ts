import 'server-only'
import { and, desc, eq, ilike, or, sql, type SQL } from 'drizzle-orm'
import { db } from '@/db'
import { bild, eintrag, fall, stellungnahme } from '@/db/schema'
import { MINDESTLAENGE, type Suchergebnis, type Treffer, type Trefferart } from './typen'

/**
 * Die Suche über alles.
 *
 * **Wofür sie da ist.** Man weiss, wonach man sucht, aber nicht, wo es
 * liegt: „Krilavicius" kann ein Fall sein, ein Schreiben oder ein Bild aus
 * einem Schreiben. Ohne diese Suche geht man drei Listen durch und filtert
 * dreimal dasselbe.
 *
 * **Was sie durchsucht: Bezeichner und Falldaten.** Aktenzeichen,
 * Anspruchsteller, Kennzeichen, Fahrgestellnummer, Fahrzeug, Betreff,
 * Eintragstitel und Bildtitel. Nicht den Fliesstext der Textbausteine und
 * nicht die Kürzungspositionen — dafür bräuchte es einen Volltextindex, und
 * eine Suche, die bei jeder Eingabe drei Tabellen quer liest, wird langsam,
 * bevor sie nützlich wird.
 *
 * **Jede Art hat ihre eigene Obergrenze.** Ein Begriff, der in fünfzig
 * Fällen vorkommt, darf die Bibliothekstreffer nicht aus der Liste drängen —
 * sonst sieht man nur noch die häufigste Art.
 */

/** Je Art höchstens so viele. */
const JE_ART = 5

/** Eine mehr holen, als gezeigt wird — daran hängt „und weitere". */
const GRENZE = JE_ART + 1

export async function sucheUeberall(roh: string): Promise<Suchergebnis> {
  const begriff = roh.trim()
  if (begriff.length < MINDESTLAENGE) return { begriff, treffer: [], mehr: false }

  const muster = `%${begriff}%`
  // Dieselbe Regel wie in der Fallliste: ein Kennzeichen wird mal mit, mal
  // ohne Trennzeichen getippt.
  const ohneTrenner = `%${begriff.replace(/[\s-]/g, '')}%`

  const gruppen = await Promise.all([
    sucheFaelle(muster, ohneTrenner),
    sucheStellungnahmen(muster),
    sucheEintraege(muster),
    sucheBilder(muster),
  ])

  return {
    begriff,
    treffer: gruppen.flatMap((g) => g.slice(0, JE_ART)),
    mehr: gruppen.some((g) => g.length > JE_ART),
  }
}

async function sucheFaelle(muster: string, ohneTrenner: string): Promise<Treffer[]> {
  const wo: SQL[] = []
  const oder = or(
    ilike(fall.aktenzeichen, muster),
    sql`${fall.daten}->'car'->>'vin' ilike ${muster}`,
    sql`replace(replace(coalesce(${fall.daten}->'car'->>'license_plate', ''), '-', ''), ' ', '') ilike ${ohneTrenner}`,
    sql`concat_ws(' ',
      ${fall.daten}->'car'->>'make',
      ${fall.daten}->'car'->>'model',
      ${fall.daten}->'claimant'->>'organization_name',
      ${fall.daten}->'claimant'->>'first_name',
      ${fall.daten}->'claimant'->>'last_name'
    ) ilike ${muster}`,
  )
  if (oder) wo.push(oder)

  const zeilen = await db
    .select({
      id: fall.id,
      aktenzeichen: fall.aktenzeichen,
      name: sql<string | null>`concat_ws(' ',
        ${fall.daten}->'claimant'->>'organization_name',
        ${fall.daten}->'claimant'->>'first_name',
        ${fall.daten}->'claimant'->>'last_name')`,
      kennzeichen: sql<string | null>`${fall.daten}->'car'->>'license_plate'`,
      fahrzeug: sql<string | null>`concat_ws(' ',
        ${fall.daten}->'car'->>'make', ${fall.daten}->'car'->>'model')`,
    })
    .from(fall)
    .where(and(...wo))
    .orderBy(desc(fall.abgerufenAm))
    .limit(GRENZE)

  return zeilen.map((z) => ({
    art: 'fall' as const,
    id: z.id,
    titel: z.name?.trim() || z.aktenzeichen || 'Fall ohne Bezeichnung',
    unterzeile:
      [z.aktenzeichen, z.kennzeichen, z.fahrzeug?.trim()].filter(Boolean).join(' · ') || null,
    pfad: `/faelle/${z.id}`,
  }))
}

async function sucheStellungnahmen(muster: string): Promise<Treffer[]> {
  const zeilen = await db
    .select({
      id: stellungnahme.id,
      betreff: stellungnahme.betreff,
      empfaenger: stellungnahme.empfaengerName,
      aktenzeichen: fall.aktenzeichen,
    })
    .from(stellungnahme)
    .leftJoin(fall, eq(stellungnahme.fallId, fall.id))
    .where(
      or(
        ilike(stellungnahme.betreff, muster),
        ilike(stellungnahme.empfaengerName, muster),
        ilike(fall.aktenzeichen, muster),
      ),
    )
    .orderBy(desc(stellungnahme.erstelltAm))
    .limit(GRENZE)

  return zeilen.map((z) => ({
    art: 'stellungnahme' as const,
    id: z.id,
    titel: z.betreff?.trim() || 'Ohne Betreff',
    unterzeile: [z.aktenzeichen, z.empfaenger].filter(Boolean).join(' · ') || null,
    pfad: `/stellungnahmen/${z.id}`,
  }))
}

async function sucheEintraege(muster: string): Promise<Treffer[]> {
  const zeilen = await db
    .select({
      id: eintrag.id,
      nummer: eintrag.nummer,
      titel: eintrag.titel,
      bereich: eintrag.bereich,
      abschnitt: eintrag.abschnitt,
    })
    .from(eintrag)
    .where(or(ilike(eintrag.titel, muster), ilike(eintrag.nummer, muster)))
    .orderBy(eintrag.nummer)
    .limit(GRENZE)

  return zeilen.map((z) => ({
    art: 'eintrag' as const,
    id: z.id,
    titel: z.titel,
    unterzeile: [z.nummer, z.bereich, z.abschnitt].filter(Boolean).join(' · ') || null,
    pfad: `/bibliothek/${z.id}`,
  }))
}

async function sucheBilder(muster: string): Promise<Treffer[]> {
  const zeilen = await db
    .select({ id: bild.id, titel: bild.titel, dateiname: bild.dateiname })
    .from(bild)
    .where(or(ilike(bild.titel, muster), ilike(bild.dateiname, muster)))
    .orderBy(desc(bild.erstelltAm))
    .limit(GRENZE)

  return zeilen.map((z) => ({
    art: 'bild' as const,
    id: z.id,
    titel: z.titel?.trim() || z.dateiname,
    unterzeile: z.titel?.trim() ? z.dateiname : null,
    pfad: `/bilder?suche=${encodeURIComponent(z.titel?.trim() || z.dateiname)}`,
  }))
}

// Weitergereicht, damit `@/suche/global` weiterhin die eine Anlaufstelle des
// Servers bleibt. Der Browser importiert stattdessen `./typen`.
export { MINDESTLAENGE, type Suchergebnis, type Treffer, type Trefferart } from './typen'
