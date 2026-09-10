import 'server-only'
import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { benutzerRecht } from '@/db/schema'
import { aktuellerBenutzer, verlangeBenutzer, type AngemeldeterBenutzer } from '@/auth/sitzung'
import { protokolliereWarnung } from '@/protokoll'
import { BESCHREIBUNGEN, type Recht } from './katalog'
import { rechteVon } from './pruefen'

/**
 * Die Wache für Rechte.
 *
 * **Aufruf immer als erste Anweisung** einer Aktion, die etwas Geschütztes
 * tut — vor jeder Abfrage, vor jedem Fremdaufruf:
 *
 *     await verlangeRecht('stellungnahme.loeschen')
 *
 * **Warum sie wirft und nichts zurückgibt.** Eine fehlende Berechtigung ist
 * kein Zustand, mit dem die Aktion weiterarbeiten könnte. Wer den Rückgabewert
 * vergisst zu prüfen, hätte eine offene Tür; eine Ausnahme kann man nicht
 * übersehen.
 *
 * **Warum jeder abgewiesene Versuch ins Protokoll geht.** Nicht wegen des
 * Verdachts, sondern wegen der Wahrheit: Wird ein Recht dauernd verlangt und
 * dauernd verweigert, ist meistens die Rechtevergabe falsch und nicht der
 * Benutzer. Ohne die Zeile bemerkt das niemand — der Benutzer sieht eine
 * Fehlermeldung und macht etwas anderes.
 */

export class RechtFehlt extends Error {
  constructor(readonly recht: Recht) {
    const beschreibung = BESCHREIBUNGEN.find((b) => b.recht === recht)
    super(
      `Dafür fehlt die Berechtigung: ${beschreibung?.name ?? recht}. ` +
        'Die Administration kann sie in der Benutzerverwaltung vergeben.',
    )
    this.name = 'RechtFehlt'
  }
}

/** Die Abweichungen eines Benutzers von den Rechten seiner Rolle. */
export async function abweichungenVon(benutzerId: string) {
  return db
    .select({ recht: benutzerRecht.recht, gewaehrt: benutzerRecht.gewaehrt })
    .from(benutzerRecht)
    .where(eq(benutzerRecht.benutzerId, benutzerId))
}

/** Der tatsächliche Satz Rechte eines Benutzers. */
export async function rechteDesBenutzers(benutzer: AngemeldeterBenutzer): Promise<Set<Recht>> {
  return rechteVon(benutzer.rolle, await abweichungenVon(benutzer.id))
}

/**
 * Fragt, ohne zu werfen. Für die Oberfläche: einen Knopf gar nicht erst
 * zeigen ist freundlicher, als ihn nach dem Klick abzuweisen.
 *
 * **Das ersetzt die Wache nicht.** Ein ausgeblendeter Knopf ist keine
 * Sperre; die Aktion prüft trotzdem.
 */
export async function darf(recht: Recht): Promise<boolean> {
  const benutzer = await aktuellerBenutzer()
  if (!benutzer) return false
  return (await rechteDesBenutzers(benutzer)).has(recht)
}

/** Wirft, wenn das Recht fehlt. Gibt sonst den Benutzer zurück. */
export async function verlangeRecht(recht: Recht): Promise<AngemeldeterBenutzer> {
  const benutzer = await verlangeBenutzer()
  const satz = await rechteDesBenutzers(benutzer)
  if (!satz.has(recht)) {
    protokolliereWarnung('rechte.abgewiesen', 'Eine Aktion wurde mangels Berechtigung abgewiesen.', {
      benutzerId: benutzer.id,
      rolle: benutzer.rolle,
      recht,
    })
    throw new RechtFehlt(recht)
  }
  return benutzer
}
