import 'server-only'
import { MODELLE, rufeMitWerkzeugAuf, type InhaltsBlock } from '@/ki/client'
import type { EingelesenerBericht } from './einlesen'
import { EXTRAKTION_WERKZEUG, extraktionSchema, type Extraktion } from './schema'

/**
 * Liest die Kürzungspositionen aus einem eingelesenen Prüfbericht.
 *
 * Ein einzelner, eng begrenzter Modellaufruf: hinein gehen Text- und
 * Bildseiten, heraus kommt eine geprüfte Struktur. Die Auswahl der
 * Gegenargumente passiert später und getrennt davon — das Modell entscheidet
 * hier nichts über die Argumentation.
 */

const SYSTEM = `Du wertest Kürzungsschreiben und Prüfberichte von Kfz-Versicherern für ein
Kfz-Sachverständigenbüro aus. Deine einzige Aufgabe ist das Auslesen — du bewertest
nichts und formulierst keine Gegenargumente.

Arbeitsweise:

- Gehe ALLE Seiten durch. Die Kürzungsbeträge stehen häufig auf späteren Seiten unter
  Überschriften wie „Prüfkalkulation", „Ergebnis der Prüfung" oder „Technische Prüfung".
- Sendungen der Versicherer bündeln oft mehrere Vorgänge. Trenne sie in Abschnitte und
  markiere unfallfremde Abschnitte als nicht relevant. Das betrifft insbesondere die
  Prüfung des Sachverständigenhonorars und den Nutzungsausfall: beide gehören nicht in
  eine Stellungnahme zur Reparaturkostenabrechnung.
- Fasse Kalkulationszeilen zusammen, die auf dieselbe Entscheidung des
  Prüfdienstleisters zurückgehen. Mehrere Lohn- und Lackierzeilen aus einer einzigen
  Beilackierungs-Streichung sind EINE Position.
- Bei einem Werkstattvergleich sind die Stundenverrechnungssätze, der Lackmaterial-
  Prozentsatz und der Ersatzteilaufschlag jeweils eigene Positionen. Gib als
  betragGutachten und betragGekuerzt die gegenübergestellten Werte an.
- Die Begründung des Prüfdienstleisters ist wichtiger als der Bauteilname. Gib sie so
  wörtlich wieder, wie es geht.
- Rate nichts. Was du nicht zweifelsfrei lesen kannst, kommt unter unklarheiten. Ein
  falscher Betrag in einem versandten Schreiben wiegt schwerer als eine Rückfrage.
- Beträge immer netto, als Zahl ohne Währungszeichen, Dezimaltrennzeichen als Punkt.`

export interface ExtraktionsErgebnis {
  extraktion: Extraktion
  /** Wie viele Seiten als Text und wie viele als Bild übergeben wurden. */
  quellen: { text: number; bild: number }
}

/** Baut die Nachricht aus Text- und Bildseiten. */
export function baueInhalt(bericht: EingelesenerBericht): InhaltsBlock[] {
  const bloecke: InhaltsBlock[] = [
    {
      type: 'text',
      text:
        `Prüfbericht mit ${bericht.seitenzahl} Seiten. ` +
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

export async function extrahierePositionen(
  bericht: EingelesenerBericht,
): Promise<ExtraktionsErgebnis> {
  const roh = await rufeMitWerkzeugAuf({
    modell: MODELLE.schnell,
    system: SYSTEM,
    inhalt: baueInhalt(bericht),
    werkzeug: EXTRAKTION_WERKZEUG,
    maxTokens: 12_000,
  })

  const geprueft = extraktionSchema.safeParse(roh)
  if (!geprueft.success) {
    throw new Error(
      'Die Auswertung des Prüfberichts kam in unerwarteter Form zurück: ' +
        geprueft.error.issues
          .slice(0, 3)
          .map((i) => `${i.path.join('.')} — ${i.message}`)
          .join('; '),
    )
  }

  return {
    extraktion: geprueft.data,
    quellen: bericht.zusammenfassung,
  }
}
