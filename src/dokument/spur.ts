/**
 * Die Herkunftsspur eines Dokuments.
 *
 * Welcher Bibliothekseintrag steckt in welchem Abschnitt? Solange die
 * Auswahlmaske die Wahrheit war, stand das in einer Tabellenzeile. Jetzt
 * hängt es als Marke am Text — und die Spur muss aus dem Baum gelesen
 * werden. Sie trägt drei Dinge: die internen Hinweise für Wächter R4, die
 * Übernahme eigener Texte in die Bibliothek (F9) und später die
 * Wirkungsstatistik (F2).
 */

import {
  MARKE_BIBLIOTHEK,
  abschnittsInhalt,
  alleKnoten,
  istText,
  knotenText,
  ueberschriftText,
  type Elementknoten,
  type Herkunftsmarke,
} from './typen'
import { leseStruktur } from './nach-absaetzen'

export interface Spurstueck {
  positionId: string | null
  /** Nummer des Abschnitts im Schreiben, wie sie später gedruckt wird. */
  nummer: number
  eintragId: string | null
  herkunft: Herkunftsmarke['herkunft']
  text: string
}

function leseMarke(marken: unknown): Herkunftsmarke | null {
  if (!Array.isArray(marken)) return null
  for (const m of marken) {
    if (typeof m !== 'object' || m === null) continue
    const marke = m as { type?: unknown; attrs?: Record<string, unknown> }
    if (marke.type !== MARKE_BIBLIOTHEK) continue
    const a = marke.attrs ?? {}
    return {
      eintragId: typeof a.eintragId === 'string' ? a.eintragId : null,
      nummer: typeof a.nummer === 'string' ? a.nummer : null,
      titel: typeof a.titel === 'string' ? a.titel : null,
      herkunft:
        a.herkunft === 'vorschlag' ||
        a.herkunft === 'bibliothekssuche' ||
        a.herkunft === 'formuliert'
          ? a.herkunft
          : 'eigener_text',
    }
  }
  return null
}

/**
 * Sammelt alle markierten Textstücke, Abschnitt für Abschnitt.
 *
 * Aneinandergrenzende Stücke derselben Herkunft werden zusammengefasst —
 * ProseMirror zerlegt Text beim Bearbeiten in beliebig viele Knoten, und
 * eine Spur mit dreissig Bruchstücken desselben Eintrags wäre unbrauchbar.
 */
export function leseSpur(dokument: Elementknoten): Spurstueck[] {
  const stuecke: Spurstueck[] = []
  const struktur = leseStruktur(dokument)

  // Nummern nach derselben Regel wie die Ausgabe, damit Befunde und
  // gedrucktes Schreiben dieselbe Position meinen.
  const nummerJePosition = new Map<string, number>()
  for (const a of struktur.abschnitte) {
    if (a.positionId) nummerJePosition.set(a.positionId, a.nummer)
  }

  for (const knoten of alleKnoten(dokument)) {
    if (istText(knoten) || knoten.type !== 'positionsAbschnitt') continue

    const positionId =
      typeof knoten.attrs?.positionId === 'string' ? knoten.attrs.positionId : null
    const nummer = positionId ? (nummerJePosition.get(positionId) ?? 0) : 0

    let laufend: Spurstueck | null = null
    for (const inhalt of abschnittsInhalt(knoten)) {
      for (const k of alleKnoten(inhalt)) {
        if (!istText(k)) continue
        const marke = leseMarke(k.marks)
        if (!marke) {
          laufend = null
          continue
        }
        if (laufend && laufend.eintragId === marke.eintragId && laufend.herkunft === marke.herkunft) {
          laufend.text += k.text
          continue
        }
        laufend = {
          positionId,
          nummer,
          eintragId: marke.eintragId,
          herkunft: marke.herkunft,
          text: k.text,
        }
        stuecke.push(laufend)
      }
      laufend = null
    }
  }

  return stuecke
}

/** Alle Bibliothekseinträge, die im Dokument vorkommen. */
export function verwendeteEintraege(dokument: Elementknoten): string[] {
  return [
    ...new Set(
      leseSpur(dokument)
        .map((s) => s.eintragId)
        .filter((id): id is string => Boolean(id)),
    ),
  ]
}

/** Ordnet jedem Abschnitt die dort verwendeten Einträge zu. */
export function eintraegeJePosition(dokument: Elementknoten): Map<string, string[]> {
  const zuordnung = new Map<string, string[]>()
  for (const s of leseSpur(dokument)) {
    if (!s.positionId || !s.eintragId) continue
    const liste = zuordnung.get(s.positionId) ?? []
    if (!liste.includes(s.eintragId)) liste.push(s.eintragId)
    zuordnung.set(s.positionId, liste)
  }
  return zuordnung
}

export interface EigenerTextStueck {
  positionId: string | null
  ueberschrift: string
  text: string
}

/**
 * Selbst geschriebene Abschnitte — die Brücke in die Bibliothek (F9).
 *
 * Gezählt wird ein ganzer Abschnitt, sobald er keinen einzigen
 * Bibliothekseintrag enthält. Ein Absatz, der aus einem Eintrag stammt und
 * nur umformuliert wurde, ist kein neuer Baustein.
 */
export function selbstGeschriebeneAbschnitte(dokument: Elementknoten): EigenerTextStueck[] {
  const mitEintrag = eintraegeJePosition(dokument)
  const gefunden: EigenerTextStueck[] = []

  for (const knoten of alleKnoten(dokument)) {
    if (istText(knoten) || knoten.type !== 'positionsAbschnitt') continue
    const positionId =
      typeof knoten.attrs?.positionId === 'string' ? knoten.attrs.positionId : null
    if (positionId && (mitEintrag.get(positionId)?.length ?? 0) > 0) continue

    const text = abschnittsInhalt(knoten)
      .map(knotenText)
      .join('\n\n')
      .trim()
    if (!text) continue

    gefunden.push({ positionId, ueberschrift: ueberschriftText(knoten).trim(), text })
  }

  return gefunden
}
