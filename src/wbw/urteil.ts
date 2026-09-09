/**
 * Das Urteil der Prüfung — Typen und die Regeln, die daran hängen.
 *
 * **Warum getrennt von `pruefung.ts`:** dort steht der Aufruf des
 * Sprachmodells, und der zieht über `@/ki/client` ein `server-only`-Modul
 * nach sich. Die Korbtabelle im Browser braucht aber dieselben Typen und
 * dieselbe Vorbelegungsregel. Ohne diese Trennung brach die Seite mit
 * „You're importing a module that depends on server-only" — gemessen am
 * 08.09.2026.
 *
 * Hier steht deshalb nur, was beide Seiten teilen dürfen: kein Aufruf, kein
 * Zugangsschlüssel, keine Datenbank.
 */

import type { Bauart } from './karosserie'

/** Was die Prüfung im Inserat erkannt hat, wenn der Text es nicht hergibt. */
export const UNBEKANNTE_BAUART = 'unbekannt'

/** Die Bauart eines Inserats aus Sicht der Prüfung. */
export type ErkannteBauart = Bauart | typeof UNBEKANNTE_BAUART

export type Auffaelligkeit =
  | 'export'
  | 'bastler'
  | 'unfall'
  | 'preisausreisser'
  | 'tachostand'
  | 'ohne_bilder'
  | 'gewerblich'
  | 'dublette'
  | 'falsches_modell'

export const AUFFAELLIGKEITEN: Record<Auffaelligkeit, string> = {
  export: 'Als Exportfahrzeug angeboten',
  bastler: 'Bastler- oder Teileträgerfahrzeug',
  unfall: 'Unfallschaden genannt',
  preisausreisser: 'Preis passt nicht zu den übrigen Angaben',
  tachostand: 'Laufleistung unstimmig oder nicht bestätigt',
  ohne_bilder: 'Kein Bild im Inserat',
  gewerblich: 'Händlerangebot',
  dublette: 'Dasselbe Fahrzeug wie ein anderes Inserat',
  falsches_modell: 'Anderes Modell als gesucht',
}


/** Was von einem Inserat an das Modell geht. */
export interface Inseratsangabe {
  id: string
  quelle: string
  titel: string | null
  beschreibung: string | null
  ausstattung: string[]
  preis: number | null
  kilometerstand: number | null
  erstzulassung: string | null
  leistungKw: number | null
  anzahlBilder: number
}

export interface Pruefurteil {
  id: string
  /** Aus der Soll-Ausstattung, im Inserat belegt. */
  erkannteAusstattung: string[]
  /** Aus der Soll-Ausstattung, im Inserat nicht belegt. */
  fehlendeAusstattung: string[]
  /** 0 bis 100 — fachliche Nähe zum Subjektfahrzeug. */
  vergleichbarkeit: number
  /**
   * Wofür die Prüfung das Fahrzeug hält, z. B. `VW Golf VI`.
   *
   * Steht in der Korbtabelle, damit ein Fehlurteil sichtbar ist statt nur
   * wirksam: am 08.09.2026 stand ein Golf im Korb einer Sharan-Suche, und
   * nichts an der Zeile verriet, dass die Prüfung ihn als Golf gelesen hatte.
   */
  erkanntesModell: string
  /**
   * Die Bauart aus Titel und Beschreibung.
   *
   * Auf Kleinanzeigen die **einzige** Quelle: das Portal liefert kein
   * Bauart-Feld, und der Titel nennt sie fast nie. Der Regex-Abgleich des
   * Plugins findet dort nichts und lässt das Fahrzeug bewusst durch.
   */
  erkannteBauart: ErkannteBauart
  /** Ein Satz, warum. Steht in der Tabelle neben dem Fahrzeug. */
  begruendung: string
  auffaelligkeiten: Auffaelligkeit[]
  empfehlung: 'aufnehmen' | 'pruefen' | 'verwerfen'
  /** Gesetzt, wenn kein Urteil zustande kam — dann ist es ein Platzhalter. */
  ungeprueft?: boolean
}


/** Der Platzhalter für ein Inserat, zu dem kein Urteil kam. */
export function ungeprueft(id: string, grund: string): Pruefurteil {
  return {
    id,
    erkannteAusstattung: [],
    fehlendeAusstattung: [],
    vergleichbarkeit: 50,
    erkanntesModell: '',
    erkannteBauart: UNBEKANNTE_BAUART,
    begruendung: grund,
    auffaelligkeiten: [],
    empfehlung: 'pruefen',
    ungeprueft: true,
  }
}

/**
 * Ob ein Fahrzeug nach dem Urteil in den Korb gehört.
 *
 * Das ist die **Vorbelegung des Hakens**, nicht die Entscheidung: `pruefen`
 * ist angehakt, weil der Sachverständige sonst jedes unsichere Fahrzeug von
 * Hand suchen müsste. Nur `verwerfen` beginnt ohne Haken.
 */
export function vorbelegt(urteil: Pruefurteil | undefined): boolean {
  return urteil?.empfehlung !== 'verwerfen'
}

/** Wie viele Fahrzeuge die Zyklus-Prüfung als brauchbar ansieht. */
export function brauchbare(urteile: Iterable<Pruefurteil>): number {
  let anzahl = 0
  for (const urteil of urteile) if (urteil.empfehlung === 'aufnehmen') anzahl += 1
  return anzahl
}
