import { createHash } from 'node:crypto'
import { eq, and } from 'drizzle-orm'
import type { db as DbTyp } from '@/db'
import {
  beleg,
  eintrag,
  eintragErgaenzung,
  eintragPlatzhalter,
  eintragVariante,
  eintragVorbedingung,
} from '@/db/schema'
import type { GeparsterEintrag } from './parser'

export interface SchreibErgebnis {
  neu: number
  ersetzt: number
  unveraendert: number
  /** Von Hand angelegte Einträge, die der Import stehen gelassen hat. */
  geschuetzt: string[]
}

export type Bestandsentscheidung = 'neu' | 'ersetzt' | 'unveraendert' | 'geschuetzt'

/**
 * Was mit einem Eintrag geschieht, den der Import unter derselben Nummer
 * vorfindet.
 *
 * **Der geschützte Fall.** Seit Einträge auch von Hand angelegt werden
 * können, ist die Nummer nicht mehr allein Sache der Referenzdateien: Die
 * Vergabe nimmt die nächste freie, und dieselbe Nummer kann später in einer
 * Referenzdatei auftauchen. Ohne diese Unterscheidung hätte der nächste
 * Importlauf den handgeschriebenen Eintrag samt Varianten, Platzhaltern und
 * bestätigten Fundstellen gelöscht und durch den Dateiinhalt ersetzt — ohne
 * Rückfrage und ohne Spur. Der Import ist die Quelle für das, was er selbst
 * angelegt hat, und für nichts sonst.
 */
export function entscheideUeberEintrag(
  vorhanden: { abdruck: string | null; herkunft: string } | undefined,
  neuerAbdruck: string,
): Bestandsentscheidung {
  if (!vorhanden) return 'neu'
  if (vorhanden.herkunft !== 'migration') return 'geschuetzt'
  return vorhanden.abdruck === neuerAbdruck ? 'unveraendert' : 'ersetzt'
}

/**
 * Der Fingerabdruck eines geparsten Eintrags.
 *
 * Bewusst über die Felder und nicht über den Rohtext der Datei: Was zählt,
 * ist der Inhalt, der in der Datenbank landet. Eine umformulierte Überschrift
 * der Sektion oder eine verschobene Leerzeile ändern ihn nicht — ein
 * geänderter Gegenargument-Satz sehr wohl. Die Reihenfolge der Unterlisten
 * geht mit ein, weil sie im Dokument sichtbar wird.
 */
export function fingerabdruck(e: GeparsterEintrag): string {
  const inhalt = JSON.stringify([
    e.titel,
    e.abschnitt,
    e.typischeBegruendung,
    e.gegenargument,
    e.vorgehen,
    e.hinweise,
    e.haeufigkeitText,
    e.quelldatei,
    e.varianten.map((v) => [v.bezeichnung, v.text]),
    e.ergaenzungen.map((x) => [x.titel, x.text]),
    e.platzhalter.map((p) => [p.schluessel, p.art]),
    e.vorbedingungsKandidaten,
    e.belege.map((b) => [b.gericht, b.aktenzeichen]),
  ])
  return createHash('sha256').update(inhalt).digest('hex')
}

/**
 * Schreibt geparste Einträge in die Datenbank.
 *
 * Ein Eintrag wird über (Bereich, Nummer) identifiziert. Hat sich sein Inhalt
 * geändert, werden er und seine Unterdatensätze ersetzt — der Einlesevorgang
 * ist damit wiederholbar, ohne Dubletten zu erzeugen. Ein bereits
 * freigegebener Eintrag behält seinen Status dann nicht: er fällt zurück auf
 * `entwurf`, weil sich sein Text geändert hat und die Freigabe sich auf den
 * alten Stand bezog.
 *
 * Hat sich **nichts** geändert, wird der Eintrag nicht angefasst. Das ist
 * kein Feinschliff, sondern der Unterschied zwischen einem benutzbaren und
 * einem gefürchteten Einlesevorgang: vorher kostete ein einziger neuer
 * Baustein die Freigabe der gesamten Bibliothek, weil alle anderen Einträge
 * gelöscht und neu angelegt wurden. Wer die Bibliothek erweitern will, soll
 * das tun können, ohne den Bestand zu entwerten.
 */
export async function schreibeEintraege(
  db: typeof DbTyp,
  eintraege: GeparsterEintrag[],
): Promise<SchreibErgebnis> {
  let neu = 0
  let ersetzt = 0
  let unveraendert = 0
  const geschuetzt: string[] = []

  for (const e of eintraege) {
    const abdruck = fingerabdruck(e)

    await db.transaction(async (tx) => {
      const vorhanden = await tx
        .select({
          id: eintrag.id,
          abdruck: eintrag.inhaltsfingerabdruck,
          herkunft: eintrag.herkunft,
        })
        .from(eintrag)
        .where(and(eq(eintrag.bereich, e.bereich), eq(eintrag.nummer, e.nummer)))
        .limit(1)

      const entscheidung = entscheideUeberEintrag(vorhanden[0], abdruck)

      if (entscheidung === 'unveraendert') {
        unveraendert++
        return
      }

      if (entscheidung === 'geschuetzt') {
        geschuetzt.push(`${e.bereich} ${e.nummer} — ${e.titel}`)
        return
      }

      const bestehendeId = vorhanden[0]?.id
      if (entscheidung === 'ersetzt' && bestehendeId) {
        // Unterdatensätze hängen per ON DELETE CASCADE am Eintrag.
        await tx.delete(eintrag).where(eq(eintrag.id, bestehendeId))
        ersetzt++
      } else {
        neu++
      }

      const [angelegt] = await tx
        .insert(eintrag)
        .values({
          nummer: e.nummer,
          titel: e.titel,
          bereich: e.bereich,
          abschnitt: e.abschnitt,
          typischeBegruendung: e.typischeBegruendung,
          gegenargument: e.gegenargument || null,
          vorgehen: e.vorgehen,
          hinweise: e.hinweise,
          haeufigkeitText: e.haeufigkeitText,
          status: 'entwurf',
          herkunft: 'migration',
          quelldatei: e.quelldatei,
          inhaltsfingerabdruck: abdruck,
        })
        .returning({ id: eintrag.id })

      const eintragId = angelegt!.id

      if (e.varianten.length > 0) {
        await tx.insert(eintragVariante).values(
          e.varianten.map((v, i) => ({
            eintragId,
            bezeichnung: v.bezeichnung || `Variante ${i + 1}`,
            text: v.text,
            reihenfolge: i,
          })),
        )
      }

      if (e.ergaenzungen.length > 0) {
        await tx.insert(eintragErgaenzung).values(
          e.ergaenzungen.map((x, i) => ({
            eintragId,
            titel: x.titel,
            text: x.text,
            reihenfolge: i,
          })),
        )
      }

      if (e.platzhalter.length > 0) {
        await tx.insert(eintragPlatzhalter).values(
          e.platzhalter.map((p) => ({
            eintragId,
            schluessel: p.schluessel,
            art: p.art,
            quelle: 'manuell' as const,
            pflicht: true,
          })),
        )
      }

      if (e.vorbedingungsKandidaten.length > 0) {
        await tx.insert(eintragVorbedingung).values(
          e.vorbedingungsKandidaten.map((text) => ({
            eintragId,
            text,
            mussBestaetigtWerden: true,
          })),
        )
      }

      if (e.belege.length > 0) {
        await tx.insert(beleg).values(
          e.belege.map((b) => ({
            eintragId,
            typ: 'urteil' as const,
            gericht: b.gericht,
            aktenzeichen: b.aktenzeichen,
            // verifiziertAm bleibt leer — der Export ist bis zur Bestätigung
            // gesperrt (Konzept R1).
          })),
        )
      }
    })
  }

  return { neu, ersetzt, unveraendert, geschuetzt }
}
