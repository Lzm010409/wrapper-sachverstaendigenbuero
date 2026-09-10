'use server'

import { revalidatePath } from 'next/cache'
import { eq, inArray } from 'drizzle-orm'
import { db } from '@/db'
import { beleg, eintrag, eintragPlatzhalter, eintragVorbedingung } from '@/db/schema'
import { verlangeBenutzer } from '@/auth/sitzung'
import { verlangeRecht } from '@/rechte/zugriff'
import { leiteAb, type Eintragstexte } from './ableitungen'
import { pruefeEingabe, type Eintragseingabe } from './eingabe'
import { naechsteNummer } from './nummer'
import { istDublette, sperreBereichZurNummernvergabe } from './sperre'

export interface AktionsErgebnis {
  fehler?: string
  erfolg?: string
}

/**
 * Legt einen neuen Bibliothekseintrag an.
 *
 * **Nur angemeldet, kein eigenes Recht.** Was hier entsteht, ist ein
 * Entwurf. Die Zusage nach draussen ist die Freigabe, und die bleibt an
 * `bibliothek.freigeben` gebunden (Konzept E5). Das Anlegen davor zu sperren
 * hiesse, denen die Arbeit zu verwehren, die die Bausteine täglich benutzen.
 */
export async function legeEintragAn(
  roheEingabe: Eintragseingabe,
): Promise<AktionsErgebnis & { id?: string }> {
  const benutzer = await verlangeBenutzer()

  const { fehler, sauber } = pruefeEingabe(roheEingabe)
  if (!sauber) return { fehler }

  try {
    const id = await db.transaction(async (tx) => {
      await sperreBereichZurNummernvergabe(tx, sauber.bereich)

      const bestand = await tx
        .select({ nummer: eintrag.nummer, abschnitt: eintrag.abschnitt })
        .from(eintrag)
        .where(eq(eintrag.bereich, sauber.bereich))

      const [angelegt] = await tx
        .insert(eintrag)
        .values({
          nummer: naechsteNummer(bestand, sauber.abschnitt),
          titel: sauber.titel,
          bereich: sauber.bereich,
          abschnitt: sauber.abschnitt,
          typischeBegruendung: sauber.typischeBegruendung,
          gegenargument: sauber.gegenargument,
          vorgehen: sauber.vorgehen,
          hinweise: sauber.hinweise,
          status: 'entwurf',
          herkunft: 'manuell',
          erstelltVon: benutzer.id,
        })
        .returning({ id: eintrag.id })

      const eintragId = angelegt!.id
      await gleicheAbleitungenAb(tx, eintragId, sauber)
      return eintragId
    })

    revalidatePath('/bibliothek')
    return { id, erfolg: 'Eintrag angelegt. Er steht auf „Entwurf".' }
  } catch (ausnahme) {
    // Der eindeutige Index über (Bereich, Nummer) ist die letzte Instanz.
    // Die Vergabe weicht vergebenen Nummern aus, aber verlassen wird sich
    // darauf nicht — eine rohe Datenbankmeldung im Formular hilft niemandem.
    if (istDublette(ausnahme)) {
      return {
        fehler:
          'Die vergebene Gliederungsnummer war einen Augenblick später schon belegt. ' +
          'Bitte noch einmal speichern.',
      }
    }
    throw ausnahme
  }
}

/**
 * Zieht Platzhalter und Fundstellen aus den Texten nach.
 *
 * Dieselbe Erkennung wie beim Einlesen der Referenzdateien — es soll nicht
 * am Weg in die Bibliothek hängen, ob `[Betrag]` später den Export sperrt.
 *
 * **Platzhalter** werden abgeglichen: Was nicht mehr im Text steht,
 * verschwindet, sonst führte die Randspalte ewig einen Wert, den niemand
 * mehr einsetzen kann. **Fundstellen** werden nur ergänzt, nie entfernt: Eine
 * bestätigte Fundstelle ist Handarbeit eines Menschen, und eine umformulierte
 * Zitierweise ist kein Grund, sie wegzuwerfen. Wegräumen lässt sie sich in
 * der Belegprüfung, mit einem Klick und mit Absicht.
 */
async function gleicheAbleitungenAb(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  eintragId: string,
  texte: Eintragstexte,
): Promise<void> {
  const abgeleitet = leiteAb(texte)

  const vorhandenePlatzhalter = await tx
    .select({ id: eintragPlatzhalter.id, schluessel: eintragPlatzhalter.schluessel })
    .from(eintragPlatzhalter)
    .where(eq(eintragPlatzhalter.eintragId, eintragId))

  const gewollt = new Set(abgeleitet.platzhalter.map((p) => p.schluessel))
  const ueberzaehlig = vorhandenePlatzhalter.filter((p) => !gewollt.has(p.schluessel))
  if (ueberzaehlig.length > 0) {
    await tx.delete(eintragPlatzhalter).where(
      inArray(
        eintragPlatzhalter.id,
        ueberzaehlig.map((p) => p.id),
      ),
    )
  }

  const bekannt = new Set(vorhandenePlatzhalter.map((p) => p.schluessel))
  const neuePlatzhalter = abgeleitet.platzhalter.filter((p) => !bekannt.has(p.schluessel))
  if (neuePlatzhalter.length > 0) {
    await tx.insert(eintragPlatzhalter).values(
      neuePlatzhalter.map((p) => ({
        eintragId,
        schluessel: p.schluessel,
        art: p.art,
        quelle: 'manuell' as const,
        pflicht: true,
      })),
    )
  }

  const vorhandeneBelege = await tx
    .select({ gericht: beleg.gericht, aktenzeichen: beleg.aktenzeichen })
    .from(beleg)
    .where(eq(beleg.eintragId, eintragId))

  const kennung = (b: { gericht: string | null; aktenzeichen: string | null }) =>
    `${b.gericht ?? ''}|${b.aktenzeichen ?? ''}`
  const schonDa = new Set(vorhandeneBelege.map(kennung))
  const neueBelege = abgeleitet.belege.filter((b) => !schonDa.has(kennung(b)))
  if (neueBelege.length > 0) {
    await tx.insert(beleg).values(
      neueBelege.map((b) => ({
        eintragId,
        typ: 'urteil' as const,
        gericht: b.gericht,
        aktenzeichen: b.aktenzeichen,
        // verifiziertAm bleibt leer — die Fundstelle will bestätigt werden,
        // bevor der Eintrag freigegeben werden kann (Konzept R1).
      })),
    )
  }
}

/**
 * Setzt einen Eintrag auf `freigegeben`.
 *
 * Diese Funktion ist die einzige Stelle, an der der Status `freigegeben`
 * gesetzt wird, und sie verlangt eine menschliche Rolle (Konzept E5).
 * Kein KI-Aufruf erreicht sie.
 */
export async function gebeFrei(id: string): Promise<AktionsErgebnis> {
  const benutzer = await verlangeRecht('bibliothek.freigeben')

  const zeilen = await db.select().from(eintrag).where(eq(eintrag.id, id)).limit(1)
  const treffer = zeilen[0]
  if (!treffer) return { fehler: 'Eintrag nicht gefunden.' }

  if (!treffer.gegenargument?.trim() && !treffer.vorgehen?.trim()) {
    return { fehler: 'Ohne Gegenargument oder Vorgehen lässt sich nichts freigeben.' }
  }

  const offeneBelege = await db
    .select({ id: beleg.id })
    .from(beleg)
    .where(eq(beleg.eintragId, id))

  const unbestaetigt = offeneBelege.length
    ? (await db.select().from(beleg).where(eq(beleg.eintragId, id))).filter(
        (b) => !b.verifiziertAm,
      ).length
    : 0

  if (unbestaetigt > 0) {
    return {
      fehler: `${unbestaetigt} Fundstelle${unbestaetigt === 1 ? '' : 'n'} noch nicht bestätigt. Bitte zuerst prüfen.`,
    }
  }

  await db
    .update(eintrag)
    .set({
      status: 'freigegeben',
      freigegebenVon: benutzer.id,
      freigegebenAm: new Date(),
      geaendertAm: new Date(),
    })
    .where(eq(eintrag.id, id))

  revalidatePath('/bibliothek')
  revalidatePath(`/bibliothek/${id}`)
  return { erfolg: 'Eintrag freigegeben.' }
}

/**
 * Alle Statuswechsel ausser der Freigabe selbst.
 *
 * Zwei Dinge standen hier schief:
 *
 * Erstens durfte jeder Angemeldete einen freigegebenen Eintrag auf
 * „Entwurf" zurücksetzen. Das ist der Weg an `gebeFrei` vorbei: Freigeben
 * verlangt die Rolle, Zurücknehmen verlangte nichts — und wer zurücknimmt,
 * entwertet die Prüfung eines anderen. Das Zurücknehmen einer Freigabe
 * verlangt jetzt dieselbe Rolle wie das Erteilen. Die Wege, die von einem
 * ungeprüften Eintrag ausgehen (Entwurf → Prüfung, Zurückziehen, zurück auf
 * Entwurf), stehen weiterhin jedem offen.
 *
 * Zweitens löschte jeder Wechsel `freigegebenVon` und `freigegebenAm` —
 * auch der von „Entwurf" nach „In Prüfung", wo gar keine Freigabe im Spiel
 * ist. Bei einem Eintrag, der schon einmal freigegeben und dann wegen einer
 * Textänderung auf Entwurf zurückgefallen war, verschwand damit beim
 * nächsten harmlosen Wechsel die Spur, wer ihn seinerzeit gesichtet hatte.
 * Gelöscht wird jetzt nur noch, was tatsächlich entwertet wird.
 */
export async function setzeStatus(
  id: string,
  status: 'entwurf' | 'pruefung' | 'zurueckgezogen',
): Promise<AktionsErgebnis> {
  const zeilen = await db
    .select({ status: eintrag.status })
    .from(eintrag)
    .where(eq(eintrag.id, id))
    .limit(1)
  const vorher = zeilen[0]
  if (!vorher) return { fehler: 'Eintrag nicht gefunden.' }

  const nimmtFreigabeZurueck = vorher.status === 'freigegeben'

  try {
    if (nimmtFreigabeZurueck) await verlangeRecht('bibliothek.freigeben')
    else await verlangeBenutzer()
  } catch {
    return {
      fehler: nimmtFreigabeZurueck
        ? 'Eine Freigabe zurücknehmen darf nur, wer die Rolle „Freigeber" oder „Administrator" hat.'
        : 'Dafür fehlt die Anmeldung.',
    }
  }

  if (vorher.status === status) {
    return { erfolg: 'Der Eintrag stand schon auf diesem Status.' }
  }

  await db
    .update(eintrag)
    .set({
      status,
      geaendertAm: new Date(),
      ...(nimmtFreigabeZurueck ? { freigegebenVon: null, freigegebenAm: null } : {}),
    })
    .where(eq(eintrag.id, id))

  revalidatePath('/bibliothek')
  revalidatePath(`/bibliothek/${id}`)
  return { erfolg: 'Status geändert.' }
}

/** Bestätigt eine Fundstelle als geprüft. Nur so wird sie exportierbar. */
export async function bestaetigeBeleg(belegId: string, eintragId: string): Promise<AktionsErgebnis> {
  const benutzer = await verlangeBenutzer()
  await db
    .update(beleg)
    .set({ verifiziertAm: new Date(), verifiziertVon: benutzer.id })
    .where(eq(beleg.id, belegId))
  revalidatePath(`/bibliothek/${eintragId}`)
  return { erfolg: 'Fundstelle bestätigt.' }
}

export async function verwerfeBeleg(belegId: string, eintragId: string): Promise<AktionsErgebnis> {
  await verlangeBenutzer()
  await db.delete(beleg).where(eq(beleg.id, belegId))
  revalidatePath(`/bibliothek/${eintragId}`)
  return { erfolg: 'Fundstelle entfernt.' }
}

/**
 * Entfernt einen Vorbedingungs-Kandidaten. Die Migration hat sie per
 * Stichwortsuche vorgeschlagen; was keine echte Vorbedingung ist, soll
 * verschwinden statt dauerhaft zu warnen.
 */
export async function verwerfeVorbedingung(
  vorbedingungId: string,
  eintragId: string,
): Promise<AktionsErgebnis> {
  await verlangeBenutzer()
  await db.delete(eintragVorbedingung).where(eq(eintragVorbedingung.id, vorbedingungId))
  revalidatePath(`/bibliothek/${eintragId}`)
  return { erfolg: 'Vorbedingung entfernt.' }
}

export async function speichereText(
  id: string,
  felder: { gegenargument?: string; vorgehen?: string; hinweise?: string; typischeBegruendung?: string },
): Promise<AktionsErgebnis> {
  await verlangeBenutzer()

  const zeilen = await db.select().from(eintrag).where(eq(eintrag.id, id)).limit(1)
  const vorher = zeilen[0]
  if (!vorher) return { fehler: 'Eintrag nicht gefunden.' }

  const texte: Eintragstexte = {
    typischeBegruendung: felder.typischeBegruendung?.trim() || null,
    gegenargument: felder.gegenargument?.trim() || null,
    vorgehen: felder.vorgehen?.trim() || null,
    hinweise: felder.hinweise?.trim() || null,
  }

  // Dieselbe Bedingung wie beim Anlegen und bei der Freigabe: ein Eintrag
  // ohne beides liefert nichts, was sich übernehmen liesse. Ohne diese
  // Prüfung liesse sich ein brauchbarer Eintrag hier leerräumen.
  if (!texte.gegenargument && !texte.vorgehen) {
    return {
      fehler:
        'Entweder ein Gegenargument oder ein Vorgehen muss stehen bleiben — sonst liefert ' +
        'der Eintrag nichts, was sich übernehmen liesse.',
    }
  }

  // Eine Textänderung entwertet eine frühere Freigabe: sie bezog sich auf
  // den alten Stand. Der Eintrag fällt deshalb zurück auf „Entwurf".
  const statusNeu = vorher.status === 'freigegeben' ? ('entwurf' as const) : vorher.status

  await db.transaction(async (tx) => {
    await tx
      .update(eintrag)
      .set({
        ...texte,
        status: statusNeu,
        version: vorher.version + 1,
        geaendertAm: new Date(),
        ...(statusNeu === 'entwurf' ? { freigegebenVon: null, freigegebenAm: null } : {}),
      })
      .where(eq(eintrag.id, id))

    // Der geänderte Text bringt neue Platzhalter mit und lässt alte fallen.
    // Bliebe das aus, führte die Randspalte einen Wert, den es im Text nicht
    // mehr gibt — und ein neu getipptes `[Betrag]` sperrte den Export nicht.
    await gleicheAbleitungenAb(tx, id, texte)
  })

  revalidatePath('/bibliothek')
  revalidatePath(`/bibliothek/${id}`)
  return {
    erfolg:
      vorher.status === 'freigegeben'
        ? 'Gespeichert. Der Eintrag steht wieder auf Entwurf, weil sich der Text geändert hat.'
        : 'Gespeichert.',
  }
}
