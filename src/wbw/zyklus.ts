import type { WbwEingabe } from './lauf'
import { haupttyp, stufenFuer } from './modell'

/**
 * Die Suche in Stufen statt in einem Anlauf.
 *
 * **Warum überhaupt.** Eine einzige, eng gefasste Suche hat genau zwei
 * Ausgänge: sie trifft, oder sie liefert nichts und der Lauf ist umsonst
 * gewesen. Am 07.09.2026 war es der zweite — `e_53_amg` brachte bei
 * Kleinanzeigen null E-Klassen, weil das Portal keine Motorvarianten führt.
 * Wer daraufhin von Hand weitet, macht dasselbe noch einmal mit anderen
 * Zahlen und hat am Ende zwei Ergebnisse, von denen keines mehr sagt, wie
 * eng gesucht wurde.
 *
 * **Die Stufen weiten zwei Dinge getrennt:** den Modellnamen (genau →
 * Haupttyp → Baureihe, jeweils nur wenn das Portal ihn führt) und die
 * Toleranzen. Das ist Absicht — ein gröberer Name holt andere Fahrzeuge
 * herein als eine weitere Kilometerspanne, und im Report soll erkennbar
 * bleiben, was von beidem gewirkt hat.
 *
 * **Aufgehört wird, sobald genug beisammen ist** (siehe `mindestzahl`), nicht
 * nach fester Stufenzahl. Ein Korb aus drei Fahrzeugen trägt kein Gutachten;
 * ein Korb aus zwölf braucht die dritte Stufe nicht.
 */

export type Zyklusname = 'eng' | 'geweitet' | 'weit'

export interface Zyklusstufe {
  name: Zyklusname
  /** Wie die Stufe im Report und in der Oberfläche heisst. */
  beschriftung: string
  /** Faktor auf km-, EZ- und Leistungstoleranz sowie den Radius. */
  faktor: number
  /** Welche Modellstufe versucht wird. */
  modellstufe: 'genau' | 'haupttyp' | 'baureihe'
}

/**
 * Die drei Stufen.
 *
 * Die Faktoren sind bewusst grob: 1 – 1,5 – 2. Feinere Abstufungen
 * täuschten eine Genauigkeit vor, die eine Marktsuche nicht hat, und jede
 * zusätzliche Stufe kostet einen vollen Portaldurchlauf.
 */
export const ZYKLEN: Zyklusstufe[] = [
  { name: 'eng', beschriftung: 'Zyklus 1 · eng', faktor: 1, modellstufe: 'genau' },
  { name: 'geweitet', beschriftung: 'Zyklus 2 · geweitet', faktor: 1.5, modellstufe: 'haupttyp' },
  { name: 'weit', beschriftung: 'Zyklus 3 · weit', faktor: 2, modellstufe: 'baureihe' },
]

/** Vorgabe für die Zahl brauchbarer Vergleichsfahrzeuge, ab der es genügt. */
export const MINDESTZAHL = 8

/**
 * Die Toleranzen einer Stufe.
 *
 * Der Radius wird mitgeweitet, aber gedeckelt: jenseits von 500 km ist die
 * Entfernung kein Merkmal des Marktes mehr, sondern nur noch Rauschen im
 * Korb — und die Portale liefern ohnehin bundesweit.
 */
export function toleranzenFuer(
  eingabe: Pick<
    WbwEingabe,
    'kmToleranz' | 'ezToleranzJahre' | 'leistungToleranzKw' | 'radiusKm'
  >,
  stufe: Zyklusstufe,
): Pick<WbwEingabe, 'kmToleranz' | 'ezToleranzJahre' | 'leistungToleranzKw' | 'radiusKm'> {
  return {
    kmToleranz: Math.round(eingabe.kmToleranz * stufe.faktor),
    ezToleranzJahre: Math.round(eingabe.ezToleranzJahre * stufe.faktor * 10) / 10,
    leistungToleranzKw: Math.round(eingabe.leistungToleranzKw * stufe.faktor),
    radiusKm: Math.min(500, Math.round(eingabe.radiusKm * stufe.faktor)),
  }
}

/**
 * Der Modellname einer Stufe für ein Portal.
 *
 * Führt das Portal die gewünschte Stufe nicht, wird die nächstgenauere
 * genommen, die es führt — lieber dieselbe Suche zweimal als eine Suche auf
 * einen Namen, den das Portal stillschweigend fallen lässt und die ganze
 * Marke zurückgibt.
 *
 * `null` heisst: dieses Portal kennt zu dieser Bezeichnung gar nichts. Dann
 * bleibt der bisher gesetzte Name stehen.
 */
export function modellFuerStufe(
  bezeichnung: string | null | undefined,
  portalmodelle: string[],
  stufe: Zyklusstufe,
): { modell: string; stufe: 'genau' | 'haupttyp' | 'baureihe' } | null {
  const stufen = stufenFuer(bezeichnung, portalmodelle)
  if (stufen.length === 0) return null

  const rang: Record<'genau' | 'haupttyp' | 'baureihe', number> = {
    genau: 0,
    haupttyp: 1,
    baureihe: 2,
  }
  const gewuenscht = rang[stufe.modellstufe]

  // Die gröbste Stufe, die nicht gröber ist als gewünscht.
  let treffer = stufen[0]!
  for (const kandidat of stufen) {
    if (rang[kandidat.stufe] <= gewuenscht) treffer = kandidat
  }
  return treffer
}

/**
 * Ob nach dieser Stufe aufgehört werden darf.
 *
 * Gezählt wird, was die KI-Prüfung nicht verworfen hat — die reine Trefferzahl
 * eines Portals sagt nichts, solange darunter Exportfahrzeuge und
 * Bastlerangebote sind.
 */
export function genugGefunden(brauchbare: number, mindestzahl = MINDESTZAHL): boolean {
  return brauchbare >= Math.max(1, mindestzahl)
}

/**
 * Die Modellnamen aller Portale für eine Stufe.
 *
 * Jedes Portal wird anders gröber, weil jedes anders sucht:
 *
 * - **AutoScout24** hat eine feste Taxonomie. Gröber heisst hier: ein
 *   anderer Eintrag aus *seiner* Liste (`modellFuerStufe`).
 * - **Kleinanzeigen** führt ohnehin nur Baureihen (`e_klasse`). Gröber geht
 *   nicht — der Name bleibt über alle Stufen gleich.
 * - **mobile.de** sucht über Freitext. Dort wirkt die Kürzung unmittelbar,
 *   ohne Liste: erst der ganze Name, dann der Haupttyp, dann das erste Wort.
 */
export function modelleFuerStufe(
  basis: { autoscout24?: string; kleinanzeigen?: string; mobilede?: string },
  bezeichnung: string | null | undefined,
  as24Modelle: string[],
  stufe: Zyklusstufe,
): { autoscout24?: string; kleinanzeigen?: string; mobilede?: string } {
  const proPortal = { ...basis }

  const as24 = modellFuerStufe(bezeichnung, as24Modelle, stufe)
  if (as24) proPortal.autoscout24 = as24.modell

  const frei = basis.mobilede ?? bezeichnung ?? undefined
  if (frei) {
    if (stufe.modellstufe === 'haupttyp') proPortal.mobilede = haupttypOderGanz(frei)
    if (stufe.modellstufe === 'baureihe') proPortal.mobilede = frei.trim().split(/\s+/)[0] ?? frei
  }

  return proPortal
}

function haupttypOderGanz(bezeichnung: string): string {
  return haupttyp(bezeichnung) ?? bezeichnung
}
