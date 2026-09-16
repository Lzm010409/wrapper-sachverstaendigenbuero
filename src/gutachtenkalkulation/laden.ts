import 'server-only'
import type { AutoixpertClient } from '@/autoixpert/client'
import { leseBericht } from '@/pruefbericht/einlesen'
import { extrahiereKalkulation } from './extraktion'
import type { GutachtenKalkulation } from './schema'

/**
 * Lädt und liest die Kalkulation eines Gutachtens direkt bei autoiXpert.
 *
 * **Reihenfolge der Quelle** (abgestimmte Entscheidung): erst die
 * DAT-Schadenskalkulation, weil sie die Zahlen tabellarisch und ohne
 * Fließtext drumherum trägt — das liest sich zuverlässiger aus als das
 * volle Gutachten-PDF. Fehlt sie (nicht jedes Gutachten hat einen
 * DAT-Zugang), wird ersatzweise das Gutachten selbst gelesen.
 *
 * Die Prüfung, ob eine DAT-Kalkulation vorliegt, läuft über die
 * Dokumentliste (`GET /documents`) statt über einen Download-Versuch ins
 * Blaue — ein 404 auf einen Typ, den es für dieses Gutachten nicht gibt,
 * ist in der Dokumentation nicht als Verhalten festgehalten, die Liste
 * dagegen schon.
 *
 * Ergebnis wird **nicht** hier zwischengespeichert — das übernimmt
 * `src/gutachtenkalkulation/cache.ts`, die einzige Stelle, die die
 * Datenbank berührt.
 */

export type Kalkulationsquelle = 'dat_damage_calculation' | 'report'

export interface GeladeneKalkulation extends GutachtenKalkulation {
  quelle: Kalkulationsquelle
}

export async function ladeGutachtenKalkulation(
  client: AutoixpertClient,
  reportId: string,
): Promise<GeladeneKalkulation> {
  const dokumente = await client.holeDokumente(reportId)
  const hatDatKalkulation = dokumente.some((d) => d.type === 'dat_damage_calculation')
  const quelle: Kalkulationsquelle = hatDatKalkulation ? 'dat_damage_calculation' : 'report'

  const pdf = await client.holeDokumentDatei(reportId, quelle)
  const bericht = await leseBericht(pdf)
  const { kalkulation } = await extrahiereKalkulation(bericht)

  return { ...kalkulation, quelle }
}
