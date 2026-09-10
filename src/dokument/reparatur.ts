/**
 * Reparaturen am Dokumentbaum.
 *
 * Der Rahmen eines Schreibens gehört nicht dem Text, sondern dem Fall: zu
 * jeder Kürzungsposition des Prüfberichts gehört ein Abschnitt, auch ein
 * leerer. Wer eine Position nicht bestreiten will, lässt ihren Abschnitt
 * aus — er verschwindet aber nicht, sonst verlöre die Anmerkung am Rand
 * ihren Anker und die Herkunftsspur ihren Fall.
 *
 * Ältere Schreiben können Abschnitte verloren haben: vor dieser Fassung
 * konnte ein Ausschneiden über das ganze Dokument sie mitnehmen. Diese
 * Datei legt sie beim Öffnen wieder an — an der Stelle, an der sie nach
 * der Reihenfolge der Positionen hingehören.
 *
 * Reines JSON, keine Editor-Abhängigkeit: läuft auf dem Server wie im
 * Browser und lässt sich ohne Browser prüfen.
 */

import {
  KNOTEN,
  abschnitt,
  absatz,
  istText,
  knotenText,
  text,
  type Elementknoten,
  type Knoten,
} from './typen'
import { istVorlagenAnrede, istVorlagenEinleitung } from '@/export/hausstil'
import { ERGEBNIS_ABSAETZE } from '@/export/hausstil'
import { zerlegeMitPlatzhaltern } from './platzhalter'
import { klassifiziereKlammerausdruck } from '@/bibliothek/parser'

export interface Positionsangabe {
  id: string
  bezeichnung: string
  behandlung?: string | null
}

export interface Reparatur {
  dokument: Elementknoten
  /**
   * Was neu angelegt wurde: die Kennungen fehlender Abschnitte, und
   * `ergebnis`, falls der Schlusssatz gefehlt hat.
   */
  ergaenzt: string[]
}

/** Die Positionskennungen der Abschnitte in der Reihenfolge des Schreibens. */
function abschnittsKennungen(inhalt: Knoten[]): string[] {
  const gefunden: string[] = []
  for (const k of inhalt) {
    if (istText(k) || k.type !== KNOTEN.abschnitt) continue
    const id = k.attrs?.positionId
    if (typeof id === 'string' && id) gefunden.push(id)
  }
  return gefunden
}

/**
 * Ergänzt die Abschnitte, die zu den Positionen fehlen.
 *
 * Die Stelle ergibt sich aus der Reihenfolge der Positionen: hinter den
 * letzten Vorgänger, der noch dasteht, sonst vor den ersten Nachfolger,
 * sonst vor das Ergebnis. So bleibt die Nummerierung die des Prüfberichts
 * und nicht die des Zufalls.
 */
export function ergaenzeFehlendeAbschnitte(
  dokument: Elementknoten,
  positionen: Positionsangabe[],
): Reparatur {
  const inhalt = [...(dokument.content ?? [])]
  const vorhanden = new Set(abschnittsKennungen(inhalt))
  const fehlend = positionen.filter((p) => !vorhanden.has(p.id))

  /**
   * Der Ergebnisabsatz gehört zum Rahmen wie die Abschnitte.
   *
   * Das Schema lässt ihn als gewöhnlichen Block zu — ein Rundumschnitt
   * nimmt ihn also mit, und das Schreiben endet danach ohne den Schlusssatz
   * des Hausstils. Wieder angelegt wird er mit dem Satz, mit dem er
   * entstanden wäre.
   */
  const ohneErgebnis = !inhalt.some((k) => !istText(k) && k.type === KNOTEN.ergebnis)
  if (fehlend.length === 0 && !ohneErgebnis) return { dokument, ergaenzt: [] }

  if (ohneErgebnis) {
    const vorDerSignatur = inhalt.findIndex((k) => !istText(k) && k.type === KNOTEN.signatur)
    inhalt.splice(vorDerSignatur >= 0 ? vorDerSignatur : inhalt.length, 0, {
      type: KNOTEN.ergebnis,
      content: [text(ERGEBNIS_ABSAETZE.vollstaendig)],
    })
  }

  const reihenfolge = positionen.map((p) => p.id)

  for (const p of fehlend) {
    const neu = abschnitt(
      {
        positionId: p.id,
        bezeichnung: p.bezeichnung,
        ausgelassen: p.behandlung === 'nicht_bestreiten',
      },
      p.bezeichnung,
    )
    inhalt.splice(einfuegestelle(inhalt, reihenfolge, p.id), 0, neu)
  }

  return {
    dokument: { ...dokument, content: inhalt },
    ergaenzt: [...fehlend.map((p) => p.id), ...(ohneErgebnis ? ['ergebnis'] : [])],
  }
}

/** Der Index im Inhalt, an dem der Abschnitt zu dieser Position steht. */
function einfuegestelle(inhalt: Knoten[], reihenfolge: string[], id: string): number {
  const rang = reihenfolge.indexOf(id)
  const stelleVon = (kennung: string): number =>
    inhalt.findIndex(
      (k) => !istText(k) && k.type === KNOTEN.abschnitt && k.attrs?.positionId === kennung,
    )

  for (let i = rang - 1; i >= 0; i--) {
    const stelle = stelleVon(reihenfolge[i]!)
    if (stelle >= 0) return stelle + 1
  }
  for (let i = rang + 1; i < reihenfolge.length; i++) {
    const stelle = stelleVon(reihenfolge[i]!)
    if (stelle >= 0) return stelle
  }

  const schluss = inhalt.findIndex(
    (k) => !istText(k) && (k.type === KNOTEN.ergebnis || k.type === KNOTEN.signatur),
  )
  return schluss >= 0 ? schluss : inhalt.length
}

/* ------------------------------------------------------------------ *
 * Platzhalter aus eckigen Klammern in Knoten
 * ------------------------------------------------------------------ */

/**
 * Macht aus `[Kennzeichen]` im Text einen Platzhalterknoten.
 *
 * Vor dieser Fassung war ein Platzhalter gewöhnlicher Text. Das hatte eine
 * Folge, die weit über das Aussehen hinausging: wer die schliessende
 * Klammer versehentlich mitlöschte, hatte im Brief `[Kennzeichen` stehen —
 * und Wächter R1 sucht über genau diese Klammern. Die Sperre schwieg dann,
 * obwohl der Brief kaputt war. Ein Knoten lässt sich nicht halb löschen.
 *
 * Läuft beim Öffnen eines Schreibens über den ganzen Baum; im Editor hält
 * eine Erweiterung dasselbe beim Tippen und Einfügen nach. Beide benutzen
 * `zerlegeMitPlatzhaltern`, damit es eine Regel bleibt und nicht zwei.
 *
 * Ausgenommen sind Betreff und Anrede: dort lässt das Schema nur Text zu.
 */
export function wandlePlatzhalterInKnoten(dokument: Elementknoten): {
  dokument: Elementknoten
  gewandelt: number
} {
  let gewandelt = 0

  const gehe = (k: Knoten): Knoten => {
    if (istText(k)) return k
    const el = k as Elementknoten
    if (!el.content) return el

    // Betreff und Anrede führen `content: 'text*'` — dort hat kein Knoten Platz.
    const nurText = el.type === KNOTEN.betreff || el.type === KNOTEN.anrede
    const neu: Knoten[] = []

    for (const kind of el.content) {
      if (!istText(kind) || nurText) {
        neu.push(gehe(kind))
        continue
      }

      const stuecke = zerlegeMitPlatzhaltern(kind.text)
      if (stuecke.every((s) => s.art === 'text')) {
        neu.push(kind)
        continue
      }

      for (const s of stuecke) {
        if (s.art === 'text') {
          if (s.text) neu.push({ ...kind, text: s.text })
          continue
        }
        gewandelt++
        // Die Marken des Textes gehen mit — sonst verlöre ein Platzhalter
        // mitten in einem Baustein dessen Herkunftsspur.
        neu.push({
          type: KNOTEN.platzhalter,
          attrs: { schluessel: s.schluessel, art: klassifiziereKlammerausdruck(s.schluessel) },
          ...(kind.marks ? { marks: kind.marks } : {}),
        })
      }
    }

    return { ...el, content: neu }
  }

  const ergebnis = gehe(dokument) as Elementknoten
  return { dokument: ergebnis, gewandelt }
}

/* ------------------------------------------------------------------ *
 * Anrede und Einleitungssatz nachtragen
 * ------------------------------------------------------------------ */

export interface Kopfsaetze {
  /** Die Anrede, wie sie sich aus dem Empfänger ergibt. */
  anrede: string
  /** Der Einleitungssatz, oder `null`, wenn das Datum fehlt. */
  einleitung: string | null
}

/**
 * Wie beharrlich nachgetragen wird.
 *
 * `nur-leeres` ist die Regel beim Öffnen eines Schreibens: gefüllt wird
 * ausschliesslich, was leer ist. Alles andere hat ein Mensch geschrieben —
 * und sei es, indem er die Vorlage stehen liess.
 *
 * `auch-vorlage` gilt, wenn jemand den Kopfbereich ausdrücklich speichert.
 * Dann darf zusätzlich ersetzt werden, was erkennbar aus der Vorlage
 * stammt: die allgemeine Anrede und ein früher gebauter Einleitungssatz.
 * Das ist eine Handlung des Benutzers, sie ist sofort zu sehen und steht in
 * der Rückgängig-Kette.
 *
 * Der Unterschied ist teuer bezahlt. Zuerst galt überall `auch-vorlage` —
 * mit der Folge, dass eine von Hand geänderte Anrede („Sehr geehrter Herr
 * Schmidt,") beim nächsten Öffnen stillschweigend durch die aus dem
 * Empfänger abgeleitete ersetzt wurde. Gespeichert war sie, angezeigt wurde
 * sie nicht mehr: der schlimmste Fall, weil die Anwendung „gespeichert"
 * meldete und trotzdem etwas anderes zeigte.
 */
export type Beharrlichkeit = 'nur-leeres' | 'auch-vorlage'

/**
 * Trägt Anrede und Einleitungssatz im Dokument nach.
 *
 * Beide sind feste Bausteine des Hausstils und wurden früher **einmal**
 * beim Anlegen gebaut. Das Datum des Anschreibens ist zu diesem Zeitpunkt
 * aber oft noch nicht bekannt, und der Empfänger wird häufig später
 * nachgetragen. Das Ergebnis stand im versandten Schreiben: keine
 * Einleitung, und „Sehr geehrte Damen und Herren," an eine namentlich
 * bekannte Rechtsanwältin.
 */
export function traegeKopfsaetzeNach(
  dokument: Elementknoten,
  kopf: Kopfsaetze,
  beharrlichkeit: Beharrlichkeit = 'nur-leeres',
): { dokument: Elementknoten; nachgetragen: string[] } {
  const inhalt = [...(dokument.content ?? [])]
  const nachgetragen: string[] = []

  const anredeStelle = inhalt.findIndex((k) => !istText(k) && k.type === KNOTEN.anrede)
  if (anredeStelle < 0) return { dokument, nachgetragen }

  const anredeKnoten = inhalt[anredeStelle] as Elementknoten
  const anredeText = knotenText(anredeKnoten).trim()
  const anredeFrei =
    !anredeText || (beharrlichkeit === 'auch-vorlage' && istVorlagenAnrede(anredeText))

  if (anredeFrei && anredeText !== kopf.anrede) {
    inhalt[anredeStelle] = { ...anredeKnoten, content: [text(kopf.anrede)] }
    nachgetragen.push('anrede')
  }

  // Die Einleitung ist alles zwischen Anrede und erstem Abschnitt.
  let bis = inhalt.length
  for (let i = anredeStelle + 1; i < inhalt.length; i++) {
    const k = inhalt[i]!
    if (!istText(k) && (k.type === KNOTEN.abschnitt || k.type === KNOTEN.ergebnis)) {
      bis = i
      break
    }
  }

  const alteEinleitung = inhalt
    .slice(anredeStelle + 1, bis)
    .map((k) => knotenText(k))
    .join(' ')
    .trim()
  const neueEinleitung = kopf.einleitung?.trim() ?? ''
  const einleitungFrei =
    !alteEinleitung || (beharrlichkeit === 'auch-vorlage' && istVorlagenEinleitung(alteEinleitung))

  if (einleitungFrei && alteEinleitung !== neueEinleitung) {
    inhalt.splice(
      anredeStelle + 1,
      bis - anredeStelle - 1,
      neueEinleitung ? absatz(neueEinleitung) : { type: KNOTEN.absatz },
    )
    nachgetragen.push('einleitung')
  }

  if (nachgetragen.length === 0) return { dokument, nachgetragen }
  return { dokument: { ...dokument, content: inhalt }, nachgetragen }
}
