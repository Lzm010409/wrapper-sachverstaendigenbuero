import { ladeFall } from '@/autoixpert/aktionen'
import { leseFalldaten, platzhalterWerte, schlageEmpfaengerVor } from '@/autoixpert/felder'
import { gutachtenSchema, type Gutachten } from '@/autoixpert/typen'
import { ladeStellungnahmenZumFall } from '@/stellungnahme/abfragen'
import { baueFallAnsicht, type FallAnsicht, type Falldaten } from './modell'

/**
 * Der Datenzugriff der Fallseite.
 *
 * Hier — und nur hier — wird geholt: die Zeile aus der Datenbank, die
 * Prüfung der gespeicherten Rohantwort, die Schreiben dazu. Das Zusammen-
 * setzen zur Ansicht macht das reine Modell in `modell.ts`; die Oberfläche
 * bekommt das Ergebnis und stellt es dar. Sie kennt weder Drizzle noch Zod
 * noch die Feldpfade der Schnittstelle.
 *
 * Der Grund ist nicht Ordnungsliebe. Vorher lagen in der Fallseite sieben
 * Zuständigkeiten nebeneinander — Datenbankabfrage, Schemaprüfung,
 * Feldabbildung, ein Aufruf an Pipedrive, zwei Umgebungsprüfungen und die
 * Darstellung. Was davon fehlschlägt und was das für die Seite bedeutet,
 * liess sich nur durch Lesen des ganzen Bauteils beantworten.
 *
 * **Pipedrive steht bewusst nicht hier** (siehe `vorgang.ts`): es ist ein
 * Aufruf über das Netz mit eigener Ausfallart. Wäre er Teil dieses Modells,
 * hinge die ganze Fallseite an seiner Erreichbarkeit.
 */

export type { FallAnsicht, Falldaten, Schreiben } from './modell'

/** Die Ansicht plus die geprüfte Rohantwort, die der WBW-Reiter braucht. */
export interface FallMitGutachten extends FallAnsicht {
  gutachten: Gutachten | null
}

/**
 * Lädt alles, was die Fallseite braucht, in einem Aufruf.
 * Gibt `null` zurück, wenn es den Fall nicht gibt.
 */
export async function ladeFallAnsicht(id: string): Promise<FallMitGutachten | null> {
  const zeile = await ladeFall(id)
  if (!zeile) return null

  // Die Schreiben hängen an der Fall-Id, nicht an den autoiXpert-Daten.
  // Sie werden deshalb auch geladen, wenn die Falldaten unlesbar sind.
  const schreiben = await ladeStellungnahmenZumFall(zeile.id)

  const geprueft = gutachtenSchema.safeParse(zeile.daten)
  const daten = geprueft.success ? leseFalldaten(geprueft.data) : null

  return {
    ...baueFallAnsicht(zeile, daten, geprueft.success, schreiben),
    gutachten: geprueft.success ? geprueft.data : null,
  }
}

/**
 * Die Angaben, die der Reiter „Vorgang" aus dem Gutachten zieht:
 * Empfängervorschlag und die Platzhalter der Argumentbibliothek.
 */
export function leseVorgangsangaben(daten: Falldaten) {
  return {
    vorschlag: schlageEmpfaengerVor(daten),
    platzhalter: platzhalterWerte(daten),
  }
}

/**
 * Kann auf diesem Server ein Prüfbericht ausgewertet werden?
 *
 * Zwei Voraussetzungen, die nichts miteinander zu tun haben: das
 * Sprachmodell liest die Positionen aus, `poppler-utils` macht aus dem PDF
 * überhaupt erst Text und Bilder. Fehlt eines von beidem, ist die Maske
 * gesperrt — und der Benutzer soll erfahren, welches.
 */
export async function ladeAuswertungsbereitschaft(): Promise<{
  bereit: boolean
  kiFehlt: boolean
  fehlendeWerkzeuge: string[]
}> {
  const { werkzeugeVorhanden } = await import('@/pruefbericht/einlesen')
  const { kiVerfuegbar } = await import('@/ki/client')
  const [werkzeuge, ki] = await Promise.all([werkzeugeVorhanden(), kiVerfuegbar()])
  return {
    bereit: werkzeuge.ok && ki,
    kiFehlt: !ki,
    fehlendeWerkzeuge: werkzeuge.fehlend,
  }
}
