import type { Kategorie } from './kategorien'
import type { Verwendung } from './ansicht'

/**
 * Was der Fotoassistent zu einem Bild vorschlägt.
 *
 * **Client-sicher.** Der Prüfmodus läuft im Browser und braucht diese
 * Typen; `ansicht.ts` und `assistent.ts` tragen `import 'server-only'` und
 * dürfen dort nicht landen. Der Typ `Verwendung` wird als reiner Typ
 * geholt — `import type` verschwindet beim Übersetzen restlos, ein
 * Wert-Import würde den Datenbanktreiber ins Browserpaket ziehen.
 *
 * **Warum die vier Häkchen nicht vom Modell kommen.** Sie folgen aus der
 * Kategorie, und zwar immer gleich: ein Schadendetail gehört in Gutachten,
 * Restwertbörse, Reparaturbestätigung und Stellungnahme, ein Foto des
 * Kennzeichens gehört nicht in eine öffentliche Restwertbörse. Diese Regel
 * einmal aufzuschreiben ist ehrlicher, als sie das Modell bei jedem Bild
 * neu erraten zu lassen — und nachvollziehbar, wenn jemand fragt, warum
 * ein Haken gesetzt wurde.
 */

export type Vorschlagsstand = 'offen' | 'uebernommen' | 'verworfen'

export interface Fotovorschlag {
  fotoId: string
  kategorie: Kategorie
  /** Ein Satz, wie er als Bildunterschrift im Gutachten stehen kann. */
  beschreibung: string
  /** Die vier Häkchen, aus der Kategorie abgeleitet. */
  verwendung: Verwendung
  /** Wie sicher sich das Modell bei der Kategorie war, 0 bis 100. */
  sicherheit: number
  stand: Vorschlagsstand
}

/** Der Stand des Hintergrundlaufs, der diese Analyse befüllt — siehe `analyse-aktionen.ts`. */
export type Laufzustand = 'laeuft' | 'fertig' | 'fehler'

export interface Fotoanalyse {
  /** ISO-Zeitpunkt des letzten Schreibens. */
  erstelltAm: string
  vorschlaege: Fotovorschlag[]
  /** Die IDs der Fotos, zu denen kein Vorschlag zustande kam. */
  ohneVorschlag: string[]
  laufZustand: Laufzustand
  /** ISO-Zeitpunkt, seit dem der laufende (oder letzte) Lauf arbeitet. */
  laufBegonnenAm: string | null
  /** Nur bei `laufZustand === 'fehler'`. */
  laufFehler: string | null
}

/**
 * Wofür ein Foto der jeweiligen Kategorie vorgesehen wird.
 *
 * Gelesen als: Gutachten · Restwertbörse · Reparaturbestätigung ·
 * Stellungnahme.
 *
 * - **Kennzeichen und Fahrgestellnummer** gehen nicht in die Restwertbörse.
 *   Dort sieht sie jeder Bieter, und beides identifiziert das Fahrzeug und
 *   über die Halterauskunft seinen Eigentümer.
 * - **Papiere** landen nirgends automatisch. Ein Fahrzeugschein im
 *   Gutachten ist eine Entscheidung, keine Voreinstellung.
 * - **Die Stellungnahme** bekommt nur Schadendetails: sie streitet über den
 *   Schaden, nicht über den Innenraum.
 */
const VERWENDUNGEN: Record<Kategorie, Verwendung> = {
  kennzeichen: haken(true, false, false, false),
  vin: haken(true, false, false, false),
  tacho: haken(true, true, false, false),
  ansicht_vorne_links: haken(true, true, true, false),
  ansicht_vorne_rechts: haken(true, true, true, false),
  ansicht_hinten_links: haken(true, true, true, false),
  ansicht_hinten_rechts: haken(true, true, true, false),
  schaden: haken(true, true, true, true),
  innenraum: haken(true, true, false, false),
  reifen: haken(true, true, false, false),
  papiere: haken(false, false, false, false),
  sonstiges: haken(true, false, false, false),
}

function haken(
  imGutachten: boolean,
  inRestwertboerse: boolean,
  inReparaturbestaetigung: boolean,
  inStellungnahme: boolean,
): Verwendung {
  return { imGutachten, inRestwertboerse, inReparaturbestaetigung, inStellungnahme }
}

export function verwendungFuer(kategorie: Kategorie): Verwendung {
  // Kopie, damit ein Aufrufer die Tabelle nicht versehentlich umschreibt.
  return { ...VERWENDUNGEN[kategorie] }
}
