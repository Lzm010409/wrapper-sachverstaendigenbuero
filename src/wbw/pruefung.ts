import { z } from 'zod'
import {
  AUFFAELLIGKEITEN,
  ungeprueft,
  type Auffaelligkeit,
  type Inseratsangabe,
  type Pruefurteil,
} from './urteil'
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
  vergleichbarkeit: z.number().min(0).max(100),
  begruendung: z.string(),
  auffaelligkeiten: z
    .array(z.enum(Object.keys(AUFFAELLIGKEITEN) as [Auffaelligkeit, ...Auffaelligkeit[]]))
    .default([]),
  empfehlung: z.enum(['aufnehmen', 'pruefen', 'verwerfen']),
})

const antwortSchema = z.object({ urteile: z.array(urteilSchema) })

const WERKZEUG = {
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
              minimum: 0,
              maximum: 100,
              description:
                'Fachliche Nähe zum Subjektfahrzeug. 100 = praktisch gleiches Fahrzeug, ' +
                '0 = als Vergleich unbrauchbar.',
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
  Bastlerfahrzeuge, offene Unfallschäden und ein anderes Modell schliessen ein
  Fahrzeug fachlich aus — das ist eine Auffälligkeit und meist "verwerfen".
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
    variante: string
    ez: string
    kilometerstand: number | null
    leistungKw: number | null
  }
  sollAusstattung: string[]
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
      werkzeug: WERKZEUG,
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
    return { ...urteil, begruendung: urteil.begruendung.slice(0, 300) }
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
