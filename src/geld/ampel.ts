/**
 * Der Zahlungsstand eines Falls — aus den Rechnungen, die in sevDesk zu
 * seinem Aktenzeichen liegen.
 *
 * **Warum mehrere Rechnungen je Fall.** Ein Fall kann eine Nachtrags- oder
 * Korrekturrechnung bekommen (`…TG01`, `…TG02`). Für den Blick in die Liste
 * zählt aber nicht die einzelne Rechnung, sondern was unter dem Strich noch
 * offen ist — also werden sie zusammengefasst.
 *
 * **Warum die Fälligkeit aus der Rechnung kommt und nicht aus einer Regel
 * dieses Hauses.** So war es entschieden: es gilt, was in sevDesk steht.
 * Dass der Rechnungstext von 14 Tagen spricht und `timeToPay` auf 30 steht,
 * ist ein Widerspruch im Rechnungsworkflow und dort zu klären — die Ampel
 * würde ihn nur verdecken, wenn sie eigenmächtig anders rechnete.
 *
 * Diese Datei ist bewusst rein: keine Datenbank, kein Netz, keine Uhr. Das
 * „heute" kommt von aussen, sonst wäre die Überfälligkeit nicht prüfbar.
 */

export type Zahlungsstand =
  | 'ohne_rechnung'
  | 'entwurf'
  | 'offen'
  | 'ueberfaellig'
  | 'teilbezahlt'
  | 'bezahlt'

export const STANDNAMEN: Record<Zahlungsstand, string> = {
  ohne_rechnung: 'Keine Rechnung',
  entwurf: 'Entwurf',
  offen: 'Offen',
  ueberfaellig: 'Überfällig',
  teilbezahlt: 'Teilbezahlt',
  bezahlt: 'Bezahlt',
}

/** Die sevDesk-Zustände, die für die Zusammenfassung eine Rolle spielen. */
const ENTWURF = 50
const BEZAHLT = 1000

export interface Rechnungszeile {
  /** Die Kennung in sevDesk — zwei Rechnungen können dieselbe Nummer tragen. */
  sevdeskId: string
  nummer: string
  status: number
  bruttoCent: number
  bezahltCent: number
  rechnungsdatum: Date | null
  zahldatum: Date | null
  zahlungszielTage: number | null
  mahnstufe: number | null
}

export interface Ampel {
  stand: Zahlungsstand
  bruttoCent: number
  bezahltCent: number
  /** Was unter dem Strich noch aussteht. Nie negativ. */
  offenCent: number
  /** Die früheste Fälligkeit unter den noch nicht beglichenen Rechnungen. */
  faelligAm: Date | null
  /** Das späteste Zahldatum — für „bezahlt am". */
  zahldatum: Date | null
  /** Die Nummern der berücksichtigten Rechnungen, in der Reihenfolge der Eingabe. */
  nummern: string[]
  /** Höchste Mahnstufe unter den offenen Rechnungen. */
  mahnstufe: number | null
  /**
   * Rechnungsnummern, die in sevDesk mehr als einmal vorkommen. Sie werden
   * nur einmal gezählt — sonst stünde der doppelte Betrag da —, aber sie
   * werden genannt: eine doppelt angelegte Rechnung ist ein Fehler, den
   * jemand aufräumen muss, und kein Rauschen, das die Ampel glattbügeln darf.
   */
  doppelt: string[]
}

/** Wann eine Rechnung fällig ist. Ohne Datum oder ohne Ziel: unbekannt. */
export function faelligkeit(rechnungsdatum: Date | null, zahlungszielTage: number | null): Date | null {
  if (!rechnungsdatum || zahlungszielTage === null) return null
  const faellig = new Date(rechnungsdatum.getTime())
  faellig.setDate(faellig.getDate() + zahlungszielTage)
  return faellig
}

export function ampelFuer(zeilen: Rechnungszeile[], heute: Date): Ampel {
  if (zeilen.length === 0) {
    return {
      stand: 'ohne_rechnung',
      bruttoCent: 0,
      bezahltCent: 0,
      offenCent: 0,
      faelligAm: null,
      zahldatum: null,
      nummern: [],
      mahnstufe: null,
      doppelt: [],
    }
  }

  const { gezaehlt, doppelt } = jeNummerEinmal(zeilen)
  const bruttoCent = summe(gezaehlt.map((z) => z.bruttoCent))
  const bezahltCent = summe(gezaehlt.map((z) => z.bezahltCent))
  const nummern = gezaehlt.map((z) => z.nummer)

  const offeneZeilen = gezaehlt.filter((z) => z.status !== BEZAHLT)
  const faelligAm = fruehestes(offeneZeilen.map((z) => faelligkeit(z.rechnungsdatum, z.zahlungszielTage)))
  const zahldatum = spaetestes(zeilen.map((z) => z.zahldatum))
  const mahnstufe = hoechstes(offeneZeilen.map((z) => z.mahnstufe))

  return {
    stand: standVon(gezaehlt, bruttoCent, bezahltCent, faelligAm, heute),
    bruttoCent,
    bezahltCent,
    offenCent: Math.max(0, bruttoCent - bezahltCent),
    faelligAm,
    zahldatum,
    nummern,
    mahnstufe,
    doppelt,
  }
}

/**
 * Je Rechnungsnummer eine Zeile.
 *
 * Liegt eine Nummer mehrfach vor, gewinnt der weiteste Zustand — bei
 * „einmal bezahlt, einmal offen" also die bezahlte. Der umgekehrte Weg
 * hiesse, jemanden zu mahnen, dessen Geld längst da ist; das ist der
 * teurere der beiden Irrtümer. Bei gleichem Zustand entscheidet der höhere
 * gebuchte Betrag, damit das Ergebnis nicht von der Sortierung abhängt.
 */
function jeNummerEinmal(zeilen: Rechnungszeile[]): {
  gezaehlt: Rechnungszeile[]
  doppelt: string[]
} {
  const beste = new Map<string, Rechnungszeile>()
  const doppelt = new Set<string>()

  for (const zeile of zeilen) {
    const bisher = beste.get(zeile.nummer)
    if (!bisher) {
      beste.set(zeile.nummer, zeile)
      continue
    }
    doppelt.add(zeile.nummer)
    const besser =
      zeile.status > bisher.status ||
      (zeile.status === bisher.status && zeile.bezahltCent > bisher.bezahltCent)
    if (besser) beste.set(zeile.nummer, zeile)
  }

  return { gezaehlt: [...beste.values()], doppelt: [...doppelt] }
}

/**
 * Der Zustand, in dieser Reihenfolge geprüft.
 *
 * **Der Zustand aus sevDesk schlägt den gebuchten Betrag.** Am Konto lagen
 * am 09.09.2026 zwei Rechnungen auf „bezahlt" ohne gebuchten Betrag. Wer
 * nur rechnete, hielte sie für offen und mahnte einen Kunden, der bezahlt
 * hat — der teurere der beiden Irrtümer.
 */
function standVon(
  zeilen: Rechnungszeile[],
  bruttoCent: number,
  bezahltCent: number,
  faelligAm: Date | null,
  heute: Date,
): Zahlungsstand {
  if (zeilen.every((z) => z.status === BEZAHLT)) return 'bezahlt'
  if (zeilen.every((z) => z.status === ENTWURF)) return 'entwurf'
  if (bezahltCent > 0 && bezahltCent < bruttoCent) return 'teilbezahlt'
  // Alles gebucht, aber noch nicht jede Rechnung auf „bezahlt" gesetzt:
  // das Geld ist da, der Haken fehlt.
  if (bruttoCent > 0 && bezahltCent >= bruttoCent) return 'bezahlt'
  if (faelligAm && faelligAm < heute) return 'ueberfaellig'
  return 'offen'
}

/**
 * Wo Pipedrive und sevDesk sich widersprechen — als Satz, nicht als Flagge.
 *
 * Gemeldet wird nur, was zusammen nicht sein kann. Dass ein Deal in
 * „Aufgenommen" steht, während noch keine Rechnung existiert, ist kein
 * Widerspruch, sondern der Normalfall.
 */
export function widerspruch(stand: Zahlungsstand, phase: string | undefined): string | null {
  if (!phase) return null

  if (phase === 'Bezahlt' && stand !== 'bezahlt') {
    return stand === 'ohne_rechnung'
      ? 'Pipedrive steht auf „Bezahlt", in sevDesk gibt es zu diesem Aktenzeichen keine Rechnung.'
      : `Pipedrive steht auf „Bezahlt", sevDesk sagt „${STANDNAMEN[stand]}".`
  }
  if (phase === 'Teilbezahlt' && (stand === 'bezahlt' || stand === 'ohne_rechnung')) {
    return `Pipedrive steht auf „Teilbezahlt", sevDesk sagt „${STANDNAMEN[stand]}".`
  }
  if (stand === 'bezahlt' && (phase === 'Versendet' || phase === 'In Bearbeitung')) {
    return `sevDesk sagt „Bezahlt", Pipedrive steht noch auf „${phase}".`
  }
  if (stand === 'teilbezahlt' && phase !== 'Teilbezahlt' && phase !== 'Klage') {
    return `sevDesk sagt „Teilbezahlt", Pipedrive steht auf „${phase}".`
  }
  return null
}

function summe(werte: number[]): number {
  return werte.reduce((a, b) => a + b, 0)
}

function fruehestes(werte: (Date | null)[]): Date | null {
  const echte = werte.filter((w): w is Date => w !== null)
  return echte.length === 0 ? null : new Date(Math.min(...echte.map((d) => d.getTime())))
}

function spaetestes(werte: (Date | null)[]): Date | null {
  const echte = werte.filter((w): w is Date => w !== null)
  return echte.length === 0 ? null : new Date(Math.max(...echte.map((d) => d.getTime())))
}

function hoechstes(werte: (number | null)[]): number | null {
  const echte = werte.filter((w): w is number => w !== null)
  return echte.length === 0 ? null : Math.max(...echte)
}
