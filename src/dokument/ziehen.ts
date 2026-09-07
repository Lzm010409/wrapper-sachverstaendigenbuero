/**
 * Was beim Ziehen eines Bausteins mitwandert.
 *
 * Eigener Datentyp statt `text/plain`: nur so kommt die Herkunft mit. Der
 * reine Text wird zusätzlich mitgegeben, damit ein Baustein auch ausserhalb
 * der Anwendung irgendwo landen kann — dort ohne Herkunft, aber immerhin.
 */

import type { Herkunftsmarke } from './typen'

export const MIME_BAUSTEIN = 'application/x-werkbank-baustein'
export const MIME_BILD = 'application/x-werkbank-bild'

export interface Ziehgut {
  text: string
  marke: Herkunftsmarke
}

/** Ein Bild aus der Bildbibliothek, unterwegs an den Zeiger geheftet. */
export interface Bildziehgut {
  bildId: string
  breitePx: number
  hoehePx: number
  dateiname: string
  beschriftung: string
}

export function leseBildziehgut(daten: string): Bildziehgut | null {
  try {
    const roh = JSON.parse(daten) as Partial<Bildziehgut>
    if (typeof roh.bildId !== 'string' || !roh.bildId) return null
    return {
      bildId: roh.bildId,
      breitePx: typeof roh.breitePx === 'number' && roh.breitePx > 0 ? roh.breitePx : 1000,
      hoehePx: typeof roh.hoehePx === 'number' && roh.hoehePx > 0 ? roh.hoehePx : 750,
      dateiname: typeof roh.dateiname === 'string' ? roh.dateiname : 'Bild',
      beschriftung: typeof roh.beschriftung === 'string' ? roh.beschriftung : '',
    }
  } catch {
    return null
  }
}

export function leseZiehgut(daten: string): Ziehgut | null {
  try {
    const roh = JSON.parse(daten) as Partial<Ziehgut>
    if (typeof roh.text !== 'string' || !roh.text.trim()) return null
    const m = roh.marke
    return {
      text: roh.text,
      marke: {
        eintragId: typeof m?.eintragId === 'string' ? m.eintragId : null,
        nummer: typeof m?.nummer === 'string' ? m.nummer : null,
        titel: typeof m?.titel === 'string' ? m.titel : null,
        herkunft:
          m?.herkunft === 'bibliothekssuche' || m?.herkunft === 'formuliert' || m?.herkunft === 'eigener_text'
            ? m.herkunft
            : 'vorschlag',
      },
    }
  } catch {
    return null
  }
}
