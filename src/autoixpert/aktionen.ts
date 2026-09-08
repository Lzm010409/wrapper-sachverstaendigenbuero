'use server'

import { revalidatePath } from 'next/cache'
import { desc, eq, sql } from 'drizzle-orm'
import { db } from '@/db'
import { fall } from '@/db/schema'
import { verlangeBenutzer } from '@/auth/sitzung'
import { AutoixpertFehler, clientAusUmgebung } from './client'
import { leseFalldaten } from './felder'
import { protokolliereFehler, protokolliereWarnung } from '@/protokoll'

export interface ImportZustand {
  fehler?: string
  hinweis?: string
  fallId?: string
}

/**
 * Holt einen Fall aus autoiXpert und legt ihn lokal ab.
 *
 * Bereits vorhandene Fälle werden aktualisiert statt doppelt angelegt —
 * erkannt wird das über die autoiXpert-ID, die sich nie ändert.
 */
export async function importiereFall(
  _zustand: ImportZustand,
  formular: FormData,
): Promise<ImportZustand> {
  const benutzer = await verlangeBenutzer()

  const eingabe = String(formular.get('eingabe') ?? '').trim()
  if (!eingabe) return { fehler: 'Bitte ein Aktenzeichen oder eine ID eingeben.' }

  const client = clientAusUmgebung()
  if (!client) {
    return {
      fehler:
        'Die autoiXpert-Schnittstelle ist nicht eingerichtet. ' +
        'Bitte AUTOIXPERT_API_TOKEN in den Umgebungsvariablen hinterlegen.',
    }
  }

  let aufloesung
  try {
    aufloesung = await client.loeseAuf(eingabe)
  } catch (fehler) {
    if (fehler instanceof AutoixpertFehler) return { fehler: fehler.message }
    const kennung = protokolliereFehler(
      'autoixpert.importiereFall',
      'Der Fall liess sich nicht laden.',
      fehler,
      { benutzerId: benutzer.id, dienst: 'autoixpert', eingabe },
    )
    return { fehler: `Der Fall konnte nicht geladen werden. Kennung ${kennung}` }
  }

  const daten = leseFalldaten(aufloesung.gutachten)

  const vorhanden = await db
    .select({ id: fall.id })
    .from(fall)
    .where(eq(fall.autoixpertId, daten.autoixpertId))
    .limit(1)

  let fallId: string
  const bestehend = vorhanden[0]
  if (bestehend) {
    await db
      .update(fall)
      .set({
        aktenzeichen: daten.aktenzeichen,
        daten: aufloesung.gutachten,
        abgerufenAm: new Date(),
      })
      .where(eq(fall.id, bestehend.id))
    fallId = bestehend.id
  } else {
    const [angelegt] = await db
      .insert(fall)
      .values({
        aktenzeichen: daten.aktenzeichen,
        autoixpertId: daten.autoixpertId,
        daten: aufloesung.gutachten,
        abgerufenAm: new Date(),
      })
      .returning({ id: fall.id })
    fallId = angelegt!.id
  }

  revalidatePath('/faelle')

  const hinweis =
    aufloesung.weg === 'aktenzeichen_suche'
      ? `Über das Aktenzeichen gefunden (${aufloesung.gelesendeSeiten} Listenseite${
          aufloesung.gelesendeSeiten === 1 ? '' : 'n'
        } gelesen). Mit der technischen ID geht es direkt.`
      : undefined

  return { fallId, hinweis }
}

/** Lädt einen bereits importierten Fall erneut aus autoiXpert. */
export async function aktualisiereFall(fallId: string): Promise<ImportZustand> {
  const benutzer = await verlangeBenutzer()

  const zeilen = await db.select().from(fall).where(eq(fall.id, fallId)).limit(1)
  const vorhanden = zeilen[0]
  if (!vorhanden?.autoixpertId) return { fehler: 'Fall nicht gefunden.' }

  const client = clientAusUmgebung()
  if (!client) return { fehler: 'Die autoiXpert-Schnittstelle ist nicht eingerichtet.' }

  try {
    const gutachten = await client.holeGutachten(vorhanden.autoixpertId)
    const daten = leseFalldaten(gutachten)
    await db
      .update(fall)
      .set({ aktenzeichen: daten.aktenzeichen, daten: gutachten, abgerufenAm: new Date() })
      .where(eq(fall.id, fallId))
  } catch (fehler) {
    // Ein Fehler der Schnittstelle trägt seine eigene, verständliche Meldung
    // — der geht an den Benutzer, nicht in eine Ausnahme.
    if (fehler instanceof AutoixpertFehler) {
      protokolliereWarnung('autoixpert.aktualisiereFall', fehler.message, {
        fallId,
        benutzerId: benutzer.id,
        dienst: 'autoixpert',
        status: fehler.status,
      })
      return { fehler: fehler.message }
    }
    // Alles Übrige ist unerwartet. Vorher flog es ungeloggt bis zur
    // Fehlerseite; jetzt steht es mit Kennung im Protokoll.
    const kennung = protokolliereFehler(
      'autoixpert.aktualisiereFall',
      'Der Fall liess sich nicht neu laden.',
      fehler,
      { fallId, benutzerId: benutzer.id, dienst: 'autoixpert' },
    )
    return { fehler: `Der Fall konnte nicht neu geladen werden. Kennung ${kennung}` }
  }

  revalidatePath('/faelle')
  revalidatePath(`/faelle/${fallId}`)
  return { hinweis: 'Falldaten aktualisiert.' }
}

/*
  Hier standen `ladeFaelle`, `ladeFall` und `zaehleFaelle`.

  Jede exportierte Funktion einer `'use server'`-Datei ist ein aufrufbarer
  Endpunkt — diese drei waren es ohne jede Anmeldeprüfung und gaben die
  letzten 100 Fälle samt Anspruchsteller und Kennzeichen heraus. Sie sind
  nach `abfragen.ts` gezogen und damit gar kein Endpunkt mehr; aufgerufen
  werden sie nur von Serverkomponenten, die die Anmeldung als erste
  Anweisung verlangen.
*/
