/**
 * Aufbau einer Stellungnahme nach dem Hausstil des Büros.
 *
 * Die Vorgaben stammen wörtlich aus
 * `skills/stellungnahme-erstellen/references/hausstil-aufbau-stellungnahme.md`.
 * Anrede, Einleitungssatz, Ergebnis-Absatz und Signatur sind feste
 * Bausteine — sie kommen aus Vorlagen, nicht aus dem Sprachmodell. Nur die
 * Argumentation der einzelnen Positionen wird formuliert.
 */

import { nachIso } from './datum'

export type Ergebnisart = 'vollstaendig' | 'teilweise' | 'scharfe_kritik' | 'einzelfrage'

export interface Kopfdaten {
  ort: string
  datum: Date
  empfaengerName: string
  empfaengerStrasse: string | null
  empfaengerPlzOrt: string | null
  betreff: string
  anrede: string
  /** Datum des Anschreibens, an das die Einleitung anknüpft. */
  einleitungDatum: string | null
  einleitungMedium: 'schreiben' | 'mail'
  /** Kürzel des Prüfdienstleisters, falls die Einleitung ihn nennen soll. */
  pruefdienstleister?: string | null
  vorbemerkungEinfuegen: boolean
}

/** Die Anrede, wenn zum Empfänger nichts Näheres bekannt ist. */
export const STANDARD_ANREDE = 'Sehr geehrte Damen und Herren,'

/*
  Aus der Empfängerzeile wird die Anrede — aber nur, wenn die Zeile sie
  ausdrücklich hergibt.

  „Rechtsanwältin Claudia Busch" ergibt „Sehr geehrte Frau Busch,". Der
  Schluss läuft ausschliesslich über die **Anredeform** in der Zeile
  („Frau", „Rechtsanwältin", „Herrn", „Rechtsanwalt"), niemals über den
  Vornamen. Aus einem Vornamen auf die Anrede zu schliessen geht regelmässig
  schief — und ein Brief, der den Empfänger falsch anredet, ist schlimmer
  als einer, der ihn gar nicht anredet. Fehlt die Form, bleibt es bei
  „Sehr geehrte Damen und Herren,".
*/
const FORMEN: [RegExp, 'frau' | 'herr'][] = [
  [/\b(frau|rechtsanwältin|anwältin|rain|ra'in)\b/i, 'frau'],
  [/\b(herrn?|rechtsanwalt|anwalt)\b/i, 'herr'],
]

/* Zeichen, an denen eine Firma erkennbar ist — dort wird niemand angeredet. */
const FIRMA =
  /\b(gmbh|mbh|ag|kg|ohg|se|mbb|partg|partner|partnerschaft|kanzlei|versicherung|versicherungen|autohaus|werkstatt|karosserie|e\.?\s?v\.?|&)\b/i

/**
 * Baut die Anrede aus der Empfängerzeile.
 *
 * Gibt `null` zurück, wenn sich nichts Belastbares ableiten lässt — dann
 * gilt die Standardanrede.
 */
export function baueAnrede(empfaengerName: string | null | undefined): string | null {
  const zeile = empfaengerName?.trim()
  if (!zeile) return null
  if (FIRMA.test(zeile)) return null

  const form = FORMEN.find(([muster]) => muster.test(zeile))?.[1]
  if (!form) return null

  // Der Nachname ist das letzte Wort, das keine Anredeform und kein Titel ist.
  const woerter = zeile
    .split(/\s+/)
    .filter((w) => !/^(frau|herrn?|rechtsanwältin|rechtsanwalt|anwältin|anwalt|rain|ra'in|dr\.?|prof\.?|dipl\.-?ing\.?)$/i.test(w))
  const nachname = woerter.at(-1)?.replace(/[,;]+$/, '')
  if (!nachname || nachname.length < 2) return null

  return form === 'frau' ? `Sehr geehrte Frau ${nachname},` : `Sehr geehrter Herr ${nachname},`
}

/**
 * Ob eine Anrede noch die unbeschriebene Vorlage ist.
 *
 * Nur eine solche darf ersetzt werden. Absichtlich eng gefasst: leer oder
 * wortgleich die allgemeine Anrede — sonst nichts.
 *
 * Die weite Fassung („alles, was aussieht wie `Sehr geehrte Frau X,`") war
 * ein Fehler mit Ansage. Wer die Anrede von Hand auf „Sehr geehrter Herr
 * Schmidt," setzte, bekam beim nächsten Öffnen die aus dem Empfänger
 * abgeleitete zurück — gespeichert war seine Fassung, angezeigt wurde sie
 * nicht mehr. Eine Anwendung, die „gespeichert" meldet und etwas anderes
 * zeigt, ist schlimmer als eine, die gar nichts nachträgt.
 *
 * Der Preis: wechselt der Empfänger, nachdem die Anrede schon auf einen
 * Namen lautet, zieht sie nicht mehr von selbst nach. Das ist der richtige
 * Preis — im Zweifel gehört der Text dem Verfasser.
 */
export function istVorlagenAnrede(anrede: string): boolean {
  const t = anrede.trim()
  return !t || t === STANDARD_ANREDE
}

/**
 * Ob ein Absatz der gebaute Einleitungssatz ist.
 *
 * Erkennbar an Anfang und Ende des festen Bausteins. Ein selbst
 * geschriebener Einleitungsabsatz sieht anders aus und wird deshalb beim
 * Ändern der Kopfdaten nicht überschrieben.
 */
export function istVorlagenEinleitung(absatz: string): boolean {
  const t = absatz.trim()
  if (!t) return true
  return /^mit (dem Schreiben|der Mail) vom .{4,12} überliessen|^mit (dem Schreiben|der Mail) vom .{4,12} überließen/i.test(
    t,
  )
}

export interface Positionstext {
  nummer: number
  ueberschrift: string
  text: string
}

export const ERGEBNIS_ABSAETZE: Record<Ergebnisart, string> = {
  vollstaendig:
    'Die Schadenpositionen aus dem vorliegenden Gutachten sind zur Regulierung des ' +
    'entstandenen Schadens vollumfänglich zu erstatten.',
  teilweise:
    'Die Schadenpositionen aus dem vorliegenden Gutachten, aktualisiert um die ' +
    'Stundenverrechnungssätze der Referenzwerkstatt, sind zur Regulierung des entstandenen ' +
    'Schadens zu erstatten.',
  scharfe_kritik:
    'Die Abzüge des Prüfdienstleisters können aus Sachverständigensicht nicht nachvollzogen ' +
    'werden. Die Schadenpositionen aus dem vorliegenden Gutachten sind zur Regulierung des ' +
    'entstandenen Schadens vollumfänglich zu erstatten.',
  einzelfrage: '',
}

export const SIGNATUR = ['Der Sachverständige', '', 'Mit freundlichen Grüßen', 'Sachverständigenbüro Gollenstede']

/** Formatiert ein Datum als TT.MM.JJJJ. */
export function deutschesDatum(d: Date): string {
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`
}

/**
 * Baut den Einleitungssatz.
 *
 * Fester Baustein mit drei Varianten je nach Übermittlungsweg; nennt der
 * Bericht einen Prüfdienstleister, wird er ausdrücklich erwähnt.
 */
export function baueEinleitung(kopf: Kopfdaten): string | null {
  // Ein Bruchstück ist kein Datum. „mit dem Schreiben vom 0 überließen Sie
  // uns …" stand tatsächlich einmal so da: das Eingabefeld war ein
  // Textfeld, und die angefangene Eingabe blieb stehen. Lieber gar kein
  // Einleitungssatz — dann fällt die fehlende Angabe vor dem Versand auf.
  if (!kopf.einleitungDatum || !nachIso(kopf.einleitungDatum)) return null

  const medium = kopf.einleitungMedium === 'mail' ? 'mit der Mail vom' : 'mit dem Schreiben vom'

  if (kopf.pruefdienstleister) {
    return (
      `${medium} ${kopf.einleitungDatum} überließen Sie uns u.a. den Kürzungsbericht des ` +
      `Dienstleisters ${kopf.pruefdienstleister} mit der Bitte um Stellungnahme. Hierzu machen ` +
      'wir folgende Feststellungen:'
    )
  }

  return (
    `${medium} ${kopf.einleitungDatum} überließen Sie uns das Abrechnungsschreiben des ` +
    'Versicherers mit der Bitte um Stellungnahme. Hierzu machen wir folgende Feststellungen:'
  )
}

export interface DokumentAufbau {
  kopf: Kopfdaten
  vorbemerkung: string | null
  positionen: Positionstext[]
  ergebnisart: Ergebnisart
  /** Frei überschriebener Ergebnis-Absatz, falls gewünscht. */
  ergebnisAbsatz: string | null
}

export interface Bildabsatz {
  bildId: string
  /** Anteil der Satzspiegelbreite. */
  breite: number
  breitePx: number
  hoehePx: number
  dateiname: string
  /** Laufende Nummer im Schreiben — sie steht so auch im Klartextmarker. */
  nummer: number
}

export interface Absatz {
  art:
    | 'betreff'
    | 'anrede'
    | 'fliesstext'
    | 'ueberschrift'
    | 'leer'
    | 'signatur'
    | 'bild'
    | 'bildunterschrift'
  text: string
  /** Nur bei `art: 'bild'` gesetzt. */
  bild?: Bildabsatz
}

/**
 * Der Marker, der im Klartext an der Stelle des Bildes steht.
 *
 * Wortlaut aus dem Hausstil: „[Bild N: dateiname – siehe Word-Dokument]".
 * Die Klartextfassung dient der Weiterverarbeitung; sie soll sagen, dass
 * hier etwas fehlt, statt es stillschweigend zu verschweigen.
 */
export function bildmarker(b: Bildabsatz): string {
  return `[Bild ${b.nummer}: ${b.dateiname} – siehe Word-Dokument]`
}

/**
 * Setzt die Stellungnahme zu einer Absatzfolge zusammen.
 *
 * Die Absatzfolge ist das gemeinsame Zwischenformat für beide Ausgaben:
 * Word und Klartext lesen dieselbe Struktur, sodass sie nicht auseinander-
 * laufen können.
 */
/**
 * Hängt mehrere Absätze eines Textes an und trennt sie durch Leerzeilen.
 *
 * Ohne die Trennung liefen zwei Absätze derselben Position im Klartext zu
 * einem zusammen — im Word-Dokument stünden sie getrennt, in der
 * Klartextfassung nicht. Beide Ausgaben müssen dasselbe zeigen.
 */
function fuegeAbsaetzeEin(ziel: Absatz[], text: string): void {
  const teile = text
    .split(/\n{2,}/)
    .map((t) => t.trim())
    .filter(Boolean)

  for (const [i, teil] of teile.entries()) {
    if (i > 0) ziel.push({ art: 'leer', text: '' })
    ziel.push({ art: 'fliesstext', text: teil })
  }
}

export function baueAbsaetze(aufbau: DokumentAufbau): Absatz[] {
  const absaetze: Absatz[] = []
  const fuegeEin = (art: Absatz['art'], text: string) => absaetze.push({ art, text })

  fuegeEin('betreff', aufbau.kopf.betreff)
  fuegeEin('leer', '')
  fuegeEin('anrede', aufbau.kopf.anrede)
  fuegeEin('leer', '')

  const einleitung = baueEinleitung(aufbau.kopf)
  if (einleitung) {
    fuegeEin('fliesstext', einleitung)
    fuegeEin('leer', '')
  }

  if (aufbau.vorbemerkung) {
    fuegeAbsaetzeEin(absaetze, aufbau.vorbemerkung)
    fuegeEin('leer', '')
  }

  for (const p of aufbau.positionen) {
    fuegeEin('ueberschrift', `${p.nummer}. ${p.ueberschrift}`)
    fuegeEin('leer', '')
    fuegeAbsaetzeEin(absaetze, p.text)
    fuegeEin('leer', '')
  }

  const ergebnis = aufbau.ergebnisAbsatz?.trim() || ERGEBNIS_ABSAETZE[aufbau.ergebnisart]
  if (ergebnis) {
    fuegeEin('fliesstext', ergebnis)
    fuegeEin('leer', '')
  }

  for (const zeile of SIGNATUR) {
    fuegeEin(zeile ? 'signatur' : 'leer', zeile)
  }

  return absaetze
}

/** Erzeugt die Klartextfassung. */
export function alsKlartext(absaetze: Absatz[]): string {
  return absaetze.map((a) => a.text).join('\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n'
}

/**
 * Dateiname nach der Konvention des Hausstils:
 * `Stellungnahme_[Nachname-oder-Firma]_[JJJJ-MM-TT]`.
 */
export function dateiname(bezeichnung: string | null, datum: Date, endung: string): string {
  const teil =
    (bezeichnung ?? 'Unbekannt')
      .replace(/[^\p{L}\p{N}\s-]/gu, '')
      .trim()
      .split(/\s+/)
      .slice(0, 3)
      .join('-') || 'Unbekannt'
  const iso = `${datum.getFullYear()}-${String(datum.getMonth() + 1).padStart(2, '0')}-${String(datum.getDate()).padStart(2, '0')}`
  return `Stellungnahme_${teil}_${iso}.${endung}`
}
