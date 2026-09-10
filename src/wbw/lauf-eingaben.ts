/**
 * Die Eingaben eines Recherchelaufs — und die Prüfung, ob sie reichen.
 *
 * Bewusst **ohne** `server-only`: die Oberfläche stellt dieselbe Frage wie
 * der Server, bevor sie den Knopf freigibt. Stünde die Prüfung nur im
 * Server, liesse sich ein Lauf anstossen, der sofort wieder abbricht; stünde
 * sie nur im Browser, liesse er sich an der Oberfläche vorbei anstossen.
 * Deshalb einmal hier, benutzt von beiden.
 */
import type { Portal, WbwEingabe } from './lauf'
import type { Kraftstoff } from './portalvokabular'

export interface LaufEingaben {
  /** Der Untertyp als Suchbegriff, z. B. `E 53 AMG 4Matic+`. */
  modell: string
  /** Die Baureihe für Kleinanzeigen, z. B. `E-Klasse`. */
  baureihe: string | null
  marke: string
  variante: string
  ez: string
  laufleistung: number | null
  leistungKw: number | null
  bauart: WbwEingabe['subjekt']['bauart']
  plz: string
  sollAusstattung: string[]
  getriebe?: 'Automatik' | 'Manuell'
  /** Leer heisst: nicht danach filtern. */
  kraftstoff?: Kraftstoff
  tueren?: number
  radiusKm: number
  kmToleranz: number
  ezToleranzJahre: number
  leistungToleranzKw: number
  maxItemsProPortal: number
  portale: Portal[]
  /** Kostenpflichtige Stufen zulassen (Apify). Bewusst je Lauf. */
  kostenpflichtigErlaubt: boolean
}

/** Was fehlt, damit ein Lauf überhaupt sinnvoll ist. */
export function fehlendeLaufangaben(eingaben: LaufEingaben): string[] {
  const fehlt: string[] = []
  if (!eingaben.marke.trim()) fehlt.push('Hersteller')
  if (!eingaben.modell.trim()) fehlt.push('Modell')
  if (!eingaben.ez.trim()) fehlt.push('Erstzulassung')
  if (!eingaben.laufleistung) fehlt.push('Laufleistung')
  if (!eingaben.plz.trim()) fehlt.push('Zentrum-PLZ')
  if (eingaben.portale.length === 0) fehlt.push('mindestens ein Portal')
  return fehlt
}

