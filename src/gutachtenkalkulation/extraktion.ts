import 'server-only'
import { MODELLE, rufeMitWerkzeugAuf, type InhaltsBlock } from '@/ki/client'
import type { EingelesenerBericht } from '@/pruefbericht/einlesen'
import { GUTACHTENKALKULATION_WERKZEUG, gutachtenKalkulationSchema, type GutachtenKalkulation } from './schema'

/**
 * Liest die Kalkulationszeilen aus einer eingelesenen DAT-Schadenskalkulation
 * oder — ersatzweise — dem vollen Gutachten-PDF.
 *
 * Ein einzelner, eng begrenzter Modellaufruf, nach demselben Muster wie
 * `src/pruefbericht/extraktion.ts`: hinein gehen Text- und Bildseiten, heraus
 * kommt eine geprüfte Liste von Kalkulationszeilen. Was mit ihnen passiert —
 * ob sie zu einer Kürzungsposition passen — entscheidet erst
 * `src/stellungnahme/kalkulationsabgleich.ts`, und zwar in einem eigenen
 * Aufruf: dieser hier liest nur aus, er ordnet nichts zu.
 */

const SYSTEM = `Du liest die Reparaturkosten-Kalkulation eines Kfz-Sachverständigengutachtens aus.
Deine einzige Aufgabe ist das Auslesen — du bewertest nichts und ordnest nichts zu.

Arbeitsweise:

- Gehe ALLE Seiten durch.
- Melde jede Einzelposition der Kalkulation als eigene Zeile — Lohnpositionen, Ersatzteile,
  Lackmaterial, Nebenkosten — mit dem Wortlaut der Kalkulation als Bezeichnung.
- Melde KEINE Kopf-, Zwischen- oder Gesamtsummen als eigene Zeile. Die Gesamtsumme der
  Reparaturkosten trägst du stattdessen unter summeNetto ein, falls ausgewiesen.
- Rate nichts. Was du nicht zweifelsfrei lesen kannst, kommt unter unklarheiten.
- Beträge immer netto, als Zahl ohne Währungszeichen, Dezimaltrennzeichen als Punkt.`

export interface ExtraktionsErgebnis {
  kalkulation: GutachtenKalkulation
  /** Wie viele Seiten als Text und wie viele als Bild übergeben wurden. */
  quellen: { text: number; bild: number }
}

/** Baut die Nachricht aus Text- und Bildseiten. */
export function baueInhalt(bericht: EingelesenerBericht): InhaltsBlock[] {
  const bloecke: InhaltsBlock[] = [
    {
      type: 'text',
      text:
        `Kalkulation mit ${bericht.seitenzahl} Seiten. ` +
        `Nachfolgend Seite für Seite; Bildseiten sind eingescannt und visuell zu lesen.`,
    },
  ]

  for (const seite of bericht.seiten) {
    bloecke.push({ type: 'text', text: `--- Seite ${seite.nummer} ---` })
    if (seite.art === 'text') {
      bloecke.push({ type: 'text', text: seite.text })
    } else if (seite.bildBase64) {
      bloecke.push({
        type: 'image',
        source: { type: 'base64', media_type: 'image/jpeg', data: seite.bildBase64 },
      })
    }
  }

  return bloecke
}

export async function extrahiereKalkulation(bericht: EingelesenerBericht): Promise<ExtraktionsErgebnis> {
  const roh = await rufeMitWerkzeugAuf({
    modell: MODELLE.schnell,
    system: SYSTEM,
    inhalt: baueInhalt(bericht),
    werkzeug: GUTACHTENKALKULATION_WERKZEUG,
    maxTokens: 8000,
  })

  const geprueft = gutachtenKalkulationSchema.safeParse(roh)
  if (!geprueft.success) {
    throw new Error(
      'Die Auswertung der Kalkulation kam in unerwarteter Form zurück: ' +
        geprueft.error.issues
          .slice(0, 3)
          .map((i) => `${i.path.join('.')} — ${i.message}`)
          .join('; '),
    )
  }

  return {
    kalkulation: geprueft.data,
    quellen: bericht.zusammenfassung,
  }
}
