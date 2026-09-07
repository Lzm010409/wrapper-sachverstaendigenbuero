import type { leseFalldaten } from '@/autoixpert/felder'

/**
 * Das Modell der Fallseite — **rein**, ohne Datenbank und ohne Netz.
 *
 * Hier stehen die Typen und die Umformungen, die aus gespeicherten Zeilen
 * eine Ansicht machen. Der Zugriff auf die Datenbank liegt daneben in
 * `ansicht.ts`, der auf Pipedrive in `vorgang.ts`.
 *
 * Die Trennung ist keine Formalie: `baueUntertitel` liess sich vorher nicht
 * prüfen, ohne dass die Testdatei über drei Ecken das Datenbankmodul lud —
 * und das bricht ohne `DATABASE_URL` ab. Eine reine Funktion, die eine
 * Datenbank braucht, um geprüft zu werden, ist nicht rein.
 */

export type Falldaten = ReturnType<typeof leseFalldaten>

export interface Schreiben {
  id: string
  betreff: string | null
  erstelltAm: Date | null
  versendetAm: Date | null
  positionen: number
}

export interface FallAnsicht {
  id: string
  /** Aktenzeichen aus dem Gutachten; fehlt es dort, das beim Import gespeicherte. */
  aktenzeichen: string | null
  /** Überschrift der Seite: der Anspruchsteller, oder eine ehrliche Ersatzangabe. */
  titel: string
  /** Zeile darunter: Gutachtentyp, Zustand, Abrufzeitpunkt. */
  untertitel: string
  /**
   * `false`, wenn die gespeicherten Falldaten nicht die Form haben, die
   * autoiXpert liefert. Dann sind `daten` und `gutachten` leer — die
   * Schreiben bleiben trotzdem erreichbar, denn die hängen an der Fall-Id.
   */
  lesbar: boolean
  daten: Falldaten | null
  schreiben: Schreiben[]
}

/**
 * Gutachtentyp, Zustand und Abrufzeitpunkt in einer Zeile.
 *
 * Jedes der drei Stücke darf fehlen. Genau daran ging die frühere Fassung:
 * ohne Gutachtentyp und Zustand begann die Zeile mit einem Trennzeichen.
 */
export function baueUntertitel(daten: Falldaten | null, abgerufenAm: Date | null): string {
  const teile = [daten?.gutachtenTyp, daten?.zustand].filter(Boolean) as string[]
  if (abgerufenAm) {
    teile.push(`abgerufen ${new Date(abgerufenAm).toLocaleString('de-DE')}`)
  }
  return teile.join(' · ')
}

/** Die Überschrift der Fallseite. Nie geraten: unlesbar heisst unlesbar. */
export function baueTitel(daten: Falldaten | null, lesbar: boolean): string {
  if (!lesbar) return 'Falldaten nicht lesbar'
  return daten?.anspruchsteller?.name ?? 'Fall ohne Anspruchsteller'
}

/**
 * Setzt die Ansicht aus den drei Zutaten zusammen: der gespeicherten Zeile,
 * den gelesenen Falldaten (oder `null`, wenn sie nicht lesbar waren) und den
 * Schreiben.
 */
export function baueFallAnsicht(
  zeile: { id: string; aktenzeichen: string | null; abgerufenAm: Date | null },
  daten: Falldaten | null,
  lesbar: boolean,
  schreiben: Schreiben[],
): FallAnsicht {
  return {
    id: zeile.id,
    aktenzeichen: daten?.aktenzeichen ?? zeile.aktenzeichen ?? null,
    titel: baueTitel(daten, lesbar),
    untertitel: baueUntertitel(daten, zeile.abgerufenAm),
    lesbar,
    daten,
    schreiben,
  }
}
