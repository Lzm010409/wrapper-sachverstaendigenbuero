import { z } from 'zod'

/**
 * Struktur der Kalkulationsauswertung.
 *
 * Anders als `src/pruefbericht/schema.ts` geht es hier nicht um Kürzungen,
 * sondern um die Kalkulation selbst, so wie das Gutachten sie ausweist —
 * die Grundlage, gegen die eine Kürzungsposition später abgeglichen wird
 * (`src/stellungnahme/kalkulationsabgleich.ts`). Das Schema ist zugleich die
 * Vorgabe an das Modell: es wird als Werkzeugdefinition mitgeschickt.
 */

export const kalkulationszeileSchema = z.object({
  bezeichnung: z
    .string()
    .describe('Positionsbezeichnung aus der Kalkulation, möglichst wörtlich, z.B. "Lohn Lackierung Stoßfänger vorne"'),
  betrag: z.number().describe('Betrag dieser Zeile in Euro, netto'),
})

export type Kalkulationszeile = z.infer<typeof kalkulationszeileSchema>

export const gutachtenKalkulationSchema = z.object({
  zeilen: z.array(kalkulationszeileSchema),
  summeNetto: z
    .number()
    .nullable()
    .describe('Gesamtsumme der Reparaturkosten laut Kalkulation, netto — falls ausgewiesen'),
  /** Was das Modell nicht sicher lesen konnte — wird dem Nutzer angezeigt. */
  unklarheiten: z.array(z.string()).default([]),
})

export type GutachtenKalkulation = z.infer<typeof gutachtenKalkulationSchema>

/**
 * JSON-Schema für die Werkzeugdefinition des Modells.
 *
 * Handgeschrieben statt aus Zod erzeugt, wie in `pruefbericht/schema.ts` —
 * die Beschreibungen sind hier die eigentliche Anweisung an das Modell.
 */
export const GUTACHTENKALKULATION_WERKZEUG = {
  name: 'kalkulationszeilen_melden',
  description: 'Meldet die einzelnen Positionen der Reparaturkosten-Kalkulation eines Gutachtens.',
  input_schema: {
    type: 'object' as const,
    properties: {
      zeilen: {
        type: 'array',
        description:
          'Jede Einzelposition der Kalkulation — Lohnpositionen, Ersatzteile, Lackmaterial, ' +
          'Nebenkosten, jeweils einzeln und mit dem Wortlaut der Kalkulation. Kopf-, ' +
          'Zwischen- und Gesamtsummen gehören NICHT hierher, nur summeNetto trägt die ' +
          'Gesamtsumme.',
        items: {
          type: 'object',
          properties: {
            bezeichnung: { type: 'string' },
            betrag: { type: 'number' },
          },
          required: ['bezeichnung', 'betrag'],
        },
      },
      summeNetto: {
        type: ['number', 'null'],
        description: 'Die Gesamtsumme der Reparaturkosten, netto, falls in der Kalkulation ausgewiesen.',
      },
      unklarheiten: {
        type: 'array',
        items: { type: 'string' },
        description: 'Alles, was nicht zweifelsfrei lesbar war. Lieber vermerken als raten.',
      },
    },
    required: ['zeilen', 'summeNetto', 'unklarheiten'],
  },
}
