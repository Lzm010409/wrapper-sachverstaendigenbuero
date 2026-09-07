'use server'

import { revalidatePath } from 'next/cache'
import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { beleg, eintrag, eintragVorbedingung } from '@/db/schema'
import { verlangeBenutzer, verlangeFreigeber } from '@/auth/sitzung'

export interface AktionsErgebnis {
  fehler?: string
  erfolg?: string
}

/**
 * Setzt einen Eintrag auf `freigegeben`.
 *
 * Diese Funktion ist die einzige Stelle, an der der Status `freigegeben`
 * gesetzt wird, und sie verlangt eine menschliche Rolle (Konzept E5).
 * Kein KI-Aufruf erreicht sie.
 */
export async function gebeFrei(id: string): Promise<AktionsErgebnis> {
  const benutzer = await verlangeFreigeber()

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
    if (nimmtFreigabeZurueck) await verlangeFreigeber()
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

  // Eine Textänderung entwertet eine frühere Freigabe: sie bezog sich auf
  // den alten Stand. Der Eintrag fällt deshalb zurück auf „Entwurf".
  const statusNeu = vorher.status === 'freigegeben' ? ('entwurf' as const) : vorher.status

  await db
    .update(eintrag)
    .set({
      gegenargument: felder.gegenargument?.trim() || null,
      vorgehen: felder.vorgehen?.trim() || null,
      hinweise: felder.hinweise?.trim() || null,
      typischeBegruendung: felder.typischeBegruendung?.trim() || null,
      status: statusNeu,
      version: vorher.version + 1,
      geaendertAm: new Date(),
      ...(statusNeu === 'entwurf' ? { freigegebenVon: null, freigegebenAm: null } : {}),
    })
    .where(eq(eintrag.id, id))

  revalidatePath('/bibliothek')
  revalidatePath(`/bibliothek/${id}`)
  return {
    erfolg:
      vorher.status === 'freigegeben'
        ? 'Gespeichert. Der Eintrag steht wieder auf Entwurf, weil sich der Text geändert hat.'
        : 'Gespeichert.',
  }
}
