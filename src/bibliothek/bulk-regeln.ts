/**
 * Die reinen Entscheidungen der Bulk-Bearbeitung — ohne Datenbankzugriff.
 *
 * Getrennt von `bulk-aktionen.ts` aus demselben Grund wie `eingabe.ts` und
 * `nummer.ts`: reine Regeln lassen sich mit Vitest prüfen, ohne eine
 * Datenbank zu brauchen. `bulk-aktionen.ts` selbst bleibt ungetestet wie
 * `aktionen.ts` und `abfragen.ts` — die Tests dieser Anwendung laufen ohne
 * erreichbare Datenbank (siehe `vitest.config.ts`), und ein Test, der eine
 * `db.transaction` mockt, prüfte nur die Mocks nach.
 */

import type { Bereich } from './eingabe'
import type { EintragStatus } from './abfragen'

/** Mehr als das würde die Bibliothek (rund 70 Einträge) auf einen Schlag treffen. */
export const BULK_HOECHSTGRENZE = 100

export interface BulkAuswahlfehler {
  fehler: string
}

/**
 * Bereinigt die angeforderte Auswahl: Duplikate raus, dann die Obergrenze
 * geprüft. Über der Grenze gibt es bewusst keine Teilausführung — wer 140
 * Einträge markiert hat, soll die Auswahl eingrenzen, nicht raten, welche 100
 * von ihnen gelaufen sind.
 */
export function pruefeBulkAuswahl(ids: string[]): BulkAuswahlfehler | { ids: string[] } {
  const eindeutig = [...new Set(ids)]
  if (eindeutig.length === 0) {
    return { fehler: 'Keine Einträge ausgewählt.' }
  }
  if (eindeutig.length > BULK_HOECHSTGRENZE) {
    return {
      fehler:
        `${eindeutig.length} Einträge ausgewählt — höchstens ${BULK_HOECHSTGRENZE} auf einmal. ` +
        'Bitte die Auswahl eingrenzen.',
    }
  }
  return { ids: eindeutig }
}

export interface BulkKandidat {
  id: string
  nummer: string
  titel: string
  /** Für das Vorher-Protokoll des Laufs — jede Operation bumpt die Version. */
  version: number
}

export interface BulkUebersprungen extends BulkKandidat {
  grund: string
}

export interface BulkBewertung<Vorher> {
  bearbeitbar: (BulkKandidat & { vorher: Vorher })[]
  uebersprungen: BulkUebersprungen[]
}

/**
 * Bewertet einen Statuswechsel (auch das „Zurückziehen") für jeden Eintrag
 * der Auswahl.
 *
 * Dieselbe Ausnahme wie bei der Einzelaktion `setzeStatus` (Konzept E5): eine
 * Freigabe zurückzunehmen entwertet die Prüfung eines anderen und verlangt
 * deshalb die Rolle „Freigeber" oder „Administrator". Alle anderen Wege —
 * Entwurf, Prüfung, Zurückziehen, sofern nicht von „freigegeben" aus — stehen
 * offen.
 */
export function bewerteStatuswechsel(
  eintraege: (BulkKandidat & { status: EintragStatus })[],
  zielStatus: 'entwurf' | 'pruefung' | 'zurueckgezogen',
  darfFreigabeZuruecknehmen: boolean,
): BulkBewertung<{ status: EintragStatus }> {
  const bearbeitbar: (BulkKandidat & { vorher: { status: EintragStatus } })[] = []
  const uebersprungen: BulkUebersprungen[] = []

  for (const e of eintraege) {
    if (e.status === zielStatus) {
      uebersprungen.push({ ...e, grund: 'Stand schon auf diesem Status.' })
      continue
    }
    if (e.status === 'freigegeben' && !darfFreigabeZuruecknehmen) {
      uebersprungen.push({
        ...e,
        grund: 'Eine Freigabe zurücknehmen darf nur, wer die Rolle „Freigeber" oder „Administrator" hat.',
      })
      continue
    }
    bearbeitbar.push({ ...e, vorher: { status: e.status } })
  }

  return { bearbeitbar, uebersprungen }
}

/**
 * Bewertet die Bulk-Freigabe.
 *
 * **Strenger als die Einzelaktion `gebeFrei`**, die von jedem Status aus
 * freigibt: bei vierzig auf einmal ausgewählten Einträgen soll ein
 * versehentlich mitgewählter Entwurf nicht ungeprüft mitlaufen. Nur was schon
 * in Prüfung steht, gilt als Kandidat — dieselbe Absicht wie bei der
 * Einzelfreigabe (ein Mensch hat hingesehen), nur ausdrücklich statt implizit
 * über den Klickpfad der Oberfläche erzwungen.
 */
export function bewerteFreigabe(
  eintraege: (BulkKandidat & {
    status: EintragStatus
    hatText: boolean
    unbestaetigteBelege: number
  })[],
): BulkBewertung<{ status: EintragStatus }> {
  const bearbeitbar: (BulkKandidat & { vorher: { status: EintragStatus } })[] = []
  const uebersprungen: BulkUebersprungen[] = []

  for (const e of eintraege) {
    if (e.status !== 'pruefung') {
      uebersprungen.push({ ...e, grund: 'Nicht in Prüfung.' })
      continue
    }
    if (e.unbestaetigteBelege > 0) {
      uebersprungen.push({
        ...e,
        grund: `${e.unbestaetigteBelege} unbestätigte Fundstelle${e.unbestaetigteBelege === 1 ? '' : 'n'}.`,
      })
      continue
    }
    if (!e.hatText) {
      uebersprungen.push({ ...e, grund: 'Weder Gegenargument noch Vorgehen hinterlegt.' })
      continue
    }
    bearbeitbar.push({ ...e, vorher: { status: e.status } })
  }

  return { bearbeitbar, uebersprungen }
}

/**
 * Bewertet den Bereichswechsel. Übersprungen wird nur, was schon dort steht.
 *
 * Die neue Gliederungsnummer im Zielbereich vergibt `bulk-aktionen.ts` —
 * das braucht den Bestand des Zielbereichs aus der Datenbank und gehört
 * deshalb nicht hierher.
 */
export function bewerteBereichswechsel(
  eintraege: (BulkKandidat & { bereich: Bereich })[],
  zielBereich: Bereich,
): BulkBewertung<{ bereich: Bereich }> {
  const bearbeitbar: (BulkKandidat & { vorher: { bereich: Bereich } })[] = []
  const uebersprungen: BulkUebersprungen[] = []

  for (const e of eintraege) {
    if (e.bereich === zielBereich) {
      uebersprungen.push({ ...e, grund: 'Steht schon in diesem Bereich.' })
      continue
    }
    bearbeitbar.push({ ...e, vorher: { bereich: e.bereich } })
  }

  return { bearbeitbar, uebersprungen }
}

/** Wie lange sich ein Bulk-Lauf noch rückgängig machen lässt. */
export const UNDO_FENSTER_SEKUNDEN = 30

/** Ob das Undo-Zeitfenster eines Laufs noch offen ist. */
export function laufNochRueckgaengigMachbar(erstelltAm: Date, jetzt: Date): boolean {
  return jetzt.getTime() - erstelltAm.getTime() <= UNDO_FENSTER_SEKUNDEN * 1000
}

/**
 * Ob ein einzelner Eintrag seit dem Bulk-Lauf unangetastet blieb.
 *
 * `geaendertAm` wird von **jeder** schreibenden Aktion auf `eintrag` gesetzt
 * — Einzelaktion wie Bulk-Lauf. Stimmt der aktuelle Stand exakt mit dem
 * überein, den dieser Lauf selbst geschrieben hat, ist seitdem nichts anderes
 * dazwischengekommen.
 */
export function eintragUnveraendertSeitLauf(
  aktuellGeaendertAm: Date,
  vomLaufGesetztGeaendertAm: Date,
): boolean {
  return aktuellGeaendertAm.getTime() === vomLaufGesetztGeaendertAm.getTime()
}
