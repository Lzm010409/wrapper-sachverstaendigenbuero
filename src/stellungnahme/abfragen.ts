import 'server-only'
import { and, asc, desc, eq, inArray, ne, or, ilike, sql } from 'drizzle-orm'
import { db } from '@/db'
import {
  eintrag,
  eintragVariante,
  fall,
  position,
  positionBaustein,
  stellungnahme,
} from '@/db/schema'
import type { Bibliothekseintrag } from './treffer'

/**
 * Lädt die für die Auswahlmaske verwendbaren Bibliothekseinträge.
 *
 * Zurückgezogene Einträge bleiben aussen vor; Entwürfe kommen mit, weil sie
 * sich einfügen lassen — sie sperren dann aber den Export.
 */
export async function ladeVerwendbareEintraege(): Promise<Bibliothekseintrag[]> {
  const zeilen = await db
    .select({
      id: eintrag.id,
      nummer: eintrag.nummer,
      titel: eintrag.titel,
      bereich: eintrag.bereich,
      abschnitt: eintrag.abschnitt,
      typischeBegruendung: eintrag.typischeBegruendung,
      gegenargument: eintrag.gegenargument,
      vorgehen: eintrag.vorgehen,
      status: eintrag.status,
      haeufigkeitText: eintrag.haeufigkeitText,
    })
    .from(eintrag)
    .where(ne(eintrag.status, 'zurueckgezogen'))
    .orderBy(asc(eintrag.bereich), asc(eintrag.nummer))

  if (zeilen.length === 0) return []

  const varianten = await db
    .select()
    .from(eintragVariante)
    .where(
      inArray(
        eintragVariante.eintragId,
        zeilen.map((z) => z.id),
      ),
    )
    .orderBy(asc(eintragVariante.reihenfolge))

  const jeEintrag = new Map<string, { id: string; bezeichnung: string; text: string }[]>()
  for (const v of varianten) {
    const liste = jeEintrag.get(v.eintragId) ?? []
    liste.push({ id: v.id, bezeichnung: v.bezeichnung, text: v.text })
    jeEintrag.set(v.eintragId, liste)
  }

  return zeilen.map((z) => ({ ...z, varianten: jeEintrag.get(z.id) ?? [] }))
}

/**
 * Volltextsuche über die gesamte Bibliothek, quer zu Bereich und Abschnitt.
 *
 * Das ist der zweite der drei Wege aus Konzept E6 und steht an jeder
 * Position dauerhaft offen — auch wenn die Vorschläge einen direkten
 * Treffer melden.
 */
export async function sucheInBibliothek(begriff: string, hoechstens = 30) {
  const gesucht = begriff.trim()
  if (!gesucht) return []

  const muster = `%${gesucht}%`
  return db
    .select({
      id: eintrag.id,
      nummer: eintrag.nummer,
      titel: eintrag.titel,
      bereich: eintrag.bereich,
      abschnitt: eintrag.abschnitt,
      status: eintrag.status,
      gegenargument: eintrag.gegenargument,
      vorgehen: eintrag.vorgehen,
    })
    .from(eintrag)
    .where(
      and(
        ne(eintrag.status, 'zurueckgezogen'),
        or(
          ilike(eintrag.titel, muster),
          ilike(eintrag.nummer, muster),
          ilike(eintrag.abschnitt, muster),
          ilike(eintrag.gegenargument, muster),
          ilike(eintrag.typischeBegruendung, muster),
          sql`exists (
            select 1 from ${eintragVariante} v
            where v.eintrag_id = ${sql.identifier('eintrag')}.${sql.identifier('id')}
              and (v.bezeichnung ilike ${muster} or v.text ilike ${muster})
          )`,
        ),
      ),
    )
    .orderBy(asc(eintrag.bereich), asc(eintrag.nummer))
    .limit(hoechstens)
}

export async function ladeStellungnahmen() {
  return db
    .select({
      id: stellungnahme.id,
      betreff: stellungnahme.betreff,
      modus: stellungnahme.modus,
      erstelltAm: stellungnahme.erstelltAm,
      versendetAm: stellungnahme.versendetAm,
      auswertungsstand: stellungnahme.auswertungsstand,
      auswertungsschritt: stellungnahme.auswertungsschritt,
      auswertungsProzent: stellungnahme.auswertungsProzent,
      pruefberichtDateiname: stellungnahme.pruefberichtDateiname,
      fallAktenzeichen: fall.aktenzeichen,
      positionen: sql<number>`(
        select count(*) from ${position} p
        where p.stellungnahme_id = ${sql.identifier('stellungnahme')}.${sql.identifier('id')}
      )`.mapWith(Number),
    })
    .from(stellungnahme)
    .leftJoin(fall, eq(stellungnahme.fallId, fall.id))
    .orderBy(desc(stellungnahme.erstelltAm))
    .limit(100)
}

/**
 * Die Schreiben zu einem Fall.
 *
 * Der Weg führte bisher nur in eine Richtung: von der Stellungnahme zum
 * Fall. Wer einen Fall aufschlug, sah nicht, ob dazu schon geschrieben
 * wurde — und legte im Zweifel ein zweites Schreiben an.
 */
export async function ladeStellungnahmenZumFall(fallId: string) {
  return db
    .select({
      id: stellungnahme.id,
      betreff: stellungnahme.betreff,
      modus: stellungnahme.modus,
      erstelltAm: stellungnahme.erstelltAm,
      versendetAm: stellungnahme.versendetAm,
      positionen: sql<number>`(
        select count(*) from ${position} p
        where p.stellungnahme_id = ${sql.identifier('stellungnahme')}.${sql.identifier('id')}
      )`.mapWith(Number),
    })
    .from(stellungnahme)
    .where(eq(stellungnahme.fallId, fallId))
    .orderBy(desc(stellungnahme.erstelltAm))
}

/** Lädt eine Stellungnahme mit Positionen und deren Bausteinen. */
export async function ladeStellungnahme(id: string) {
  const zeilen = await db.select().from(stellungnahme).where(eq(stellungnahme.id, id)).limit(1)
  const kopf = zeilen[0]
  if (!kopf) return null

  const positionen = await db
    .select()
    .from(position)
    .where(eq(position.stellungnahmeId, id))
    .orderBy(asc(position.reihenfolge))

  const bausteine = positionen.length
    ? await db
        .select()
        .from(positionBaustein)
        .where(
          inArray(
            positionBaustein.positionId,
            positionen.map((p) => p.id),
          ),
        )
        .orderBy(asc(positionBaustein.reihenfolge))
    : []

  const fallDaten = kopf.fallId
    ? (await db.select().from(fall).where(eq(fall.id, kopf.fallId)).limit(1))[0]
    : null

  return {
    ...kopf,
    fall: fallDaten ?? null,
    positionen: positionen.map((p) => ({
      ...p,
      bausteine: bausteine.filter((b) => b.positionId === p.id),
    })),
  }
}

export type GeladeneStellungnahme = NonNullable<Awaited<ReturnType<typeof ladeStellungnahme>>>
