'use server'

import { verlangeBenutzer } from '@/auth/sitzung'
import { verlangeRecht } from '@/rechte/zugriff'
import { holeLauf, starteLauf, type LaufEingaben, type Laufstand } from './auftrag'

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
