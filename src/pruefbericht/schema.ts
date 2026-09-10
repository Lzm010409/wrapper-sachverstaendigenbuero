import { z } from 'zod'

/**
 * Struktur der Positionsextraktion.
 *
 * Das Schema ist zugleich die Vorgabe an das Modell: es wird als
 * Werkzeugdefinition mitgeschickt, sodass die Antwort geprüft ankommt
 * statt aus Fliesstext gelesen werden zu müssen.
 */

export const KUERZUNGSTYPEN = [
  'kalkulation',
  'wertminderung',
  'wbw',
  'restwert',
  'sachverstaendigenhonorar',
  'nutzungsausfall',
  'sonstiges',
] as const

export type Kuerzungstyp = (typeof KUERZUNGSTYPEN)[number]

/**
 * Abschnitte eines Dokumentbündels.
 *
 * Der Skill verlangt ausdrücklich, unfallfremde Abschnitte zu erkennen und
 * von der Bearbeitung auszunehmen (Sonderfall B.1). Beide vorliegenden
 * Testdokumente sind solche Bündel: die HUK-Sendung enthält neben dem
 * DEKRA-Prüfbericht eine Kürzung des Sachverständigenhonorars.
 */
export const abschnittSchema = z.object({
  bezeichnung: z.string().describe('Kurze Bezeichnung des Abschnitts'),
  typ: z.enum(KUERZUNGSTYPEN),
  seiteVon: z.number().int().min(1),
  seiteBis: z.number().int().min(1),
  fuerStellungnahmeRelevant: z
    .boolean()
    .describe('false bei unfallfremden Abschnitten wie Sachverständigenhonorar'),
  begruendung: z.string().describe('Warum dieser Abschnitt so eingeordnet wurde'),
})

export const positionSchema = z.object({
  bezeichnung: z.string().describe('Bauteil oder Kürzungsgrund, kurz'),
  typ: z.enum(KUERZUNGSTYPEN),
  betragGutachten: z.number().nullable().describe('Betrag laut Gutachten in Euro, netto'),
  betragGekuerzt: z.number().nullable().describe('Betrag nach Prüfung in Euro, netto'),
  begruendungVersicherer: z
    .string()
    .describe('Wörtlich oder sinngemäß, was der Prüfdienstleister vorbringt'),
  seite: z.number().int().min(1).nullable(),
  /**
   * Mehrere Kalkulationszeilen können auf eine Prüfentscheidung zurückgehen.
   * Der Skill verlangt, sie zu einer Position zusammenzufassen.
   */
  zusammengefassteZeilen: z.array(z.string()).default([]),
})

export const extraktionSchema = z.object({
  pruefdienstleister: z
    .string()
    .nullable()
    .describe('z.B. DEKRA, ControlExpert, ClaimsControlling, LOGICHECK; null wenn unklar'),
  versicherer: z.string().nullable(),
  schadennummer: z.string().nullable(),
  aktenzeichen: z.string().nullable().describe('Aktenzeichen des Sachverständigenbüros'),
  pruefdatum: z.string().nullable().describe('ISO-Datum, falls angegeben'),
  fahrzeug: z.string().nullable().describe('Hersteller, Modell und Kennzeichen, soweit genannt'),

  summeGutachten: z.number().nullable().describe('Reparaturkosten laut Gutachten, netto'),
  summeGekuerzt: z.number().nullable().describe('Reparaturkosten nach Prüfung, netto'),

  abschnitte: z.array(abschnittSchema),
  positionen: z.array(positionSchema),

  /** Was das Modell nicht sicher lesen konnte — wird dem Nutzer angezeigt. */
  unklarheiten: z.array(z.string()).default([]),
})

export type Abschnitt = z.infer<typeof abschnittSchema>
export type ExtrahiertePosition = z.infer<typeof positionSchema>
export type Extraktion = z.infer<typeof extraktionSchema>

/** Differenz einer Position, sofern beide Beträge vorliegen. */
export function differenz(p: ExtrahiertePosition): number | null {
  if (p.betragGutachten === null || p.betragGekuerzt === null) return null
  return Math.round((p.betragGutachten - p.betragGekuerzt) * 100) / 100
}

/** Summe aller Kürzungen, über die eine Stellungnahme geschrieben wird. */
export function gesamtdifferenz(positionen: ExtrahiertePosition[]): number {
  const summe = positionen.reduce((s, p) => s + (differenz(p) ?? 0), 0)
  return Math.round(summe * 100) / 100
}

/**
 * JSON-Schema für die Werkzeugdefinition des Modells.
 *
 * Handgeschrieben statt aus Zod erzeugt: die Beschreibungen sind hier die
 * eigentliche Anweisung an das Modell und sollen bewusst formuliert sein.
 */
export const EXTRAKTION_WERKZEUG = {
  name: 'kuerzungspositionen_melden',
  description:
    'Meldet die im Prüfbericht enthaltenen Kürzungspositionen und die Gliederung des Dokuments.',
  input_schema: {
    type: 'object' as const,
    properties: {
      pruefdienstleister: {
        type: ['string', 'null'],
        description:
          'Name des Prüfdienstleisters, z.B. DEKRA, ControlExpert, ClaimsControlling, LOGICHECK. null, wenn nicht erkennbar.',
      },
      versicherer: { type: ['string', 'null'], description: 'Name der Versicherung.' },
      schadennummer: { type: ['string', 'null'] },
      aktenzeichen: {
        type: ['string', 'null'],
        description: 'Aktenzeichen des Sachverständigenbüros, oft als „Ihr Az." bezeichnet.',
      },
      pruefdatum: { type: ['string', 'null'], description: 'ISO-Datum JJJJ-MM-TT.' },
      fahrzeug: { type: ['string', 'null'] },
      summeGutachten: {
        type: ['number', 'null'],
        description: 'Reparaturkosten laut Gutachten in Euro, netto.',
      },
      summeGekuerzt: {
        type: ['number', 'null'],
        description: 'Reparaturkosten nach der Prüfung in Euro, netto.',
      },
      abschnitte: {
        type: 'array',
        description:
          'Gliederung des Dokuments. Sendungen der Versicherer bündeln häufig mehrere ' +
          'Vorgänge: Abrechnungsschreiben, Prüfbericht zur Kalkulation, Prüfung des ' +
          'Sachverständigenhonorars, Nutzungsausfall. Jeder Abschnitt wird einzeln gemeldet.',
        items: {
          type: 'object',
          properties: {
            bezeichnung: { type: 'string' },
            typ: { type: 'string', enum: [...KUERZUNGSTYPEN] },
            seiteVon: { type: 'integer' },
            seiteBis: { type: 'integer' },
            fuerStellungnahmeRelevant: {
              type: 'boolean',
              description:
                'false für unfallfremde Abschnitte — insbesondere die Prüfung des ' +
                'Sachverständigenhonorars und Nutzungsausfall.',
            },
            begruendung: { type: 'string' },
          },
          required: [
            'bezeichnung',
            'typ',
            'seiteVon',
            'seiteBis',
            'fuerStellungnahmeRelevant',
            'begruendung',
          ],
        },
      },
      positionen: {
        type: 'array',
        description:
          'Jede einzelne Kürzungsposition. Mehrere Kalkulationszeilen, die auf dieselbe ' +
          'Entscheidung des Prüfdienstleisters zurückgehen (etwa mehrere Lohn- und ' +
          'Lackierzeilen aus einer einzigen Beilackierungs-Streichung), werden zu EINER ' +
          'Position zusammengefasst und die Einzelzeilen unter zusammengefassteZeilen ' +
          'aufgeführt. Beträge immer netto und ohne Währungszeichen.',
        items: {
          type: 'object',
          properties: {
            bezeichnung: { type: 'string' },
            typ: { type: 'string', enum: [...KUERZUNGSTYPEN] },
            betragGutachten: { type: ['number', 'null'] },
            betragGekuerzt: { type: ['number', 'null'] },
            begruendungVersicherer: {
              type: 'string',
              description:
                'Was der Prüfdienstleister vorbringt — möglichst wörtlich. Diese Begründung ' +
                'bestimmt später, welches Gegenargument passt, nicht der Bauteilname.',
            },
            seite: { type: ['integer', 'null'] },
            zusammengefassteZeilen: { type: 'array', items: { type: 'string' } },
          },
          required: [
            'bezeichnung',
            'typ',
            'betragGutachten',
            'betragGekuerzt',
            'begruendungVersicherer',
            'seite',
            'zusammengefassteZeilen',
          ],
        },
      },
      unklarheiten: {
        type: 'array',
        items: { type: 'string' },
        description:
          'Alles, was nicht zweifelsfrei lesbar war. Lieber hier vermerken als raten — ' +
          'ein falscher Betrag im Schreiben wiegt schwerer als eine offene Rückfrage.',
      },
    },
    required: [
      'pruefdienstleister',
      'versicherer',
      'schadennummer',
      'aktenzeichen',
      'pruefdatum',
      'fahrzeug',
      'summeGutachten',
      'summeGekuerzt',
      'abschnitte',
      'positionen',
      'unklarheiten',
    ],
  },
}
