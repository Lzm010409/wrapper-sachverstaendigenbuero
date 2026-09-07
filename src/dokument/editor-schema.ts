/**
 * Die Editor-Erweiterungen zum Dokumentbaum.
 *
 * Sie bilden genau die Struktur nach, die `typen.ts` beschreibt — und sonst
 * nichts. Der Editor kann deshalb nichts erzeugen, was die Ausgabe später
 * nicht versteht: keine Überschriftenebenen, keine Codeblöcke, keine
 * Zitatblöcke. Ein Brief hat Betreff, Anrede, Fliesstext, nummerierte
 * Abschnitte, Ergebnis und Signatur.
 *
 * Nur im Browser verwenden.
 */

import { Extension, Mark, Node, mergeAttributes } from '@tiptap/core'
import { ReactNodeViewRenderer } from '@tiptap/react'
import { Plugin, PluginKey, TextSelection, type Transaction } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import type {
  Fragment,
  Mark as PmMark,
  Node as PmNode,
  Schema as PmSchema,
} from '@tiptap/pm/model'
import StarterKit from '@tiptap/starter-kit'
import { Placeholder } from '@tiptap/extensions'
import { ERGEBNIS_ABSAETZE, SIGNATUR } from '@/export/hausstil'
import { BILD_BREITE_STANDARD, KNOTEN, MARKE_BIBLIOTHEK } from './typen'
import { BildAnsicht } from '@/app/(app)/stellungnahmen/[id]/bild-ansicht'
import { PlatzhalterKachel } from '@/app/(app)/stellungnahmen/[id]/platzhalter-kachel'
import { zerlegeMitPlatzhaltern } from './platzhalter'
import { klassifiziereKlammerausdruck } from '@/bibliothek/parser'

/**
 * Der Rahmen des Schreibens ist fest.
 *
 * `betreff anrede block+ signatur` heisst: Betreff und Anrede lassen sich
 * ändern, aber nicht löschen, und unter der Signatur kann nichts stehen.
 */
export const Dokument = Node.create({
  name: KNOTEN.dokument,
  topNode: true,
  content: 'betreff anrede block+ signatur',
})

export const Betreff = Node.create({
  name: KNOTEN.betreff,
  content: 'text*',
  marks: '',
  defining: true,
  parseHTML: () => [{ tag: 'p[data-betreff]' }],
  renderHTML: ({ HTMLAttributes }) => [
    'p',
    mergeAttributes(HTMLAttributes, { 'data-betreff': '', class: 'd-betreff' }),
    0,
  ],
})

export const Anrede = Node.create({
  name: KNOTEN.anrede,
  content: 'text*',
  marks: '',
  defining: true,
  parseHTML: () => [{ tag: 'p[data-anrede]' }],
  renderHTML: ({ HTMLAttributes }) => [
    'p',
    mergeAttributes(HTMLAttributes, { 'data-anrede': '', class: 'd-anrede' }),
    0,
  ],
})

export const PositionsUeberschrift = Node.create({
  name: KNOTEN.ueberschrift,
  content: 'text*',
  marks: '',
  defining: true,
  parseHTML: () => [{ tag: 'h3[data-ueberschrift]' }],
  renderHTML: ({ HTMLAttributes }) => [
    'h3',
    mergeAttributes(HTMLAttributes, { 'data-ueberschrift': '', class: 'd-ueberschrift' }),
    0,
  ],
})

/**
 * Ein nummerierter Abschnitt des Schreibens.
 *
 * Die Nummer steht ausdrücklich **nicht** im Text: sie wird über einen
 * CSS-Zähler aus der Reihenfolge gebildet. Wird eine Position nicht
 * bestritten und ihr Abschnitt entfernt, rückt die Nummerierung von selbst
 * nach — genau die Regel, die der Hausstil verlangt.
 *
 * `isolating` hält die Grenzen dicht: eine Rückschritt-Taste am
 * Abschnittsanfang zieht den Absatz nicht in den Abschnitt davor.
 */
export const PositionsAbschnitt = Node.create({
  name: KNOTEN.abschnitt,
  group: 'block',
  content: `${KNOTEN.ueberschrift} (paragraph|bulletList|orderedList|${KNOTEN.bild})+`,
  defining: true,
  isolating: true,

  addAttributes: () => ({
    positionId: {
      default: null,
      parseHTML: (el: HTMLElement) => el.getAttribute('data-position-id'),
      renderHTML: (attrs: Record<string, unknown>) =>
        attrs.positionId ? { 'data-position-id': attrs.positionId as string } : {},
    },
    bezeichnung: {
      default: '',
      parseHTML: (el: HTMLElement) => el.getAttribute('data-bezeichnung') ?? '',
      renderHTML: (attrs: Record<string, unknown>) =>
        attrs.bezeichnung ? { 'data-bezeichnung': attrs.bezeichnung as string } : {},
    },
    ausgelassen: {
      default: false,
      parseHTML: (el: HTMLElement) => el.hasAttribute('data-ausgelassen'),
      renderHTML: (attrs: Record<string, unknown>) =>
        attrs.ausgelassen ? { 'data-ausgelassen': '' } : {},
    },
  }),

  parseHTML: () => [{ tag: 'section[data-position-id]' }],
  renderHTML: ({ HTMLAttributes }) => [
    'section',
    mergeAttributes(HTMLAttributes, { class: 'd-abschnitt' }),
    0,
  ],
})

export const Ergebnis = Node.create({
  name: KNOTEN.ergebnis,
  content: 'inline*',
  group: 'block',
  defining: true,
  parseHTML: () => [{ tag: 'p[data-ergebnis]' }],
  renderHTML: ({ HTMLAttributes }) => [
    'p',
    mergeAttributes(HTMLAttributes, { 'data-ergebnis': '', class: 'd-ergebnis' }),
    0,
  ],
})

/**
 * Die Signatur steht im Editor, lässt sich aber nicht bearbeiten.
 *
 * Sichtbar, weil das Bild auf dem Schirm dem versandten Brief entsprechen
 * soll; gesperrt, weil der Hausstil sonst zwei Quellen hätte.
 */
export const Signatur = Node.create({
  name: KNOTEN.signatur,
  atom: true,
  selectable: false,
  draggable: false,
  parseHTML: () => [{ tag: 'div[data-signatur]' }],
  renderHTML: () => [
    'div',
    { 'data-signatur': '', class: 'd-signatur', contenteditable: 'false' },
    ...SIGNATUR.map((zeile) => ['p', {}, zeile || ' '] as const),
  ],
})

/**
 * Die Herkunftsmarke.
 *
 * `inclusive: false` sorgt dafür, dass frisch getippter Text am Rand eines
 * eingefügten Bausteins nicht fälschlich als Bibliothekstext gilt. Wer
 * mitten im Baustein umformuliert, behält die Marke — genau so soll es
 * sein: der Absatz stammt weiterhin aus diesem Eintrag.
 */
export const Bibliothekstext = Mark.create({
  name: MARKE_BIBLIOTHEK,
  inclusive: false,

  addAttributes: () => ({
    eintragId: {
      default: null,
      parseHTML: (el: HTMLElement) => el.getAttribute('data-eintrag-id'),
      renderHTML: (attrs: Record<string, unknown>) =>
        attrs.eintragId ? { 'data-eintrag-id': attrs.eintragId as string } : {},
    },
    nummer: {
      default: null,
      parseHTML: (el: HTMLElement) => el.getAttribute('data-nummer'),
      renderHTML: (attrs: Record<string, unknown>) =>
        attrs.nummer ? { 'data-nummer': attrs.nummer as string } : {},
    },
    titel: {
      default: null,
      parseHTML: (el: HTMLElement) => el.getAttribute('title'),
      renderHTML: (attrs: Record<string, unknown>) =>
        attrs.titel ? { title: `${attrs.nummer ? `${attrs.nummer} ` : ''}${attrs.titel}` } : {},
    },
    herkunft: {
      default: 'vorschlag',
      parseHTML: (el: HTMLElement) => el.getAttribute('data-herkunft') ?? 'vorschlag',
      renderHTML: (attrs: Record<string, unknown>) => ({
        'data-herkunft': (attrs.herkunft as string) ?? 'vorschlag',
      }),
    },
  }),

  parseHTML: () => [{ tag: 'span[data-eintrag-id]' }, { tag: 'span[data-herkunft]' }],
  renderHTML: ({ HTMLAttributes }) => [
    'span',
    mergeAttributes(HTMLAttributes, { class: 'd-quelle' }),
    0,
  ],
})

/**
 * Ein Bild im Schreiben.
 *
 * Der Inhalt des Knotens ist die **Beschriftung** — sie ist damit
 * gewöhnlicher Text des Dokuments und wird wie jeder andere bearbeitet,
 * geprüft und ausgegeben. Ein Feld daneben wäre bequemer zu bauen und
 * schlechter zu benutzen.
 *
 * `isolating` hält die Grenzen dicht: eine Rückschritt-Taste in der
 * Beschriftung zerlegt nicht den Absatz darüber.
 */
export const Bild = Node.create({
  name: KNOTEN.bild,
  group: 'block',
  content: 'inline*',
  draggable: true,
  isolating: true,

  addAttributes: () => ({
    bildId: {
      default: null,
      parseHTML: (el: HTMLElement) => el.getAttribute('data-bild-id'),
      renderHTML: (attrs: Record<string, unknown>) =>
        attrs.bildId ? { 'data-bild-id': attrs.bildId as string } : {},
    },
    breite: {
      default: BILD_BREITE_STANDARD,
      parseHTML: (el: HTMLElement) => Number(el.getAttribute('data-breite')) || BILD_BREITE_STANDARD,
      renderHTML: (attrs: Record<string, unknown>) => ({ 'data-breite': String(attrs.breite) }),
    },
    breitePx: {
      default: 1000,
      parseHTML: (el: HTMLElement) => Number(el.getAttribute('data-breite-px')) || 1000,
      renderHTML: (attrs: Record<string, unknown>) => ({ 'data-breite-px': String(attrs.breitePx) }),
    },
    hoehePx: {
      default: 750,
      parseHTML: (el: HTMLElement) => Number(el.getAttribute('data-hoehe-px')) || 750,
      renderHTML: (attrs: Record<string, unknown>) => ({ 'data-hoehe-px': String(attrs.hoehePx) }),
    },
    dateiname: {
      default: 'Bild',
      parseHTML: (el: HTMLElement) => el.getAttribute('data-dateiname') ?? 'Bild',
      renderHTML: (attrs: Record<string, unknown>) => ({
        'data-dateiname': String(attrs.dateiname ?? 'Bild'),
      }),
    },
  }),

  parseHTML: () => [{ tag: 'figure[data-bild-id]' }],
  renderHTML: ({ HTMLAttributes }) => [
    'figure',
    mergeAttributes(HTMLAttributes, { class: 'd-bild' }),
    ['figcaption', {}, 0],
  ],

  addNodeView() {
    return ReactNodeViewRenderer(BildAnsicht)
  },
})

/**
 * Ein Platzhalter — eine Angabe, die noch fehlt.
 *
 * `atom: true` ist der ganze Punkt: der Knoten hat keinen Textinhalt, in
 * den die Schreibmarke hineinlaufen könnte, und er lässt sich nur ganz
 * löschen. Vorher standen Platzhalter als gewöhnlicher Text im Brief; eine
 * mitgelöschte Klammer brachte damit den Wächter R1 zum Schweigen, der über
 * genau diese Klammern sucht.
 *
 * In der Ausgabe erscheint er wieder als `[Schlüssel]` — dafür sorgt
 * `knotenText` in `typen.ts`. Nach aussen ändert sich damit nichts: die
 * Word-Datei, die Klartextfassung und alle vier Wächter sehen denselben
 * Text wie zuvor. Auch das `renderHTML` trägt die Klammern, damit ein
 * Ausschneiden in eine fremde Anwendung nichts verschluckt.
 */
export const Platzhalter = Node.create({
  name: KNOTEN.platzhalter,
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,

  addOptions: () => ({ werte: {} as Record<string, string> }),

  addAttributes: () => ({
    schluessel: {
      default: '',
      parseHTML: (el: HTMLElement) => el.getAttribute('data-schluessel') ?? '',
      renderHTML: (attrs: Record<string, unknown>) => ({
        'data-schluessel': String(attrs.schluessel ?? ''),
      }),
    },
    art: {
      default: 'wert',
      parseHTML: (el: HTMLElement) => el.getAttribute('data-art') ?? 'wert',
      renderHTML: (attrs: Record<string, unknown>) => ({ 'data-art': String(attrs.art ?? 'wert') }),
    },
  }),

  parseHTML: () => [{ tag: 'span[data-platzhalter]' }],
  renderHTML: ({ HTMLAttributes, node }) => [
    'span',
    mergeAttributes(HTMLAttributes, { 'data-platzhalter': '', class: 'd-platzhalter' }),
    `[${String(node.attrs.schluessel ?? '')}]`,
  ],

  addNodeView() {
    return ReactNodeViewRenderer(PlatzhalterKachel)
  },
})

/**
 * Hält die Platzhalter nach, während geschrieben wird.
 *
 * Beim Öffnen eines Schreibens wandelt `wandlePlatzhalterInKnoten` die
 * eckigen Klammern um. Hier passiert dasselbe für alles, was danach
 * hineinkommt: getippt, eingefügt, aus der Bibliothek übernommen. Eine
 * Regel an zwei Orten wäre zwei Regeln — beide benutzen deshalb
 * `zerlegeMitPlatzhaltern`.
 *
 * Betreff und Anrede bleiben aussen vor: dort lässt das Schema nur Text zu.
 * Und ausgelassen wird auch, was der Verfasser gerade tippt — solange die
 * Schreibmarke in der Klammer steht, wäre eine Umwandlung mitten im Wort
 * eine Bevormundung. Erst wenn er die Stelle verlässt, greift sie.
 */
export const Platzhalterwandler = Extension.create({
  name: 'platzhalterwandler',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        appendTransaction(vorgaenge, _alt, neu) {
          if (!vorgaenge.some((v) => v.docChanged)) return null

          const schreibmarke = neu.selection.from
          const aenderungen: {
            von: number
            bis: number
            stuecke: ReturnType<typeof zerlegeMitPlatzhaltern>
            marken: readonly PmMark[]
          }[] = []

          neu.doc.descendants((knoten, pos, elternteil) => {
            if (!knoten.isText || !knoten.text) return true
            const eltern = elternteil?.type.name
            if (eltern === KNOTEN.betreff || eltern === KNOTEN.anrede) return false

            const stuecke = zerlegeMitPlatzhaltern(knoten.text)
            if (stuecke.every((s) => s.art === 'text')) return true

            // Steht die Schreibmarke in diesem Textstück, wird nichts
            // angefasst: sonst schnappt die Klammer zu, während noch
            // getippt wird.
            if (schreibmarke > pos && schreibmarke < pos + knoten.nodeSize) return true

            aenderungen.push({
              von: pos,
              bis: pos + knoten.nodeSize,
              stuecke,
              marken: knoten.marks,
            })
            return true
          })

          if (aenderungen.length === 0) return null

          const tr = neu.tr
          // Von hinten nach vorn, damit die vorderen Stellen gültig bleiben.
          for (const a of [...aenderungen].reverse()) {
            /*
              Die Marken des ursprünglichen Textes gehen mit — an die Stücke
              wie an den Platzhalter selbst. Ohne sie verlor ein
              eingefügter Baustein beim Umwandeln seine Herkunftsmarke: der
              Text stand im Brief, aber die Spur zum Bibliothekseintrag war
              fort, und mit ihr die Grundlage von Wächter R4 und der
              Wirkungsstatistik. Bemerkt hat das die Bedienprobe, nicht das
              Auge — im Brief sah alles richtig aus.
            */
            const teile = a.stuecke.map((s) =>
              s.art === 'text'
                ? neu.schema.text(s.text, a.marken as PmMark[])
                : neu.schema.nodes[KNOTEN.platzhalter]!.create(
                    {
                      schluessel: s.schluessel,
                      art: klassifiziereKlammerausdruck(s.schluessel),
                    },
                    null,
                    a.marken as PmMark[],
                  ),
            )
            tr.replaceWith(a.von, a.bis, teile)
          }
          tr.setMeta('addToHistory', false)
          return tr.docChanged ? tr : null
        },
      }),
    ]
  },
})

/**
 * Das Ereignis, mit dem der Kopfbereich seine Angaben ansagt.
 *
 * Der Kopf ist ein Formular für sich, der Brief steht im Editor daneben —
 * beide wissen voneinander nichts. Damit ein nachgetragenes Datum im Brief
 * ankommt, meldet der Kopf es nach dem Speichern an; der Schreibtisch
 * hört zu und trägt nach, wo noch die Vorlage steht.
 */
export const EREIGNIS_KOPF = 'kopfdaten'

export interface Kopfmeldung {
  empfaengerName: string
  einleitungDatum: string
  einleitungMedium: string
}

/** Das Ereignis, mit dem eine Marke im Brief ihre Position meldet. */
export const EREIGNIS_MARKE = 'abschnittsmarke'

/**
 * Die Marke am Rand eines Abschnitts.
 *
 * Ein Knopf im Papierrand, der die Nummer der Position trägt. Er meldet
 * seinen Klick als Ereignis nach oben, statt eine Rückrufadresse aus React
 * mitzuschleppen: die Auszeichnungen entstehen einmal beim Bau des Editors,
 * eine mitgegebene Funktion wäre nach dem ersten Neuzeichnen veraltet.
 */
function baueMarke(nummer: number, positionId: string, zustand: string): HTMLElement {
  const knopf = document.createElement('button')
  knopf.type = 'button'
  knopf.className = `abschnittsmarke ${zustand}`
  knopf.textContent = String(nummer)
  knopf.contentEditable = 'false'
  knopf.tabIndex = -1
  knopf.title = `Position ${nummer} — Anmerkung öffnen`
  knopf.setAttribute('aria-label', `Anmerkung zu Position ${nummer} öffnen`)
  knopf.addEventListener('mousedown', (ereignis) => {
    // Ohne `preventDefault` setzt ProseMirror die Schreibmarke an den Rand
    // des Abschnitts, bevor der Klick überhaupt ankommt.
    ereignis.preventDefault()
    ereignis.stopPropagation()
    knopf.dispatchEvent(new CustomEvent(EREIGNIS_MARKE, { bubbles: true, detail: positionId }))
  })
  return knopf
}

/**
 * Markiert Abschnitte ohne Text.
 *
 * Die Nummerierung im Editor entsteht über einen CSS-Zähler, die im
 * ausgegebenen Schreiben über die Reihenfolge der Abschnitte mit Text.
 * Beide müssen dieselbe Zahl zeigen — sonst spricht die Anmerkung am Rand
 * von Position 3 und der Brief von Position 2. Diese Auszeichnung nimmt
 * leere Abschnitte aus der Zählung heraus.
 */
export const LeereAbschnitte = Extension.create({
  name: 'leereAbschnitte',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        props: {
          decorations(state) {
            const auszeichnungen: Decoration[] = []
            let laufend = 0
            state.doc.descendants((node, pos) => {
              if (node.type.name !== KNOTEN.abschnitt) return true
              let text = ''
              node.forEach((kind) => {
                if (kind.type.name !== KNOTEN.ueberschrift) text += kind.textContent
              })

              /**
               * Die Marke im Papierrand.
               *
               * Sie trägt dieselbe Zahl wie die Marke in der Leiste und die
               * Anmerkung am Rand — die Reihenfolge des Prüfberichts. Bei
               * achtzehn Positionen ist sie der kürzeste Weg zum Argument:
               * die Anmerkung wird dort geöffnet, wo man ohnehin liest,
               * statt am Rand gesucht zu werden.
               */
              // Als eigene Konstante, nicht als Zähler: die Funktion unten
              // wird später aufgerufen und läse sonst den Endstand.
              const nummer = (laufend += 1)
              const positionId =
                typeof node.attrs.positionId === 'string' ? node.attrs.positionId : ''
              const zustand = node.attrs.ausgelassen
                ? 'draussen'
                : text.trim()
                  ? 'fertig'
                  : 'leer'
              if (positionId) {
                auszeichnungen.push(
                  Decoration.widget(pos + 1, () => baueMarke(nummer, positionId, zustand), {
                    side: -1,
                    key: `marke-${positionId}-${nummer}-${zustand}`,
                  }),
                )
              }

              if (!text.trim()) {
                auszeichnungen.push(
                  Decoration.node(pos, pos + node.nodeSize, { class: 'abschnitt-leer' }),
                )
              }

              // Eine leere Überschrift trägt den Namen der Position als
              // Schatten. Ohne ihn verschwindet ein Abschnitt, dessen
              // Überschrift gelöscht wurde, vollständig aus dem Bild — die
              // Marke in der Leiste und die Anmerkung am Rand stehen dann
              // scheinbar ohne Grund da.
              const bezeichnung =
                typeof node.attrs.bezeichnung === 'string' ? node.attrs.bezeichnung : ''
              const kopf = node.firstChild
              if (kopf && kopf.type.name === KNOTEN.ueberschrift && !kopf.textContent.trim()) {
                auszeichnungen.push(
                  Decoration.node(pos + 1, pos + 1 + kopf.nodeSize, {
                    class: 'ueberschrift-leer',
                    'data-titel': bezeichnung || 'Ohne Überschrift',
                  }),
                )
              }
              return false
            })
            return DecorationSet.create(state.doc, auszeichnungen)
          },
        },
      }),
    ]
  },
})

/* ------------------------------------------------------------------ *
 * Der Rahmen
 * ------------------------------------------------------------------ */

interface Abschnittsfund {
  id: string
  pos: number
  node: PmNode
}

/** Alle Positionsabschnitte des Dokuments in seiner Reihenfolge. */
function abschnitteImBaum(doc: PmNode): Abschnittsfund[] {
  const gefunden: Abschnittsfund[] = []
  doc.descendants((node, pos) => {
    if (node.type.name !== KNOTEN.abschnitt) return true
    const id = typeof node.attrs.positionId === 'string' ? node.attrs.positionId : ''
    gefunden.push({ id, pos, node })
    return false
  })
  return gefunden
}

/** Die Stelle vor Ergebnis und Signatur — das Ende des Fliesstextes. */
function stelleVorDemSchluss(doc: PmNode): number {
  let stelle: number | null = null
  doc.forEach((kind, versatz) => {
    if (stelle !== null) return
    if (kind.type.name === KNOTEN.ergebnis || kind.type.name === KNOTEN.signatur) {
      stelle = versatz
    }
  })
  return stelle ?? doc.content.size
}

/**
 * Der Einleitungssatz aus der Ablage — und sein Platz im Dokument.
 *
 * Betreff, Anrede und Ergebnis tragen ein Merkmal, an dem sie sich in der
 * Ablage wiederfinden lassen. Der Einleitungssatz („mit dem Schreiben vom
 * … überliessen Sie uns den Kürzungsbericht") trägt keines: er ist ein
 * gewöhnlicher Absatz. Nach Ausschneiden und Einfügen fiel er deshalb als
 * einziger Teil des Briefkopfs unter den Tisch — und anders als bei den
 * Abschnitten fällt das nicht auf, weil an seiner Stelle einfach ein leerer
 * Absatz steht.
 *
 * Er lässt sich trotzdem eindeutig bestimmen: es ist alles, was zwischen
 * der Anrede und dem ersten Abschnitt steht. Genau so wird er hier aus der
 * Ablage gelesen und genau dorthin zurückgeschrieben — aber nur, wenn dort
 * nichts steht. Was der Verfasser inzwischen selbst geschrieben hat, wird
 * nie überschrieben.
 */
function einleitungAusAblage(baum: Document): string[] {
  const absaetze: string[] = []
  let nachAnrede = false
  for (const el of baum.body.querySelectorAll('p, section')) {
    if (el.matches('p[data-anrede]')) {
      nachAnrede = true
      continue
    }
    if (el.tagName === 'SECTION') break
    if (!nachAnrede) continue
    if (el.matches('p[data-betreff], p[data-ergebnis]')) continue
    const text = el.textContent?.trim()
    if (text) absaetze.push(text)
  }
  return absaetze
}

/** Die Strecke zwischen Anrede und erstem Abschnitt. */
function einleitungsstrecke(doc: PmNode): { von: number; bis: number; leer: boolean } | null {
  let von: number | null = null
  let bis: number | null = null
  let leer = true
  doc.forEach((kind, versatz) => {
    if (kind.type.name === KNOTEN.anrede) {
      von = versatz + kind.nodeSize
      return
    }
    if (von === null || bis !== null) return
    if (kind.type.name === KNOTEN.abschnitt || kind.type.name === KNOTEN.ergebnis) {
      bis = versatz
      return
    }
    if (kind.textContent.trim() !== '') leer = false
  })
  if (von === null) return null
  return { von, bis: bis ?? von, leer }
}

/**
 * Ein leerer Abschnitt mit denselben Angaben wie der verlorene — und mit
 * seiner Überschrift.
 *
 * Die Überschrift kommt aus dem Abschnitt, wie er eben noch dastand, nicht
 * aus der Angabe `bezeichnung`. Der Unterschied ist der Punkt der Übung:
 * `bezeichnung` trägt den Namen aus dem Prüfbericht, und wer die
 * Überschrift im Brief umgeschrieben hatte, bekam beim Wiederherstellen den
 * alten Namen zurück — seine Arbeit war weg, ohne dass es jemand ansagte.
 *
 * Der naheliegende Weg wäre gewesen, die Angabe bei jeder Änderung der
 * Überschrift nachzuziehen. Das wäre ein teurer Fehler: `setNodeMarkup`
 * zeichnet den Abschnitt neu, und dabei sterben die Kindansichten — die
 * Bilder verlören ihre Ziehgriffe. Genau daran ist das schon einmal
 * gescheitert. Der Wortlaut wird deshalb erst dann gelesen, wenn er
 * gebraucht wird: beim Wiederherstellen.
 */
function leererAbschnitt(schema: PmSchema, verloren: PmNode): PmNode {
  const kopf = verloren.firstChild
  const wortlaut =
    kopf?.type.name === KNOTEN.ueberschrift && kopf.textContent.trim()
      ? kopf.textContent.trim()
      : typeof verloren.attrs.bezeichnung === 'string'
        ? verloren.attrs.bezeichnung
        : ''

  return schema.nodes[KNOTEN.abschnitt]!.create(verloren.attrs, [
    schema.nodes[KNOTEN.ueberschrift]!.create(null, wortlaut ? schema.text(wortlaut) : null),
    schema.nodes.paragraph!.create(),
  ])
}

/** Wohin ein fehlender Abschnitt gehört, gemessen an seinen Nachbarn. */
function einfuegestelle(doc: PmNode, reihenfolge: string[], id: string): number {
  const rang = reihenfolge.indexOf(id)
  const da = abschnitteImBaum(doc)
  const finde = (kennung: string) => da.find((a) => a.id === kennung)

  for (let i = rang - 1; i >= 0; i--) {
    const fund = finde(reihenfolge[i]!)
    if (fund) return fund.pos + fund.node.nodeSize
  }
  for (let i = rang + 1; i < reihenfolge.length; i++) {
    const fund = finde(reihenfolge[i]!)
    if (fund) return fund.pos
  }
  return stelleVorDemSchluss(doc)
}

/** Alle Abschnitte, die in einem eingefügten Stück stecken. */
function abschnitteImStueck(inhalt: Fragment): PmNode[] {
  const gefunden: PmNode[] = []
  inhalt.forEach((kind) => {
    if (kind.type.name === KNOTEN.abschnitt) gefunden.push(kind)
    else if (kind.isBlock && kind.childCount > 0) gefunden.push(...abschnitteImStueck(kind.content))
  })
  return gefunden
}

/**
 * Beigabe an eine Änderung, die einen Abschnitt absichtlich wegnimmt.
 *
 * Ohne sie legt der Rahmen ihn sofort wieder an — genau dafür ist er da.
 */
export const RAHMEN_FREI = 'rahmenFrei'


/**
 * Legt den Ergebnisabsatz wieder an, wenn eine Änderung ihn mitgenommen hat.
 *
 * Er gehört zum Rahmen wie die Abschnitte: das Schema lässt ihn als
 * gewöhnlichen Block zu, ein Rundumschnitt nimmt ihn also mit. Ohne ihn
 * endet das Schreiben ohne den Schlusssatz des Hausstils — und niemand
 * sieht, dass er fehlt.
 */
function ergaenzeErgebnis(tr: Transaction, altesDoc: PmNode, schema: PmSchema): boolean {
  const hatte = (doc: PmNode) => {
    let da = false
    doc.forEach((kind) => {
      if (kind.type.name === KNOTEN.ergebnis) da = true
    })
    return da
  }
  if (!hatte(altesDoc) || hatte(tr.doc)) return false

  tr.insert(
    stelleVorDerSignatur(tr.doc),
    schema.nodes[KNOTEN.ergebnis]!.create(null, schema.text(ERGEBNIS_ABSAETZE.vollstaendig)),
  )
  return true
}

/** Die Stelle unmittelbar vor der Signatur. */
function stelleVorDerSignatur(doc: PmNode): number {
  let stelle: number | null = null
  doc.forEach((kind, versatz) => {
    if (stelle === null && kind.type.name === KNOTEN.signatur) stelle = versatz
  })
  return stelle ?? doc.content.size
}

/**
 * Der Rahmen des Schreibens überlebt jede Bearbeitung.
 *
 * Zwei Dinge tut diese Erweiterung, und beide hängen zusammen.
 *
 * **Abschnitte kehren zurück.** Wer alles markiert und ausschneidet, hat
 * den Text in der Ablage — die Abschnitte aber wären fort, und mit ihnen
 * die Zuordnung zu den Kürzungspositionen. Jede Änderung, die einen
 * Abschnitt entfernt, bekommt ihn deshalb leer zurückgesetzt, an seiner
 * alten Stelle. Was verschwinden soll, verschwindet über „Nicht
 * bestreiten": dann bleibt der Abschnitt stehen und wird ausgelassen.
 *
 * **Eingefügtes findet zurück an seinen Platz.** Ein Stück, das Abschnitte
 * enthält, wird nicht an der Schreibmarke abgelegt — dort passt es
 * schema-seitig meist gar nicht hin, und das Einfügen scheiterte bisher
 * lautlos. Stattdessen wird jeder Abschnitt an seiner Positionskennung
 * erkannt und sein Inhalt an der richtigen Stelle wiederhergestellt.
 * Ausschneiden und Einfügen ist damit ein vollständiger Hin- und Rückweg,
 * auch über das ganze Schreiben.
 */
export const Rahmen = Extension.create({
  name: 'rahmen',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        appendTransaction(vorgaenge, alt, neu) {
          if (!vorgaenge.some((v) => v.docChanged)) return null
          // Eine Position, die ganz aus dem Fall genommen wird, darf ihren
          // Abschnitt mitnehmen. Sie sagt es ausdrücklich an.
          if (vorgaenge.some((v) => v.getMeta(RAHMEN_FREI) === true)) return null

          const vorher = abschnitteImBaum(alt.doc).filter((a) => a.id)
          const jetzt = new Set(abschnitteImBaum(neu.doc).map((a) => a.id))
          const fehlend = vorher.filter((a) => !jetzt.has(a.id))

          if (fehlend.length === 0) {
            const tr = neu.tr
            return ergaenzeErgebnis(tr, alt.doc, neu.schema) ? tr : null
          }

          const reihenfolge = vorher.map((a) => a.id)
          const tr = neu.tr
          for (const a of fehlend) {
            tr.insert(
              einfuegestelle(tr.doc, reihenfolge, a.id),
              leererAbschnitt(neu.schema, a.node),
            )
          }
          ergaenzeErgebnis(tr, alt.doc, neu.schema)
          return tr
        },

        props: {
          handlePaste(sicht, ereignis, stueck) {
            const abschnitte = abschnitteImStueck(stueck.content)
            if (abschnitte.length === 0) return false

            // Der Wortlaut aus der Ablage, unverarbeitet. Betreff, Anrede
            // und Ergebnis werden daraus gelesen — nicht aus dem
            // eingefügten Stück.
            const html = (ereignis as ClipboardEvent).clipboardData?.getData('text/html') ?? ''

            const tr = sicht.state.tr
            const unbekannt: PmNode[] = []
            let schreibmarke: number | null = null

            for (const knoten of abschnitte) {
              const id = typeof knoten.attrs.positionId === 'string' ? knoten.attrs.positionId : ''
              const fund = id ? abschnitteImBaum(tr.doc).find((a) => a.id === id) : null
              if (!fund) {
                unbekannt.push(knoten)
                continue
              }
              // Erst die Angaben, dann der Inhalt: die Stelle bleibt dabei
              // dieselbe, und „ausgelassen" kommt aus der Ablage mit.
              tr.setNodeMarkup(fund.pos, undefined, {
                ...fund.node.attrs,
                ausgelassen: knoten.attrs.ausgelassen === true,
              })
              tr.replaceWith(fund.pos + 1, fund.pos + fund.node.nodeSize - 1, knoten.content)
              schreibmarke = fund.pos + knoten.content.size
            }

            /**
             * Betreff, Anrede und Ergebnis gehören zum Hin- und Rückweg
             * dazu — die Signatur nicht, die kommt aus dem Hausstil.
             *
             * Ihr Wortlaut wird unmittelbar aus der Ablage gelesen, an
             * ihren Merkmalen im Geschriebenen. ProseMirror liest ein
             * eingefügtes Stück im Zusammenhang der Einfügestelle: steht
             * die Schreibmarke in einem Absatz, kann dort kein Betreff
             * stehen, und aus dem Betreff wird ein gewöhnlicher Absatz.
             * Betreff und Anrede kamen deshalb leer zurück, während die
             * Abschnitte vollständig waren.
             */
            if (html) {
              const baum = new window.DOMParser().parseFromString(html, 'text/html')
              const rahmen: [string, string][] = [
                [KNOTEN.betreff, 'p[data-betreff]'],
                [KNOTEN.anrede, 'p[data-anrede]'],
                [KNOTEN.ergebnis, 'p[data-ergebnis]'],
              ]
              for (const [name, merkmal] of rahmen) {
                const wortlaut = baum.querySelector(merkmal)?.textContent?.trim()
                if (!wortlaut) continue
                let ziel: { pos: number; node: PmNode } | null = null
                tr.doc.descendants((kind, pos) => {
                  if (ziel) return false
                  if (kind.type.name === name) ziel = { pos, node: kind }
                  return !ziel
                })
                if (!ziel) continue
                const z = ziel as { pos: number; node: PmNode }
                tr.replaceWith(
                  z.pos + 1,
                  z.pos + z.node.nodeSize - 1,
                  sicht.state.schema.text(wortlaut),
                )
              }

              // Und der Einleitungssatz, der kein Merkmal trägt.
              const einleitung = einleitungAusAblage(baum)
              const strecke = einleitungsstrecke(tr.doc)
              if (einleitung.length > 0 && strecke && strecke.leer) {
                const absatz = sicht.state.schema.nodes.paragraph!
                tr.replaceWith(
                  strecke.von,
                  strecke.bis,
                  einleitung.map((text) => absatz.create(null, sicht.state.schema.text(text))),
                )
              }
            }

            for (const knoten of unbekannt) {
              tr.insert(stelleVorDemSchluss(tr.doc), knoten)
            }

            if (!tr.docChanged) return true

            // Die Schreibmarke ans Ende des zuletzt eingesetzten Abschnitts.
            // Ohne diesen Schritt bliebe die Auswahl von vorhin bestehen —
            // nach einem „Alles markieren" wäre das die Auswahl über das
            // ganze Dokument, und der nächste Handgriff träfe alles.
            if (schreibmarke !== null) {
              const stelle = Math.min(Math.max(schreibmarke, 0), tr.doc.content.size)
              tr.setSelection(TextSelection.near(tr.doc.resolve(stelle), -1))
            }

            sicht.dispatch(tr.scrollIntoView())
            return true
          },
        },
      }),
    ]
  },
})

/** Schlüssel des Plugins, das den hervorgehobenen Abschnitt hält. */
export const SCHLUESSEL_AKTIV = new PluginKey<string | null>('aktiverAbschnitt')

/**
 * Hebt den Abschnitt hervor, zu dem die offene Anmerkung gehört.
 *
 * Die Hervorhebung ist eine Auszeichnung und keine Klasse, die von aussen
 * an das Element geschrieben wird. Der Unterschied ist kein Schönheits-
 * fehler: ProseMirror beobachtet seinen eigenen Baum. Wer dort von Hand ein
 * Attribut setzt, sieht seinen Abschnitt neu gezeichnet — und mit ihm alle
 * Bilder darin, samt laufender Bewegung am Ziehgriff. Als Auszeichnung
 * weiss ProseMirror Bescheid und tauscht nur die Klasse aus.
 */
export const AktiverAbschnitt = Extension.create({
  name: 'aktiverAbschnitt',

  addProseMirrorPlugins() {
    return [
      new Plugin<string | null>({
        key: SCHLUESSEL_AKTIV,
        state: {
          init: () => null,
          apply(tr, alt) {
            const neu = tr.getMeta(SCHLUESSEL_AKTIV) as string | null | undefined
            return neu === undefined ? alt : neu
          },
        },
        props: {
          decorations(state) {
            const id = SCHLUESSEL_AKTIV.getState(state)
            if (!id) return null
            const auszeichnungen: Decoration[] = []
            state.doc.descendants((node, pos) => {
              if (node.type.name !== KNOTEN.abschnitt) return true
              if (node.attrs.positionId === id) {
                auszeichnungen.push(Decoration.node(pos, pos + node.nodeSize, { class: 'aktiv' }))
              }
              return false
            })
            return DecorationSet.create(state.doc, auszeichnungen)
          },
        },
      }),
    ]
  },
})

/**
 * Alle Erweiterungen des Brief-Editors.
 *
 * Aus dem Starterpaket bleibt nur, was in einem Geschäftsbrief vorkommt.
 * Überschriften, Codeblöcke und Zitatblöcke sind abgeschaltet — nicht aus
 * Strenge, sondern weil die Word-Ausgabe sie nicht kennt und ein Editor,
 * der mehr anbietet als die Ausgabe kann, in die Irre führt.
 */
/**
 * Die Erweiterungen des Brief-Editors.
 *
 * `werte` sind die Angaben, die der Fall hergibt — dieselben, mit denen
 * beim Einfügen eines Bausteins die Platzhalter gefüllt werden. Sie werden
 * hier durchgereicht, damit die Kachel eines offenen Platzhalters den Wert
 * gleich anbieten kann, statt ihn abzutippen zu verlangen.
 */
export function briefErweiterungen(werte: Record<string, string> = {}) {
  return [
    StarterKit.configure({
      document: false,
      heading: false,
      codeBlock: false,
      code: false,
      blockquote: false,
      horizontalRule: false,
      strike: false,
      link: false,
      trailingNode: false,
    }),
    Dokument,
    Betreff,
    Anrede,
    PositionsUeberschrift,
    PositionsAbschnitt,
    Ergebnis,
    Signatur,
    Bild,
    Platzhalter.configure({ werte }),
    Platzhalterwandler,
    Bibliothekstext,
    LeereAbschnitte,
    AktiverAbschnitt,
    Rahmen,
    Placeholder.configure({
      includeChildren: true,
      placeholder: ({ node }: { node: { type: { name: string } } }) => {
        if (node.type.name === KNOTEN.ueberschrift) return 'Überschrift der Position'
        if (node.type.name === KNOTEN.betreff) return 'Betreff'
        if (node.type.name === KNOTEN.anrede) return 'Anrede'
        if (node.type.name === KNOTEN.bild) return 'Beschriftung (freiwillig)'
        if (node.type.name === KNOTEN.platzhalter) return ''
        return 'Text — oder rechts einen Baustein wählen'
      },
    }),
  ]
}
