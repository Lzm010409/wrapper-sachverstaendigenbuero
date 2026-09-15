import { z } from 'zod'

/**
 * Struktur der Extraktion einer bereits verfassten Stellungnahme.
 *
 * Anders als beim Prüfbericht (`@/pruefbericht/schema`) steht hier kein
 * Befund des Prüfdienstleisters im Mittelpunkt, sondern das fertige
 * Schreiben selbst: Betreff, Anrede, Empfänger und — je Position — die
 * eigene Argumentation, so wie sie im Schreiben steht. Das Schema ist
 * zugleich die Vorgabe an das Modell: es wird als Werkzeugdefinition
 * mitgeschickt, sodass die Antwort geprüft ankommt statt aus Fliesstext
 * gelesen werden zu müssen.
 */

export const importPositionSchema = z.object({
  bezeichnung: z.string().describe('Bauteil oder Kürzungsgrund, kurz'),
  /** Die im Schreiben vorgebrachte Argumentation zu dieser Position, möglichst wörtlich. */
  begruendungstext: z.string().nullable(),
  betragGutachten: z.number().nullable().describe('Betrag laut Gutachten in Euro, netto'),
  betragGekuerzt: z.number().nullable().describe('Betrag nach Kürzung in Euro, netto'),
})

export const importSchema = z.object({
  betreff: z.string().nullable(),
  anrede: z.string().nullable(),
  empfaengerName: z.string().nullable(),
  empfaengerStrasse: z.string().nullable(),
  empfaengerPlzOrt: z.string().nullable(),
  positionen: z.array(importPositionSchema),
  /** Der Schlussabsatz des Schreibens, z.B. die Zusammenfassung der Forderung. */
  ergebnisAbsatz: z.string().nullable(),
  /** Was das Modell nicht sicher lesen konnte — wird dem Nutzer angezeigt. */
  unklarheiten: z.array(z.string()).default([]),
})

export type ImportPosition = z.infer<typeof importPositionSchema>
export type Import = z.infer<typeof importSchema>

/**
 * JSON-Schema für die Werkzeugdefinition des Modells.
 *
 * Handgeschrieben statt aus Zod erzeugt: die Beschreibungen sind hier die
 * eigentliche Anweisung an das Modell und sollen bewusst formuliert sein —
 * dieselbe Entscheidung wie bei `EXTRAKTION_WERKZEUG` in
 * `@/pruefbericht/schema`.
 */
export const IMPORT_WERKZEUG = {
  name: 'stellungnahme_melden',
  description: 'Meldet Betreff, Anrede, Empfänger und Positionen einer verfassten Stellungnahme.',
  input_schema: {
    type: 'object' as const,
    properties: {
      betreff: { type: ['string', 'null'], description: 'Der Betreff des Schreibens.' },
      anrede: { type: ['string', 'null'], description: 'Die Anrede, z.B. „Sehr geehrte Damen und Herren,".' },
      empfaengerName: {
        type: ['string', 'null'],
        description: 'Name des Empfängers — Versicherung, Kanzlei oder Prüfdienstleister.',
      },
      empfaengerStrasse: { type: ['string', 'null'] },
      empfaengerPlzOrt: { type: ['string', 'null'], description: 'Postleitzahl und Ort in einem Feld.' },
      positionen: {
        type: 'array',
        description: 'Jede im Schreiben behandelte Kürzungsposition, in der Reihenfolge des Textes.',
        items: {
          type: 'object',
          properties: {
            bezeichnung: { type: 'string' },
            begruendungstext: {
              type: ['string', 'null'],
              description:
                'Die im Schreiben vorgebrachte Argumentation zu dieser Position, möglichst ' +
                'wörtlich übernommen — sie wird unverändert in den neuen Brief übertragen.',
            },
            betragGutachten: { type: ['number', 'null'] },
            betragGekuerzt: { type: ['number', 'null'] },
          },
          required: ['bezeichnung', 'begruendungstext', 'betragGutachten', 'betragGekuerzt'],
        },
      },
      ergebnisAbsatz: {
        type: ['string', 'null'],
        description: 'Der Schlussabsatz des Schreibens, etwa die zusammengefasste Forderung.',
      },
      unklarheiten: {
        type: 'array',
        items: { type: 'string' },
        description:
          'Alles, was nicht zweifelsfrei lesbar war. Lieber hier vermerken als raten.',
      },
    },
    required: [
      'betreff',
      'anrede',
      'empfaengerName',
      'empfaengerStrasse',
      'empfaengerPlzOrt',
      'positionen',
      'ergebnisAbsatz',
      'unklarheiten',
    ],
  },
}
