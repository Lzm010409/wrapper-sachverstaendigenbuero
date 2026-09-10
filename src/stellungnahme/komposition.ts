import 'server-only'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { MODELLE, rufeFuerTextAuf } from '@/ki/client'

/**
 * Formuliert die gewählten Bausteine einer Position zu einem Absatz aus.
 *
 * Ein Aufruf **je Position**, nicht einer für das ganze Dokument. Das ist
 * der wichtigste Hebel für die Wartezeit: die Aufrufe laufen nebeneinander,
 * und ein misslungener Absatz lässt sich einzeln neu erzeugen, ohne alles
 * zu verlieren.
 *
 * Die Substanz bleibt unangetastet. Das Modell verbindet die gewählten
 * Bausteine und setzt die Fallwerte ein — es ergänzt keine Argumente und
 * erfindet keine Tatsachen. Was nicht in den Bausteinen steht, steht auch
 * nicht im Ergebnis.
 */

let hausstilZwischenspeicher: string | null = null

/**
 * Lädt die Hausstil-Vorgaben aus den Skills.
 *
 * Der Text wird nicht umgeschrieben, sondern wörtlich als Prompt-Fragment
 * verwendet — der Skill bleibt die Wahrheit (Konzept E1).
 */
export async function ladeHausstil(wurzel = process.cwd()): Promise<string> {
  if (hausstilZwischenspeicher) return hausstilZwischenspeicher
  const pfad = join(
    wurzel,
    'skills',
    'stellungnahme-erstellen',
    'references',
    'hausstil-aufbau-stellungnahme.md',
  )
  try {
    const roh = await readFile(pfad, 'utf8')
    // Nur die Abschnitte zu Tonfall und Positionen; Briefkopf und
    // Dateiformate steuert die Anwendung selbst.
    const anfang = roh.indexOf('## 7. Nummerierte Positionen')
    const ende = roh.indexOf('## 10. Formatierungsregeln')
    hausstilZwischenspeicher =
      anfang >= 0 && ende > anfang ? roh.slice(anfang, ende).trim() : roh.slice(0, 4000)
  } catch {
    hausstilZwischenspeicher = ''
  }
  return hausstilZwischenspeicher
}

export interface KompositionsBaustein {
  /** Text aus der Bibliothek oder vom Nutzer. */
  text: string
  herkunft: 'bibliothek' | 'eigener_text'
}

export interface KompositionsAuftrag {
  positionBezeichnung: string
  begruendungVersicherer: string | null
  bausteine: KompositionsBaustein[]
  /** Werte aus dem Fall, mit denen Platzhalter zu füllen sind. */
  platzhalterWerte: Record<string, string>
  betragGutachten: string | null
  betragGekuerzt: string | null
}

function baueSystem(hausstil: string): string {
  return `Du formulierst einen Abschnitt einer Stellungnahme des Kfz-Sachverständigenbüros
Gollenstede gegen ein Kürzungsschreiben.

Feste Regeln:

- Die Substanz kommt ausschliesslich aus den gelieferten Bausteinen. Ergänze KEINE
  Argumente, KEINE Tatsachen, KEINE Rechtsprechung und KEINE Zahlen, die nicht dort
  oder in den Fallwerten stehen.
- Setze die genannten Fallwerte an die Stelle der Platzhalter in eckigen Klammern.
  Bleibt ein Platzhalter ohne passenden Wert, LASS IHN STEHEN — er wird anschliessend
  geprüft. Erfinde keinen Wert und lass ihn nicht einfach weg.
- Verbinde mehrere Bausteine zu zusammenhängendem Fliesstext, ohne ihren Inhalt zu
  verändern oder zu kürzen.
- Schreibe sachlich und bestimmt. Keine Konjunktive an Stellen, an denen eine
  Feststellung getroffen wird: „ist erforderlich", nicht „könnte erforderlich sein".
- Du bist Sachverständiger, nicht Rechtsberater. Begründe technisch. Keine Wendungen
  wie „Sie haben Anspruch auf" oder „der Versicherer ist verpflichtet".
- Keine Überschrift, keine Anrede, keine Aufzählungszeichen — nur der Fliesstext des
  Abschnitts. Mehrere Absätze durch eine Leerzeile trennen.

Aus dem Hausstil des Büros:

${hausstil}`
}

function baueAuftrag(a: KompositionsAuftrag): string {
  const teile: string[] = []

  teile.push(`Position: ${a.positionBezeichnung}`)
  if (a.begruendungVersicherer) {
    teile.push(`Begründung des Prüfdienstleisters: „${a.begruendungVersicherer}"`)
  }
  if (a.betragGutachten && a.betragGekuerzt) {
    teile.push(`Beträge: laut Gutachten ${a.betragGutachten} €, nach Prüfung ${a.betragGekuerzt} €`)
  }

  const werte = Object.entries(a.platzhalterWerte)
  teile.push(
    werte.length > 0
      ? `\nFallwerte für die Platzhalter:\n${werte.map(([k, v]) => `  [${k}] = ${v}`).join('\n')}`
      : '\nZu diesem Fall liegen keine Werte für Platzhalter vor.',
  )

  teile.push('\nBausteine, aus denen der Abschnitt besteht:')
  for (const [i, b] of a.bausteine.entries()) {
    const quelle = b.herkunft === 'bibliothek' ? 'aus der Argumentbibliothek' : 'vom Sachverständigen'
    teile.push(`\n--- Baustein ${i + 1} (${quelle}) ---\n${b.text}`)
  }

  teile.push('\nFormuliere daraus den Abschnitt.')
  return teile.join('\n')
}

/** Formuliert eine Position aus. */
export async function formulierePosition(auftrag: KompositionsAuftrag): Promise<string> {
  if (auftrag.bausteine.length === 0) {
    throw new Error('Ohne Bausteine lässt sich nichts formulieren.')
  }

  const hausstil = await ladeHausstil()
  return rufeFuerTextAuf({
    modell: MODELLE.formulieren,
    system: baueSystem(hausstil),
    auftrag: baueAuftrag(auftrag),
    maxTokens: 2000,
  })
}

/**
 * Formuliert mehrere Positionen nebeneinander.
 *
 * Eine gescheiterte Position reisst die übrigen nicht mit — sie wird mit
 * ihrem Fehler zurückgegeben, damit die Oberfläche gezielt einen neuen
 * Versuch anbieten kann.
 *
 * **Die erste Position läuft allein.** Systemanweisung und Hausstil sind für
 * alle Positionen dieselben rund 1700 Token und liegen im Zwischenspeicher
 * des Modells (siehe `alsSystemblock` in `ki/client.ts`). Der Eintrag
 * entsteht aber erst, wenn ein Aufruf ihn geschrieben hat. Starteten alle
 * Positionen gleichzeitig, käme keine an einem fertigen Eintrag an: jede
 * schriebe ihren eigenen — zum 1,25-fachen Preis — und keine läse einen. Das
 * Zwischenspeichern wäre dann teurer als gar keines. Läuft die erste zuerst,
 * lesen alle übrigen ihren Eintrag zu einem Zehntel des Preises.
 *
 * Das kostet die Wartezeit eines einzelnen Aufrufs. Bei acht Positionen
 * stehen dem rund drei Viertel weniger Eingabe-Token gegenüber.
 */
export async function formulierePositionen(
  auftraege: { positionId: string; auftrag: KompositionsAuftrag }[],
): Promise<{ positionId: string; text?: string; fehler?: string }[]> {
  async function formuliere({
    positionId,
    auftrag,
  }: {
    positionId: string
    auftrag: KompositionsAuftrag
  }): Promise<{ positionId: string; text?: string; fehler?: string }> {
    try {
      return { positionId, text: await formulierePosition(auftrag) }
    } catch (fehler) {
      return {
        positionId,
        fehler: fehler instanceof Error ? fehler.message : 'Unbekannter Fehler',
      }
    }
  }

  const [erste, ...uebrige] = auftraege
  if (!erste) return []

  // Der Warmlauf. Scheitert er, laufen die übrigen trotzdem — dann eben ohne
  // gefüllten Zwischenspeicher, wie vorher auch.
  const zuerst = await formuliere(erste)
  return [zuerst, ...(await Promise.all(uebrige.map(formuliere)))]
}
