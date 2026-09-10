import 'server-only'
import Anthropic from '@anthropic-ai/sdk'
import { protokolliereInfo } from '@/protokoll'

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

/**
 * Setzt den Haltepunkt für das Prompt Caching auf die Systemanweisung.
 *
 * Anthropic gleicht den Prompt als Präfix ab: Alles vor dem Haltepunkt wird
 * zwischengespeichert und beim nächsten Aufruf zum Bruchteil des Preises
 * gelesen, alles dahinter jedes Mal neu. Die Reihenfolge ist
 * `tools` → `system` → `messages`, ein Haltepunkt auf dem System-Block hält
 * deshalb Werkzeugdefinition UND Systemanweisung zusammen im Speicher —
 * genau den Teil, der sich zwischen zwei Aufrufen derselben Stelle nicht
 * ändert. Der veränderliche Teil (Prüfbericht, Inserate, Auftrag) steht
 * dahinter.
 *
 * **Warum hier und nicht als `cache_control` auf oberster Ebene der Anfrage.**
 * Die automatische Platzierung setzt den Haltepunkt ans Ende der Anfrage,
 * also hinter den veränderlichen Teil. Der wäre dann bei jeder Anfrage neu zu
 * schreiben — zum 1,25-fachen Preis — und würde nie wieder gelesen. Das
 * Attribut wäre nicht wirkungslos, sondern teurer als gar keines.
 *
 * **Wann es wirkt.** Anthropic legt einen Eintrag erst ab einer Mindestlänge
 * des Präfixes an: 512 Token bei Opus 5, 1024 bei Sonnet 5, 4096 bei
 * Haiku 4.5. Darunter passiert nichts — ohne Fehler, ohne Hinweis, nur
 * `cache_creation_input_tokens: 0`. Nach Werkzeug plus Systemanweisung
 * geschätzt:
 *
 * | Aufrufstelle              | Modell   | Präfix | Schwelle | greift        |
 * |---------------------------|----------|--------|----------|---------------|
 * | `stellungnahme/komposition` | Sonnet 5 | ~1700  | 1024     | ja            |
 * | `fotos/assistent`         | Haiku 4.5 | ~2300 | 4096     | noch nicht    |
 * | `pruefbericht/extraktion`  | Haiku 4.5 | ~1700 | 4096     | noch nicht    |
 * | `wbw/pruefung`            | Haiku 4.5 | ~950   | 4096     | noch nicht    |
 *
 * Bei den drei Haiku-Stellen ist der Haltepunkt heute also folgenlos. Er
 * greift von selbst, sobald ein Prompt wächst oder die Aufrufstelle das
 * Modell wechselt — beim Fotoassistenten am ehesten, weil dessen
 * Werkzeugdefinition mit dem Fotolexikon mitwächst. Was tatsächlich ankommt,
 * steht im Protokoll — siehe `protokolliereVerbrauch`.
 *
 * **Voraussetzung ist ein Byte für Byte gleicher Präfix.** Alle vier
 * Systemanweisungen sind fest verdrahtet, ohne Einsetzung pro Anfrage; der
 * Hausstil der Komposition wird einmal geladen und im Modul gehalten; das
 * Fotolexikon kommt sortiert aus der Datenbank (`orderBy(asc(name))`), damit
 * die Werkzeugdefinition zwischen zwei Anfragen dieselbe bleibt. Wer hier
 * etwas Veränderliches einsetzt — Datum, Fall-ID, unsortierte Liste —, macht
 * das Zwischenspeichern wirkungslos, ohne dass etwas fehlschlägt.
 *
 * Die Lebensdauer beträgt fünf Minuten und wird von jedem Zugriff erneuert.
 * Das passt zu der Art, wie hier gearbeitet wird: ein Vorgang in einem Zug.
 */
function alsSystemblock(system: string): Anthropic.TextBlockParam[] {
  return [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }]
}

/**
 * Schreibt den Tokenverbrauch eines Aufrufs ins Protokoll.
 *
 * Caching fällt lautlos aus. Ändert jemand später den Aufbau eines Prompts
 * so, dass der Präfix nicht mehr Byte für Byte derselbe ist, laufen die
 * Aufrufe weiter, nur die Rechnung steigt — es gibt keine Fehlermeldung, die
 * darauf hinweist. Diese Zeilen sind der einzige Beleg dafür, dass der
 * Zwischenspeicher überhaupt greift: Ist `cacheGelesen` über mehrere Aufrufe
 * derselben Stelle hinweg null, stimmt etwas nicht.
 */
function protokolliereVerbrauch(modell: string, verbrauch: Anthropic.Usage, dauerMs: number): void {
  protokolliereInfo('ki.aufruf', 'Modellaufruf abgeschlossen.', {
    dienst: 'anthropic',
    modell,
    dauerMs,
    eingabe: verbrauch.input_tokens,
    ausgabe: verbrauch.output_tokens,
    cacheGeschrieben: verbrauch.cache_creation_input_tokens ?? 0,
    cacheGelesen: verbrauch.cache_read_input_tokens ?? 0,
  })
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
   *
   * **Erlaubt ist dann aber nur ein Teil von JSON Schema.** Grenzen und
   * Muster — `minimum`, `maximum`, `multipleOf`, `minLength`, `maxLength`,
   * `pattern`, `minItems`, `maxItems`, `uniqueItems` — quittiert die
   * Schnittstelle mit einem 400, bevor der Aufruf das Modell erreicht. Solche
   * Vorgaben gehören in den `description`-Text des Feldes; nachprüfen muss sie
   * das Zod-Schema an der Aufrufstelle. Typen, `enum`, `const` und `anyOf`
   * gehen.
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
  const begonnen = Date.now()

  let antwort
  try {
    antwort = await client.messages.create({
      model: optionen.modell,
      max_tokens: optionen.maxTokens ?? 8000,
      system: alsSystemblock(optionen.system),
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

  protokolliereVerbrauch(optionen.modell, antwort.usage, Date.now() - begonnen)

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

  const begonnen = Date.now()
  try {
    const antwort = await client.messages.create({
      model: optionen.modell,
      max_tokens: optionen.maxTokens ?? 4000,
      system: alsSystemblock(optionen.system),
      messages: nachrichten,
    })
    protokolliereVerbrauch(optionen.modell, antwort.usage, Date.now() - begonnen)
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
