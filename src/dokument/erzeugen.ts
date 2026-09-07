/**
 * Erzeugt das Schreiben als Dokumentbaum.
 *
 * Aufgerufen wird das zweimal: einmal direkt nach der Auswertung des
 * Prüfberichts, und einmal beim ersten Öffnen einer Stellungnahme, die noch
 * aus der Zeit der Auswahlmaske stammt — dann werden ihre Bausteine in
 * Abschnitte übersetzt. Beides derselbe Weg, damit es keine zwei Fassungen
 * eines fertigen Dokuments gibt.
 */

import {
  baueEinleitung,
  ERGEBNIS_ABSAETZE,
  STANDARD_ANREDE,
  type Kopfdaten,
} from '@/export/hausstil'
import {
  KNOTEN,
  abschnitt,
  absatz,
  absaetzeAusText,
  herkunftsmarke,
  text,
  type Elementknoten,
  type Herkunftsmarke,
} from './typen'

export interface DokumentBaustein {
  text: string | null
  eintragId: string | null
  nummer?: string | null
  titel?: string | null
  herkunft: string
}

export interface DokumentPosition {
  id: string
  bezeichnung: string
  /**
   * `nicht_bestreiten` legt den Abschnitt als ausgelassen an: er steht im
   * Dokument, erscheint aber nicht im Schreiben.
   */
  behandlung: string
  bausteine?: DokumentBaustein[]
}

export interface DokumentQuelle {
  betreff: string | null
  anrede: string | null
  /** Einleitungssatz; wird aus den Kopfdaten gebaut, wenn nicht angegeben. */
  einleitung?: string | null
  kopf?: Pick<
    Kopfdaten,
    'einleitungDatum' | 'einleitungMedium' | 'pruefdienstleister'
  > | null
  positionen: DokumentPosition[]
  ergebnisAbsatz?: string | null
}

const STANDARD_BETREFF = 'Betreff: Stellungnahme'

function normalisiereHerkunft(wert: string): Herkunftsmarke['herkunft'] {
  return wert === 'vorschlag' || wert === 'bibliothekssuche' || wert === 'formuliert'
    ? wert
    : 'eigener_text'
}

/** Übersetzt die Bausteine einer Position in Absätze mit Herkunftsmarken. */
function bausteinAbsaetze(bausteine: DokumentBaustein[]): Elementknoten[] {
  const absaetze: Elementknoten[] = []

  for (const b of bausteine) {
    const inhalt = b.text?.trim()
    if (!inhalt) continue
    absaetze.push(
      ...absaetzeAusText(inhalt, [
        herkunftsmarke({
          eintragId: b.eintragId ?? null,
          nummer: b.nummer ?? null,
          titel: b.titel ?? null,
          herkunft: normalisiereHerkunft(b.herkunft),
        }),
      ]),
    )
  }

  return absaetze
}

export function erzeugeDokument(quelle: DokumentQuelle): Elementknoten {
  const inhalt: Elementknoten[] = [
    { type: KNOTEN.betreff, content: [text(quelle.betreff?.trim() || STANDARD_BETREFF)] },
    { type: KNOTEN.anrede, content: [text(quelle.anrede?.trim() || STANDARD_ANREDE)] },
  ]

  const einleitung =
    quelle.einleitung ??
    (quelle.kopf
      ? baueEinleitung({
          ...(quelle.kopf as Kopfdaten),
          einleitungMedium: quelle.kopf.einleitungMedium ?? 'schreiben',
        })
      : null)

  inhalt.push(einleitung ? absatz(einleitung) : absatz())

  for (const p of quelle.positionen) {
    inhalt.push(
      abschnitt(
        {
          positionId: p.id,
          bezeichnung: p.bezeichnung,
          ausgelassen: p.behandlung === 'nicht_bestreiten',
        },
        p.bezeichnung,
        bausteinAbsaetze(p.bausteine ?? []),
      ),
    )
  }

  const ergebnis = quelle.ergebnisAbsatz?.trim() || ERGEBNIS_ABSAETZE.vollstaendig
  inhalt.push({ type: KNOTEN.ergebnis, content: [text(ergebnis)] })
  inhalt.push({ type: KNOTEN.signatur })

  return { type: KNOTEN.dokument, content: inhalt }
}
