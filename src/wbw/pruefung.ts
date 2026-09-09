import { z } from 'zod'
import {
  AUFFAELLIGKEITEN,
  UNBEKANNTE_BAUART,
  ungeprueft,
  type Auffaelligkeit,
  type ErkannteBauart,
  type Inseratsangabe,
  type Pruefurteil,
} from './urteil'
import { BAUARTEN, type Bauart } from './karosserie'
import { MODELLE, rufeMitWerkzeugAuf } from '@/ki/client'
import { protokolliereWarnung } from '@/protokoll'

/**
 * Die Prüfung der Inserate durch das Sprachmodell.
 *
 * **Warum es das gibt.** Die Portale führen strukturiert nur, was in ihre
 * Felder passt: Preis, Kilometer, Erstzulassung, ein paar Häkchen. Alles
 * Übrige steht im Fliesstext — und dort steht das, was einen
 * Vergleichswagen tauglich oder untauglich macht: „Export", „Bastlerfahrzeug",
 * „Unfallschaden hinten links", „Standheizung nachgerüstet", „AMG
 * Driver's Package". Am 07.09.2026 lag bei Kleinanzeigen bei **keinem
 * einzigen** Inserat eine gepflegte Ausstattungsliste vor; alles stand im
 * Beschreibungstext.
 *
 * **Was die Prüfung nicht ist: eine Entscheidung.** Sie liefert einen
 * Vorschlag mit Begründung. Ob ein Fahrzeug in den Korb kommt, entscheidet
 * der Sachverständige — ein Gutachten, dessen Vergleichskorb ein Modell
 * zusammengestellt hat, könnte er im Streitfall nicht vertreten.
 *
 * **Was bei einem Fehler passiert: nichts verschwindet.** Scheitert ein
 * Paket, bekommen seine Inserate das Urteil `pruefen` ohne Begründung und
 * stehen weiter in der Liste. Der umgekehrte Weg — im Zweifel wegwerfen —
 * hiesse, dass ein Netzfehler still den Korb ändert.
 */

/** Wie viele Inserate in einem Aufruf. */
export const PAKETGROESSE = 25

const urteilSchema = z.object({
  id: z.string(),
  erkannteAusstattung: z.array(z.string()).default([]),
  fehlendeAusstattung: z.array(z.string()).default([]),
  /*
    Geklemmt, nicht abgelehnt. `strict` kann `minimum`/`maximum` nicht
    erzwingen (siehe PRUEF_WERKZEUG), die Grenze steht also nur im Auftragstext.
    Ein einzelner Ausreisser würde sonst über `safeParse` das ganze Paket
    kippen — 25 Inserate ungeprüft wegen einer 105.
  */
  vergleichbarkeit: z.number().transform((wert) => Math.min(100, Math.max(0, wert))),
  erkanntesModell: z.string().default(''),
  /*
    `catch` statt `default`: eine Bauart, die das Modell erfindet, darf nicht
    über `safeParse` 25 Inserate mitreissen. Sie wird zu „unbekannt", und
    unbekannt heisst hier: stehen lassen, nicht verwerfen.
  */
  erkannteBauart: z
    .enum([UNBEKANNTE_BAUART, ...BAUARTEN] as [ErkannteBauart, ...ErkannteBauart[]])
    .catch(UNBEKANNTE_BAUART),
  begruendung: z.string(),
  auffaelligkeiten: z
    .array(z.enum(Object.keys(AUFFAELLIGKEITEN) as [Auffaelligkeit, ...Auffaelligkeit[]]))
    .default([]),
  empfehlung: z.enum(['aufnehmen', 'pruefen', 'verwerfen']),
})

const antwortSchema = z.object({ urteile: z.array(urteilSchema) })

/**
 * Die Werkzeugdefinition der Prüfung.
 *
 * **`strict: true` kennt nur einen Teil von JSON Schema.** Zahlengrenzen
 * (`minimum`, `maximum`, `multipleOf`), Textlängen (`minLength`,
 * `maxLength`), Muster und Mengenangaben für Listen weist die Schnittstelle
 * mit einem 400 ab — der Aufruf kommt gar nicht erst beim Modell an. Am
 * 08.09.2026 stand hier `minimum: 0, maximum: 100`, und jedes einzelne Paket
 * scheiterte mit „For 'integer' type, properties maximum, minimum are not
 * supported"; die ganze Prüfung lief ins Leere, ohne dass die Suche stehen
 * blieb. Grenzen gehören deshalb in den Beschreibungstext, und die
 * Nachprüfung macht das Zod-Schema oben.
 *
 * Exportiert, damit ein Test das nachhalten kann, ohne das Modell zu rufen.
 */
export const PRUEF_WERKZEUG = {
  name: 'urteile_abgeben',
  description:
    'Gibt für jedes übergebene Inserat genau ein Urteil zurück — in derselben Reihenfolge ' +
    'und mit derselben id. Kein Inserat auslassen, keine id erfinden.',
  input_schema: {
    type: 'object' as const,
    additionalProperties: false,
    properties: {
      urteile: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            id: { type: 'string', description: 'Die id des Inserats, unverändert.' },
            erkannteAusstattung: {
              type: 'array',
              items: { type: 'string' },
              description:
                'Merkmale aus der Soll-Ausstattung, die im Inserat belegt sind — wortgleich ' +
                'aus der Soll-Liste übernommen, nicht umformuliert.',
            },
            fehlendeAusstattung: {
              type: 'array',
              items: { type: 'string' },
              description: 'Merkmale aus der Soll-Ausstattung, die im Inserat nicht vorkommen.',
            },
            vergleichbarkeit: {
              type: 'integer',
              description:
                'Ganze Zahl von 0 bis 100 — fachliche Nähe zum Subjektfahrzeug. ' +
                '100 = praktisch gleiches Fahrzeug, 0 = als Vergleich unbrauchbar.',
            },
            erkanntesModell: {
              type: 'string',
              description:
                'Marke und Modell, wie sie im Inserat stehen, z. B. „VW Golf VI". ' +
                'Aus Titel und Beschreibung, nicht geraten. Leer, wenn nicht erkennbar.',
            },
            erkannteBauart: {
              type: 'string',
              enum: [UNBEKANNTE_BAUART, ...BAUARTEN],
              description:
                'Die Bauart des angebotenen Fahrzeugs aus Titel und Beschreibung. ' +
                '„unbekannt", wenn der Text sie nicht hergibt — nicht raten.',
            },
            begruendung: {
              type: 'string',
              description: 'Ein Satz auf Deutsch, höchstens 200 Zeichen.',
            },
            auffaelligkeiten: {
              type: 'array',
              items: { type: 'string', enum: Object.keys(AUFFAELLIGKEITEN) },
            },
            empfehlung: { type: 'string', enum: ['aufnehmen', 'pruefen', 'verwerfen'] },
          },
          required: [
            'id',
            'erkannteAusstattung',
            'fehlendeAusstattung',
            'vergleichbarkeit',
            'erkanntesModell',
            'erkannteBauart',
            'begruendung',
            'auffaelligkeiten',
            'empfehlung',
          ],
        },
      },
    },
    required: ['urteile'],
  },
  strict: true,
}

const SYSTEM = `Du prüfst Inserate für den Vergleichskorb eines Kfz-Gutachtens
(Wiederbeschaffungswert nach § 249 BGB). Der Sachverständige entscheidet, du
bereitest vor.

Grundsätze:
- Der Beschreibungstext zählt so viel wie die Datenfelder. Ausstattung,
  Unfallschäden und Exportabsicht stehen dort und fast nie in der
  Ausstattungsliste des Portals.
- Als Vergleich taugt nur, was am selben Markt angeboten wird. Export,
  Bastlerfahrzeuge und offene Unfallschäden schliessen ein Fahrzeug fachlich
  aus — das ist eine Auffälligkeit und meist "verwerfen".
- **Baureihe und Bauart entscheiden zuerst.** Trägt das Inserat eine andere
  Baureihe als das Subjektfahrzeug (ein Golf, wo ein Sharan gesucht ist) oder
  eine andere Bauart (eine Limousine, wo ein Van gesucht ist), dann ist es
  "verwerfen" mit der Auffälligkeit "falsches_modell" — unabhängig davon, wie
  gut Preis, Laufleistung und Leistung passen. Ein anderes Fahrzeug wird durch
  ähnliche Zahlen nicht vergleichbar.
- "erkanntesModell" und "erkannteBauart" werden aus Titel und Beschreibung
  gelesen. Gibt der Text die Bauart nicht her, ist sie "unbekannt" — das ist
  eine gültige Antwort und besser als eine geratene. Bei Kleinanzeigen steht
  die Bauart fast nie im Titel; dort hilft nur der Beschreibungstext.
- Ein Händlerangebot ist kein Mangel; es wird nur vermerkt, weil
  Händlerpreise über Privatpreisen liegen.
- Unsicher heisst "pruefen", nicht "verwerfen". Wegwerfen darf nur, wer
  sicher ist.
- Die Begründung ist ein Satz und nennt den Grund, nicht das Ergebnis.
  Nicht "gut vergleichbar", sondern "gleiche Motorisierung, 12.000 km mehr,
  Ausstattung deckt sich bis auf das Panoramadach".`

/** Teilt eine Liste in Pakete. */
export function inPakete<T>(liste: T[], groesse = PAKETGROESSE): T[][] {
  const pakete: T[][] = []
  for (let i = 0; i < liste.length; i += Math.max(1, groesse)) {
    pakete.push(liste.slice(i, i + Math.max(1, groesse)))
  }
  return pakete
}

/**
 * Kürzt einen Beschreibungstext.
 *
 * Inserate tragen bis zu mehreren tausend Zeichen, davon der grössere Teil
 * Textbausteine des Händlers („Finanzierung ab 0,9 %", Öffnungszeiten,
 * Haftungsausschluss). Die fachlichen Angaben stehen weit vorn. 1200 Zeichen
 * je Inserat halten ein Paket aus 25 unter dem, was das schnelle Modell
 * sicher trägt.
 */
function kurz(text: string | null, hoechstens = 1200): string {
  const geputzt = (text ?? '').replace(/\s+/g, ' ').trim()
  return geputzt.length > hoechstens ? `${geputzt.slice(0, hoechstens)}…` : geputzt
}

export interface Pruefauftrag {
  subjekt: {
    marke: string
    modell: string
    /**
     * Die Baureihe, z. B. `Sharan (7N1)`.
     *
     * Ohne sie sieht die Prüfung nur `modell` — und das trägt bisweilen die
     * Ausstattungslinie („Highline BMT") statt des Fahrzeugs. Dann kann sie
     * ein falsches Modell nicht erkennen.
     */
    baureihe: string | null
    variante: string
    ez: string
    kilometerstand: number | null
    leistungKw: number | null
    /** Die Bauart aus autoiXpert, z. B. `Van`. */
    bauart: Bauart | null
  }
  sollAusstattung: string[]
}

/**
 * Zieht ein Urteil zurück, das ein anderes Fahrzeug aufnehmen will.
 *
 * **Warum die Regel hier steht und nicht nur im Systemtext.** Am 08.09.2026
 * empfahl die Prüfung einen VW Golf VI für den Korb einer VW-Sharan-Suche mit
 * „aufnehmen · 60" — die Begründung nannte den Golf sogar beim Namen. Eine
 * Anweisung im Text ist eine Bitte; hier wird sie zur Bedingung.
 *
 * Verworfen wird nur bei **belegter** Abweichung: eine unbekannte Bauart
 * bleibt stehen. Auf Kleinanzeigen ist sie der Normalfall, und wegwerfen darf
 * nur, wer sicher ist.
 */
function ziehePassendesUrteil(
  urteil: Pruefurteil,
  subjekt: Pruefauftrag['subjekt'],
): Pruefurteil {
  const bauartWeichtAb =
    subjekt.bauart !== null &&
    urteil.erkannteBauart !== UNBEKANNTE_BAUART &&
    urteil.erkannteBauart !== subjekt.bauart

  const falschesModell = urteil.auffaelligkeiten.includes('falsches_modell') || bauartWeichtAb
  if (!falschesModell || urteil.empfehlung === 'verwerfen') {
    return bauartWeichtAb && !urteil.auffaelligkeiten.includes('falsches_modell')
      ? { ...urteil, auffaelligkeiten: [...urteil.auffaelligkeiten, 'falsches_modell'] }
      : urteil
  }

  return {
    ...urteil,
    empfehlung: 'verwerfen',
    auffaelligkeiten: urteil.auffaelligkeiten.includes('falsches_modell')
      ? urteil.auffaelligkeiten
      : [...urteil.auffaelligkeiten, 'falsches_modell'],
  }
}

/**
 * Prüft ein Paket. Ein Fehler wird hier abgefangen — der Aufrufer bekommt
 * für jedes Inserat ein Urteil, notfalls den Platzhalter.
 */
export async function pruefePaket(
  auftrag: Pruefauftrag,
  inserate: Inseratsangabe[],
): Promise<Pruefurteil[]> {
  if (inserate.length === 0) return []

  const auftragstext = [
    'Subjektfahrzeug:',
    JSON.stringify(auftrag.subjekt, null, 2),
    '',
    'Soll-Ausstattung (nur diese Bezeichnungen in erkannteAusstattung/fehlendeAusstattung verwenden):',
    auftrag.sollAusstattung.length > 0 ? auftrag.sollAusstattung.join(', ') : '— keine hinterlegt —',
    '',
    `Inserate (${inserate.length}):`,
    JSON.stringify(
      inserate.map((i) => ({ ...i, beschreibung: kurz(i.beschreibung) })),
      null,
      1,
    ),
  ].join('\n')

  let roh: unknown
  try {
    roh = await rufeMitWerkzeugAuf({
      modell: MODELLE.schnell,
      system: SYSTEM,
      inhalt: [{ type: 'text', text: auftragstext }],
      werkzeug: PRUEF_WERKZEUG,
      // 25 Urteile mit Begründung brauchen Platz; zu knapp bemessen bricht
      // die Antwort mitten im letzten Urteil ab und das ganze Paket ist hin.
      maxTokens: 8000,
    })
  } catch (fehler) {
    protokolliereWarnung('wbw.pruefung', 'Ein Prüfpaket ist gescheitert.', {
      dienst: 'anthropic',
      anzahl: inserate.length,
      grund: fehler instanceof Error ? fehler.message : String(fehler),
    })
    return inserate.map((i) => ungeprueft(i.id, 'Die Prüfung ist gescheitert — bitte selbst ansehen.'))
  }

  const geprueft = antwortSchema.safeParse(roh)
  if (!geprueft.success) {
    protokolliereWarnung('wbw.pruefung', 'Die Antwort des Modells passte nicht zum Schema.', {
      dienst: 'anthropic',
      anzahl: inserate.length,
      grund: geprueft.error.issues[0]?.message,
    })
    return inserate.map((i) => ungeprueft(i.id, 'Die Prüfung war nicht lesbar — bitte selbst ansehen.'))
  }

  // Nach id zuordnen, nicht nach Reihenfolge: ein verrutschtes Urteil wäre
  // schlimmer als ein fehlendes, weil es plausibel aussieht.
  const nachId = new Map(geprueft.data.urteile.map((u) => [u.id, u]))
  return inserate.map((i) => {
    const urteil = nachId.get(i.id)
    if (!urteil) return ungeprueft(i.id, 'Zu diesem Inserat kam kein Urteil — bitte selbst ansehen.')
    return ziehePassendesUrteil(
      { ...urteil, begruendung: urteil.begruendung.slice(0, 300) },
      auftrag.subjekt,
    )
  })
}

/**
 * Prüft alle Inserate.
 *
 * Die Pakete laufen nacheinander, nicht nebeneinander: parallel wären es bei
 * drei Zyklen und drei Portalen bis zu achtzehn gleichzeitige Anfragen, und
 * die Ratenbegrenzung schlägt dann für alle zu statt für eine.
 */
export async function pruefeInserate(
  auftrag: Pruefauftrag,
  inserate: Inseratsangabe[],
  melde: (fertig: number, gesamt: number) => void = () => {},
): Promise<Map<string, Pruefurteil>> {
  const urteile = new Map<string, Pruefurteil>()
  let fertig = 0

  for (const paket of inPakete(inserate)) {
    for (const urteil of await pruefePaket(auftrag, paket)) {
      urteile.set(urteil.id, urteil)
    }
    fertig += paket.length
    melde(fertig, inserate.length)
  }

  return urteile
}

/*
 * Weitergereicht: die Typen und die Vorbelegungsregel stehen in `urteil.ts`,
 * weil die Korbtabelle im Browser sie braucht und dieses Modul über den
 * KI-Zugang `server-only` ist. Wer von hier importiert, bekommt sie
 * trotzdem — der Umzug soll keine Aufrufstelle kosten.
 */
export {
  AUFFAELLIGKEITEN,
  brauchbare,
  ungeprueft,
  vorbelegt,
  type Auffaelligkeit,
  type Inseratsangabe,
  type Pruefurteil,
} from './urteil'
