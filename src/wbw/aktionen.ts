'use server'

import { verlangeBenutzer } from '@/auth/sitzung'
import { verlangeRecht } from '@/rechte/zugriff'
import { holeLauf, starteLauf, type LaufEingaben, type Laufstand } from './auftrag'
import { uebernimmAuswahl } from './korb'

/**
 * Die beiden Handgriffe der Oberfläche: einen Lauf anstossen und nach seinem
 * Stand fragen.
 *
 * Beide verlangen eine Anmeldung. Ein Recherchelauf bindet den Server für
 * Minuten und fragt fremde Portale in unserem Namen ab — das darf niemand
 * auslösen, der nicht angemeldet ist.
 */

export interface Startantwort {
  id?: string
  fehler?: string
}

export async function starteRecherche(
  fallId: string,
  eingaben: LaufEingaben,
): Promise<Startantwort> {
  const benutzer = await verlangeBenutzer()

  // Das Recht wird nur verlangt, wenn der Lauf wirklich Geld ausgeben soll.
  // Ein Lauf über die kostenlosen Portale ist tägliche Arbeit und braucht
  // keine Sondererlaubnis.
  if (eingaben.kostenpflichtigErlaubt) {
    try {
      await verlangeRecht('wbw.kostenpflichtig')
    } catch (fehler) {
      return { fehler: fehler instanceof Error ? fehler.message : 'Keine Berechtigung.' }
    }
  }

  const ergebnis = await starteLauf(fallId, eingaben, benutzer.id)
  return 'id' in ergebnis ? { id: ergebnis.id } : { fehler: ergebnis.fehler }
}

export async function frageStandAb(id: string): Promise<Laufstand | null> {
  await verlangeBenutzer()
  return holeLauf(id)
}

export interface Auswahlantwort {
  anzahl?: number
  hinweis?: string
  fehler?: string
}

/**
 * Hält fest, welche Fahrzeuge der Sachverständige in den Korb genommen hat.
 *
 * Kein eigenes Recht: die Auswahl ist die tägliche Arbeit am Gutachten und
 * kostet weder Geld noch etwas Unwiederbringliches. Der Lauf selbst ist
 * bereits an die Anmeldung gebunden.
 */
export async function uebernimmKorb(
  laufId: string,
  kennungen: string[],
): Promise<Auswahlantwort> {
  const benutzer = await verlangeBenutzer()
  const ergebnis = await uebernimmAuswahl(laufId, kennungen, benutzer.id)

  if (ergebnis.fehler) return { anzahl: ergebnis.anzahl, fehler: ergebnis.fehler }

  /*
   * Weicht die Zahl in der Anlage von der Auswahl ab, wird das gesagt.
   *
   * Die Auswertung wirft Fahrzeuge ohne Händlerkoordinate heraus. Für eine
   * Suche ist das richtig, für einen handverlesenen Korb nicht — und wenn es
   * doch geschieht, darf es nicht stillschweigend geschehen. Eine
   * Gutachtenanlage, die weniger zeigt als ausgewählt wurde, ist schlimmer
   * als eine, die gar nicht entsteht.
   */
  const imKorb = ergebnis.imKorb ?? ergebnis.anzahl
  if (imKorb < ergebnis.anzahl) {
    return {
      anzahl: ergebnis.anzahl,
      fehler:
        `Die Anlage enthält ${imKorb} von ${ergebnis.anzahl} gewählten Fahrzeugen. ` +
        'Die übrigen liessen sich nicht verorten — bitte in der Anlage nachsehen, ' +
        'bevor sie ins Gutachten geht.',
    }
  }

  return {
    anzahl: ergebnis.anzahl,
    hinweis:
      ergebnis.anzahl === 1
        ? 'Ein Fahrzeug im Korb — die Anlage ist erzeugt.'
        : `${ergebnis.anzahl} Fahrzeuge im Korb — die Anlage ist erzeugt.`,
  }
}
