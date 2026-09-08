import 'server-only'
import Anthropic from '@anthropic-ai/sdk'

/**
 * Zugang zum Sprachmodell.
 *
 * Die Anwendung ruft das Modell an vier eng begrenzten Stellen auf
 * (Konzept E1). Jeder Aufruf gibt eine Werkzeugdefinition vor und bekommt
 * dadurch eine geprüfte Struktur zurück statt Fliesstext.
 *
 * Das Modell wird je Aufgabe gewählt: Extraktion und Einstufung sind
 * mechanisch und laufen auf dem schnellen Modell, das Ausformulieren
 * verlangt Sprachgefühl.
 */

export const MODELLE = {
  /** Belege lesen, Positionen erkennen, einstufen. */
  schnell: 'claude-haiku-4-5-20251001',
  /** Ausformulieren im Hausstil. */
  formulieren: 'claude-sonnet-5',
  /** Bibliotheksarbeit, Kanonisieren, Dubletten beurteilen. */
  gruendlich: 'claude-opus-5',
} as const

export class KiFehler extends Error {
  constructor(
    nachricht: string,
    readonly ursache?: unknown,
  ) {
    super(nachricht)
    this.name = 'KiFehler'
  }
}

let zwischenspeicher: Anthropic | null = null

export function kiVerfuegbar(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY)
}

export function holeClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    throw new KiFehler(
      'Die KI-Funktionen sind nicht eingerichtet. Bitte ANTHROPIC_API_KEY in den ' +
        'Umgebungsvariablen hinterlegen.',
    )
  }
  zwischenspeicher ??= new Anthropic({ apiKey, maxRetries: 2 })
  return zwischenspeicher
}

export interface WerkzeugDefinition {
  name: string
  description: string
  input_schema: {
    type: 'object'
    properties: Record<string, unknown>
    required?: string[]
    additionalProperties?: boolean
  }
  /**
   * Erzwingt, dass die Werkzeugeingabe dem Schema genügt.
   *
   * Verlangt `additionalProperties: false` und `required` im Schema. Ohne das
   * ist die Rückgabe nur „meistens" schemakonform, und die Prüfung mit Zod
   * an der Aufrufstelle wird zur Fehlerquelle statt zur Absicherung.
   */
  strict?: boolean
}

export interface InhaltsBlock {
  type: 'text' | 'image'
  text?: string
  source?: { type: 'base64'; media_type: 'image/jpeg' | 'image/png'; data: string }
}

/**
 * Ruft das Modell auf und erzwingt die Antwort über eine Werkzeugdefinition.
 *
 * Die Rückgabe ist die rohe Werkzeugeingabe; die Prüfung gegen das
 * Zod-Schema übernimmt die aufrufende Stelle, damit dort auch die
 * Fehlermeldung formuliert werden kann.
 */
export async function rufeMitWerkzeugAuf(optionen: {
  modell: string
  system: string
  inhalt: InhaltsBlock[]
  werkzeug: WerkzeugDefinition
  maxTokens?: number
}): Promise<unknown> {
  const client = holeClient()

  let antwort
  try {
    antwort = await client.messages.create({
      model: optionen.modell,
      max_tokens: optionen.maxTokens ?? 8000,
      system: optionen.system,
      tools: [optionen.werkzeug as never],
      tool_choice: { type: 'tool', name: optionen.werkzeug.name },
      messages: [{ role: 'user', content: optionen.inhalt as never }],
    })
  } catch (fehler) {
    throw new KiFehler(
      `Das Sprachmodell antwortete nicht: ${fehler instanceof Error ? fehler.message : String(fehler)}`,
      fehler,
    )
  }

  const block = antwort.content.find((b) => b.type === 'tool_use')
  if (!block || block.type !== 'tool_use') {
    throw new KiFehler('Das Modell hat keine strukturierte Antwort geliefert.')
  }

  return block.input
}

/**
 * Ruft das Modell für Fliesstext auf.
 *
 * `vorlaufText` wird als Beginn der Antwort vorgegeben. Das hält das Modell
 * davon ab, mit einer Einleitung wie „Gerne, hier ist …" zu beginnen — im
 * fertigen Schreiben wäre das ein Fremdkörper.
 */
export async function rufeFuerTextAuf(optionen: {
  modell: string
  system: string
  auftrag: string
  vorlaufText?: string
  maxTokens?: number
}): Promise<string> {
  const client = holeClient()

  const nachrichten: { role: 'user' | 'assistant'; content: string }[] = [
    { role: 'user', content: optionen.auftrag },
  ]
  if (optionen.vorlaufText) {
    nachrichten.push({ role: 'assistant', content: optionen.vorlaufText })
  }

  try {
    const antwort = await client.messages.create({
      model: optionen.modell,
      max_tokens: optionen.maxTokens ?? 4000,
      system: optionen.system,
      messages: nachrichten,
    })
    const text = antwort.content
      .filter((b) => b.type === 'text')
      .map((b) => (b.type === 'text' ? b.text : ''))
      .join('')
    return ((optionen.vorlaufText ?? '') + text).trim()
  } catch (fehler) {
    throw new KiFehler(
      `Das Sprachmodell antwortete nicht: ${fehler instanceof Error ? fehler.message : String(fehler)}`,
      fehler,
    )
  }
}
