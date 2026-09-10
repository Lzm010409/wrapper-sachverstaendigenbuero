/**
 * Dokumentbaum → Absatzfolge.
 *
 * Die Absatzfolge ist das gemeinsame Zwischenformat beider Ausgaben. Sie
 * bleibt unverändert — Word- und Klartextausgabe merken vom Umbau auf den
 * Brief-Editor nichts, weil sich nur ändert, woher die Absätze kommen.
 */

import { SIGNATUR, bildmarker, type Absatz, type Bildabsatz } from '@/export/hausstil'
import {
  KNOTEN,
  abschnittsInhalt,
  bildattribute,
  istAusgelassen,
  istBild,
  istText,
  kinder,
  knotenText,
  ueberschriftText,
  type Elementknoten,
  type Knoten,
} from './typen'

/**
 * Ein Block im ausgegebenen Schreiben: entweder Text oder ein Bild.
 *
 * Bilder stehen nicht neben dem Text, sondern **an ihrer Stelle** in ihm —
 * deshalb ist die Ausgabe eine Folge von Blöcken und keine Zeichenkette mit
 * Anhängen.
 */
export type Ausgabeblock =
  | { art: 'text'; text: string }
  | { art: 'bild'; bild: Bildabsatz; beschriftung: string }

/** Ein Abschnitt, wie er im ausgegebenen Schreiben erscheint. */
export interface AusgabeAbschnitt {
  positionId: string | null
  nummer: number
  ueberschrift: string
  /** Text und Bildbeschriftungen — die Grundlage für die Wächter. */
  text: string
  bloecke: Ausgabeblock[]
}

export interface Ausgabestruktur {
  betreff: string
  anrede: string
  /** Alles zwischen Anrede und erstem Abschnitt: Einleitung, Vorbemerkung. */
  einleitung: string[]
  abschnitte: AusgabeAbschnitt[]
  ergebnis: string
}

function listenAbsaetze(knoten: Elementknoten): string[] {
  const nummeriert = knoten.type === 'orderedList'
  return kinder(knoten).map((eintrag, i) => {
    const zeichen = nummeriert ? `${i + 1}. ` : '– '
    return zeichen + knotenText(eintrag).replace(/\s*\n+\s*/g, ' ').trim()
  })
}

/**
 * Zerlegt eine Folge von Blöcken in Text und Bilder.
 *
 * `zaehler` vergibt die Bildnummern fortlaufend über das ganze Schreiben —
 * sie stehen so auch im Klartextmarker und müssen deshalb eindeutig sein.
 */
function bloeckeAus(knoten: Knoten[], zaehler: { stand: number }): Ausgabeblock[] {
  const bloecke: Ausgabeblock[] = []

  for (const k of knoten) {
    if (istText(k)) {
      const t = k.text.trim()
      if (t) bloecke.push({ art: 'text', text: t })
      continue
    }

    if (istBild(k)) {
      const attrs = bildattribute(k as Elementknoten)
      if (!attrs) continue
      bloecke.push({
        art: 'bild',
        bild: { ...attrs, nummer: ++zaehler.stand },
        beschriftung: knotenText(k).trim(),
      })
      continue
    }

    if (k.type === 'bulletList' || k.type === 'orderedList') {
      for (const zeile of listenAbsaetze(k)) bloecke.push({ art: 'text', text: zeile })
      continue
    }

    const t = knotenText(k).trim()
    if (t) bloecke.push({ art: 'text', text: t })
  }

  return bloecke
}

/** Nur die Textteile — für die Einleitung und die Wächter. */
function textAbsaetze(knoten: Knoten[], zaehler = { stand: 0 }): string[] {
  return bloeckeAus(knoten, zaehler)
    .filter((b): b is { art: 'text'; text: string } => b.art === 'text')
    .map((b) => b.text)
}

/**
 * Liest den Dokumentbaum in seine Bestandteile.
 *
 * Die Nummerierung entsteht hier und nur hier: sie ergibt sich aus der
 * Reihenfolge der Abschnitte, die tatsächlich Text tragen. Ein Abschnitt
 * ohne Text bekommt keine Nummer und erscheint nicht — sonst stünde im
 * versandten Schreiben eine leere Überschrift.
 */
export function leseStruktur(dokument: Elementknoten): Ausgabestruktur {
  const struktur: Ausgabestruktur = {
    betreff: '',
    anrede: '',
    einleitung: [],
    abschnitte: [],
    ergebnis: '',
  }

  let vorDemErstenAbschnitt = true
  const bildzaehler = { stand: 0 }

  for (const block of kinder(dokument)) {
    if (istText(block)) continue

    switch (block.type) {
      case KNOTEN.betreff:
        struktur.betreff = knotenText(block).trim()
        break

      case KNOTEN.anrede:
        struktur.anrede = knotenText(block).trim()
        break

      case KNOTEN.abschnitt: {
        vorDemErstenAbschnitt = false
        // Nicht bestrittene Positionen bleiben im Dokument stehen, gehören
        // aber nicht in das Schreiben — und zählen deshalb auch nicht mit.
        if (istAusgelassen(block)) break
        const bloecke = bloeckeAus(abschnittsInhalt(block), bildzaehler)
        if (bloecke.length === 0) break
        // Die Beschriftung eines Bildes zählt als Text des Schreibens: sie
        // wird gedruckt, also muss sie auch durch die Wächter.
        const text = bloecke
          .map((b) => (b.art === 'text' ? b.text : b.beschriftung))
          .filter(Boolean)
          .join('\n\n')
        const attrs = block.attrs ?? {}
        struktur.abschnitte.push({
          positionId: typeof attrs.positionId === 'string' ? attrs.positionId : null,
          nummer: struktur.abschnitte.length + 1,
          ueberschrift: ueberschriftText(block).trim(),
          text,
          bloecke,
        })
        break
      }

      case KNOTEN.ergebnis:
        struktur.ergebnis = knotenText(block).trim()
        break

      case KNOTEN.signatur:
        break

      default:
        if (vorDemErstenAbschnitt) {
          struktur.einleitung.push(...textAbsaetze([block], bildzaehler))
        }
        break
    }
  }

  return struktur
}

/** Setzt die Absatzfolge aus dem Dokumentbaum zusammen. */
export function dokumentNachAbsaetzen(dokument: Elementknoten): Absatz[] {
  const s = leseStruktur(dokument)
  const absaetze: Absatz[] = []
  const fuegeEin = (art: Absatz['art'], text: string) => absaetze.push({ art, text })

  fuegeEin('betreff', s.betreff)
  fuegeEin('leer', '')
  fuegeEin('anrede', s.anrede)
  fuegeEin('leer', '')

  for (const e of s.einleitung) {
    fuegeEin('fliesstext', e)
    fuegeEin('leer', '')
  }

  for (const a of s.abschnitte) {
    fuegeEin('ueberschrift', `${a.nummer}. ${a.ueberschrift}`)
    fuegeEin('leer', '')

    for (const [i, block] of a.bloecke.entries()) {
      if (i > 0) fuegeEin('leer', '')
      if (block.art === 'text') {
        fuegeEin('fliesstext', block.text)
        continue
      }
      absaetze.push({ art: 'bild', text: bildmarker(block.bild), bild: block.bild })
      if (block.beschriftung) fuegeEin('bildunterschrift', block.beschriftung)
    }

    fuegeEin('leer', '')
  }

  if (s.ergebnis) {
    fuegeEin('fliesstext', s.ergebnis)
    fuegeEin('leer', '')
  }

  for (const zeile of SIGNATUR) {
    fuegeEin(zeile ? 'signatur' : 'leer', zeile)
  }

  return absaetze
}
