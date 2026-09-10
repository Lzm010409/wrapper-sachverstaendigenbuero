import type { Gutachten } from '@/autoixpert/typen'
import type { VxsDaten } from '@/autoixpert/vxs'
import { baureiheAusVxs, modellVorschlagAusVxs } from '@/autoixpert/vxs'
import { ausstattungAusVxs, linieAus, type Ausstattungsvorschlag } from './ausstattung'
import { bauartAusShape, type Bauart } from './karosserie'
import { trenneLinie } from './linie'
import { toEzMonat } from './params'

/**
 * Was die DAT-Kalkulation zur Vergleichsfahrzeugsuche beisteuert, das im
 * Gutachten-Objekt nicht steht.
 *
 * Am echten Fall 0926/2081TG nebeneinandergelegt:
 *
 * | Angabe | Gutachten-Objekt | DAT-Kalkulation |
 * | --- | --- | --- |
 * | Modell | `E Limousine (BM 213)` | **`E 53 AMG 4Matic+`** |
 * | Leistung | 320 kW | 320 kW |
 * | Laufleistung | 147.441 km | 147.441 km |
 * | Erstzulassung | 2018-10-12 | 2018-10-12 |
 * | Getriebe | — | **Automatik, 9 Stufen** |
 * | Türen | — | **4** |
 * | Ausstattung | **kein Feld** | **66 Sonder-, 50 Serienpositionen** |
 *
 * Die drei fett gesetzten Zeilen sind der Grund für diese Datei. Das Modell
 * entscheidet, ob die Suche etwas taugt — eine Suche nach der Baureihe mischt
 * 143-kW-Diesel mit einem 320-kW-AMG. Die Ausstattung filtert den Korb hart
 * und musste bisher von Hand eingetippt werden.
 *
 * **Nichts wird stillschweigend übernommen.** Jede Angabe trägt ihre
 * Herkunft, und wo Gutachten und DAT verschiedene Zahlen nennen, steht das
 * als Abweichung da statt sich zu einer Zahl zu verschweigen.
 */

export interface Angabe<T> {
  wert: T
  quelle: 'gutachten' | 'dat'
  /** Bei `dat`: der Wert, wie DAT ihn schreibt. */
  beleg?: string
}

export interface Abweichung {
  feld: string
  ausGutachten: string
  ausDat: string
}

export interface WbwVorschlag {
  /** Der Untertyp für die Portalsuche, z. B. `E 53 AMG 4Matic+`. */
  modell: Angabe<string> | null
  /** Die Baureihe für Portale ohne Motorvarianten, z. B. `E-Klasse`. */
  baureihe: string | null
  leistungKw: Angabe<number> | null
  laufleistung: Angabe<number> | null
  /** `MM/JJJJ`. */
  ez: Angabe<string> | null
  getriebe: Angabe<'Automatik' | 'Manuell'> | null
  tueren: Angabe<number> | null
  bauart: Bauart | null
  farbe: string | null
  /** Die Ausstattungslinie, z. B. `AMG-Line` — sonst `null`. */
  linie: string | null
  ausstattung: Ausstattungsvorschlag
  /** Wo Gutachten und DAT nicht dasselbe sagen. */
  abweichungen: Abweichung[]
}

/** DAT schreibt `automatic` / `manual`; das Plugin will Deutsch. */
export function getriebeAusDat(wert: string | null): 'Automatik' | 'Manuell' | null {
  if (!wert) return null
  const w = wert.trim().toLowerCase()
  if (w.startsWith('automat')) return 'Automatik'
  if (w.startsWith('manual') || w.startsWith('manuell') || w.startsWith('schalt')) return 'Manuell'
  return null
}

/** Die belastbarste Laufleistung des Gutachtens: abgelesen vor angegeben vor geschätzt. */
function laufleistungAusGutachten(gutachten: Gutachten): number | null {
  const car = gutachten.car ?? {}
  return car.mileage_meter ?? car.mileage_as_stated ?? car.mileage_estimated ?? null
}

/**
 * Nimmt die Angabe des Gutachtens, wo es eine hat, sonst die der DAT — und
 * merkt sich, wenn beide etwas Verschiedenes sagen.
 */
function waehle<T>(
  feld: string,
  ausGutachten: T | null | undefined,
  ausDat: T | null | undefined,
  abweichungen: Abweichung[],
  anzeige: (wert: T) => string = String,
): Angabe<T> | null {
  if (ausGutachten != null && ausDat != null && ausGutachten !== ausDat) {
    abweichungen.push({ feld, ausGutachten: anzeige(ausGutachten), ausDat: anzeige(ausDat) })
  }
  // Das Gutachten hat Vorrang: dort steht, was der Sachverständige aufgenommen
  // hat. Die Kalkulation kann älter sein als die Besichtigung.
  if (ausGutachten != null) return { wert: ausGutachten, quelle: 'gutachten' }
  if (ausDat != null) return { wert: ausDat, quelle: 'dat', beleg: anzeige(ausDat) }
  return null
}

export function vorschlagAusVxs(gutachten: Gutachten, daten: VxsDaten): WbwVorschlag {
  const car = gutachten.car ?? {}
  const abweichungen: Abweichung[] = []

  const untertyp = modellVorschlagAusVxs(daten)
  const getriebe = getriebeAusDat(daten.fahrzeug.getriebe)
  const baureihe = baureiheAusVxs(daten)

  /*
    Die DAT liefert als Untertyp bisweilen die Ausstattungslinie statt des
    Fahrzeugs — am 08.09.2026 stand dort „Highline BMT". Ein solcher Suchbegriff
    kostet AutoScout24 komplett: das Portal kennt ihn nicht, lässt ihn
    stillschweigend fallen und sucht über die ganze Marke. Die Linie wandert
    deshalb ins Variantenfeld, und bleibt kein Modell übrig, tritt die Baureihe
    an seine Stelle. Der Beleg zeigt weiter, was die DAT geschrieben hat.
  */
  const getrennt = trenneLinie(untertyp)
  const modellwert = getrennt.modell || baureihe

  return {
    // Das Modell kommt bewusst **nur** aus der DAT: das Gutachten-Objekt
    // führt hier die Baureihe, und die ist als Suchbegriff zu grob.
    modell: modellwert
      ? { wert: modellwert, quelle: 'dat', beleg: daten.fahrzeug.untertyp ?? untertyp ?? modellwert }
      : null,
    baureihe,
    leistungKw: waehle(
      'Leistung',
      car.performance_kw ?? null,
      daten.fahrzeug.leistungKw,
      abweichungen,
      (w) => `${w} kW`,
    ),
    laufleistung: waehle(
      'Laufleistung',
      laufleistungAusGutachten(gutachten),
      daten.fahrzeug.laufleistung,
      abweichungen,
      (w) => `${w.toLocaleString('de-DE')} km`,
    ),
    ez: waehle(
      'Erstzulassung',
      toEzMonat(car.first_registration_date ?? undefined) || null,
      daten.fahrzeug.erstzulassung ? toEzMonat(daten.fahrzeug.erstzulassung) : null,
      abweichungen,
    ),
    // Getriebe und Türen kennt das Gutachten-Objekt nicht — hier kann nur
    // die DAT etwas beitragen.
    getriebe: getriebe ? { wert: getriebe, quelle: 'dat', beleg: daten.fahrzeug.getriebe ?? '' } : null,
    tueren: daten.fahrzeug.tueren
      ? { wert: daten.fahrzeug.tueren, quelle: 'dat', beleg: String(daten.fahrzeug.tueren) }
      : null,
    bauart: bauartAusShape(car.shape),
    farbe: daten.fahrzeug.farbe,
    // Die Linie aus dem Modellfeld ist die genauere: sie steht am Fahrzeug,
    // nicht in einer Ausstattungszeile, die auch ein Paket meinen kann.
    linie: getrennt.linie ?? linieAus(daten),
    ausstattung: ausstattungAusVxs(daten),
    abweichungen,
  }
}
