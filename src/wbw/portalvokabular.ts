/**
 * Der Kraftstoff — die Liste für die Oberfläche und die Prüfung danach.
 *
 * **Wo die Portalschreibweisen und die Selbstprüfung stehen:** in
 * `wbw-plugin/portalvokabular.js`, und nur dort. Die Portaleingaben baut das Plugin; läge die Übersetzung
 * zusätzlich hier, gäbe es zwei Stellen mit demselben Portalwort — und zwei
 * Stellen laufen auseinander. Das Cockpit kennt nur die deutschen Begriffe
 * und reicht sie über `params.json` herein.
 *
 * **Warum der Kraftstoff überhaupt eine eigene Angabe ist.** Das Gutachten
 * führt kein Feld dafür. Bei Modellen, die es als Verbrenner und als Stromer
 * gibt — Smart, Fiat 500, Mini — entscheidet er aber über den halben Korb:
 * ein E-Smart und ein Benziner-Smart sind zwei Märkte.
 */

/** Kraftstoffarten, die der Sachverständige wählen kann. */
export type Kraftstoff =
  | 'Benzin'
  | 'Diesel'
  | 'Elektro'
  | 'Hybrid'
  | 'Plug-in-Hybrid'
  | 'LPG'
  | 'CNG'

/** Dieselbe Liste zur Laufzeit — die Oberfläche baut daraus ihre Auswahl. */
export const KRAFTSTOFFE: Kraftstoff[] = [
  'Benzin',
  'Diesel',
  'Elektro',
  'Hybrid',
  'Plug-in-Hybrid',
  'LPG',
  'CNG',
]

export type Getriebe = 'Automatik' | 'Manuell'
