import 'server-only'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { unzipSync, zipSync } from 'fflate'
import type { Absatz, Kopfdaten } from './hausstil'
import { deutschesDatum } from './hausstil'
import { bildmasseInEmu } from '@/bilder/lesen'

/**
 * Erzeugt das Word-Dokument aus der Geschäftspapier-Vorlage des Büros.
 *
 * Die Vorlage wird gefüllt, nicht nachgebaut: Kopf- und Fußzeile, Logo,
 * Schriften und Ränder sind dort gestaltet und sollen es bleiben.
 *
 * Der Hausstil beschreibt zwei Fallstricke beim Ersetzen. Beide entfallen
 * durch das hier gewählte Vorgehen:
 *
 * 1. Word legt jedes Textfeld doppelt ab (`mc:Choice` für neuere Versionen,
 *    `mc:Fallback` für ältere). Datum und Adresszeilen kommen deshalb je
 *    zweimal vor — hier werden grundsätzlich ALLE Vorkommen ersetzt.
 * 2. Die Rücksendeangabe endet auf dieselbe Zeichenfolge wie die
 *    Empfänger-PLZ („47807 Krefeld"). Eine Suche im rohen XML träfe beide.
 *    Ersetzt wird deshalb der **vollständige Inhalt einzelner Textknoten**
 *    per Gleichheit — und `47807 Krefeld` ist als ganzer Knoteninhalt etwas
 *    anderes als `Kfz Sachverständigenbüro Gollenstede, …, 47807 Krefeld`.
 */

export const VORLAGE_PFAD = join(
  'skills',
  'stellungnahme-erstellen',
  'assets',
  'briefkopf-vorlage.docx',
)

/** Platzhalterwerte, wie sie in der Vorlage stehen. */
const VORLAGE = {
  datum: 'Krefeld, 23.04.2026',
  ruecksendeangabe: 'Kfz Sachverständigenbüro Gollenstede, Am Germannshof 15, 47807 Krefeld',
  name: 'Max Mustermann ',
  strasse: 'Musterstraße 123',
  plzOrt: '47807 Krefeld',
  land: 'Deutschland',
  betreff: '[BETREFFZEILE]',
  text: '[STELLUNGNAHME-TEXT: Anrede, Einleitungssatz, nummerierte Positionen, Ergebnis, Signatur]',
} as const

export class DocxFehler extends Error {
  constructor(nachricht: string) {
    super(nachricht)
    this.name = 'DocxFehler'
  }
}

/** Maskiert Text für die Verwendung in XML. */
export function maskiere(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * Ersetzt den vollständigen Inhalt aller Textknoten mit genau diesem Wert.
 *
 * Gleichheit statt Teilzeichenkette — das ist der Kern der Sicherheit
 * gegenüber der mehrdeutigen Ortszeile.
 */
export function ersetzeTextknoten(xml: string, alt: string, neu: string): string {
  const muster = new RegExp(`(<w:t(?:\\s[^>]*)?>)${escapeRegExp(maskiere(alt))}(</w:t>)`, 'g')
  return xml.replace(muster, `$1${maskiere(neu).replace(/\$/g, '$$$$')}$2`)
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Die Zeichnung eines eingebetteten Bildes.
 *
 * `noChangeAspect` hält das Seitenverhältnis fest, wenn jemand das Bild in
 * Word anfasst — der Hausstil verlangt ausdrücklich, nicht zu verzerren.
 * Die Namensräume `a` und `pic` werden hier erklärt; `wp` und `r` bringt die
 * Vorlage bereits im Wurzelelement mit.
 */
function zeichnungXml(nummer: number, rId: string, cx: number, cy: number, name: string): string {
  const sicher = maskiere(name)
  return (
    '<w:drawing>' +
    '<wp:inline distT="0" distB="0" distL="0" distR="0">' +
    `<wp:extent cx="${cx}" cy="${cy}"/>` +
    '<wp:effectExtent l="0" t="0" r="0" b="0"/>' +
    `<wp:docPr id="${1000 + nummer}" name="Bild ${nummer}" descr="${sicher}"/>` +
    '<wp:cNvGraphicFramePr>' +
    '<a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/>' +
    '</wp:cNvGraphicFramePr>' +
    '<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">' +
    '<a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">' +
    '<pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">' +
    `<pic:nvPicPr><pic:cNvPr id="${1000 + nummer}" name="${sicher}"/><pic:cNvPicPr/></pic:nvPicPr>` +
    `<pic:blipFill><a:blip r:embed="${rId}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>` +
    '<pic:spPr>' +
    `<a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm>` +
    '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>' +
    '</pic:spPr>' +
    '</pic:pic>' +
    '</a:graphicData>' +
    '</a:graphic>' +
    '</wp:inline>' +
    '</w:drawing>'
  )
}

/** Baut einen Word-Absatz. */
function absatzXml(a: Absatz, rIds: Map<string, string>): string {
  if (a.art === 'leer') return '<w:p/>'

  if (a.art === 'bild') {
    const b = a.bild
    const rId = b ? rIds.get(b.bildId) : undefined
    // Fehlt das Bild, bleibt der Marker stehen — lieber ein sichtbarer
    // Hinweis als eine stille Lücke im versandten Schreiben.
    if (!b || !rId) {
      return `<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:i/></w:rPr><w:t xml:space="preserve">${maskiere(a.text)}</w:t></w:r></w:p>`
    }
    const { cx, cy } = bildmasseInEmu(b.breite, b.breitePx, b.hoehePx)
    return (
      '<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r>' +
      zeichnungXml(b.nummer, rId, cx, cy, b.dateiname) +
      '</w:r></w:p>'
    )
  }

  if (a.art === 'bildunterschrift') {
    return (
      '<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r>' +
      '<w:rPr><w:i/><w:sz w:val="18"/></w:rPr>' +
      `<w:t xml:space="preserve">${maskiere(a.text)}</w:t>` +
      '</w:r></w:p>'
    )
  }

  const fett = a.art === 'ueberschrift' || a.art === 'betreff'
  const eigenschaften = fett ? '<w:rPr><w:b/></w:rPr>' : ''
  // xml:space bewahrt führende und folgende Leerzeichen.
  return `<w:p><w:r>${eigenschaften}<w:t xml:space="preserve">${maskiere(a.text)}</w:t></w:r></w:p>`
}

/**
 * Sucht den Beginn des Absatzes, der eine bestimmte Stelle enthält.
 *
 * Eine einfache Rückwärtssuche nach `<w:p` träfe auch `<w:pPr` — deshalb
 * wird ausdrücklich auf `<w:p>` oder `<w:p ` geprüft.
 */
function findeAbsatzBeginn(xml: string, stelle: number): number {
  let gefunden = -1
  const muster = /<w:p(?=[\s>/])/g
  let treffer: RegExpExecArray | null
  while ((treffer = muster.exec(xml)) !== null) {
    if (treffer.index >= stelle) break
    gefunden = treffer.index
  }
  return gefunden
}

/**
 * Ersetzt den Absatz, der den Textplatzhalter enthält, durch die
 * Absatzfolge der Stellungnahme.
 */
export function setzeFliesstext(
  xml: string,
  absaetze: Absatz[],
  rIds: Map<string, string> = new Map(),
): string {
  const stelle = xml.indexOf(maskiere(VORLAGE.text))
  if (stelle === -1) {
    throw new DocxFehler(
      'Der Textplatzhalter wurde in der Vorlage nicht gefunden. Wurde die Vorlage verändert?',
    )
  }

  const absatzStart = findeAbsatzBeginn(xml, stelle)
  const absatzEnde = xml.indexOf('</w:p>', stelle) + '</w:p>'.length
  if (absatzStart === -1 || absatzEnde <= absatzStart) {
    throw new DocxFehler('Der Absatz um den Textplatzhalter liess sich nicht bestimmen.')
  }

  // Der Betreff steht bereits als eigener Absatz in der Vorlage; er wird
  // dort ersetzt und darf hier nicht ein zweites Mal erscheinen.
  const ohneBetreff = absaetze.filter((a) => a.art !== 'betreff')
  const neuerInhalt = ohneBetreff.map((a) => absatzXml(a, rIds)).join('')

  return xml.slice(0, absatzStart) + neuerInhalt + xml.slice(absatzEnde)
}

export interface DocxBild {
  daten: Uint8Array
  /** `png` oder `jpg` — die Vorlage erklärt beide Endungen bereits. */
  endung: 'png' | 'jpg'
}

export interface DocxEingabe {
  kopf: Kopfdaten
  absaetze: Absatz[]
  /** Die Bytes zu den Bildern, nach Kennung. */
  bilder?: Map<string, DocxBild>
  /** Abweichender Vorlagenpfad, vor allem für Tests. */
  vorlagePfad?: string
}

/**
 * Die nächste freie Beziehungsnummer.
 *
 * Die Vorlage bringt eigene Beziehungen mit (Kopfzeile, Fusszeile, Schriften
 * und mehr). Eine neue Nummer einfach zu raten hiesse, eine davon zu
 * überschreiben — und die Kopfzeile mit dem Logo wäre weg.
 */
export function naechsteBeziehungsnummer(rels: string): number {
  let hoechste = 0
  for (const treffer of rels.matchAll(/Id="rId(\d+)"/g)) {
    hoechste = Math.max(hoechste, Number(treffer[1]))
  }
  return hoechste + 1
}

/** Hängt die Bildbeziehungen an und liefert die vergebenen Kennungen. */
export function ergaenzeBeziehungen(
  rels: string,
  bilder: { bildId: string; ziel: string }[],
): { rels: string; rIds: Map<string, string> } {
  const rIds = new Map<string, string>()
  if (bilder.length === 0) return { rels, rIds }

  let nummer = naechsteBeziehungsnummer(rels)
  const neu = bilder
    .map((b) => {
      const id = `rId${nummer++}`
      rIds.set(b.bildId, id)
      return (
        `<Relationship Id="${id}" ` +
        'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" ' +
        `Target="${b.ziel}"/>`
      )
    })
    .join('')

  const ende = rels.lastIndexOf('</Relationships>')
  if (ende === -1) throw new DocxFehler('Die Beziehungsdatei der Vorlage ist unbrauchbar.')

  return { rels: rels.slice(0, ende) + neu + rels.slice(ende), rIds }
}

/**
 * Stellt sicher, dass die Endung in `[Content_Types].xml` erklärt ist.
 *
 * Die Vorlage führt png und jpg bereits — sie enthält selbst Bilder. Fehlt
 * die Erklärung trotzdem, öffnet Word die Datei mit einer Fehlermeldung
 * statt mit dem Schreiben.
 */
export function ergaenzeInhaltstypen(xml: string, endungen: Set<string>): string {
  let ergebnis = xml
  for (const endung of endungen) {
    if (new RegExp(`Extension="${endung}"`, 'i').test(ergebnis)) continue
    const typ = endung === 'png' ? 'image/png' : 'image/jpeg'
    ergebnis = ergebnis.replace(
      /(<Types[^>]*>)/,
      `$1<Default Extension="${endung}" ContentType="${typ}"/>`,
    )
  }
  return ergebnis
}

export async function baueDocx(eingabe: DocxEingabe): Promise<Uint8Array> {
  const pfad = eingabe.vorlagePfad ?? join(process.cwd(), VORLAGE_PFAD)

  let roh: Buffer
  try {
    roh = await readFile(pfad)
  } catch {
    throw new DocxFehler(
      `Die Geschäftspapier-Vorlage wurde nicht gefunden (${pfad}). ` +
        'Sie liegt im Repository unter skills/stellungnahme-erstellen/assets/.',
    )
  }

  const dateien = unzipSync(new Uint8Array(roh))
  const dokument = dateien['word/document.xml']
  if (!dokument) throw new DocxFehler('Die Vorlage enthält kein word/document.xml.')

  let xml = new TextDecoder().decode(dokument)

  // Bilder ablegen, bevor der Fliesstext gesetzt wird — die Absätze brauchen
  // die Beziehungskennungen.
  const rIds = legeBilderAb(dateien, eingabe)

  const { kopf } = eingabe
  xml = ersetzeTextknoten(xml, VORLAGE.datum, `${kopf.ort}, ${deutschesDatum(kopf.datum)}`)
  xml = ersetzeTextknoten(xml, VORLAGE.name, kopf.empfaengerName)
  xml = ersetzeTextknoten(xml, VORLAGE.strasse, kopf.empfaengerStrasse ?? '')
  xml = ersetzeTextknoten(xml, VORLAGE.plzOrt, kopf.empfaengerPlzOrt ?? '')
  xml = ersetzeTextknoten(xml, VORLAGE.betreff, kopf.betreff)
  xml = setzeFliesstext(xml, eingabe.absaetze, rIds)

  dateien['word/document.xml'] = new TextEncoder().encode(xml)
  return zipSync(dateien, { level: 6 })
}

/**
 * Legt die Bilder als Medien in die Datei und verknüpft sie.
 *
 * Verwendet werden nur Bilder, die im Text tatsächlich vorkommen — ein
 * mitgeschlepptes, nirgends eingebundenes Bild bläht das Dokument auf und
 * sagt dem Empfänger nichts.
 */
function legeBilderAb(
  dateien: Record<string, Uint8Array>,
  eingabe: DocxEingabe,
): Map<string, string> {
  const verwendet = eingabe.absaetze
    .filter((a) => a.art === 'bild' && a.bild)
    .map((a) => a.bild!)
  if (verwendet.length === 0 || !eingabe.bilder) return new Map()

  const relsPfad = 'word/_rels/document.xml.rels'
  const rohRels = dateien[relsPfad]
  if (!rohRels) throw new DocxFehler('Die Vorlage enthält keine Beziehungsdatei.')

  const endungen = new Set<string>()
  const anzulegen: { bildId: string; ziel: string }[] = []

  for (const b of verwendet) {
    if (anzulegen.some((x) => x.bildId === b.bildId)) continue
    const inhalt = eingabe.bilder.get(b.bildId)
    if (!inhalt) continue

    const name = `bild-${b.bildId}.${inhalt.endung}`
    dateien[`word/media/${name}`] = inhalt.daten
    anzulegen.push({ bildId: b.bildId, ziel: `media/${name}` })
    endungen.add(inhalt.endung)
  }

  const { rels, rIds } = ergaenzeBeziehungen(new TextDecoder().decode(rohRels), anzulegen)
  dateien[relsPfad] = new TextEncoder().encode(rels)

  const typenPfad = '[Content_Types].xml'
  const rohTypen = dateien[typenPfad]
  if (rohTypen) {
    dateien[typenPfad] = new TextEncoder().encode(
      ergaenzeInhaltstypen(new TextDecoder().decode(rohTypen), endungen),
    )
  }

  return rIds
}
