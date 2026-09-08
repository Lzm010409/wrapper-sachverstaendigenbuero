import { dealFelder, monetaerWert, phasenNamen, pipedrive } from '@/pipedrive/client'
import { protokolliereFehler } from '@/protokoll'

/**
 * Die Datenschicht des Reiters „Vorgang" — der Blick nach Pipedrive.
 *
 * Bewusst getrennt von `ansicht.ts`: das hier ist ein Aufruf über das Netz
 * an ein fremdes System. Er hat fünf Ausgänge, die für den Benutzer etwas
 * völlig Verschiedenes bedeuten, und deshalb auch fünf Namen bekommen:
 *
 * | `stand` | heisst |
 * | --- | --- |
 * | `gefunden` | Es gibt genau einen Deal, hier sind seine Werte |
 * | `ohne_treffer` | Pipedrive antwortet, kennt aber kein solches Aktenzeichen |
 * | `mehrdeutig` | Mehr als ein offener Deal trägt dieses Aktenzeichen als Titel |
 * | `nicht_eingerichtet` | Auf diesem Server ist gar kein Zugang hinterlegt |
 * | `fehler` | Pipedrive war nicht erreichbar oder hat abgelehnt |
 *
 * Vorher fielen die letzten vier in der Oberfläche zu einem „kein Deal
 * gefunden" zusammen. Das ist die gefährlichste der fünf Aussagen: Wer sie
 * liest, schliesst daraus, dass der Vorgang nicht in Pipedrive steht — und
 * legt ihn womöglich ein zweites Mal an.
 */

export type VorgangStand = 'gefunden' | 'ohne_treffer' | 'mehrdeutig' | 'nicht_eingerichtet' | 'fehler'

export interface VorgangAnsicht {
  stand: VorgangStand
  /** Nur bei `stand === 'gefunden'` gesetzt. */
  deal?: {
    /** Die Pipedrive-Deal-ID — Grundlage für Notizen und Mails im selben Reiter. */
    dealId: number
    titel: string | null
    phase: string
    schadenhoeheBrutto: number | undefined
    ausgebuchterBetrag: number | undefined
    sevdeskRechnungId: string | null
  }
  /** Nur bei `stand === 'mehrdeutig'`: die widersprüchlichen Treffer. */
  treffer?: { id: number; title: string | null }[]
  /** Nur bei `stand === 'fehler'`: die Meldung, unverändert. */
  meldung?: string
}

export async function ladeVorgang(aktenzeichen: string | null): Promise<VorgangAnsicht> {
  if (!process.env.PIPEDRIVE_API_TOKEN) return { stand: 'nicht_eingerichtet' }
  if (!aktenzeichen?.trim()) return { stand: 'ohne_treffer' }

  let ergebnis
  try {
    ergebnis = await pipedrive.findeDeal(aktenzeichen)
  } catch (fehler) {
    // Vorher ging dieser Fehler ausschliesslich an die Oberfläche und stand
    // nirgends im Protokoll: ein dauerhaft kaputtes Pipedrive sah aus wie
    // ein Anzeigeproblem und wurde nie untersucht.
    const kennung = protokolliereFehler('pipedrive.findeDeal', 'Pipedrive war nicht erreichbar.', fehler, {
      dienst: 'pipedrive',
      aktenzeichen,
    })
    return {
      stand: 'fehler',
      meldung: `${fehler instanceof Error ? fehler.message : String(fehler)} (Kennung ${kennung})`,
    }
  }

  if (ergebnis.art === 'ohne_treffer') return { stand: 'ohne_treffer' }
  if (ergebnis.art === 'mehrdeutig') return { stand: 'mehrdeutig', treffer: ergebnis.treffer }

  const deal = ergebnis.deal
  const felder = deal.custom_fields ?? {}
  return {
    stand: 'gefunden',
    deal: {
      dealId: deal.id,
      titel: deal.title ?? null,
      phase: phasenNamen[deal.stage_id ?? -1] ?? 'unbekannt',
      schadenhoeheBrutto: monetaerWert(felder[dealFelder.schadenhoeheBrutto]),
      ausgebuchterBetrag: monetaerWert(felder[dealFelder.ausgebuchterBetrag]),
      sevdeskRechnungId: textOderNull(felder[dealFelder.sevdeskRechnungId]),
    },
  }
}

function textOderNull(wert: unknown): string | null {
  return typeof wert === 'string' && wert.trim() ? wert : null
}
