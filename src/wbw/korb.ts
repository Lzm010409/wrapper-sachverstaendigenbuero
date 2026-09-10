import 'server-only'
import { eq } from 'drizzle-orm'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { db } from '@/db'
import { wbwLauf } from '@/db/schema'
import { protokolliereFehler } from '@/protokoll'
import { fahrzeugKennung, leseErgebnis } from './ergebnis'
import { rufeSkript } from './lauf'

/**
 * Der Vergleichskorb, wie der Sachverständige ihn festlegt.
 *
 * **Warum die Auswahl überhaupt gespeichert wird.** Der Lauf liefert einen
 * Vorschlag, das Gutachten braucht eine Entscheidung. Zwischen beidem liegt
 * ein Blick des Sachverständigen auf jede Zeile — und der muss festgehalten
 * werden, sonst beginnt er beim nächsten Öffnen des Reiters von vorn.
 *
 * **Warum als Liste von Kennungen und nicht als Häkchenzahl.** Die Zeilen
 * ändern ihre Reihenfolge, sobald sortiert oder gefiltert wird. Ein
 * gespeicherter Index zeigte danach auf ein anderes Fahrzeug.
 */

/** Was gerade im Korb liegt — `null` heisst: noch nicht entschieden. */
export function gespeicherteAuswahl(wert: unknown): string[] | null {
  if (!Array.isArray(wert)) return null
  return wert.filter((w): w is string => typeof w === 'string')
}

/**
 * Hält die Auswahl fest und erzeugt die Gutachtenanlage.
 *
 * Die Zyklus-Reports bleiben, wo sie sind: sie belegen, wie tief gesucht
 * wurde. Der Report aus der Auswahl ist das, was ins Gutachten geht.
 *
 * Scheitert die Erzeugung, ist die Auswahl trotzdem gespeichert — sie ist
 * die Entscheidung, der Report nur ihr Ausdruck. Andersherum wäre ein
 * Fehler beim Drucken ein Grund, die Arbeit zu verlieren.
 */
export async function uebernimmAuswahl(
  laufId: string,
  kennungen: string[],
  benutzerId: string,
): Promise<{ anzahl: number; imKorb?: number; anlage?: string; fehler?: string }> {
  const zeilen = await db.select().from(wbwLauf).where(eq(wbwLauf.id, laufId)).limit(1)
  const lauf = zeilen[0]
  if (!lauf) return { anzahl: 0, fehler: 'Der Lauf wurde nicht gefunden.' }

  const eindeutig = [...new Set(kennungen)]
  await db.update(wbwLauf).set({ auswahl: eindeutig }).where(eq(wbwLauf.id, laufId))

  if (!lauf.ordner) {
    return {
      anzahl: eindeutig.length,
      fehler:
        'Die Auswahl ist gespeichert. Die Anlage lässt sich nicht mehr erzeugen — ' +
        'die Rohdaten des Laufs sind mit einem Neustart des Containers verlorengegangen.',
    }
  }

  try {
    const { pfad, imKorb } = await erzeugeAnlage(lauf.ordner, eindeutig)
    return { anzahl: eindeutig.length, imKorb, anlage: pfad }
  } catch (fehler) {
    const kennung = protokolliereFehler(
      'wbw.korb',
      'Die Gutachtenanlage liess sich nicht erzeugen.',
      fehler,
      { laufId, benutzerId, anzahl: eindeutig.length },
    )
    return {
      anzahl: eindeutig.length,
      fehler: `Die Auswahl ist gespeichert, die Anlage nicht erzeugt. Kennung ${kennung}`,
    }
  }
}

/**
 * Schreibt eine Rohdatei nur mit den gewählten Fahrzeugen und lässt daraus
 * den Report bauen.
 *
 * Der Umweg über eine Datei ist Absicht: so entsteht die Anlage über
 * denselben Weg wie jeder andere Report des Plugins — dieselbe Rechnung,
 * dieselbe Darstellung, dieselben Zahlen. Ein eigener Ausgabeweg daneben
 * wäre eine zweite Wahrheit über denselben Korb.
 */
async function erzeugeAnlage(
  ordner: string,
  kennungen: string[],
): Promise<{ pfad: string; imKorb: number }> {
  const behalten = new Set(kennungen)

  const alle: Record<string, unknown>[] = []
  const rohdateien = await sammleRohdateien(ordner)
  for (const datei of rohdateien) {
    for (const eintrag of await leseEintraege(join(ordner, datei))) {
      const url = typeof eintrag.url === 'string' ? eintrag.url : null
      const kennung = fahrzeugKennung(url, (eintrag.id ?? eintrag.adid) as string | null)
      if (behalten.has(kennung)) alle.push(eintrag)
    }
  }

  if (alle.length === 0) {
    throw new Error('Zu den gewählten Fahrzeugen finden sich keine Rohdaten mehr.')
  }

  await writeFile(join(ordner, 'auswahl.json'), JSON.stringify({ items: alle }, null, 2), 'utf8')
  await writeFile(
    join(ordner, 'params-auswahl.json'),
    JSON.stringify(await auswahlparameter(ordner), null, 2),
    'utf8',
  )
  await rufeSkript(
    'run-report.js',
    ['params-auswahl.json', './auswahl-out', 'auswahl=auswahl.json'],
    { cwd: ordner, timeoutMs: 10 * 60 * 1000 },
  )
  /*
   * Nachzählen, was wirklich in der Anlage steht.
   *
   * Die Auswertung wirft Fahrzeuge ohne Händlerkoordinate heraus — für eine
   * Suche richtig, für einen handverlesenen Korb nicht. Am 08.09.2026 wurden
   * drei Fahrzeuge gewählt und zwei standen in der Anlage, ohne dass es
   * irgendwo stand. Eine Gutachtenanlage, die still weniger zeigt als
   * ausgewählt wurde, ist schlimmer als eine, die gar nicht entsteht.
   */
  const ergebnis = leseErgebnis(
    JSON.parse(await readFile(join(ordner, 'auswahl-out', 'result.json'), 'utf8')),
  )
  return { pfad: join(ordner, 'auswahl-out'), imKorb: ergebnis?.korb.length ?? 0 }
}

/**
 * Die Parameter für die Anlage.
 *
 * **Die Toleranzen stehen weit offen — und das ist der Punkt.** Der
 * Sachverständige hat jede Zeile einzeln angehakt; seine Auswahl *ist* der
 * Filter. Liefe die Anlage mit den Toleranzen des ersten Zyklus, würfe die
 * Auswertung genau die Fahrzeuge wieder heraus, für die im zweiten und
 * dritten Zyklus geweitet wurde — die Anlage zeigte dann weniger, als der
 * Sachverständige ausgewählt hat, ohne es zu sagen.
 *
 * Genommen wird der Zyklus, der zuletzt lief: er trägt Subjekt, Zentrum und
 * Karosserie in ihrer letzten Fassung. Findet sich keine seiner Dateien,
 * greift `params.json` — so hiess sie vor der Umstellung auf Zyklen, und
 * ältere Läufe sollen sich weiter ausdrucken lassen.
 */
export async function auswahlparameter(ordner: string): Promise<Record<string, unknown>> {
  const { readdir } = await import('node:fs/promises')
  const vorhanden = new Set(await readdir(ordner))
  const kandidaten = ['params-weit.json', 'params-geweitet.json', 'params-eng.json', 'params.json']
  const datei = kandidaten.find((k) => vorhanden.has(k))
  if (!datei) throw new Error('Zu diesem Lauf gibt es keine Parameterdatei mehr.')

  const params = JSON.parse(await readFile(join(ordner, datei), 'utf8')) as Record<string, unknown>
  return {
    ...params,
    radiusKm: 100000,
    kmToleranz: 10000000,
    ezToleranzJahre: 100,
    leistungToleranzKw: 10000,
    // Auch diese beiden greifen als Filter — und auch sie hat der
    // Sachverständige mit dem Haken bereits entschieden.
    getriebe: undefined,
    tueren: undefined,
    karosserie: undefined,
    /*
     * Rettet die Inserate ohne Händlerkoordinate. Das Plugin kennt die
     * Fahne für die geografisch bereits eingegrenzte Kleinanzeigen-Suche;
     * hier gilt dieselbe Begründung in stärkerer Form: die Auswahl von Hand
     * hat die Eingrenzung schon vorgenommen.
     */
    kleinanzeigenGeoConstrained: true,
  }
}

async function sammleRohdateien(ordner: string): Promise<string[]> {
  const { readdir } = await import('node:fs/promises')
  const eintraege = await readdir(ordner)
  return eintraege.filter((d) => d.startsWith('raw-') && d.endsWith('.json'))
}

async function leseEintraege(pfad: string): Promise<Record<string, unknown>[]> {
  const roh = JSON.parse(await readFile(pfad, 'utf8')) as
    | { items?: Record<string, unknown>[] }
    | Record<string, unknown>[]
  return Array.isArray(roh) ? roh : (roh.items ?? [])
}
