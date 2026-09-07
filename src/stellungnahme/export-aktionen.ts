'use server'

import { revalidatePath } from 'next/cache'
import { and, eq } from 'drizzle-orm'
import { db } from '@/db'
import { bild, stellungnahme } from '@/db/schema'
import { verlangeBenutzer } from '@/auth/sitzung'
import { verarbeiteImHintergrund } from './auswertung'

/**
 * Die kurzen Wege rund um die Ausgabe.
 *
 * Das Erzeugen der Dokumente selbst läuft nicht mehr hier, sondern als
 * Ereignisstrom über `/api/stellungnahmen/[id]/ausgabe` — eine Aktion kann
 * nur einmal antworten, und der Vorgang soll melden, woran er arbeitet.
 */
export interface ExportErgebnis {
  fehler?: string
  hinweis?: string
}

/** Merkt die Stellungnahme als versendet. */
export async function markiereVersendet(stellungnahmeId: string): Promise<ExportErgebnis> {
  await verlangeBenutzer()
  await db
    .update(stellungnahme)
    .set({ versendetAm: new Date() })
    .where(eq(stellungnahme.id, stellungnahmeId))
  revalidatePath('/stellungnahmen')
  revalidatePath(`/stellungnahmen/${stellungnahmeId}`)
  return { hinweis: 'Als versendet vermerkt. Das Schreiben ist ab jetzt geschlossen.' }
}

/**
 * Nimmt den Versandvermerk zurück.
 *
 * Ohne diesen Weg war „Versendet" eine Einbahnstrasse: der Knopf
 * verschwand, das Löschen verwies auf einen Vermerk, den niemand
 * zurücknehmen konnte, und ein versehentlicher Klick liess sich nicht
 * berichtigen. Ein Versandvermerk ist eine Notiz über die Wirklichkeit,
 * kein Zustand der Anwendung — und Notizen dürfen berichtigt werden.
 */
export async function nimmVersandZurueck(stellungnahmeId: string): Promise<ExportErgebnis> {
  await verlangeBenutzer()
  await db
    .update(stellungnahme)
    .set({ versendetAm: null })
    .where(eq(stellungnahme.id, stellungnahmeId))
  revalidatePath('/stellungnahmen')
  revalidatePath(`/stellungnahmen/${stellungnahmeId}`)
  return { hinweis: 'Der Versandvermerk ist zurückgenommen — das Schreiben lässt sich wieder ändern.' }
}

/** Kopfdaten der Stellungnahme ändern. */
export async function speichereKopf(
  stellungnahmeId: string,
  felder: {
    empfaengerName?: string
    empfaengerStrasse?: string
    empfaengerPlzOrt?: string
    einleitungDatum?: string
    einleitungMedium?: string
  },
): Promise<ExportErgebnis> {
  await verlangeBenutzer()
  await db
    .update(stellungnahme)
    .set({
      empfaengerName: felder.empfaengerName?.trim() || null,
      empfaengerStrasse: felder.empfaengerStrasse?.trim() || null,
      empfaengerPlzOrt: felder.empfaengerPlzOrt?.trim() || null,
      einleitungDatum: felder.einleitungDatum?.trim() || null,
      einleitungMedium: felder.einleitungMedium?.trim() || null,
    })
    .where(eq(stellungnahme.id, stellungnahmeId))

  /*
    Ausdrücklich **kein** `revalidatePath` auf die Detailseite.

    Es sah harmlos aus und war ein Wettlauf: das Neuzeichnen lässt den
    Server die Seite neu bauen, dabei läuft `stelleDokumentBereit` — und
    trägt seinerseits Anrede und Einleitungssatz nach, sobald die Felder
    gefüllt sind. Es schreibt also das Dokument und erhöht dessen Stand,
    während der Editor im Browser dasselbe gerade selbst tut. Dessen
    Speicherung trifft dann auf einen fremden Stand und wird abgewiesen:
    der nachgetragene Satz stand auf dem Schirm, aber nicht in der Ablage —
    und die Anzeige meldete „gespeichert".

    Zwei Schreiber für dieselbe Sache sind einer zu viel. Hier gewinnt der
    Editor: er hat den Brief, wie er gerade aussieht. Beim nächsten Öffnen
    findet der Server den Satz vor und lässt ihn in Ruhe.
  */
  return { hinweis: 'Gespeichert.' }
}

/**
 * Löscht eine Stellungnahme mit allem, was nur zu ihr gehört.
 *
 * Positionen, ihre Bausteine und die zugeordneten Bilder gehen mit — dafür
 * sorgt die Datenbank selbst. Zwei Dinge tut diese Aktion vorher von Hand:
 *
 * Bilder, die in der **Bildbibliothek** stehen, werden von der Stellungnahme
 * gelöst statt gelöscht. Sie gehören dort nicht mehr diesem einen Fall,
 * sondern dem Büro; ein aufbereiteter Kalkulationsauszug soll nicht
 * verschwinden, weil das Schreiben von damals weggeräumt wird.
 *
 * Und ein **versendetes** Schreiben lässt sich nicht löschen. Was aus dem
 * Haus ist, bleibt nachvollziehbar; wer es doch loswerden will, muss den
 * Versandvermerk vorher zurücknehmen.
 */
export async function loescheStellungnahme(stellungnahmeId: string): Promise<ExportErgebnis> {
  await verlangeBenutzer()

  const [vorhanden] = await db
    .select({
      versendetAm: stellungnahme.versendetAm,
      betreff: stellungnahme.betreff,
      auswertungsstand: stellungnahme.auswertungsstand,
    })
    .from(stellungnahme)
    .where(eq(stellungnahme.id, stellungnahmeId))
    .limit(1)

  if (!vorhanden) return { fehler: 'Diese Stellungnahme gibt es nicht mehr.' }

  /*
    Während die Auswertung läuft, wird nicht gelöscht: die Verarbeitung
    schriebe gleich in eine Zeile, die es nicht mehr gibt. Ist sie
    gescheitert, ist nichts mehr unterwegs — dann darf gelöscht werden.
  */
  if (vorhanden.auswertungsstand === 'laeuft') {
    return {
      fehler:
        'Der Prüfbericht wird gerade ausgewertet. Bitte warten, bis das durch ist — ' +
        'danach lässt sich das Schreiben löschen.',
    }
  }
  if (vorhanden.versendetAm) {
    return {
      fehler:
        'Dieses Schreiben ist als versendet vermerkt und lässt sich nicht löschen. ' +
        'Nimm den Vermerk zurück, wenn es wirklich weg soll.',
    }
  }

  await db
    .update(bild)
    .set({ stellungnahmeId: null })
    .where(and(eq(bild.stellungnahmeId, stellungnahmeId), eq(bild.inBibliothek, true)))

  await db.delete(stellungnahme).where(eq(stellungnahme.id, stellungnahmeId))

  revalidatePath('/stellungnahmen')
  revalidatePath('/bilder')
  return { hinweis: 'Stellungnahme gelöscht.' }
}

/** Positionen ohne Fall-Zuordnung brauchen keine Extraktion. */
export async function ladeFallId(stellungnahmeId: string): Promise<string | null> {
  await verlangeBenutzer()
  const zeilen = await db
    .select({ fallId: stellungnahme.fallId })
    .from(stellungnahme)
    .where(eq(stellungnahme.id, stellungnahmeId))
    .limit(1)
  return zeilen[0]?.fallId ?? null
}

/* ------------------------------------------------------------------ *
 * Auswertung im Hintergrund
 * ------------------------------------------------------------------ */

export interface Auswertungsstand {
  stand: string
  schritt: string | null
  prozent: number
  fehler: string | null
}

/**
 * Der Stand der laufenden Auswertung.
 *
 * Die Detailseite fragt im Takt danach. Bewusst eine gewöhnliche Aktion und
 * kein offener Strom: der Stand steht in der Datenbank und überlebt damit
 * den Weg auf eine andere Seite und zurück, das Schliessen des Fensters und
 * den Neustart des Behälters. Genau daran ist die Fassung gescheitert, die
 * alles an einer einzigen offenen Verbindung hängen hatte.
 */
export async function holeAuswertungsstand(
  stellungnahmeId: string,
): Promise<Auswertungsstand | null> {
  await verlangeBenutzer()

  const [zeile] = await db
    .select({
      stand: stellungnahme.auswertungsstand,
      schritt: stellungnahme.auswertungsschritt,
      prozent: stellungnahme.auswertungsProzent,
      fehler: stellungnahme.auswertungsfehler,
    })
    .from(stellungnahme)
    .where(eq(stellungnahme.id, stellungnahmeId))
    .limit(1)

  if (!zeile) return null
  return {
    stand: zeile.stand ?? 'fertig',
    schritt: zeile.schritt,
    prozent: zeile.prozent,
    fehler: zeile.fehler,
  }
}

/**
 * Stösst die Auswertung erneut an.
 *
 * Möglich, weil der Prüfbericht bei der Stellungnahme liegt — ein neuer
 * Anlauf kostet nichts als Zeit. Gebraucht wird er in zwei Fällen: die
 * Verarbeitung ist gescheitert, oder der Behälter ist mitten im Lauf neu
 * gestartet und die Zeile steht seither ohne Regung auf „läuft".
 */
export async function starteAuswertungNeu(stellungnahmeId: string): Promise<ExportErgebnis> {
  await verlangeBenutzer()

  const [zeile] = await db
    .select({ daten: stellungnahme.pruefberichtDaten })
    .from(stellungnahme)
    .where(eq(stellungnahme.id, stellungnahmeId))
    .limit(1)

  if (!zeile?.daten) {
    return { fehler: 'Zu dieser Stellungnahme liegt kein Prüfbericht mehr vor.' }
  }

  await db
    .update(stellungnahme)
    .set({
      auswertungsstand: 'laeuft',
      auswertungsschritt: 'Wartet auf die Verarbeitung …',
      auswertungsProzent: 0,
      auswertungsfehler: null,
      auswertungAktualisiertAm: new Date(),
    })
    .where(eq(stellungnahme.id, stellungnahmeId))

  void verarbeiteImHintergrund(stellungnahmeId)

  revalidatePath(`/stellungnahmen/${stellungnahmeId}`)
  return { hinweis: 'Die Auswertung läuft erneut.' }
}
