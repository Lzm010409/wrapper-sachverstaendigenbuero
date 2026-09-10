/**
 * Aus dem Dokumentbaum wird die Eingabe für die vier Wächter.
 *
 * Geprüft wird abschnittsweise — so meldet ein Befund dieselbe Nummer, die
 * später im gedruckten Schreiben steht, und die Oberfläche kann ihn an den
 * richtigen Abschnitt heften.
 */

import type { PruefBaustein } from '@/export/waechter'
import { leseStruktur } from './nach-absaetzen'
import { eintraegeJePosition } from './spur'
import type { Elementknoten } from './typen'

export function pruefBausteineAusDokument(
  dokument: Elementknoten,
  interneHinweise: Map<string, string | null> = new Map(),
): PruefBaustein[] {
  const zuordnung = eintraegeJePosition(dokument)

  return leseStruktur(dokument).abschnitte.map((a) => ({
    positionNummer: a.nummer,
    positionBezeichnung: a.ueberschrift,
    positionId: a.positionId,
    text: a.text,
    interneHinweise: a.positionId
      ? ((zuordnung.get(a.positionId) ?? [])
          .map((id) => interneHinweise.get(id))
          .filter((h): h is string => Boolean(h))
          .join('\n\n') || null)
      : null,
  }))
}

/** Alle Zahlen aus dem Dokument, die der Fall belegen muss (R2). */
export function gesamttext(dokument: Elementknoten): string {
  const s = leseStruktur(dokument)
  return [...s.einleitung, ...s.abschnitte.map((a) => a.text), s.ergebnis]
    .filter(Boolean)
    .join('\n\n')
}
