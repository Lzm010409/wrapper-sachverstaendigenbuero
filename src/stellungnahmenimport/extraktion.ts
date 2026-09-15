import 'server-only'
import { MODELLE, rufeMitWerkzeugAuf } from '@/ki/client'
import { baueInhalt } from '@/pruefbericht/extraktion'
import type { EingelesenerBericht } from '@/pruefbericht/einlesen'
import { IMPORT_WERKZEUG, importSchema, type Import } from './schema'

/**
 * Liest eine bereits verfasste Stellungnahme aus, um sie in dieselbe
 * editierbare Struktur zu überführen wie eine aus dem Prüfbericht ausgewertete.
 *
 * Ein einzelner, eng begrenzter Modellaufruf — dasselbe Muster wie
 * `extrahierePositionen` in `@/pruefbericht/extraktion`, nur mit einem
 * anderen Blick auf das Dokument: hier ist das Schreiben selbst schon
 * fertig, es soll nur noch in Betreff, Anrede, Empfänger und Positionen
 * zerlegt werden.
 */

const SYSTEM = `Du liest eine bereits verfasste Stellungnahme eines Kfz-Sachverständigenbüros an
einen Versicherer, eine Kanzlei oder einen Prüfdienstleister aus. Das Schreiben ist fertig
formuliert — deine einzige Aufgabe ist, es in seine Bestandteile zu zerlegen. Du bewertest
nichts, änderst nichts und formulierst nichts neu.

Arbeitsweise:

- Lies das ganze Schreiben. Betreff und Anrede stehen meist am Anfang, der Empfänger im
  Anschriftfeld darüber.
- Zerlege den Brieftext in die einzelnen Kürzungspositionen, die darin behandelt werden —
  in der Reihenfolge, in der sie im Text vorkommen. Jede Position bekommt eine kurze
  Bezeichnung (Bauteil oder Kürzungsgrund) und den dazugehörigen Argumentationstext,
  möglichst wörtlich aus dem Schreiben übernommen.
- Beträge (laut Gutachten und nach Kürzung) nur übernehmen, wenn sie im Text tatsächlich
  genannt werden. Rate nichts — was nicht zweifelsfrei dasteht, bleibt null.
- Der letzte zusammenfassende Absatz vor der Grußformel ist der Ergebnisabsatz.
- Beträge immer netto, als Zahl ohne Währungszeichen, Dezimaltrennzeichen als Punkt.
- Was du nicht zweifelsfrei lesen kannst, kommt unter unklarheiten.`

export interface ImportExtraktionsErgebnis {
  extraktion: Import
}

export async function extrahiereImport(bericht: EingelesenerBericht): Promise<ImportExtraktionsErgebnis> {
  const roh = await rufeMitWerkzeugAuf({
    modell: MODELLE.schnell,
    system: SYSTEM,
    inhalt: baueInhalt(bericht),
    werkzeug: IMPORT_WERKZEUG,
    maxTokens: 12_000,
  })

  const geprueft = importSchema.safeParse(roh)
  if (!geprueft.success) {
    throw new Error(
      'Die Auswertung der Stellungnahme kam in unerwarteter Form zurück: ' +
        geprueft.error.issues
          .slice(0, 3)
          .map((i) => `${i.path.join('.')} — ${i.message}`)
          .join('; '),
    )
  }

  return { extraktion: geprueft.data }
}
