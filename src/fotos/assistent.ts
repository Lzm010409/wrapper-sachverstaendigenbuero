import 'server-only'
import { z } from 'zod'
import { KATEGORIESCHLUESSEL, kategoriename, type Kategorie } from './kategorien'
import { verwendungFuer, type Fotovorschlag } from './vorschlag'
import { istSeite, SEITEN, zusammensetzen, type FotoTeil, type Rohtreffer } from './lexikon'
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
 * Tabelle in `vorschlag.ts` — siehe die Begründung dort. Bei den sieben
 * Positionskategorien (Kennzeichen, Fahrgestellnummer, Tachostand, die vier
 * Eckansichten) wird selbst die Beschreibung nicht vom Modell übernommen,
 * siehe `bildunterschrift` weiter unten.
 *
 * **Das Teile-Lexikon (`lexikon.ts`) bindet den Wortlaut — nur bei
 * `schaden`.** Ist im Haus ein Teil hinterlegt (Seite, Beschädigungsarten
 * mit Begriff), muss das Modell für ein Schadendetail-Foto mit dem einen
 * erkannten Teil genau einen Treffer (Teil, Seite, Beschädigungsart)
 * liefern, nur aus dieser Liste — nie mehr als einen je Foto, auch wenn
 * mehrere Teile zu sehen sind: ein Foto zeigt einen Schaden, nicht eine
 * Liste. Der Satz wird serverseitig aus dem Treffer zusammengesetzt
 * (`zusammensetzen` in `lexikon.ts`), nicht vom Modell formuliert. Ein nicht
 * gelistetes Teil bleibt freier Text wie zuvor — für ein gelistetes Teil darf
 * das Modell nie selbst formulieren, auch nicht zusätzlich zum Treffer. Bei
 * jeder anderen Kategorie bleibt `treffer` unbeachtet, selbst wenn das
 * Modell es trotzdem befüllt — am 10.09.2026 beobachtet: eine
 * Übersichtsaufnahme („Ansicht hinten links") bekam sonst dieselbe
 * Schadensformulierung wie ein ganz anderes Detailfoto und verlor damit
 * ihre eigentliche Übersichts-Bildunterschrift.
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

/**
 * Unterhalb dieser Sicherheit entfällt ein Vorschlag komplett — für jede
 * Kategorie, nicht nur bei einem Lexikon-Treffer. Das Foto zählt dann wie
 * eines, zu dem das Modell nichts geliefert hat: kein Vorschlag, der nächste
 * Lauf versucht es erneut. Eine Unsicherheit, die der Systemtext selbst
 * einfordert ("unter 50, wenn das Bild unklar ist"), soll auch eine Folge
 * haben, statt nur eine Zahl neben einem übernommenen Vorschlag zu sein.
 */
const MINDESTSICHERHEIT = 50

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

const trefferSchema = z.object({
  teil: z.string(),
  seite: z.string(),
  beschaedigungsart: z.string(),
})

const vorschlagSchema = z.object({
  id: z.string(),
  kategorie: z.enum(KATEGORIESCHLUESSEL as [Kategorie, ...Kategorie[]]),
  beschreibung: z.string(),
  /*
    Roh übernommen, nicht gegen das Lexikon geprüft: welche Werte hier
    überhaupt zulässig sind, hängt vom `teile`-Argument des jeweiligen
    Aufrufs ab, nicht von einem festen Schema. Die Prüfung übernimmt
    `zusammensetzen()` in `beschriftePaket` — dort steht auch das aktuelle
    Lexikon zur Verfügung. Grosszügig statt hart begrenzt: `safeParse` soll
    bei einem Ausreisser nicht das ganze Paket kippen — die in `bauWerkzeug`
    beschriebene Ein-Treffer-Grenze wird erst danach per `.slice(0, 1)`
    erzwungen, falls sich das Modell trotz Vorgabe nicht daran hält.
  */
  treffer: z.array(trefferSchema).default([]),
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
 * **Warum eine Funktion und keine Konstante.** `treffer.teil` und
 * `treffer.beschaedigungsart` dürfen nur Werte aus dem Fotolexikon annehmen
 * — und das Lexikon steht in der Datenbank, ändert sich also zur Laufzeit.
 * Ohne Lexikoneintrag entfällt das Feld `treffer` ganz; ein leeres
 * `enum: []` ist kein gültiges JSON Schema.
 *
 * **`strict: true` kennt nur einen Teil von JSON Schema.** Zahlengrenzen
 * (`minimum`, `maximum`, `multipleOf`), Textlängen, Muster und
 * Mengenangaben für Listen (`minItems`/`maxItems`) weist die Schnittstelle
 * mit einem 400 ab — der Aufruf kommt gar nicht erst beim Modell an (vgl.
 * `PRUEF_WERKZEUG` in `wbw/pruefung.ts`, wo derselbe Fehler am 08.09.2026
 * auffiel). Grenzen gehören deshalb in den Beschreibungstext; die
 * Ein-Treffer-Grenze für `treffer` erzwingt erst `bildunterschrift` per
 * `.slice(0, 1)`, nicht dieses Schema.
 */
function bauWerkzeug(teile: readonly FotoTeil[]) {
  const teilNamen = teile.map((t) => t.name)
  const alleBegriffe = [...new Set(teile.flatMap((t) => t.beschaedigungsarten.map((b) => b.begriff)))]

  const trefferEigenschaften = {
    type: 'array' as const,
    description:
      'Das eine erkannte Fahrzeugteil aus dem Teile-Lexikon im Auftrag, sofern eines mit ' +
      'sichtbarem Schaden zu sehen ist. Leer lassen, wenn keines der gelisteten Teile zu ' +
      'sehen ist — dann zählt allein das Feld beschreibung. Höchstens EIN Eintrag, auch ' +
      'wenn mehrere Teile im Bild erkennbar wären: ein Foto zeigt einen Schaden. Wähle in ' +
      'diesem Fall das Teil, das im Vordergrund oder am deutlichsten beschädigt ist.',
    items: {
      type: 'object' as const,
      additionalProperties: false,
      properties: {
        teil: {
          type: 'string',
          enum: teilNamen,
          description: 'Das erkannte Fahrzeugteil, exakt aus dem Teile-Lexikon im Auftrag.',
        },
        seite: {
          type: 'string',
          enum: SEITEN,
          description:
            'Die Seite dieses Teils — nur wenn das Lexikon für dieses Teil eine Seite vorsieht.',
        },
        beschaedigungsart: {
          type: 'string',
          enum: alleBegriffe,
          description:
            'Die Beschädigungsart, exakt einer der im Lexikon für DIESES Teil gelisteten ' +
            'Begriffe.',
        },
      },
      required: ['teil', 'seite', 'beschaedigungsart'],
    },
  }

  return {
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
                  'Die Bildunterschrift fürs Gutachten, sofern treffer leer ist — sonst wird ' +
                  'dieses Feld ignoriert und der Satz aus den treffer-Einträgen zusammengesetzt. ' +
                  'Deutsch, höchstens 120 Zeichen, ohne Satzzeichen am Ende.',
              },
              ...(teilNamen.length > 0 ? { treffer: trefferEigenschaften } : {}),
              sicherheit: {
                type: 'integer',
                description:
                  'Ganze Zahl von 0 bis 100 — wie sicher die Kategorie ist. Unter 50, wenn ' +
                  'das Bild unklar ist.',
              },
            },
            required: [
              'id',
              'kategorie',
              'beschreibung',
              ...(teilNamen.length > 0 ? ['treffer'] : []),
              'sicherheit',
            ],
          },
        },
      },
      required: ['vorschlaege'],
    },
    strict: true,
  }
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
- Bei den vier Eckansichten (ansicht_vorne_links/rechts,
  ansicht_hinten_links/rechts) entscheidet eine einfache Regel, keine
  Vermutung: Bei einer Aufnahme von HINTEN blickst du gedanklich in
  dieselbe Richtung wie das Fahrzeug fährt — keine Spiegelung, was im Bild
  links erscheint, ist auch in Fahrtrichtung links. Bei einer Aufnahme von
  VORNE blickst du dem Fahrzeug entgegen — hier spiegelt sich die Seite,
  was im Bild links erscheint, ist in Fahrtrichtung rechts, und umgekehrt.
  Beispiel: Auf einer Heckaufnahme ist links im Bild eine Fahrzeugseite mit
  Rad und Kotflügel zu sehen, rechts nur Kennzeichen und Rückleuchte — das
  ist "ansicht_hinten_links", nicht "ansicht_hinten_rechts".
- Für die Positionskategorien (kennzeichen, vin, tacho und die vier
  ansicht_*) wird beschreibung ohnehin ignoriert und durch den
  Kategorienamen ersetzt. Formuliere dort trotzdem kurz und sachlich, falls
  es doch verwendet wird — aber verschwende keine Mühe auf den Wortlaut.
- treffer gilt ausschliesslich bei kategorie "schaden" und ausschliesslich
  aus dem Teile-Lexikon weiter unten im Auftrag, sofern eines mitgeschickt
  wurde. Bei jeder anderen Kategorie bleibt treffer leer — auch dann, wenn
  irgendwo im Bild zufällig ein gelistetes Teil zu erkennen ist. Erkennst du
  bei kategorie "schaden" eines der gelisteten Teile beschädigt, trage
  GENAU EINEN Eintrag in treffer ein — auch wenn mehrere Teile im Bild zu
  sehen sind, wähle nur das eine deutlichste. teil und beschaedigungsart
  müssen dabei Zeichen für Zeichen aus der Liste für GENAU DIESES Teil
  stammen, nie aus der eines anderen Teils und nie ein eigener,
  naheliegender Begriff.
- Existiert ein Teile-Lexikon (siehe unten), wird bei kategorie "schaden"
  ausschliesslich der Lexikon-Treffer verwendet — beschreibung wird in
  diesem Fall nie benutzt, auch nicht wenn treffer leer bleibt. Erkennst du
  keines der gelisteten Teile beschädigt, lass treffer leer und schreibe
  trotzdem eine knappe beschreibung (Validierung verlangt das Feld) — sie
  wird nur ignoriert, verschwende darauf also keine Mühe.
- Sobald ein Treffer eingetragen ist, wird beschreibung verworfen und der
  Satz stattdessen aus dem Lexikon zusammengesetzt. Formuliere für ein
  gelistetes Teil deshalb NIE selbst in beschreibung — weder statt eines
  Treffers noch zusätzlich dazu. Beispiel für falsch: du schreibst
  "Kotflügel rechts leicht verbeult" in beschreibung, obwohl der Kotflügel
  im Lexikon steht und dort "deformiert" heisst. Richtig ist, stattdessen
  {teil: "Kotflügel", seite: "rechts", beschaedigungsart: "deformiert"} in
  treffer einzutragen — der Satz entsteht daraus von selbst.
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
export function auftragstext(
  fahrzeug: Fahrzeugkontext,
  stilbeispiele: string[],
  teile: readonly FotoTeil[] = [],
): string {
  const zeilen = [
    'Fahrzeug:',
    `- Marke und Modell: ${fahrzeug.marke ?? '—'} ${fahrzeug.modell ?? ''}`.trimEnd(),
    `- Kennzeichen: ${fahrzeug.kennzeichen ?? '—'}`,
    `- Schaden laut Gutachten: ${kurz(fahrzeug.schadenbeschreibung) || '—'}`,
    '',
    'Mögliche Kategorien:',
    ...KATEGORIESCHLUESSEL.map((k) => `- ${k} = ${kategoriename(k)}`),
  ]

  if (teile.length > 0) {
    zeilen.push(
      '',
      'Teile-Lexikon (siehe Systemtext — teil/seite/beschaedigungsart nur hieraus wählen):',
      ...teile.flatMap((teil) => [
        `- ${teil.name} (Seite: ${teil.seiten.length > 0 ? teil.seiten.join('/') : 'ohne'}):`,
        ...(teil.erkennungsmerkmal ? [`  Erkennungsmerkmal: ${teil.erkennungsmerkmal}`] : []),
        ...teil.beschaedigungsarten.map((b) => `  · "${b.begriff}" — ${b.hinweis}`),
      ]),
    )
  }

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
 * Die reinen Positionsfotos — hier ersetzt der Kategoriename immer die
 * Bildunterschrift, siehe `bildunterschrift`.
 */
const POSITIONSKATEGORIEN: readonly Kategorie[] = [
  'kennzeichen',
  'vin',
  'tacho',
  'ansicht_vorne_links',
  'ansicht_vorne_rechts',
  'ansicht_hinten_links',
  'ansicht_hinten_rechts',
]

/**
 * Welche Bildunterschrift ein Vorschlag am Ende bekommt — je nach Kategorie
 * unterschiedlich gebunden. `null` heisst: kein Vorschlag für dieses Foto,
 * genau wie ein leerer String schon immer behandelt wurde.
 *
 * - **Positionsfotos** (`POSITIONSKATEGORIEN`) bekommen immer den
 *   Kategorienamen, nie Modelltext und nie einen Lexikon-Treffer. Sonst
 *   verdrängt ein zufällig erkannter Treffer die eigentliche
 *   Übersichtsbeschriftung — am 10.09.2026 beobachtet: eine „Ansicht hinten
 *   links" bekam dieselbe Schadensformulierung wie ein ganz anderes
 *   Detailfoto.
 * - **`schaden`, wenn ein Lexikon existiert** nutzt ausschliesslich den
 *   Lexikon-Treffer. Kommt keiner gültig zustande — das Modell hat sich
 *   nicht ans Lexikon gehalten, oder es ist wirklich ein nicht gelistetes
 *   Teil zu sehen —, entfällt der Vorschlag komplett. Bewusst kein
 *   Freitext mehr als Ausweg (bis 10.09.2026 gab es den): lieber kein
 *   KI-Vorschlag als einer, der vom Hausstil abweicht.
 * - **`schaden` ohne Lexikon** (es gibt noch keine Einträge) sowie **alles
 *   andere** (Reifen, Innenraum, Papiere, Sonstiges) bleibt freier
 *   Modelltext — dort gibt es keine Alternative zu Freitext.
 */
function bildunterschrift(
  vorschlag: z.infer<typeof vorschlagSchema>,
  teile: readonly FotoTeil[],
): string | null {
  if (POSITIONSKATEGORIEN.includes(vorschlag.kategorie)) {
    return kategoriename(vorschlag.kategorie)
  }

  if (vorschlag.kategorie === 'schaden' && teile.length > 0) {
    // `.slice(0, 1)` erzwingt serverseitig, was der Auftragstext nur bitten
    // kann: nie mehr als ein Treffer je Foto.
    const rohtreffer: Rohtreffer[] = vorschlag.treffer.slice(0, 1).map((t) => ({
      teil: t.teil,
      seite: istSeite(t.seite) ? t.seite : null,
      begriff: t.beschaedigungsart,
    }))
    const zusammengesetzt = zusammensetzen(teile, rohtreffer)
    if (!zusammengesetzt) return null
    return zusammengesetzt.trim().replace(/[.;:,\s]+$/, '').slice(0, 120)
  }

  const text = vorschlag.beschreibung.trim().replace(/[.;:,\s]+$/, '').slice(0, 120)
  return text || null
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
  teile: FotoTeil[],
  bilder: Bildpaket[],
): Promise<Fotovorschlag[]> {
  if (bilder.length === 0) return []

  const inhalt: InhaltsBlock[] = [{ type: 'text', text: auftragstext(fahrzeug, stilbeispiele, teile) }]
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
      werkzeug: bauWerkzeug(teile),
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

    // Unter der Mindestsicherheit entfällt der Vorschlag komplett — für
    // jede Kategorie, nicht nur bei einem Lexikon-Treffer. Gerundet wird
    // hier einmal; derselbe Wert geht unten in den Vorschlag, kein zweites
    // Runden nötig.
    const sicherheit = Math.round(vorschlag.sicherheit)
    if (sicherheit < MINDESTSICHERHEIT) continue

    const beschreibung = bildunterschrift(vorschlag, teile)
    if (!beschreibung) continue
    vorschlaege.push({
      fotoId: bild.fotoId,
      kategorie: vorschlag.kategorie,
      beschreibung,
      verwendung: verwendungFuer(vorschlag.kategorie),
      sicherheit,
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
  teile: FotoTeil[],
  bilder: Bildpaket[],
  melde: (fertig: number, gesamt: number) => void = () => {},
): Promise<Fotovorschlag[]> {
  const alle: Fotovorschlag[] = []
  let fertig = 0
  for (const paket of inPakete(bilder)) {
    alle.push(...(await beschriftePaket(fahrzeug, stilbeispiele, teile, paket)))
    fertig += paket.length
    melde(fertig, bilder.length)
  }
  return alle
}
