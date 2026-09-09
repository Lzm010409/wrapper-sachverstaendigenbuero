import 'server-only'
import { z } from 'zod'
import { KATEGORIESCHLUESSEL, kategoriename, type Kategorie } from './kategorien'
import { verwendungFuer, type Fotovorschlag } from './vorschlag'
import { MODELLE, rufeMitWerkzeugAuf, type InhaltsBlock } from '@/ki/client'
import { protokolliereWarnung } from '@/protokoll'

/**
 * Der Fotoassistent: was ist auf dem Bild, und wie hiesse es im Gutachten.
 *
 * **Warum Vorschaubilder und nicht die Originale.** Ein Original hat 3 MB;
 * 67 davon wären 200 MB je Lauf, und die liegen — anders als die
 * Vorschaubilder — in keinem Zwischenspeicher. Für „welches Bauteil, welche
 * Seite, welche Art von Aufnahme" reichen 400 × 300 Bildpunkte; das sind
 * rund 160 Bildtoken je Foto, ein ganzer Fall also etwa 11.000.
 *
 * **Was daraus folgt, und im Systemtext auch so steht:** Der Tachostand ist
 * bei dieser Auflösung nicht ablesbar. Das Modell soll ihn deshalb nicht
 * raten — „Tachostand" als Unterschrift ist richtig, „Tachostand 129.558 km"
 * wäre erfunden. Dieselbe Regel gilt für Kennzeichen und Fahrgestellnummer.
 *
 * **Was das Modell entscheidet und was nicht.** Es liefert Kategorie und
 * Beschreibung. Die vier Verwendungshäkchen folgen daraus über die feste
 * Tabelle in `vorschlag.ts` — siehe die Begründung dort.
 *
 * **Was bei einem Fehler passiert.** Ein gescheitertes Paket nimmt die
 * übrigen nicht mit; seine Fotos bleiben schlicht ohne Vorschlag. Der
 * umgekehrte Weg — irgendetwas hinschreiben — wäre bei einem Text, der ins
 * Gutachten geht, der schlechtere.
 */

/**
 * Wie viele Bilder in einem Aufruf.
 *
 * Zwölf Vorschaubilder sind rund 2.000 Bildtoken und 600 KB im Rumpf der
 * Anfrage — klein genug für eine zügige Antwort, gross genug, dass ein Fall
 * mit 67 Fotos in sechs Aufrufen erledigt ist statt in 67.
 */
export const PAKETGROESSE = 12

/** Wie viele vorhandene Beschreibungen als Stilvorlage mitgehen. */
const STILBEISPIELE = 8

export interface Fahrzeugkontext {
  marke: string | null
  modell: string | null
  kennzeichen: string | null
  schadenbeschreibung: string | null
}

export interface Bildpaket {
  fotoId: string
  /** Das Vorschaubild, base64-kodiert. */
  daten: string
  typ: 'image/jpeg' | 'image/png'
}

const vorschlagSchema = z.object({
  id: z.string(),
  kategorie: z.enum(KATEGORIESCHLUESSEL as [Kategorie, ...Kategorie[]]),
  beschreibung: z.string(),
  /*
    Geklemmt, nicht abgelehnt. `strict` kann `minimum`/`maximum` nicht
    erzwingen (siehe WERKZEUG), die Grenze steht also nur im
    Beschreibungstext. Ein einzelner Ausreisser würde sonst über
    `safeParse` das ganze Paket kippen — bis zu zwölf Fotos ohne
    Vorschlag wegen einer 105.
  */
  sicherheit: z.number().transform((wert) => Math.min(100, Math.max(0, wert))),
})

const antwortSchema = z.object({ vorschlaege: z.array(vorschlagSchema) })

/**
 * Die Werkzeugdefinition des Fotoassistenten.
 *
 * **`strict: true` kennt nur einen Teil von JSON Schema.** Zahlengrenzen
 * (`minimum`, `maximum`, `multipleOf`), Textlängen, Muster und
 * Mengenangaben für Listen weist die Schnittstelle mit einem 400 ab — der
 * Aufruf kommt gar nicht erst beim Modell an (vgl. `PRUEF_WERKZEUG` in
 * `wbw/pruefung.ts`, wo derselbe Fehler am 08.09.2026 auffiel). Grenzen
 * gehören deshalb in den Beschreibungstext, und die Nachprüfung macht das
 * Zod-Schema oben.
 */
const WERKZEUG = {
  name: 'fotos_beschriften',
  description:
    'Gibt zu jedem übergebenen Foto genau einen Vorschlag zurück — mit derselben id, ' +
    'die über dem Bild steht. Kein Foto auslassen, keine id erfinden.',
  input_schema: {
    type: 'object' as const,
    additionalProperties: false,
    properties: {
      vorschlaege: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            id: { type: 'string', description: 'Die id des Fotos, unverändert.' },
            kategorie: {
              type: 'string',
              enum: KATEGORIESCHLUESSEL,
              description:
                'Was die Aufnahme zeigt. Nur eine dieser Kategorien, keine eigene erfinden. ' +
                'Bei Zweifel zwischen einer Eckansicht und einem Schadendetail entscheidet, ' +
                'ob das ganze Fahrzeug oder ein einzelnes Bauteil im Bild ist.',
            },
            beschreibung: {
              type: 'string',
              description:
                'Die Bildunterschrift fürs Gutachten. Deutsch, höchstens 120 Zeichen, ' +
                'ohne Satzzeichen am Ende.',
            },
            sicherheit: {
              type: 'integer',
              description:
                'Ganze Zahl von 0 bis 100 — wie sicher die Kategorie ist. Unter 50, wenn ' +
                'das Bild unklar ist.',
            },
          },
          required: ['id', 'kategorie', 'beschreibung', 'sicherheit'],
        },
      },
    },
    required: ['vorschlaege'],
  },
  strict: true,
}

const SYSTEM = `Du beschriftest die Fotos eines Kfz-Schadengutachtens. Der
Sachverständige entscheidet, du bereitest vor.

Grundsätze:
- Schreibe nur, was im Bild zu sehen ist. Die Bilder sind Vorschaubilder mit
  400 × 300 Bildpunkten: Zahlen auf dem Tacho, Zeichen im Kennzeichen und die
  Fahrgestellnummer sind darauf nicht lesbar. Nenne sie deshalb nie. Richtig
  ist "Tachostand", falsch ist "Tachostand 129.558 km".
- Benenne Bauteil und Seite, wenn beides erkennbar ist: "Heckstossfänger
  links, Kratzer über die gesamte Breite".
- Die Seitenangabe folgt der Fahrtrichtung, nicht dem Blick des Betrachters.
- Keine Bewertung des Schadens, keine Reparaturempfehlung, keine Vermutung
  über die Ursache. Das ist die Arbeit des Sachverständigen.
- Keine Einleitung, kein "Dieses Bild zeigt", kein Punkt am Ende.
- Bist du bei der Kategorie unsicher, nimm "sonstiges" und setze die
  Sicherheit niedrig. Eine falsche Kategorie ist schlimmer als eine offene.`

/** Teilt eine Liste in Pakete. */
export function inPakete<T>(liste: T[], groesse = PAKETGROESSE): T[][] {
  const pakete: T[][] = []
  const schritt = Math.max(1, groesse)
  for (let i = 0; i < liste.length; i += schritt) pakete.push(liste.slice(i, i + schritt))
  return pakete
}

/**
 * Welche Fotos als nächstes drankommen.
 *
 * Zwei Ausschlüsse, und beide sind wichtig: was schon einen Vorschlag hat,
 * und was sich beim letzten Versuch nicht laden liess. Ohne den zweiten
 * käme ein defektes Bild in jedem weiteren Paket wieder mit, belegte dort
 * einen Platz und hielte den Lauf davon ab, jemals „fertig" zu melden.
 */
export function naechstesPaket<T extends { id: string }>(
  fotos: T[],
  beschriftet: ReadonlySet<string>,
  gescheitert: ReadonlySet<string>,
  groesse = PAKETGROESSE,
): T[] {
  return fotos
    .filter((f) => !beschriftet.has(f.id) && !gescheitert.has(f.id))
    .slice(0, Math.max(1, groesse))
}

/**
 * Der Auftragstext vor den Bildern.
 *
 * Die Stilbeispiele sind der Grund, warum der Assistent nach dem zehnten Fall
 * klingt wie das Haus und nicht wie ein Sprachmodell: was der
 * Sachverständige in diesem Fall schon selbst geschrieben hat, ist die beste
 * verfügbare Vorgabe. Fehlen sie, bleibt der knappe Sachstil aus dem
 * Systemtext.
 */
export function auftragstext(fahrzeug: Fahrzeugkontext, stilbeispiele: string[]): string {
  const zeilen = [
    'Fahrzeug:',
    `- Marke und Modell: ${fahrzeug.marke ?? '—'} ${fahrzeug.modell ?? ''}`.trimEnd(),
    `- Kennzeichen: ${fahrzeug.kennzeichen ?? '—'}`,
    `- Schaden laut Gutachten: ${kurz(fahrzeug.schadenbeschreibung) || '—'}`,
    '',
    'Mögliche Kategorien:',
    ...KATEGORIESCHLUESSEL.map((k) => `- ${k} = ${kategoriename(k)}`),
  ]

  if (stilbeispiele.length > 0) {
    zeilen.push(
      '',
      'So beschriftet der Sachverständige in diesem Fall bereits selbst. Halte dich',
      'an diesen Ton, diese Länge und diese Wortwahl:',
      ...stilbeispiele.slice(0, STILBEISPIELE).map((b) => `- ${kurz(b, 200)}`),
    )
  }

  return zeilen.join('\n')
}

function kurz(text: string | null, hoechstens = 600): string {
  const geputzt = (text ?? '').replace(/\s+/g, ' ').trim()
  return geputzt.length > hoechstens ? `${geputzt.slice(0, hoechstens)}…` : geputzt
}

/**
 * Beschriftet ein Paket Bilder.
 *
 * Gibt nur zurück, wozu ein brauchbarer Vorschlag kam. Fotos ohne Eintrag
 * sind für den Aufrufer die gescheiterten — das ist der einzige Unterschied
 * zwischen „das Paket ist gefallen" und „zu diesem Bild kam nichts".
 */
export async function beschriftePaket(
  fahrzeug: Fahrzeugkontext,
  stilbeispiele: string[],
  bilder: Bildpaket[],
): Promise<Fotovorschlag[]> {
  if (bilder.length === 0) return []

  const inhalt: InhaltsBlock[] = [{ type: 'text', text: auftragstext(fahrzeug, stilbeispiele) }]
  for (const bild of bilder) {
    // Die Kennung steht **vor** dem Bild: das Modell liest der Reihe nach,
    // und eine Kennung dahinter gehörte optisch schon zum nächsten.
    inhalt.push({ type: 'text', text: `Foto id=${bild.fotoId}:` })
    inhalt.push({
      type: 'image',
      source: { type: 'base64', media_type: bild.typ, data: bild.daten },
    })
  }

  let roh: unknown
  try {
    roh = await rufeMitWerkzeugAuf({
      modell: MODELLE.schnell,
      system: SYSTEM,
      inhalt,
      werkzeug: WERKZEUG,
      maxTokens: 4000,
    })
  } catch (fehler) {
    protokolliereWarnung('fotos.assistent', 'Ein Paket Fotos liess sich nicht beschriften.', {
      dienst: 'anthropic',
      anzahl: bilder.length,
      grund: fehler instanceof Error ? fehler.message : String(fehler),
    })
    return []
  }

  const geprueft = antwortSchema.safeParse(roh)
  if (!geprueft.success) {
    protokolliereWarnung('fotos.assistent', 'Die Antwort des Modells passte nicht zum Schema.', {
      dienst: 'anthropic',
      anzahl: bilder.length,
      grund: geprueft.error.issues[0]?.message,
    })
    return []
  }

  // Nach id zuordnen, nicht nach Reihenfolge. Ein verrutschter Vorschlag
  // sähe richtig aus und beschriftete das falsche Bild.
  const nachId = new Map(geprueft.data.vorschlaege.map((v) => [v.id, v]))
  const vorschlaege: Fotovorschlag[] = []
  for (const bild of bilder) {
    const vorschlag = nachId.get(bild.fotoId)
    if (!vorschlag) continue
    const beschreibung = vorschlag.beschreibung.trim().replace(/[.;:,\s]+$/, '').slice(0, 120)
    if (!beschreibung) continue
    vorschlaege.push({
      fotoId: bild.fotoId,
      kategorie: vorschlag.kategorie,
      beschreibung,
      verwendung: verwendungFuer(vorschlag.kategorie),
      sicherheit: Math.round(vorschlag.sicherheit),
      stand: 'offen',
    })
  }
  return vorschlaege
}

/**
 * Beschriftet alle Bilder eines Falls.
 *
 * Die Pakete laufen nacheinander. Nebeneinander wären es bei 67 Fotos sechs
 * gleichzeitige Anfragen mit je 600 KB Bilddaten — die Ratenbegrenzung
 * träfe dann alle sechs statt einer.
 */
export async function beschrifteAlle(
  fahrzeug: Fahrzeugkontext,
  stilbeispiele: string[],
  bilder: Bildpaket[],
  melde: (fertig: number, gesamt: number) => void = () => {},
): Promise<Fotovorschlag[]> {
  const alle: Fotovorschlag[] = []
  let fertig = 0
  for (const paket of inPakete(bilder)) {
    alle.push(...(await beschriftePaket(fahrzeug, stilbeispiele, paket)))
    fertig += paket.length
    melde(fertig, bilder.length)
  }
  return alle
}
