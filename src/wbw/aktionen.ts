'use server'

import { verlangeBenutzer } from '@/auth/sitzung'
import { verlangeRecht } from '@/rechte/zugriff'
import { holeLauf, starteLauf, type LaufEingaben, type Laufstand } from './auftrag'
import { ermittleModelle } from './lauf'
import { loeseModellAuf } from './modell'
import { uebernimmAuswahl } from './korb'
import { ladeBelegeHoch } from './hochladen'

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

export interface Uploadantwort {
  hinweis?: string
  fehler?: string
}

/**
 * Legt die Belege des übernommenen Korbs im Gutachtenordner ab.
 *
 * Ein eigener Handgriff, kein Nebeneffekt des Übernehmens: der Upload wirkt
 * nach draussen und in ein System, aus dem das Cockpit nichts zurücknehmen
 * kann. Er verlangt das Recht `versand.vermerken` — dasselbe wie jede andere
 * Handlung, die das Haus verlässt.
 */
export async function ladeBelegeInGutachtenordner(laufId: string): Promise<Uploadantwort> {
  const benutzer = await verlangeBenutzer()
  try {
    await verlangeRecht('versand.vermerken')
  } catch (fehler) {
    return { fehler: fehler instanceof Error ? fehler.message : 'Keine Berechtigung.' }
  }

  const ergebnis = await ladeBelegeHoch(laufId, benutzer.id)
  if (ergebnis.fehler) return { fehler: ergebnis.fehler }

  const teile = [
    `${ergebnis.hochgeladen} von ${ergebnis.gesamt} Dateien im Gutachtenordner`,
    ergebnis.einzelbelege > 0
      ? `${ergebnis.einzelbelege} ${ergebnis.einzelbelege === 1 ? 'Einzelbeleg' : 'Einzelbelege'}`
      : null,
    ergebnis.portalpakete > 0
      ? `${ergebnis.portalpakete} ${ergebnis.portalpakete === 1 ? 'Portalpaket' : 'Portalpakete'}`
      : null,
  ].filter(Boolean)

  // Ein Hinweis ist kein Fehler, darf aber nicht untergehen: er sagt, dass
  // etwas fehlt, obwohl der Vorgang durchlief.
  const meldung = [teile.join(' · '), ...ergebnis.hinweise].join('. ')
  return ergebnis.hinweise.length > 0 ? { fehler: meldung } : { hinweis: meldung }
}

export interface Modellpruefung {
  /** Ob AutoScout24 den Suchbegriff auflösen kann. */
  bekannt: boolean
  /** Der Name, unter dem das Portal das Fahrzeug führt. */
  aufgeloest: string | null
  /** Was das Portal selbst zu diesem Namen vorschlägt. */
  vorschlaege: string[]
  /** Wie viele Modelle die Marke bei AutoScout24 hat. */
  anzahl: number
  /** Gesetzt, wenn die Liste nicht abgerufen werden konnte. */
  fehler?: string
}

/**
 * Prüft **vor** dem Lauf, ob AutoScout24 den Suchbegriff kennt.
 *
 * **Warum vorher.** Bisher stand die Antwort erst im Protokoll eines
 * laufenden Auftrags: „AutoScout24 kennt ‚Highline BMT‘ nicht unter 119
 * Modellen von Volkswagen. Gesucht wird über die ganze Marke." Wer das liest,
 * hat schon fünf Minuten gewartet — und bekommt am Ende einen Korb, der aus
 * einem Portal weniger stammt, ohne dass es der Zahl anzusehen wäre. Am
 * 08.09.2026 lieferte AutoScout24 daraufhin in beiden Zyklen null Treffer.
 *
 * Die Prüfung ist ein Hinweis, keine Sperre: der Sachverständige darf
 * wissentlich über die Marke suchen.
 */
export async function pruefeModellname(marke: string, modell: string): Promise<Modellpruefung> {
  await verlangeBenutzer()

  const leer: Modellpruefung = { bekannt: true, aufgeloest: null, vorschlaege: [], anzahl: 0 }
  if (!marke.trim() || !modell.trim()) return leer

  try {
    const liste = await ermittleModelle(marke, modell)
    const treffer = loeseModellAuf(modell, liste.modelle)
    return {
      bekannt: treffer.modell !== null,
      aufgeloest: treffer.modell,
      vorschlaege: liste.vorschlaege.slice(0, 6),
      anzahl: liste.anzahl,
    }
  } catch (fehler) {
    // Ein Abruffehler ist kein Befund. Er darf nicht als „Modell unbekannt"
    // erscheinen und den Sachverständigen ein richtiges Feld ändern lassen.
    return {
      ...leer,
      fehler: fehler instanceof Error ? fehler.message.slice(0, 200) : 'Abruf gescheitert.',
    }
  }
}
