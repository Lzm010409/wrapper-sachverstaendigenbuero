import { clientAusUmgebung } from '@/autoixpert/client'
import { leseVxs, type VxsDaten } from '@/autoixpert/vxs'
import type { Gutachten } from '@/autoixpert/typen'

/**
 * Die Datenschicht des Reiters „Kalkulation" — die DAT-Kalkulation aus
 * autoiXpert.
 *
 * `GET /reports/{id}/vxs` liefert sie im DAT-Format. Sie trägt die
 * Reparaturkosten, die Lohn- und Materialanteile und die Mehrwertsteuer —
 * die Dokumentation der Schnittstelle führt Kalkulationsergebnisse unter
 * „Zukünftige Erweiterungen", über die VXS sind sie längst zu haben.
 *
 * Dieselbe Datei hat den Untertyp geliefert, mit dem die
 * Vergleichsfahrzeugsuche arbeitet. Sie wird hier **ein zweites Mal** und
 * für einen anderen Zweck gelesen — nicht nur für die WBW-Suche.
 *
 * Wie beim Reiter „Vorgang" hat der Abruf mehrere Ausgänge, und sie bedeuten
 * für den Sachverständigen Verschiedenes:
 *
 * | `stand` | heisst |
 * | --- | --- |
 * | `gefunden` | Es gibt eine Kalkulation, hier sind ihre Zahlen |
 * | `ohne_kalkulation` | autoiXpert antwortet, hat aber keine — das ist bei vielen Gutachten normal |
 * | `nicht_eingerichtet` | Auf diesem Server ist kein autoiXpert-Zugang hinterlegt |
 * | `fehler` | autoiXpert war nicht erreichbar oder hat abgelehnt |
 *
 * „Keine Kalkulation" und „nicht abrufbar" dürfen nicht dasselbe anzeigen:
 * im ersten Fall gibt es nichts zu holen, im zweiten fehlt etwas.
 */

export type KalkulationStand = 'gefunden' | 'ohne_kalkulation' | 'nicht_eingerichtet' | 'fehler'

export interface KalkulationAnsicht {
  stand: KalkulationStand
  /** Nur bei `stand === 'gefunden'`. */
  daten?: VxsDaten
  /** Nur bei `stand === 'fehler'`: die Meldung, unverändert. */
  meldung?: string
}

/**
 * Der Bezeichner, unter dem das Gutachten abrufbar ist.
 *
 * Die externe ID ist die des Büros und in der URL erlaubt; sie steht auch
 * dann, wenn die interne ID einmal fehlt. Vorrang hat die interne, weil sie
 * immer eindeutig ist.
 */
export function abrufkennung(gutachten: Gutachten): string | null {
  return gutachten.id || gutachten.external_id || null
}

export async function ladeKalkulation(
  gutachten: Gutachten | null,
): Promise<KalkulationAnsicht> {
  const client = clientAusUmgebung()
  if (!client) return { stand: 'nicht_eingerichtet' }
  if (!gutachten) return { stand: 'ohne_kalkulation' }

  const kennung = abrufkennung(gutachten)
  if (!kennung) return { stand: 'ohne_kalkulation' }

  let xml: string | null
  try {
    xml = await client.holeVxs(kennung)
  } catch (fehler) {
    return { stand: 'fehler', meldung: fehler instanceof Error ? fehler.message : String(fehler) }
  }

  if (!xml) return { stand: 'ohne_kalkulation' }

  const daten = leseVxs(xml)
  // Eine Datei ohne jede Zahl ist keine Kalkulation, auch wenn sie ankam.
  const hatZahlen = Object.values(daten.kalkulation).some((w) => w !== null)
  const hatFahrzeug = Object.values(daten.fahrzeug).some((w) => w !== null)
  if (!hatZahlen && !hatFahrzeug) return { stand: 'ohne_kalkulation' }

  return { stand: 'gefunden', daten }
}
