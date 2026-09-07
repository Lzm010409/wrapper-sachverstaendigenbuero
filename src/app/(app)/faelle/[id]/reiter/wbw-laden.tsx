import type { Gutachten } from '@/autoixpert/typen'
import { ladeKalkulation } from '@/fall/kalkulation'
import { vorschlagAusVxs, type WbwVorschlag } from '@/wbw/vorschlag'
import { WbwReiter } from './wbw'

/**
 * Holt die DAT-Kalkulation und macht daraus den Vorschlag für die
 * Vergleichsfahrzeugsuche.
 *
 * **Warum eine eigene Datei:** `wbw.tsx` ist eine Client-Komponente — dort
 * darf kein Abruf über das Netz stehen. Hier wird auf dem Server geladen und
 * fertig hinübergereicht; die Trennung zwischen Daten und Oberfläche bleibt,
 * wo sie hingehört.
 */
export async function WbwReiterMitVorschlag({ gutachten }: { gutachten: Gutachten }) {
  const kalkulation = await ladeKalkulation(gutachten)

  let vorschlag: WbwVorschlag | null = null
  if (kalkulation.stand === 'gefunden' && kalkulation.daten) {
    vorschlag = vorschlagAusVxs(gutachten, kalkulation.daten)
  }

  return (
    <WbwReiter gutachten={gutachten} vorschlag={vorschlag} kalkulationsstand={kalkulation.stand} />
  )
}
