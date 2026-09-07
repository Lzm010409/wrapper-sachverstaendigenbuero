/**
 * Griffe in den laufenden Editor.
 *
 * Alles, was die Randspalte am Brief tut — einfügen, ersetzen, einen
 * Abschnitt herausnehmen oder wieder aufnehmen, eine beanstandete Stelle
 * anspringen — läuft über diese Funktionen. Sie arbeiten mit den Knoten des
 * Dokuments, nicht mit Textsuche: eine Position wird über ihre Kennung
 * gefunden, nicht über ihre Überschrift.
 *
 * Nur im Browser verwenden.
 */

import type { Editor } from '@tiptap/react'
import type { Node as PmNode } from '@tiptap/pm/model'
import { KNOTEN, type Knoten } from './typen'
import { RAHMEN_FREI, SCHLUESSEL_AKTIV } from './editor-schema'

/**
 * Der Dokumentbaum als schlichtes JSON.
 *
 * `editor.getJSON()` liefert die Attributobjekte mit leerem Prototyp, so wie
 * ProseMirror sie intern hält. React reicht solche Objekte nicht an eine
 * Server-Aktion durch, sondern ersetzt sie durch Platzhalter — auf dem
 * Server steht dann zwar ein Dokument, aber jeder Zugriff auf `positionId`
 * scheitert. Einmal durch JSON gedreht, und es sind gewöhnliche Objekte.
 */
export function dokumentJson(editor: Editor): unknown {
  return JSON.parse(JSON.stringify(editor.getJSON()))
}

export interface Abschnittsfund {
  /** Position des Abschnittsknotens im Dokument. */
  pos: number
  node: PmNode
}

export function findeAbschnitt(editor: Editor, positionId: string): Abschnittsfund | null {
  let gefunden: Abschnittsfund | null = null
  editor.state.doc.descendants((node, pos) => {
    if (gefunden) return false
    if (node.type.name === KNOTEN.abschnitt && node.attrs.positionId === positionId) {
      gefunden = { pos, node }
      return false
    }
    return true
  })
  return gefunden
}

export interface Abschnittsstand {
  positionId: string
  hatText: boolean
  /** Nicht bestritten: steht im Dokument, aber nicht im Schreiben. */
  ausgelassen: boolean
  /**
   * Die Überschrift, wie sie im Brief steht — leer, solange keine
   * geschrieben wurde.
   *
   * Sie ist der Name, den ein Mensch der Position gegeben hat, und geht
   * darum überall dort vor, wo die Oberfläche die Position benennt. Der
   * Name aus dem Prüfbericht bleibt daneben stehen, wo seine Herkunft
   * etwas erklärt.
   */
  ueberschrift: string
}

/** Die Abschnitte in Dokumentreihenfolge — daraus entsteht die Nummerierung. */
export function abschnittsReihenfolge(editor: Editor): Abschnittsstand[] {
  const liste: Abschnittsstand[] = []
  editor.state.doc.descendants((node) => {
    if (node.type.name !== KNOTEN.abschnitt) return true
    const positionId = node.attrs.positionId
    if (typeof positionId === 'string') {
      let text = ''
      node.forEach((kind) => {
        if (kind.type.name !== KNOTEN.ueberschrift) text += kind.textContent
      })
      liste.push({
        positionId,
        hatText: text.trim().length > 0,
        ausgelassen: node.attrs.ausgelassen === true,
        ueberschrift: node.firstChild?.type.name === KNOTEN.ueberschrift
          ? node.firstChild.textContent.trim()
          : '',
      })
    }
    return false
  })
  return liste
}

/** Der Text eines Abschnitts ohne seine Überschrift, Absätze durch Leerzeilen getrennt. */
export function abschnittsText(editor: Editor, positionId: string): string {
  const fund = findeAbschnitt(editor, positionId)
  if (!fund) return ''
  const teile: string[] = []
  fund.node.forEach((kind) => {
    if (kind.type.name === KNOTEN.ueberschrift) return
    const text = kind.textContent.trim()
    if (text) teile.push(text)
  })
  return teile.join('\n\n')
}

/**
 * Die erste Herkunftsmarke eines Abschnitts.
 *
 * Wird das Ausformulieren angestossen, ersetzt der neue Text den alten —
 * die Herkunft muss dabei erhalten bleiben, sonst verlöre die
 * Wirkungsstatistik genau die Fälle, in denen ein Eintrag am meisten
 * geholfen hat.
 */
export function ersteHerkunft(
  editor: Editor,
  positionId: string,
): { eintragId: string | null; nummer: string | null; titel: string | null } | null {
  const fund = findeAbschnitt(editor, positionId)
  if (!fund) return null

  let gefunden: { eintragId: string | null; nummer: string | null; titel: string | null } | null =
    null
  fund.node.descendants((node) => {
    if (gefunden || !node.isText) return true
    for (const marke of node.marks) {
      if (marke.type.name !== 'bibliothekstext') continue
      const a = marke.attrs as Record<string, unknown>
      gefunden = {
        eintragId: typeof a.eintragId === 'string' ? a.eintragId : null,
        nummer: typeof a.nummer === 'string' ? a.nummer : null,
        titel: typeof a.titel === 'string' ? a.titel : null,
      }
      return false
    }
    return true
  })
  return gefunden
}

/** Der Abschnitt, in dem die Schreibmarke gerade steht. */
export function aktiverAbschnitt(editor: Editor): string | null {
  const { $from } = editor.state.selection
  for (let tiefe = $from.depth; tiefe > 0; tiefe--) {
    const node = $from.node(tiefe)
    if (node.type.name === KNOTEN.abschnitt) {
      return typeof node.attrs.positionId === 'string' ? node.attrs.positionId : null
    }
  }
  return null
}

/**
 * Sagt dem Editor, welcher Abschnitt hervorgehoben werden soll.
 *
 * Die Meldung geht als Beigabe an einer Änderung mit, die den Text nicht
 * anrührt: kein Eintrag in der Rückgängig-Kette, kein Speichervorgang, nur
 * eine andere Klasse am Abschnitt. Steht die Marke schon richtig, geschieht
 * gar nichts — sonst liefe bei jedem Neuzeichnen eine Änderung mehr.
 */
export function markiereAktivenAbschnitt(editor: Editor, id: string | null): void {
  if (SCHLUESSEL_AKTIV.getState(editor.state) === id) return
  const tr = editor.state.tr.setMeta(SCHLUESSEL_AKTIV, id).setMeta('addToHistory', false)
  editor.view.dispatch(tr)
}

/** Enthält der Abschnitt nur einen leeren Absatz? */
function istLeer(node: PmNode): boolean {
  let text = ''
  node.forEach((kind) => {
    if (kind.type.name !== KNOTEN.ueberschrift) text += kind.textContent
  })
  return text.trim().length === 0
}

/**
 * Hängt Absätze an einen Abschnitt an.
 *
 * Ist der Abschnitt noch leer, ersetzen sie den leeren Absatz — sonst
 * bliebe über jedem frisch eingefügten Baustein eine Leerzeile stehen.
 */
export function fuegeInAbschnittEin(
  editor: Editor,
  positionId: string,
  absaetze: Knoten[],
): boolean {
  const fund = findeAbschnitt(editor, positionId)
  if (!fund || absaetze.length === 0) return false

  const { pos, node } = fund
  const innenEnde = pos + node.nodeSize - 1

  if (istLeer(node)) {
    // Alles nach der Überschrift ersetzen.
    const kopf = node.firstChild
    const inhaltAnfang = pos + 1 + (kopf ? kopf.nodeSize : 0)
    editor
      .chain()
      .focus()
      .insertContentAt({ from: inhaltAnfang, to: innenEnde }, absaetze)
      .run()
    return true
  }

  editor.chain().focus().insertContentAt(innenEnde, absaetze).run()
  return true
}

/**
 * Fügt Absätze an der Stelle ein, an der etwas fallen gelassen wurde.
 *
 * Eingefügt wird **hinter** dem Absatz, über dem die Maus losgelassen wurde,
 * nicht mitten hinein: ein Baustein, der einen Satz aufspaltet, ist beim
 * Aufräumen mehr Arbeit als beim Einfügen gespart wurde. Fällt der Baustein
 * ausserhalb eines Positionsabschnitts — in den Betreff, das Ergebnis, die
 * Signatur —, passiert nichts; dort gehört er nicht hin.
 */
export function fuegeAnStelleEin(
  editor: Editor,
  koordinaten: { left: number; top: number },
  absaetze: Knoten[],
): { positionId: string | null } | null {
  if (absaetze.length === 0) return null

  const treffer = editor.view.posAtCoords(koordinaten)
  if (!treffer) return null

  const $pos = editor.state.doc.resolve(treffer.pos)

  let tiefe = -1
  for (let t = $pos.depth; t > 0; t--) {
    if ($pos.node(t).type.name === KNOTEN.abschnitt) {
      tiefe = t
      break
    }
  }
  if (tiefe < 0) return null

  const abschnitt = $pos.node(tiefe)
  const positionId = typeof abschnitt.attrs.positionId === 'string' ? abschnitt.attrs.positionId : null

  if (istLeer(abschnitt)) {
    const anfang = $pos.before(tiefe)
    const kopf = abschnitt.firstChild
    const inhaltAnfang = anfang + 1 + (kopf ? kopf.nodeSize : 0)
    editor
      .chain()
      .focus()
      .insertContentAt({ from: inhaltAnfang, to: anfang + abschnitt.nodeSize - 1 }, absaetze)
      .run()
    return { positionId }
  }

  // Hinter den Block, in dem die Stelle liegt — oder ans Ende des
  // Abschnitts, wenn die Stelle zwischen den Blöcken liegt.
  const ziel =
    $pos.depth > tiefe ? $pos.after(tiefe + 1) : $pos.before(tiefe) + abschnitt.nodeSize - 1

  editor.chain().focus().insertContentAt(ziel, absaetze).run()
  return { positionId }
}

/**
 * Fügt einen Block an der Schreibmarke oder an einer Stelle ein — überall.
 *
 * Anders als beim Baustein ist hier kein Positionsabschnitt nötig: ein Bild
 * darf zwischen Einleitung und erstem Abschnitt genauso stehen wie mitten
 * in einer Begründung. Eingefügt wird hinter dem Block, in dem die Stelle
 * liegt, damit kein Satz zerschnitten wird.
 */
export function fuegeBlockEin(
  editor: Editor,
  knoten: Knoten,
  koordinaten?: { left: number; top: number },
): boolean {
  const stelle = koordinaten
    ? editor.view.posAtCoords(koordinaten)?.pos
    : editor.state.selection.from
  if (stelle === undefined) return false

  const $pos = editor.state.doc.resolve(stelle)

  // Die Tiefe des Blocks suchen, der unmittelbar im Dokument oder in einem
  // Abschnitt steht — dahinter wird eingefügt.
  let tiefe = $pos.depth
  while (tiefe > 1 && $pos.node(tiefe - 1).type.name !== KNOTEN.abschnitt) tiefe--

  /**
   * Steht die Auswahl über dem ganzen Dokument — nach „Alles markieren"
   * etwa —, gibt es keinen Block, hinter den etwas passen würde. Früher
   * landete das Bild dann am Dokumentende, also hinter der Signatur, wo das
   * Schema nichts zulässt: es geschah schlicht nichts. Jetzt kommt es ans
   * Ende des Fliesstextes, vor Ergebnis und Signatur.
   */
  const ziel =
    tiefe >= 1 ? $pos.after(tiefe) : (ergebnisPosition(editor) ?? editor.state.doc.content.size)

  editor.chain().focus().insertContentAt(ziel, knoten as never).run()
  return true
}

/** Ersetzt den gesamten Inhalt eines Abschnitts, die Überschrift bleibt. */
export function ersetzeAbschnittsInhalt(
  editor: Editor,
  positionId: string,
  absaetze: Knoten[],
): boolean {
  const fund = findeAbschnitt(editor, positionId)
  if (!fund) return false

  const { pos, node } = fund
  const kopf = node.firstChild
  const inhaltAnfang = pos + 1 + (kopf ? kopf.nodeSize : 0)
  const innenEnde = pos + node.nodeSize - 1

  editor.chain().focus().insertContentAt({ from: inhaltAnfang, to: innenEnde }, absaetze).run()
  return true
}

/**
 * Nimmt einen Abschnitt aus dem Schreiben — oder wieder hinein.
 *
 * Der Abschnitt wird **nicht gelöscht**. Er bleibt mit seinem Text im
 * Dokument stehen, erscheint aber weder im Brief noch in der Nummerierung.
 * Wer eine Position doch bestreitet, findet seine Arbeit wieder; ein
 * Löschen wäre ein Knopf, der stillschweigend Text vernichtet.
 */
export function setzeAusgelassen(
  editor: Editor,
  positionId: string,
  ausgelassen: boolean,
): boolean {
  const fund = findeAbschnitt(editor, positionId)
  if (!fund) return false

  editor
    .chain()
    .focus()
    .command(({ tr }) => {
      tr.setNodeMarkup(fund.pos, undefined, { ...fund.node.attrs, ausgelassen })
      return true
    })
    .run()
  return true
}

/**
 * Nimmt den Abschnitt einer Position ganz aus dem Schreiben.
 *
 * Nur für den einen Fall gedacht, in dem die Position selbst aus dem Fall
 * verschwindet. Die Beigabe `RAHMEN_FREI` sagt dem Rahmen, dass er diesen
 * Abschnitt nicht zurücklegen soll — sonst stünde er im nächsten Augenblick
 * wieder da.
 */
export function entferneAbschnitt(editor: Editor, positionId: string): boolean {
  const fund = findeAbschnitt(editor, positionId)
  if (!fund) return false

  editor
    .chain()
    .command(({ tr }) => {
      tr.setMeta(RAHMEN_FREI, true)
      tr.delete(fund.pos, fund.pos + fund.node.nodeSize)
      return true
    })
    .run()
  return true
}

/**
 * Nimmt einen Abschnitt wieder auf.
 *
 * Er landet dort, wo er nach der Reihenfolge der Kürzungspositionen
 * hingehört — nicht am Ende. Wer eine Position doch bestreitet, will sie
 * nicht hinter dem Ergebnis wiederfinden.
 */
export function fuegeAbschnittEin(
  editor: Editor,
  positionId: string,
  bezeichnung: string,
  reihenfolge: string[],
): boolean {
  if (findeAbschnitt(editor, positionId)) return false

  const vorhanden = abschnittsReihenfolge(editor).map((a) => a.positionId)
  const eigenerRang = reihenfolge.indexOf(positionId)

  let einfuegePosition: number | null = null
  for (const id of vorhanden) {
    const rang = reihenfolge.indexOf(id)
    if (eigenerRang >= 0 && rang > eigenerRang) {
      const fund = findeAbschnitt(editor, id)
      if (fund) einfuegePosition = fund.pos
      break
    }
  }

  if (einfuegePosition === null) {
    // Hinter den letzten Abschnitt, also vor das Ergebnis.
    const letzte = vorhanden.at(-1)
    const fund = letzte ? findeAbschnitt(editor, letzte) : null
    einfuegePosition = fund
      ? fund.pos + fund.node.nodeSize
      : ergebnisPosition(editor) ?? editor.state.doc.content.size
  }

  editor
    .chain()
    .focus()
    .insertContentAt(einfuegePosition, {
      type: KNOTEN.abschnitt,
      attrs: { positionId, bezeichnung },
      content: [
        { type: KNOTEN.ueberschrift, content: bezeichnung ? [{ type: 'text', text: bezeichnung }] : [] },
        { type: KNOTEN.absatz },
      ],
    })
    .run()
  return true
}

function ergebnisPosition(editor: Editor): number | null {
  let gefunden: number | null = null
  editor.state.doc.descendants((node, pos) => {
    if (gefunden !== null) return false
    if (node.type.name === KNOTEN.ergebnis) {
      gefunden = pos
      return false
    }
    return true
  })
  return gefunden
}

/** Setzt die Schreibmarke in den Abschnitt einer Position. */
export function springeInAbschnitt(editor: Editor, positionId: string): boolean {
  const fund = findeAbschnitt(editor, positionId)
  if (!fund) return false
  // Hinter die Überschrift, in den ersten Absatz.
  const kopf = fund.node.firstChild
  const ziel = fund.pos + 1 + (kopf ? kopf.nodeSize : 0) + 1
  editor
    .chain()
    .focus()
    .setTextSelection(Math.min(ziel, fund.pos + fund.node.nodeSize - 1))
    .scrollIntoView()
    .run()
  return true
}

/**
 * Springt eine beanstandete Stelle an und markiert sie.
 *
 * Gesucht wird innerhalb des Abschnitts, zu dem der Befund gehört — dieselbe
 * Zahl kann an mehreren Stellen im Brief stehen.
 */
export function zeigeFundstelle(
  editor: Editor,
  positionId: string | null | undefined,
  fundstelle: string,
): boolean {
  if (!fundstelle) return false

  const bereich = positionId ? findeAbschnitt(editor, positionId) : null
  const von = bereich ? bereich.pos : 0
  const bis = bereich ? bereich.pos + bereich.node.nodeSize : editor.state.doc.content.size

  /*
    Ein Platzhalter ist kein Text mehr, sondern ein Knoten. Wächter R1 nennt
    als Fundstelle aber weiterhin `[Schlüssel]` — im Textbestand des
    Dokuments kommt diese Zeichenkette also gar nicht mehr vor, und der
    Klick auf die Beanstandung lief ins Leere. Deshalb zwei Wege: der Text
    wie bisher, und der Platzhalter über seinen Schlüssel.
  */
  const klammer = fundstelle.match(/^\[([^\][]+)\]$/)
  const gesuchterSchluessel = klammer ? klammer[1]!.trim() : null

  let treffer: { from: number; to: number } | null = null
  editor.state.doc.nodesBetween(von, bis, (node, pos) => {
    if (treffer) return false

    if (gesuchterSchluessel && node.type.name === KNOTEN.platzhalter) {
      if (String(node.attrs.schluessel ?? '').trim() === gesuchterSchluessel) {
        treffer = { from: pos, to: pos + node.nodeSize }
      }
      return false
    }

    if (!node.isText || !node.text) return true
    const index = node.text.indexOf(fundstelle)
    if (index >= 0) treffer = { from: pos + index, to: pos + index + fundstelle.length }
    return true
  })

  if (!treffer) return false
  editor.chain().focus().setTextSelection(treffer).scrollIntoView().run()
  return true
}

/** Der senkrechte Abstand eines Abschnitts von der Oberkante des Briefes. */
export function ankerHoehe(behaelter: HTMLElement, positionId: string): number | null {
  const el = behaelter.querySelector<HTMLElement>(`[data-position-id="${CSS.escape(positionId)}"]`)
  if (!el) return null
  return el.getBoundingClientRect().top - behaelter.getBoundingClientRect().top
}

/**
 * Die Strecke zwischen Anrede und erstem Abschnitt — der Einleitungsabsatz.
 *
 * Er trägt kein eigenes Merkmal: im Brief ist er gewöhnlicher Fliesstext,
 * und genau das soll er auch sein. Bestimmt wird er deshalb über seine
 * Stelle. Dieselbe Regel benutzt der Rahmen, wenn er ihn nach einem
 * Rundumschnitt aus der Ablage zurückholt.
 */
export function einleitungsstelle(
  editor: Editor,
): { von: number; bis: number; text: string } | null {
  let von: number | null = null
  let bis: number | null = null
  let text = ''

  editor.state.doc.forEach((kind, versatz) => {
    if (kind.type.name === KNOTEN.anrede) {
      von = versatz + kind.nodeSize
      return
    }
    if (von === null || bis !== null) return
    if (kind.type.name === KNOTEN.abschnitt || kind.type.name === KNOTEN.ergebnis) {
      bis = versatz
      return
    }
    text += kind.textContent
  })

  if (von === null) return null
  return { von, bis: bis ?? von, text: text.trim() }
}
