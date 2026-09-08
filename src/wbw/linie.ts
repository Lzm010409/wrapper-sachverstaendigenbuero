/**
 * Trennt die Ausstattungslinie vom Modellnamen.
 *
 * **Warum es das gibt.** Die DAT führt als Untertyp mitunter nicht das
 * Fahrzeug, sondern seine Ausstattungslinie. Am 08.09.2026 stand im
 * Modellfeld eines VW Sharan schlicht `Highline BMT` — kein Modell, sondern
 * eine Linie und ein Effizienzzusatz. Die Folge stand im Protokoll:
 *
 *     AutoScout24 kennt „Highline BMT" nicht unter 119 Modellen von
 *     Volkswagen. Gesucht wird über die ganze Marke.
 *
 * Über die ganze Marke gesucht, mit den engen Toleranzen des ersten Zyklus,
 * lieferte AutoScout24 in **beiden** Zyklen null Treffer. Das belastbarste
 * Portal fiel damit aus, und der Korb kam allein von Kleinanzeigen.
 *
 * **Was hier passiert und was nicht.** Erkannte Linien wandern in das Feld
 * „Variante / Ausstattungslinie", wo sie hingehören und wo sie den Korb
 * filtern. Technische Zusätze (`BMT`, `BlueMotion`) werden nur entfernt —
 * eine Linie sind sie nicht. Bleibt danach nichts übrig, ist das Modellfeld
 * leer, und die aufrufende Stelle fällt auf die Baureihe zurück.
 *
 * **Die Liste ist bewusst unvollständig.** Sie deckt die geläufigen
 * deutschen Linienbezeichnungen ab. Eine unbekannte Linie bleibt im
 * Modellfeld stehen — und wird dann von der Vorab-Prüfung gegen die
 * Modellliste von AutoScout24 aufgefangen, die der Sachverständige vor dem
 * Lauf sieht. Diese Prüfung ist das Sicherheitsnetz, nicht diese Liste.
 *
 * Was hier **nicht** hineingehört, ist alles, was Teil eines Modellnamens
 * sein kann: `AMG` ohne `Line` (AutoScout24 führt `E 53 AMG` als eigenes
 * Modell), `GTI`, `FR`, oder ein blosses `sport`.
 */

/**
 * Ausstattungslinien in der Schreibweise, die ins Variantenfeld geschrieben
 * wird. Längere Bezeichnungen stehen vor kürzeren, damit `AMG Line` nicht als
 * `Line` endet.
 */
const LINIEN = [
  // Mercedes-Benz
  'AMG Line',
  'Avantgarde',
  'Elegance',
  'Ambiente',
  'Progressive',
  // BMW
  'M Sportpaket',
  'M Sport',
  'Luxury Line',
  'Modern Line',
  'Urban Line',
  'Sport Line',
  'xLine',
  'Advantage',
  // Volkswagen
  'Comfortline',
  'Conceptline',
  'Trendline',
  'Highline',
  'R-Line',
  // Audi
  'S line',
  'Attraction',
  'Ambition',
  'Advanced',
  // Škoda, Seat
  'Laurin & Klement',
  'Monte Carlo',
  'Xcellence',
  'Reference',
  'Clever',
  'Scout',
  // Ford, Opel
  'ST-Line',
  'Titanium',
  'Vignale',
  'Innovation',
  'GS Line',
  'Edition',
  // herstellerübergreifend
  'Style',
  'Life',
  'Business',
  'Selection',
]

/**
 * Technische Zusätze. Sie kommen aus dem Modellfeld heraus, sind aber keine
 * Ausstattungslinie und dürfen deshalb nicht ins Variantenfeld.
 */
const ZUSAETZE = [
  'BlueMotion Technology',
  'BlueEFFICIENCY',
  'EfficientDynamics',
  'BlueMotion',
  'ECOnetic',
  'BlueTEC',
  'ecoFlex',
  'BMT',
]

export interface Modelltrennung {
  /** Was vom Modellfeld bleibt. Leer, wenn nur Linie und Zusätze darin standen. */
  modell: string
  /** Die erkannte Ausstattungslinie, z. B. `Highline`. */
  linie: string | null
  /** Entfernte technische Zusätze, z. B. `BMT`. Für die Anzeige. */
  entfernt: string[]
}

/** Für den Einsatz in einem regulären Ausdruck entschärft. */
function entschaerft(wert: string): string {
  return wert.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Sucht eine Bezeichnung als ganze Wortfolge und schneidet sie heraus.
 *
 * Die Wortgrenzen sind der Punkt: ohne sie würde `Life` in `Lifestyle`
 * treffen und aus einem Kia Ceed Lifestyle einen „Ceed style" machen.
 */
function schneide(text: string, bezeichnung: string): string | null {
  const muster = new RegExp(`(^|\\s)${entschaerft(bezeichnung).replace(/\s+/g, '[\\s-]+')}(?=\\s|$)`, 'i')
  return muster.test(text) ? text.replace(muster, ' ') : null
}

/**
 * Trennt Linie und technische Zusätze vom Modellnamen.
 *
 * @param bezeichnung Der Untertyp, wie die DAT ihn liefert
 */
export function trenneLinie(bezeichnung: string | null | undefined): Modelltrennung {
  let rest = (bezeichnung ?? '').replace(/\s+/g, ' ').trim()
  if (!rest) return { modell: '', linie: null, entfernt: [] }

  let linie: string | null = null
  for (const kandidat of LINIEN) {
    const ohne = schneide(rest, kandidat)
    if (ohne !== null) {
      linie = kandidat
      rest = ohne
      break
    }
  }

  const entfernt: string[] = []
  for (const kandidat of ZUSAETZE) {
    const ohne = schneide(rest, kandidat)
    if (ohne !== null) {
      entfernt.push(kandidat)
      rest = ohne
    }
  }

  return { modell: rest.replace(/\s+/g, ' ').trim(), linie, entfernt }
}
