/**
 * Was ist das für ein Bild, und wie gross ist es?
 *
 * Format und Masse werden aus den Bytes selbst gelesen, nicht aus dem
 * Dateinamen oder dem, was der Browser behauptet: beides lässt sich
 * beliebig setzen, und im Word-Dokument entscheidet das echte
 * Seitenverhältnis darüber, ob ein Bild verzerrt erscheint.
 *
 * Nur PNG und JPEG. Word nimmt zwar mehr an, aber nicht verlässlich in
 * jeder Fassung — und ein Schreiben, das beim Empfänger anders aussieht als
 * beim Absender, ist schlimmer als ein abgelehnter Upload.
 */

export type Bildformat = 'image/png' | 'image/jpeg'

export interface Bildmasse {
  format: Bildformat
  breite: number
  hoehe: number
  /** Endung für die Ablage im Word-Dokument. */
  endung: 'png' | 'jpg'
}

export class Bildfehler extends Error {
  constructor(nachricht: string) {
    super(nachricht)
    this.name = 'Bildfehler'
  }
}

const PNG_KENNUNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

/**
 * Bildmarken, die im JPEG die Masse tragen.
 *
 * Ausgenommen sind ausdrücklich C4 (Huffman-Tabellen), C8 (Erweiterung) und
 * CC (arithmetische Tabellen) — die sehen wie Rahmenmarken aus, sind aber
 * keine. Wer sie mitnimmt, liest irgendwann Tabellendaten als Bildmasse.
 */
function istRahmenmarke(marke: number): boolean {
  return marke >= 0xc0 && marke <= 0xcf && marke !== 0xc4 && marke !== 0xc8 && marke !== 0xcc
}

function lesePng(daten: Uint8Array): Bildmasse | null {
  if (daten.length < 24) return null
  if (!PNG_KENNUNG.every((b, i) => daten[i] === b)) return null

  const sicht = new DataView(daten.buffer, daten.byteOffset, daten.byteLength)
  // Nach Signatur (8) und Längenfeld (4) steht "IHDR", dann Breite und Höhe.
  const typ = String.fromCharCode(daten[12]!, daten[13]!, daten[14]!, daten[15]!)
  if (typ !== 'IHDR') return null

  return {
    format: 'image/png',
    endung: 'png',
    breite: sicht.getUint32(16, false),
    hoehe: sicht.getUint32(20, false),
  }
}

function leseJpeg(daten: Uint8Array): Bildmasse | null {
  if (daten.length < 4 || daten[0] !== 0xff || daten[1] !== 0xd8) return null

  const sicht = new DataView(daten.buffer, daten.byteOffset, daten.byteLength)
  let stelle = 2

  while (stelle + 3 < daten.length) {
    if (daten[stelle] !== 0xff) {
      stelle++
      continue
    }
    const marke = daten[stelle + 1]!
    // Füllbytes und Marken ohne Rumpf überspringen.
    if (marke === 0xff) {
      stelle++
      continue
    }
    if (marke === 0xd8 || (marke >= 0xd0 && marke <= 0xd9)) {
      stelle += 2
      continue
    }

    const laenge = sicht.getUint16(stelle + 2, false)
    if (laenge < 2) return null

    if (istRahmenmarke(marke)) {
      if (stelle + 9 > daten.length) return null
      return {
        format: 'image/jpeg',
        endung: 'jpg',
        hoehe: sicht.getUint16(stelle + 5, false),
        breite: sicht.getUint16(stelle + 7, false),
      }
    }

    stelle += 2 + laenge
  }

  return null
}

/** Liest Format und Masse — oder erklärt, warum das Bild nicht taugt. */
export function leseBildmasse(daten: Uint8Array): Bildmasse {
  const masse = lesePng(daten) ?? leseJpeg(daten)
  if (!masse) {
    throw new Bildfehler(
      'Nur PNG und JPEG lassen sich verlässlich in das Word-Dokument einbetten. ' +
        'Diese Datei ist weder das eine noch das andere.',
    )
  }
  if (masse.breite < 1 || masse.hoehe < 1 || masse.breite > 20000 || masse.hoehe > 20000) {
    throw new Bildfehler('Die Bildmasse sind unbrauchbar.')
  }
  return masse
}

/** Höchstgrösse je Bild. Ein Kalkulationsauszug bleibt weit darunter. */
export const MAX_BILD_BYTES = 8 * 1024 * 1024

/* ------------------------------------------------------------------ *
 * Masse im Word-Dokument
 * ------------------------------------------------------------------ */

/** 914400 EMU sind ein Zoll, also 2,54 cm. */
export const EMU_JE_CM = 914400 / 2.54

/**
 * Breite des Satzspiegels der Geschäftspapier-Vorlage.
 *
 * A4 (21 cm) abzüglich der Ränder. Daran hängt, was ein Bildanteil von
 * 68 Prozent in Zentimetern bedeutet — der Hausstil nennt 10 bis 12 cm als
 * angemessene Breite, das ist die Voreinstellung.
 */
export const SATZSPIEGEL_CM = 17.5

export function bildmasseInEmu(
  anteil: number,
  breitePx: number,
  hoehePx: number,
): { cx: number; cy: number } {
  const begrenzt = Math.min(1, Math.max(0.1, anteil))
  const cx = Math.round(SATZSPIEGEL_CM * begrenzt * EMU_JE_CM)
  // Höhe stets proportional — ein verzerrtes Bild fällt sofort auf.
  const cy = Math.round((cx * hoehePx) / Math.max(1, breitePx))
  return { cx, cy }
}
