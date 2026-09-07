import 'server-only'
import { and, eq, inArray, isNull, sql } from 'drizzle-orm'
import { db } from '@/db'
import { eintrag, stellungnahme } from '@/db/schema'
import type { Extraktion } from '@/pruefbericht/schema'
import type { GeladeneStellungnahme } from '@/stellungnahme/abfragen'
import { erzeugeDokument, type DokumentBaustein } from './erzeugen'
import {
  ergaenzeFehlendeAbschnitte,
  traegeKopfsaetzeNach,
  wandlePlatzhalterInKnoten,
} from './reparatur'
import { STANDARD_ANREDE, baueAnrede, baueEinleitung } from '@/export/hausstil'
import { istDokument, type Elementknoten } from './typen'

/**
 * Beschafft das Dokument einer Stellungnahme — und legt es an, wenn es
 * noch keines gibt.
 *
 * Stellungnahmen aus der Zeit der Auswahlmaske tragen kein Dokument. Beim
 * ersten Öffnen entsteht es aus ihren Bausteinen: dieselbe Erzeugung wie
 * bei einer neuen Stellungnahme, nur mit vorhandenem Inhalt. Ein eigenes
 * Migrationsskript gibt es deshalb nicht — und keine Stellungnahme, die
 * zwischen zwei Welten hängt.
 */
export async function stelleDokumentBereit(
  s: GeladeneStellungnahme,
): Promise<{ dokument: Elementknoten; stand: number }> {
  if (istDokument(s.dokument)) {
    return heileAbschnitte(s, s.dokument, s.dokumentStand)
  }

  const dokument = await baueAusBausteinen(s)

  // Nur schreiben, wenn tatsächlich noch nichts dasteht: zwei gleichzeitig
  // geöffnete Fenster dürfen sich nicht gegenseitig überschreiben.
  const geschrieben = await db
    .update(stellungnahme)
    .set({ dokument, dokumentStand: 1, dokumentGeaendertAm: new Date() })
    .where(and(eq(stellungnahme.id, s.id), isNull(stellungnahme.dokument)))
    .returning({ id: stellungnahme.id })

  if (geschrieben.length > 0) return { dokument, stand: 1 }

  const [aktuell] = await db
    .select({ dokument: stellungnahme.dokument, stand: stellungnahme.dokumentStand })
    .from(stellungnahme)
    .where(eq(stellungnahme.id, s.id))
    .limit(1)

  return istDokument(aktuell?.dokument)
    ? { dokument: aktuell.dokument, stand: aktuell.stand }
    : { dokument, stand: 1 }
}

/**
 * Legt Abschnitte an, die dem Schreiben abhandengekommen sind.
 *
 * Vor der Fassung mit dem festen Rahmen konnte ein Ausschneiden über das
 * ganze Dokument Abschnitte mitnehmen; die Anmerkung am Rand stand dann als
 * „nicht im Schreiben" da und der Bezug zum Prüfbericht war fort. Solche
 * Schreiben heilen beim Öffnen: die fehlenden Abschnitte kommen leer an
 * ihre Stelle zurück.
 *
 * Geschrieben wird nur, wenn niemand sonst zwischenzeitlich gespeichert
 * hat. Misslingt das, bekommt der Editor das reparierte Schreiben trotzdem
 * — beim nächsten Speichern geht es von selbst mit.
 */
async function heileAbschnitte(
  s: GeladeneStellungnahme,
  dokument: Elementknoten,
  stand: number,
): Promise<{ dokument: Elementknoten; stand: number }> {
  const repariert = ergaenzeFehlendeAbschnitte(
    dokument,
    s.positionen.map((p) => ({
      id: p.id,
      bezeichnung: p.bezeichnung,
      behandlung: p.behandlung,
    })),
  )

  /*
    Und der zweite Handgriff beim Öffnen: aus `[Kennzeichen]` im Text wird
    ein Platzhalterknoten. Ältere Schreiben tragen die Klammern noch als
    gewöhnlichen Text — ein halb gelöschter Ausdruck brachte dort den
    Wächter R1 zum Schweigen, obwohl der Brief eine offene Angabe enthielt.
  */
  const gewandelt = wandlePlatzhalterInKnoten(repariert.dokument)

  /*
    Und der dritte: Anrede und Einleitungssatz auf den Stand der Kopfdaten
    bringen. Sie wurden bisher einmal beim Anlegen gebaut — da ist das
    Datum des Anschreibens aber oft noch unbekannt und der Empfänger noch
    nicht eingetragen. Wer beides später nachtrug, änderte nur die
    Aktennotiz; im Brief blieb die Einleitung leer und die Anrede allgemein.

    Hier geschieht es beim Öffnen, damit auch ein Schreiben von gestern in
    Ordnung kommt, ohne dass jemand den Kopfbereich anfassen muss.
  */
  const kopf = traegeKopfsaetzeNach(
    gewandelt.dokument,
    {
      anrede: baueAnrede(s.empfaengerName) ?? (s.anrede?.trim() || STANDARD_ANREDE),
      einleitung: baueEinleitung({
        einleitungDatum: s.einleitungDatum,
        einleitungMedium: s.einleitungMedium === 'mail' ? 'mail' : 'schreiben',
        pruefdienstleister: (s.extraktion as Extraktion | null)?.pruefdienstleister ?? null,
      } as Parameters<typeof baueEinleitung>[0]),
    },
    // Beim Öffnen wird nur gefüllt, was leer ist. Was dasteht, hat jemand
    // dorthin geschrieben — und sei es, indem er die Vorlage stehen liess.
    'nur-leeres',
  )

  const etwasGetan =
    repariert.ergaenzt.length > 0 || gewandelt.gewandelt > 0 || kopf.nachgetragen.length > 0
  if (!etwasGetan) return { dokument, stand }

  const geschrieben = await schreibeDokument(s.id, kopf.dokument, stand)
  return {
    dokument: kopf.dokument,
    stand: 'stand' in geschrieben ? geschrieben.stand : stand,
  }
}

async function baueAusBausteinen(s: GeladeneStellungnahme): Promise<Elementknoten> {
  const eintragsIds = [
    ...new Set(
      s.positionen
        .flatMap((p) => p.bausteine.map((b) => b.eintragId))
        .filter((id): id is string => Boolean(id)),
    ),
  ]

  const beschriftung = new Map<string, { nummer: string; titel: string }>()
  if (eintragsIds.length > 0) {
    const zeilen = await db
      .select({ id: eintrag.id, nummer: eintrag.nummer, titel: eintrag.titel })
      .from(eintrag)
      .where(inArray(eintrag.id, eintragsIds))
    for (const z of zeilen) beschriftung.set(z.id, { nummer: z.nummer, titel: z.titel })
  }

  const extraktion = s.extraktion as Extraktion | null

  return erzeugeDokument({
    betreff: s.betreff,
    /*
      Die Anrede folgt dem Empfänger, wo seine Zeile das hergibt. In
      `stellungnahme.anrede` steht, was bei der Auswertung des Prüfberichts
      bekannt war — oft „Sehr geehrte Damen und Herren,", weil der Empfänger
      erst danach eingetragen wurde. Sie ist deshalb der Rückfall, nicht die
      erste Wahl.
    */
    anrede: baueAnrede(s.empfaengerName) ?? s.anrede,
    kopf: {
      einleitungDatum: s.einleitungDatum,
      einleitungMedium: s.einleitungMedium === 'mail' ? 'mail' : 'schreiben',
      pruefdienstleister: extraktion?.pruefdienstleister ?? null,
    },
    positionen: s.positionen.map((p) => ({
      id: p.id,
      bezeichnung: p.bezeichnung,
      behandlung: p.behandlung,
      bausteine: p.bausteine.map(
        (b): DokumentBaustein => ({
          text: b.textFinal,
          eintragId: b.eintragId,
          nummer: b.eintragId ? (beschriftung.get(b.eintragId)?.nummer ?? null) : null,
          titel: b.eintragId ? (beschriftung.get(b.eintragId)?.titel ?? null) : null,
          herkunft: b.herkunft,
        }),
      ),
    })),
    ergebnisAbsatz: s.ergebnisAbsatz,
  })
}

/**
 * Schreibt eine neue Fassung.
 *
 * Der mitgelieferte Stand muss der sein, auf dem der Editor aufsetzt.
 * Passt er nicht, hat jemand anderes zwischenzeitlich gespeichert — dann
 * wird nicht geschrieben, sondern gemeldet. Stilles Überschreiben wäre der
 * schlechteste aller Ausgänge.
 */
export async function schreibeDokument(
  stellungnahmeId: string,
  dokument: Elementknoten,
  stand: number,
): Promise<{ stand: number } | { konflikt: number }> {
  const geschrieben = await db
    .update(stellungnahme)
    .set({
      dokument,
      dokumentStand: sql`${stellungnahme.dokumentStand} + 1`,
      dokumentGeaendertAm: new Date(),
    })
    .where(and(eq(stellungnahme.id, stellungnahmeId), eq(stellungnahme.dokumentStand, stand)))
    .returning({ stand: stellungnahme.dokumentStand })

  if (geschrieben.length > 0) return { stand: geschrieben[0]!.stand }

  const [aktuell] = await db
    .select({ stand: stellungnahme.dokumentStand })
    .from(stellungnahme)
    .where(eq(stellungnahme.id, stellungnahmeId))
    .limit(1)

  return { konflikt: aktuell?.stand ?? 0 }
}

/** Liest das gespeicherte Dokument, ohne eines anzulegen. */
export async function leseDokument(stellungnahmeId: string): Promise<Elementknoten | null> {
  const [zeile] = await db
    .select({ dokument: stellungnahme.dokument })
    .from(stellungnahme)
    .where(eq(stellungnahme.id, stellungnahmeId))
    .limit(1)
  return istDokument(zeile?.dokument) ? zeile.dokument : null
}
