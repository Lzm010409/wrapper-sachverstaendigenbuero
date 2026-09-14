'use server'

import { revalidatePath } from 'next/cache'
import { zipSync } from 'fflate'
import { and, eq, inArray, isNull, sql } from 'drizzle-orm'
import { db } from '@/db'
import {
  beleg,
  bulkLauf,
  eintrag,
  eintragErgaenzung,
  eintragVariante,
} from '@/db/schema'
import { verlangeBenutzer } from '@/auth/sitzung'
import { darf, verlangeRecht } from '@/rechte/zugriff'
import type { Bereich } from './eingabe'
import type { EintragStatus } from './abfragen'
import { naechsteNummer, type Nummernbestand } from './nummer'
import { istDublette, sperreBereichZurNummernvergabe } from './sperre'
import { formatiereEintrag, type ExportEintrag } from './markdown-export'
import {
  bewerteBereichswechsel,
  bewerteFreigabe,
  bewerteStatuswechsel,
  eintragUnveraendertSeitLauf,
  laufNochRueckgaengigMachbar,
  pruefeBulkAuswahl,
  type BulkUebersprungen,
} from './bulk-regeln'

/**
 * Die drei schreibenden Bulk-Aktionen der Bibliothek und ihr Rückgängig.
 *
 * **Warum kein gemeinsamer Rumpf.** Statuswechsel, Freigabe und
 * Bereichswechsel greifen an verschiedenen Spalten an, mit verschiedenen
 * Rechten und verschiedenen Nebenwirkungen (Freigabe setzt zwei zusätzliche
 * Felder, ein Bereichswechsel vergibt eine neue Nummer). Ein gemeinsamer
 * Rumpf wäre eine Fallunterscheidung mit drei Zweigen — nicht kürzer als drei
 * eigene Funktionen, nur schwerer zu lesen.
 *
 * **Warum Teilausführung und kein Alles-oder-nichts.** Bei vierzig
 * ausgewählten Einträgen ist es wahrscheinlicher, dass ein einzelner nicht
 * passt (steht schon auf dem Zielstatus, hat unbestätigte Belege), als dass
 * die ganze Auswahl von Grund auf falsch ist. Was passt, wird angewendet; was
 * nicht passt, steht im Bericht — mit Grund, nicht stillschweigend.
 */

export interface BulkKandidatErgebnis {
  id: string
  nummer: string
  titel: string
}

export interface BulkErgebnis {
  /** Nur bei einem Fehler, der die ganze Anfrage betrifft (leere/zu grosse Auswahl, fehlendes Recht). */
  fehler?: string
  bulkLaufId?: string
  bearbeitet: BulkKandidatErgebnis[]
  uebersprungen: BulkUebersprungen[]
}

function leeresErgebnis(fehler: string): BulkErgebnis {
  return { fehler, bearbeitet: [], uebersprungen: [] }
}

/* ------------------------------------------------------------------ *
 * Statuswechsel
 * ------------------------------------------------------------------ */

export async function bulkSetzeStatus(
  rohIds: string[],
  zielStatus: 'entwurf' | 'pruefung' | 'zurueckgezogen',
): Promise<BulkErgebnis> {
  const benutzer = await verlangeBenutzer()

  const auswahl = pruefeBulkAuswahl(rohIds)
  if ('fehler' in auswahl) return leeresErgebnis(auswahl.fehler)

  // Nur die Rücknahme einer Freigabe verlangt die Rolle — dieselbe
  // Ausnahme wie bei der Einzelaktion `setzeStatus`. Ein Recht je Eintrag
  // abzufragen wäre dieselbe Antwort, nur zwanzigmal gegen die Datenbank.
  const darfFreigabeZuruecknehmen = await darf('bibliothek.freigeben')

  const zeilen = await db
    .select({
      id: eintrag.id,
      nummer: eintrag.nummer,
      titel: eintrag.titel,
      status: eintrag.status,
      version: eintrag.version,
      freigegebenVon: eintrag.freigegebenVon,
      freigegebenAm: eintrag.freigegebenAm,
    })
    .from(eintrag)
    .where(inArray(eintrag.id, auswahl.ids))

  const { bearbeitbar, uebersprungen } = bewerteStatuswechsel(
    zeilen,
    zielStatus,
    darfFreigabeZuruecknehmen,
  )
  if (bearbeitbar.length === 0) return { bearbeitet: [], uebersprungen }

  const jetzt = new Date()
  const zurueckgenommeneIds = bearbeitbar
    .filter((e) => e.vorher.status === 'freigegeben')
    .map((e) => e.id)
  const uebrigeIds = bearbeitbar
    .filter((e) => e.vorher.status !== 'freigegeben')
    .map((e) => e.id)

  const bulkLaufId = await db.transaction(async (tx) => {
    if (zurueckgenommeneIds.length > 0) {
      await tx
        .update(eintrag)
        .set({
          status: zielStatus,
          geaendertAm: jetzt,
          version: sql`${eintrag.version} + 1`,
          // Nur hier gelöscht — dieselbe Unterscheidung wie bei der
          // Einzelaktion (siehe Kommentar dort): ein harmloser Wechsel
          // zwischen Entwurf und Prüfung soll die Spur einer früheren
          // Freigabe nicht mitreissen.
          freigegebenVon: null,
          freigegebenAm: null,
        })
        .where(inArray(eintrag.id, zurueckgenommeneIds))
    }
    if (uebrigeIds.length > 0) {
      await tx
        .update(eintrag)
        .set({ status: zielStatus, geaendertAm: jetzt, version: sql`${eintrag.version} + 1` })
        .where(inArray(eintrag.id, uebrigeIds))
    }

    return schreibeLauf(tx, benutzer.id, 'status', auswahl.ids, bearbeitbar, jetzt, (e) => {
      const zeile = zeilen.find((z) => z.id === e.id)!
      return {
        status: e.vorher.status,
        // Nur gesichert, wenn davor tatsächlich freigegeben war — sonst
        // stünden hier zwei „leere" Felder, die kein Rückgängig je braucht.
        ...(e.vorher.status === 'freigegeben'
          ? {
              freigegebenVon: zeile.freigegebenVon,
              freigegebenAm: zeile.freigegebenAm?.toISOString() ?? null,
            }
          : {}),
      }
    })
  })

  revalidatePath('/bibliothek')
  return {
    bulkLaufId,
    bearbeitet: bearbeitbar.map(({ id, nummer, titel }) => ({ id, nummer, titel })),
    uebersprungen,
  }
}

/* ------------------------------------------------------------------ *
 * Freigabe
 * ------------------------------------------------------------------ */

export async function bulkGebeFrei(rohIds: string[]): Promise<BulkErgebnis> {
  const benutzer = await verlangeRecht('bibliothek.freigeben')

  const auswahl = pruefeBulkAuswahl(rohIds)
  if ('fehler' in auswahl) return leeresErgebnis(auswahl.fehler)

  const zeilen = await db
    .select({
      id: eintrag.id,
      nummer: eintrag.nummer,
      titel: eintrag.titel,
      status: eintrag.status,
      version: eintrag.version,
      gegenargument: eintrag.gegenargument,
      vorgehen: eintrag.vorgehen,
    })
    .from(eintrag)
    .where(inArray(eintrag.id, auswahl.ids))

  const unbestaetigt = zeilen.length
    ? await db
        .select({ eintragId: beleg.eintragId, anzahl: sql<number>`count(*)`.mapWith(Number) })
        .from(beleg)
        .where(and(inArray(beleg.eintragId, auswahl.ids), isNull(beleg.verifiziertAm)))
        .groupBy(beleg.eintragId)
    : []
  const unbestaetigtJe = new Map(unbestaetigt.map((u) => [u.eintragId, u.anzahl]))

  const { bearbeitbar, uebersprungen } = bewerteFreigabe(
    zeilen.map((z) => ({
      id: z.id,
      nummer: z.nummer,
      titel: z.titel,
      version: z.version,
      status: z.status,
      hatText: Boolean(z.gegenargument?.trim() || z.vorgehen?.trim()),
      unbestaetigteBelege: unbestaetigtJe.get(z.id) ?? 0,
    })),
  )
  if (bearbeitbar.length === 0) return { bearbeitet: [], uebersprungen }

  const jetzt = new Date()
  const ids = bearbeitbar.map((e) => e.id)

  const bulkLaufId = await db.transaction(async (tx) => {
    await tx
      .update(eintrag)
      .set({
        status: 'freigegeben',
        freigegebenVon: benutzer.id,
        freigegebenAm: jetzt,
        geaendertAm: jetzt,
        version: sql`${eintrag.version} + 1`,
      })
      .where(inArray(eintrag.id, ids))

    return schreibeLauf(tx, benutzer.id, 'freigabe', auswahl.ids, bearbeitbar, jetzt, (e) => ({
      status: e.vorher.status,
    }))
  })

  revalidatePath('/bibliothek')
  return {
    bulkLaufId,
    bearbeitet: bearbeitbar.map(({ id, nummer, titel }) => ({ id, nummer, titel })),
    uebersprungen,
  }
}

/* ------------------------------------------------------------------ *
 * Bereichswechsel
 * ------------------------------------------------------------------ */

/**
 * Verschiebt Einträge in einen anderen Bereich.
 *
 * **Warum das die Gliederungsnummer mit anfasst.** Über (Bereich, Nummer)
 * liegt ein eindeutiger Index, und die Nummer selbst gehört zur Gliederung
 * des alten Bereichs — „1.2 Kalkulation" ergibt im Bereich Restwert keinen
 * Sinn und würde dort mit einer vorhandenen Nummer kollidieren. Jeder
 * verschobene Eintrag bekommt deshalb dieselbe neue Nummer, die auch ein neu
 * angelegter Eintrag in diesem Abschnitt des Zielbereichs bekäme
 * (`naechsteNummer`, siehe `legeEintragAn`). Der Abschnittstext selbst bleibt
 * stehen — er ist ohnehin frei getippt und nicht Sache dieser Aktion.
 */
export async function bulkSetzeBereich(rohIds: string[], zielBereich: Bereich): Promise<BulkErgebnis> {
  const benutzer = await verlangeBenutzer()

  const auswahl = pruefeBulkAuswahl(rohIds)
  if ('fehler' in auswahl) return leeresErgebnis(auswahl.fehler)

  const zeilen = await db
    .select({
      id: eintrag.id,
      nummer: eintrag.nummer,
      titel: eintrag.titel,
      version: eintrag.version,
      bereich: eintrag.bereich,
      abschnitt: eintrag.abschnitt,
    })
    .from(eintrag)
    .where(inArray(eintrag.id, auswahl.ids))

  const { bearbeitbar, uebersprungen } = bewerteBereichswechsel(zeilen, zielBereich)
  if (bearbeitbar.length === 0) return { bearbeitet: [], uebersprungen }

  const jetzt = new Date()
  // Ausserhalb der Transaktion deklariert, damit der Bericht danach weiss,
  // welche Nummer jeder verschobene Eintrag bekommen hat.
  const neueNummerJe = new Map<string, string>()

  try {
    const bulkLaufId = await db.transaction(async (tx) => {
      await sperreBereichZurNummernvergabe(tx, zielBereich)

      const bestand: Nummernbestand[] = await tx
        .select({ nummer: eintrag.nummer, abschnitt: eintrag.abschnitt })
        .from(eintrag)
        .where(eq(eintrag.bereich, zielBereich))

      // Nacheinander vergeben, nicht auf einmal: zwei verschobene Einträge
      // desselben Abschnitts dürfen nicht dieselbe neue Nummer bekommen. Der
      // eigene Bestand wächst mit jeder Zuteilung, genau wie beim Anlegen.
      for (const e of bearbeitbar) {
        const zeile = zeilen.find((z) => z.id === e.id)!
        const neu = naechsteNummer(bestand, zeile.abschnitt)
        neueNummerJe.set(e.id, neu)
        bestand.push({ nummer: neu, abschnitt: zeile.abschnitt })
      }

      for (const e of bearbeitbar) {
        await tx
          .update(eintrag)
          .set({
            bereich: zielBereich,
            nummer: neueNummerJe.get(e.id)!,
            geaendertAm: jetzt,
            version: sql`${eintrag.version} + 1`,
          })
          .where(eq(eintrag.id, e.id))
      }

      return schreibeLauf(tx, benutzer.id, 'bereich', auswahl.ids, bearbeitbar, jetzt, (e) => ({
        bereich: e.vorher.bereich,
        nummer: zeilen.find((z) => z.id === e.id)!.nummer,
      }))
    })

    revalidatePath('/bibliothek')
    return {
      bulkLaufId,
      bearbeitet: bearbeitbar.map(({ id, titel }) => ({
        id,
        titel,
        nummer: neueNummerJe.get(id)!,
      })),
      uebersprungen,
    }
  } catch (ausnahme) {
    if (istDublette(ausnahme)) {
      return leeresErgebnis(
        'Beim Vergeben der neuen Gliederungsnummern kam sich die Auswahl in die Quere. Bitte noch einmal versuchen.',
      )
    }
    throw ausnahme
  }
}

/* ------------------------------------------------------------------ *
 * Das Protokoll (`bulk_lauf`) und sein Rückgängig
 * ------------------------------------------------------------------ */

type Transaktion = Parameters<Parameters<typeof db.transaction>[0]>[0]

async function schreibeLauf<Vorher extends { status?: EintragStatus; bereich?: Bereich; nummer?: string }>(
  tx: Transaktion,
  benutzerId: string,
  operation: 'status' | 'freigabe' | 'bereich',
  eintragIds: string[],
  bearbeitbar: { id: string; version: number; vorher: Vorher }[],
  jetzt: Date,
  vorherFuer: (e: { id: string; vorher: Vorher }) => Record<string, unknown>,
): Promise<string> {
  const [angelegt] = await tx
    .insert(bulkLauf)
    .values({
      benutzerId,
      operation,
      eintragIds,
      vorherZustand: Object.fromEntries(
        bearbeitbar.map((e) => [
          e.id,
          { ...vorherFuer(e), version: e.version, geaendertAm: jetzt.toISOString() },
        ]),
      ),
      erstelltAm: jetzt,
    })
    .returning({ id: bulkLauf.id })
  return angelegt!.id
}

export interface UndoErgebnis {
  fehler?: string
  hinweis?: string
  wiederhergestellt: number
  uebersprungen: number
}

/**
 * Macht einen Bulk-Lauf rückgängig — innerhalb seines Zeitfensters und nur
 * für Einträge, die seitdem niemand sonst angefasst hat.
 */
export async function macheBulkLaufRueckgaengig(bulkLaufId: string): Promise<UndoErgebnis> {
  await verlangeBenutzer()

  const zeilen = await db.select().from(bulkLauf).where(eq(bulkLauf.id, bulkLaufId)).limit(1)
  const lauf = zeilen[0]
  if (!lauf) return { fehler: 'Dieser Lauf ist nicht mehr vorhanden.', wiederhergestellt: 0, uebersprungen: 0 }
  if (lauf.rueckgaengigGemachtAm) {
    return { fehler: 'Dieser Lauf wurde bereits rückgängig gemacht.', wiederhergestellt: 0, uebersprungen: 0 }
  }

  /*
   * Dasselbe Recht wie der ursprüngliche Lauf, nicht bloss die Anmeldung.
   *
   * Ein Rückgängig ist keine neutrale Operation: `freigabe` rückgängig zu
   * machen nimmt eine Freigabe zurück, und `status` rückgängig zu machen
   * kann einen Eintrag genau dorthin zurückbringen — auf `freigegeben`. Ohne
   * diese Prüfung könnte jeder Angemeldete, der an eine `bulkLaufId` kommt
   * (Browserverlauf, ein geteilter Bildschirm), innerhalb der dreissig
   * Sekunden eine Freigabe erteilen oder zurücknehmen, für die ihm
   * `bibliothek.freigeben` fehlt — genau die Grenze, die `setzeStatus` und
   * `gebeFrei` für den Einzelfall ziehen.
   */
  const beruehrtFreigabe =
    lauf.operation === 'freigabe' ||
    Object.values(lauf.vorherZustand).some((v) => v.status === 'freigegeben')
  if (beruehrtFreigabe && !(await darf('bibliothek.freigeben'))) {
    return {
      fehler: 'Diesen Lauf rückgängig zu machen darf nur, wer die Rolle „Freigeber" oder „Administrator" hat.',
      wiederhergestellt: 0,
      uebersprungen: 0,
    }
  }

  const jetzt = new Date()
  if (!laufNochRueckgaengigMachbar(lauf.erstelltAm, jetzt)) {
    return {
      fehler: 'Das Zeitfenster für Rückgängig ist abgelaufen — bitte einzeln korrigieren.',
      wiederhergestellt: 0,
      uebersprungen: 0,
    }
  }

  const eintragIds = Object.keys(lauf.vorherZustand)
  const aktuell = await db
    .select({ id: eintrag.id, geaendertAm: eintrag.geaendertAm })
    .from(eintrag)
    .where(inArray(eintrag.id, eintragIds))
  const aktuellJe = new Map(aktuell.map((e) => [e.id, e.geaendertAm]))

  const wiederherstellbar: string[] = []
  let uebersprungen = 0
  for (const id of eintragIds) {
    const aktuelleGeaendertAm = aktuellJe.get(id)
    const gesetztAm = new Date(lauf.vorherZustand[id]!.geaendertAm)
    if (!aktuelleGeaendertAm || !eintragUnveraendertSeitLauf(aktuelleGeaendertAm, gesetztAm)) {
      uebersprungen++
      continue
    }
    wiederherstellbar.push(id)
  }

  if (wiederherstellbar.length === 0) {
    return {
      fehler: 'Kein Eintrag liess sich zurücksetzen — alle wurden seitdem anderweitig verändert.',
      wiederhergestellt: 0,
      uebersprungen,
    }
  }

  try {
    await db.transaction(async (tx) => {
      for (const id of wiederherstellbar) {
        const vorher = lauf.vorherZustand[id]!
        await tx
          .update(eintrag)
          .set({
            ...(vorher.status ? { status: vorher.status as EintragStatus } : {}),
            ...(vorher.bereich ? { bereich: vorher.bereich as Bereich } : {}),
            ...(vorher.nummer ? { nummer: vorher.nummer } : {}),
            // Eine zurückgenommene Freigabe verliert wieder ihre Spur — genau
            // das Gegenstück zur Freigabe selbst. Kam die Freigabe dagegen
            // durch dieses Rückgängig zurück (Statuswechsel weg von
            // „freigegeben" wird aufgehoben), lebt ihre Spur wieder auf,
            // statt für immer leer zu bleiben.
            ...(lauf.operation === 'freigabe'
              ? { freigegebenVon: null, freigegebenAm: null }
              : vorher.status === 'freigegeben'
                ? {
                    freigegebenVon: vorher.freigegebenVon ?? null,
                    freigegebenAm: vorher.freigegebenAm ? new Date(vorher.freigegebenAm) : null,
                  }
                : {}),
            version: vorher.version,
            geaendertAm: jetzt,
          })
          .where(eq(eintrag.id, id))
      }
      await tx.update(bulkLauf).set({ rueckgaengigGemachtAm: jetzt }).where(eq(bulkLauf.id, bulkLaufId))
    })
  } catch (ausnahme) {
    // Nur bei `bereich`-Läufen möglich: die alte (Bereich, Nummer) wurde
    // seitdem von einem dritten Eintrag belegt (neu angelegt oder dorthin
    // verschoben). Dieselbe Ausweichantwort wie bei der Vergabe selbst,
    // statt einer rohen Datenbankmeldung.
    if (istDublette(ausnahme)) {
      return {
        fehler:
          'Beim Zurücksetzen kam eine Gliederungsnummer inzwischen anderswo in Gebrauch. ' +
          'Bitte einzeln in der Bibliothek prüfen.',
        wiederhergestellt: 0,
        uebersprungen,
      }
    }
    throw ausnahme
  }

  revalidatePath('/bibliothek')
  return {
    hinweis:
      uebersprungen > 0
        ? `${wiederherstellbar.length} Einträge zurückgesetzt, ${uebersprungen} übersprungen (seitdem anderweitig verändert).`
        : `${wiederherstellbar.length} Einträge zurückgesetzt.`,
    wiederhergestellt: wiederherstellbar.length,
    uebersprungen,
  }
}

/* ------------------------------------------------------------------ *
 * Export
 * ------------------------------------------------------------------ */

export interface BulkExportErgebnis {
  fehler?: string
  dateiname?: string
  /** Base64 — Server Actions geben keine Binärdaten roh zurück. */
  datenBase64?: string
}

/** Macht aus einem Titel einen unbedenklichen Dateinamen. */
function alsDateiname(nummer: string, titel: string): string {
  const sauber = `${nummer}-${titel}`
    .toLowerCase()
    .replace(/[^a-z0-9äöüß]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return `${sauber || 'eintrag'}.md`
}

/**
 * Baut ein ZIP mit einer Markdown-Datei je ausgewähltem Eintrag.
 *
 * Kein Bulk-Lauf wird dafür geschrieben — ein Export verändert keinen
 * Eintrag und hat nichts, das sich zurücknehmen liesse.
 */
export async function bulkExportiere(rohIds: string[]): Promise<BulkExportErgebnis> {
  await verlangeBenutzer()

  const auswahl = pruefeBulkAuswahl(rohIds)
  if ('fehler' in auswahl) return { fehler: auswahl.fehler }

  const eintraege = await db.select().from(eintrag).where(inArray(eintrag.id, auswahl.ids))
  if (eintraege.length === 0) return { fehler: 'Keiner der ausgewählten Einträge wurde gefunden.' }

  const [varianten, ergaenzungen] = await Promise.all([
    db.select().from(eintragVariante).where(inArray(eintragVariante.eintragId, auswahl.ids)),
    db.select().from(eintragErgaenzung).where(inArray(eintragErgaenzung.eintragId, auswahl.ids)),
  ])

  const dateien: Record<string, Uint8Array> = {}
  const vergebeneNamen = new Set<string>()
  for (const e of eintraege) {
    const exportEintrag: ExportEintrag = {
      nummer: e.nummer,
      titel: e.titel,
      abschnitt: e.abschnitt,
      typischeBegruendung: e.typischeBegruendung,
      gegenargument: e.gegenargument,
      vorgehen: e.vorgehen,
      hinweise: e.hinweise,
      varianten: varianten
        .filter((v) => v.eintragId === e.id)
        .map((v) => ({ bezeichnung: v.bezeichnung, text: v.text, reihenfolge: v.reihenfolge })),
      ergaenzungen: ergaenzungen
        .filter((g) => g.eintragId === e.id)
        .map((g) => ({ titel: g.titel, text: g.text, reihenfolge: g.reihenfolge })),
    }

    let name = alsDateiname(e.nummer, e.titel)
    // Zwei Einträge mit demselben geputzten Namen (etwa gleicher Titel in
    // verschiedenen Bereichen) sollen sich im ZIP nicht überschreiben.
    let zaehler = 2
    while (vergebeneNamen.has(name)) {
      name = `${alsDateiname(e.nummer, e.titel).replace(/\.md$/, '')}-${zaehler}.md`
      zaehler++
    }
    vergebeneNamen.add(name)

    dateien[name] = new TextEncoder().encode(formatiereEintrag(exportEintrag, 2))
  }

  const zip = zipSync(dateien, { level: 6 })
  return {
    dateiname: `bibliothek-export-${eintraege.length}.zip`,
    datenBase64: Buffer.from(zip).toString('base64'),
  }
}
