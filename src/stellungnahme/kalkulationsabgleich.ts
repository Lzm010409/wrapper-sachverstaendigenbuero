import 'server-only'
import { z } from 'zod'
import { MODELLE, rufeMitWerkzeugAuf } from '@/ki/client'
import type { Kalkulationszeile } from '@/gutachtenkalkulation/schema'

/**
 * Ordnet eine Kürzungsposition den Zeilen der tatsächlichen Kalkulation des
 * zugehörigen Gutachtens zu — der dritte Ausbauschritt rund um
 * Kürzungspositionen: nach dem Import bestehender Stellungnahmen und dem
 * Bearbeiten/Löschen von Positionen jetzt ein Vorschlag für `betragGutachten`,
 * der aus der echten Kalkulation bei autoiXpert kommt statt nur aus dem Text
 * des Versicherer-Schreibens.
 *
 * **Warum ein KI-Aufruf und keine Stichwortsuche wie `treffer.ts`.** Die
 * Bezeichnung einer Kürzungsposition stammt oft aus dem Prüfbericht des
 * Versicherers und ist nicht wortgleich mit der Kalkulation — „UPE-Aufschlag
 * Stoßfänger" im Kürzungsschreiben kann in der Kalkulation als eigene
 * Aufschlagszeile oder als Teil der Ersatzteilzeile stehen. Das ist eine
 * fachliche Zuordnung, kein Stichwortabgleich.
 *
 * **Warum die Summe im Code berechnet wird, nicht vom Modell.** Das Modell
 * meldet nur, WELCHE Kalkulationszeilen passen (als Indizes in die
 * übergebene Liste) — die Summe der Beträge bildet `ermittleKalkulationsvorschlag`
 * selbst, aus den echten Zahlen. Ein Sprachmodell, das eine Zahlensumme
 * selbst ausrechnet, kann sich verrechnen; ein Index in eine feste Liste
 * lässt sich dagegen exakt nachrechnen.
 */

export interface PositionFuerAbgleich {
  bezeichnung: string
  begruendungVersicherer: string | null
}

export interface Kalkulationsvorschlag {
  betrag: number
  begruendung: string
  verwendeteZeilen: Kalkulationszeile[]
}

const SYSTEM = `Du ordnest eine Kürzungsposition aus einer Stellungnahme den Zeilen der
Reparaturkosten-Kalkulation desselben Gutachtens zu.

- Die Bezeichnung der Position stammt oft aus dem Kürzungsschreiben des Versicherers und
  ist nicht wortgleich mit der Kalkulation — ordne nach der Sache, nicht nach dem Wortlaut.
  Die Begründung des Versicherers ist dabei wichtiger als der Bauteilname.
- Mehrere Kalkulationszeilen können zu einer Position gehören, z.B. mehrere Lohn- und
  Lackierzeilen derselben Beilackierung — melde dann alle passenden Zeilen als Treffer.
- Finde sich keine passende Zeile, melde eine leere Trefferliste statt zu raten. Ein
  falscher Vorschlag wiegt schwerer als gar keiner.`

const WERKZEUG = {
  name: 'kalkulationszeilen_zuordnen',
  description: 'Meldet, welche Kalkulationszeilen zu der Kürzungsposition gehören.',
  input_schema: {
    type: 'object' as const,
    properties: {
      treffer: {
        type: 'array',
        description:
          'Die passenden Kalkulationszeilen, als 0-basierter Index in die übergebene Liste, ' +
          'mit kurzem Grund je Zeile. Leer lassen, wenn keine Zeile passt.',
        items: {
          type: 'object',
          properties: {
            index: { type: 'integer' },
            grund: { type: 'string' },
          },
          required: ['index', 'grund'],
        },
      },
      begruendung: {
        type: 'string',
        description: 'Kurze Gesamtbegründung für den Vorschlag, ein bis zwei Sätze.',
      },
    },
    required: ['treffer', 'begruendung'],
  },
}

const abgleichSchema = z.object({
  treffer: z.array(z.object({ index: z.number().int().min(0), grund: z.string() })),
  begruendung: z.string(),
})

function baueInhalt(position: PositionFuerAbgleich, zeilen: Kalkulationszeile[]): string {
  const zeilenText = zeilen
    .map((z, i) => `${i}: ${z.bezeichnung} — ${z.betrag.toFixed(2)} €`)
    .join('\n')

  return (
    `Kürzungsposition:\n` +
    `Bezeichnung: ${position.bezeichnung}\n` +
    `Begründung des Versicherers: ${position.begruendungVersicherer ?? '(keine)'}\n\n` +
    `Kalkulationszeilen dieses Gutachtens:\n${zeilenText}`
  )
}

/**
 * Ermittelt den Vorschlag für `betragGutachten` — oder `null`, wenn sich
 * nichts Passendes findet oder gar keine Kalkulationszeilen vorliegen.
 */
export async function ermittleKalkulationsvorschlag(
  position: PositionFuerAbgleich,
  zeilen: Kalkulationszeile[],
): Promise<Kalkulationsvorschlag | null> {
  if (zeilen.length === 0) return null

  const roh = await rufeMitWerkzeugAuf({
    modell: MODELLE.schnell,
    system: SYSTEM,
    inhalt: [{ type: 'text', text: baueInhalt(position, zeilen) }],
    werkzeug: WERKZEUG,
    maxTokens: 2000,
  })

  const geprueft = abgleichSchema.safeParse(roh)
  if (!geprueft.success) {
    throw new Error(
      'Der Kalkulationsabgleich kam in unerwarteter Form zurück: ' +
        geprueft.error.issues
          .slice(0, 3)
          .map((i) => `${i.path.join('.')} — ${i.message}`)
          .join('; '),
    )
  }

  // Dieselbe Zeile kann das Modell zweimal mit unterschiedlichem Grund
  // melden — ohne die Entdopplung zählte sie doppelt in der Summe.
  const indizes = [...new Set(geprueft.data.treffer.map((t) => t.index))]
  const verwendeteZeilen = indizes.map((i) => zeilen[i]).filter((z): z is Kalkulationszeile => z !== undefined)
  if (verwendeteZeilen.length === 0) return null

  const betrag = Math.round(verwendeteZeilen.reduce((summe, z) => summe + z.betrag, 0) * 100) / 100
  return { betrag, begruendung: geprueft.data.begruendung, verwendeteZeilen }
}
