import 'server-only'
import { inArray, sql } from 'drizzle-orm'
import { db } from '@/db'
import { rechnung } from '@/db/schema'
import { holeRechnungen, sevdeskEingerichtet, type Rechnungsdaten } from './client'
import type { Rechnungszeile } from '@/geld/ampel'
import { protokolliereWarnung } from '@/protokoll'

/**
 * Der Abgleich zwischen sevDesk und dem Spiegel in der Datenbank.
 *
 * **Wie oft.** Bei jedem Blick in die Fallliste — aber höchstens einmal je
 * Minute. Der Abgleich ist nach dem ersten Lauf billig (eine Anfrage, eine
 * Handvoll Zeilen); die Sperre verhindert nur, dass zehn gleichzeitig
 * geöffnete Reiter zehn Anfragen auslösen.
 *
 * **Was ein Fehler bedeutet.** Nichts, ausser dass der Stand älter ist. Der
 * Abgleich wirft nicht nach oben durch: eine Fallliste, die wegen eines
 * langsamen sevDesk gar nicht erscheint, wäre der schlechtere Tausch. Die
 * Störung steht im Protokoll und der Stand wird als das ausgewiesen, was er
 * ist — alt.
 */

/** Wie lange ein Abgleich als frisch genug gilt. */
const SPERRE_MS = 60_000

export interface Spiegelstand {
  /** Wann zuletzt tatsächlich mit sevDesk gesprochen wurde. */
  abgeglichenAm: Date | null
  /** Der jüngste Änderungszeitpunkt im Spiegel — das Wasserzeichen. */
  wasserzeichen: Date | null
  anzahl: number
}

export async function spiegelstand(): Promise<Spiegelstand> {
  const [zeile] = await db
    .select({
      abgeglichenAm: sql<Date | null>`max(${rechnung.abgeglichenAm})`,
      wasserzeichen: sql<Date | null>`max(${rechnung.geaendertAm})`,
      anzahl: sql<number>`count(*)::int`,
    })
    .from(rechnung)
  return {
    abgeglichenAm: zeile?.abgeglichenAm ? new Date(zeile.abgeglichenAm) : null,
    wasserzeichen: zeile?.wasserzeichen ? new Date(zeile.wasserzeichen) : null,
    anzahl: zeile?.anzahl ?? 0,
  }
}

/**
 * Holt, was sich seit dem letzten Mal geändert hat, und schreibt es in den
 * Spiegel. Gibt zurück, wie viele Zeilen berührt wurden.
 */
export async function gleicheAb(erzwingen = false): Promise<number> {
  if (!sevdeskEingerichtet()) return 0

  const stand = await spiegelstand()
  if (
    !erzwingen &&
    stand.abgeglichenAm &&
    Date.now() - stand.abgeglichenAm.getTime() < SPERRE_MS
  ) {
    return 0
  }

  let neue: Rechnungsdaten[]
  try {
    neue = await holeRechnungen(stand.wasserzeichen)
  } catch (fehler) {
    protokolliereWarnung('sevdesk.abgleich', 'Der Rechnungsabgleich ist gescheitert.', {
      dienst: 'sevdesk',
      grund: fehler instanceof Error ? fehler.message : String(fehler),
    })
    return 0
  }

  if (neue.length === 0) {
    // Auch ohne neue Rechnung war das ein Abgleich: ohne diesen Vermerk
    // liefe die Minutensperre ins Leere und jeder Aufruf fragte erneut.
    if (stand.anzahl > 0) {
      await db.update(rechnung).set({ abgeglichenAm: new Date() })
    }
    return 0
  }

  const jetzt = new Date()
  // In Blöcken, damit eine Erstbefüllung mit 1444 Rechnungen nicht als eine
  // einzige riesige Anweisung an die Datenbank geht.
  for (let i = 0; i < neue.length; i += 200) {
    const block = neue.slice(i, i + 200)
    await db
      .insert(rechnung)
      .values(block.map((r) => ({ ...r, abgeglichenAm: jetzt })))
      .onConflictDoUpdate({
        target: rechnung.sevdeskId,
        set: {
          nummer: sql`excluded.nummer`,
          schluessel: sql`excluded.schluessel`,
          status: sql`excluded.status`,
          bruttoCent: sql`excluded.brutto_cent`,
          bezahltCent: sql`excluded.bezahlt_cent`,
          rechnungsdatum: sql`excluded.rechnungsdatum`,
          zahldatum: sql`excluded.zahldatum`,
          zahlungszielTage: sql`excluded.zahlungsziel_tage`,
          mahnstufe: sql`excluded.mahnstufe`,
          geaendertAm: sql`excluded.geaendert_am`,
          abgeglichenAm: jetzt,
        },
      })
  }

  return neue.length
}

/** Die Rechnungen zu einer Menge von Aktenzeichenschlüsseln, gruppiert. */
export async function ladeRechnungen(
  schluessel: string[],
): Promise<Map<string, Rechnungszeile[]>> {
  const gesucht = [...new Set(schluessel.filter(Boolean))]
  const nach = new Map<string, Rechnungszeile[]>()
  if (gesucht.length === 0) return nach

  const zeilen = await db
    .select({
      sevdeskId: rechnung.sevdeskId,
      nummer: rechnung.nummer,
      schluessel: rechnung.schluessel,
      status: rechnung.status,
      bruttoCent: rechnung.bruttoCent,
      bezahltCent: rechnung.bezahltCent,
      rechnungsdatum: rechnung.rechnungsdatum,
      zahldatum: rechnung.zahldatum,
      zahlungszielTage: rechnung.zahlungszielTage,
      mahnstufe: rechnung.mahnstufe,
    })
    .from(rechnung)
    .where(inArray(rechnung.schluessel, gesucht))
    .orderBy(rechnung.nummer, rechnung.sevdeskId)

  for (const z of zeilen) {
    const liste = nach.get(z.schluessel) ?? []
    liste.push({
      sevdeskId: z.sevdeskId,
      nummer: z.nummer,
      status: z.status,
      bruttoCent: z.bruttoCent,
      bezahltCent: z.bezahltCent,
      rechnungsdatum: z.rechnungsdatum,
      zahldatum: z.zahldatum,
      zahlungszielTage: z.zahlungszielTage,
      mahnstufe: z.mahnstufe,
    })
    nach.set(z.schluessel, liste)
  }
  return nach
}
