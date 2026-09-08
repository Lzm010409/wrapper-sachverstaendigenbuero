import 'server-only'
import { readFile } from 'node:fs/promises'
import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { fall, wbwLauf } from '@/db/schema'
import { protokolliereFehler, protokolliereWarnung } from '@/protokoll'
import { gutachtenSchema } from '@/autoixpert/typen'
import { leseFalldaten } from '@/autoixpert/felder'
import { leseErgebnis } from './ergebnis'
import { erzeugeBelege, type Belegdatei } from './belege'
import { gespeicherteAuswahl } from './korb'
import type { Pruefurteil } from './urteil'

/**
 * Der Weg der Belege in den Gutachtenordner.
 *
 * **Warum über n8n und nicht unmittelbar nach OneDrive.** Der Ordner steckt
 * in einer gewachsenen Struktur — Jahr, Monat, Aktenzeichen — und die kennt
 * bereits ein Workflow, den mehrere Anwendungen benutzen
 * (`Search_Gutachtenordner_OneDrive`). Sie hier ein zweites Mal
 * nachzubilden hiesse, sie an zwei Stellen zu pflegen; und die
 * OneDrive-Zugangsdaten lägen dann auch im Cockpit.
 */

/** Ab diesem Wiederbeschaffungswert genügen die Portalpakete. */
export const EINZELBELEG_GRENZE = 10_000

/** Wie viel eine Anfrage tragen darf, bevor n8n und OneDrive abwinken. */
const ANFRAGE_HOECHSTENS = 20_000_000

export interface Hochladeergebnis {
  /** Was tatsächlich im Ordner liegt. */
  hochgeladen: number
  gesamt: number
  einzelbelege: number
  portalpakete: number
  hinweise: string[]
  fehler?: string
}

interface N8nAntwort {
  ok?: boolean
  fehler?: string
  hochgeladen?: number
  gesamt?: number
  dateien?: { name: string; hochgeladen: boolean; grund?: string }[]
}

/** Ob der Weg überhaupt eingerichtet ist — für eine Meldung vor der Arbeit. */
export function hochladenEingerichtet(): boolean {
  return Boolean(process.env.N8N_BELEGE_URL)
}

/**
 * Erzeugt die Belege und legt sie im Gutachtenordner ab.
 *
 * **Die Grenze von 10.000 EUR entscheidet nur über die Einzelbelege.** Die
 * Portalpakete gehen immer mit: sie belegen, welches Portal was beigetragen
 * hat, und das ist unabhängig von der Höhe des Werts.
 */
export async function ladeBelegeHoch(
  laufId: string,
  benutzerId: string,
): Promise<Hochladeergebnis> {
  const leer = { hochgeladen: 0, gesamt: 0, einzelbelege: 0, portalpakete: 0, hinweise: [] }

  const adresse = process.env.N8N_BELEGE_URL
  if (!adresse) {
    return {
      ...leer,
      fehler:
        'Der Weg in den Gutachtenordner ist nicht eingerichtet. ' +
        'Bitte N8N_BELEGE_URL in den Umgebungsvariablen hinterlegen.',
    }
  }

  const [lauf] = await db.select().from(wbwLauf).where(eq(wbwLauf.id, laufId)).limit(1)
  if (!lauf) return { ...leer, fehler: 'Der Lauf wurde nicht gefunden.' }
  if (!lauf.ordner) {
    return {
      ...leer,
      fehler:
        'Die Rohdaten dieses Laufs sind mit einem Neustart des Containers verlorengegangen. ' +
        'Die Belege lassen sich nicht mehr erzeugen.',
    }
  }

  const auswahl = gespeicherteAuswahl(lauf.auswahl)
  if (!auswahl || auswahl.length === 0) {
    return {
      ...leer,
      fehler: 'Es ist kein Korb übernommen. Bitte zuerst Fahrzeuge anhaken und übernehmen.',
    }
  }

  const [fallzeile] = await db.select().from(fall).where(eq(fall.id, lauf.fallId)).limit(1)
  const geprueft = fallzeile ? gutachtenSchema.safeParse(fallzeile.daten) : null
  const daten = geprueft?.success ? leseFalldaten(geprueft.data) : null
  const aktenzeichen = fallzeile?.aktenzeichen ?? daten?.aktenzeichen ?? null

  if (!aktenzeichen) {
    return {
      ...leer,
      fehler:
        'Zu diesem Fall steht kein Aktenzeichen fest. Ohne das lässt sich der ' +
        'Gutachtenordner nicht finden.',
    }
  }

  const ergebnis = leseErgebnis(lauf.ergebnis)
  const wert = ergebnis?.wert.vorschlagBrutto ?? null
  // Im Zweifel die gründlichere Fassung: steht kein Wert fest, entstehen die
  // Einzelbelege. Sie zu haben und nicht zu brauchen ist harmloser als
  // umgekehrt.
  const mitEinzelbelegen = wert === null || wert < EINZELBELEG_GRENZE

  let belege
  try {
    belege = await erzeugeBelege({
      ordner: lauf.ordner,
      kennungen: auswahl,
      urteile: (lauf.urteile as Record<string, Pruefurteil>) ?? {},
      kopf: {
        aktenzeichen,
        subjekt: subjektzeile(daten),
        abgerufenAm: lauf.beendetAm ?? lauf.begonnenAm,
      },
      mitEinzelbelegen,
    })
  } catch (fehler) {
    const kennung = protokolliereFehler(
      'wbw.hochladen',
      'Die Belege liessen sich nicht erzeugen.',
      fehler,
      { laufId, benutzerId, anzahl: auswahl.length },
    )
    return { ...leer, fehler: `Die Belege liessen sich nicht erzeugen. Kennung ${kennung}` }
  }

  return schicke(adresse, aktenzeichen, belege.dateien, belege.hinweise, {
    laufId,
    benutzerId,
    mitEinzelbelegen,
  })
}

/** Eine Zeile über das Subjektfahrzeug — sie steht im Kopf jedes Belegs. */
function subjektzeile(daten: ReturnType<typeof leseFalldaten> | null): string {
  if (!daten) return 'Vergleich zum Subjektfahrzeug'
  const teile = [
    [daten.fahrzeug.hersteller, daten.fahrzeug.modell].filter(Boolean).join(' '),
    daten.fahrzeug.erstzulassung ? `EZ ${daten.fahrzeug.erstzulassung}` : null,
    daten.fahrzeug.laufleistung
      ? `${daten.fahrzeug.laufleistung.toLocaleString('de-DE')} km`
      : null,
  ].filter(Boolean)
  return teile.length > 0 ? teile.join(' · ') : 'Vergleich zum Subjektfahrzeug'
}

async function schicke(
  adresse: string,
  aktenzeichen: string,
  dateien: Belegdatei[],
  hinweise: string[],
  zusammenhang: { laufId: string; benutzerId: string; mitEinzelbelegen: boolean },
): Promise<Hochladeergebnis> {
  const einzelbelege = dateien.filter((d) => d.art === 'einzelbeleg').length
  const portalpakete = dateien.filter((d) => d.art === 'portalpaket').length
  const gerippe = { hochgeladen: 0, gesamt: dateien.length, einzelbelege, portalpakete, hinweise }

  const gesamtgroesse = dateien.reduce((summe, d) => summe + d.bytes, 0)
  if (gesamtgroesse > ANFRAGE_HOECHSTENS) {
    return {
      ...gerippe,
      fehler:
        `Die Belege sind zusammen ${Math.round(gesamtgroesse / 1_000_000)} MB gross — das ist ` +
        'zu viel für eine Übertragung. Bitte den Korb verkleinern.',
    }
  }

  const inhalte = await Promise.all(
    dateien.map(async (d) => ({
      name: d.name,
      inhalt: (await readFile(d.pfad)).toString('base64'),
    })),
  )

  let antwort: Response
  try {
    antwort = await fetch(adresse, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(process.env.N8N_BELEGE_TOKEN
          ? { authorization: process.env.N8N_BELEGE_TOKEN }
          : {}),
      },
      body: JSON.stringify({ aktenzeichen, dateien: inhalte }),
      // Acht Belege mit Bildern brauchen Zeit — aber nicht unbegrenzt viel.
      signal: AbortSignal.timeout(180_000),
    })
  } catch (fehler) {
    const kennung = protokolliereFehler(
      'wbw.hochladen',
      'Der Gutachtenordner war nicht erreichbar.',
      fehler,
      { ...zusammenhang, dienst: 'n8n', anzahl: dateien.length },
    )
    return { ...gerippe, fehler: `Der Gutachtenordner war nicht erreichbar. Kennung ${kennung}` }
  }

  const rohtext = await antwort.text()
  let gelesen: N8nAntwort = {}
  try {
    gelesen = JSON.parse(rohtext) as N8nAntwort
  } catch {
    // Kein JSON — dann trägt der Text selbst die Auskunft.
  }

  if (!antwort.ok || gelesen.ok === false) {
    const grund = gelesen.fehler ?? rohtext.slice(0, 300) ?? `HTTP ${antwort.status}`
    protokolliereWarnung('wbw.hochladen', 'Der Gutachtenordner hat abgelehnt.', {
      ...zusammenhang,
      dienst: 'n8n',
      status: antwort.status,
      grund,
    })
    return {
      ...gerippe,
      hochgeladen: gelesen.hochgeladen ?? 0,
      fehler: grund,
    }
  }

  const gescheitert = (gelesen.dateien ?? []).filter((d) => !d.hochgeladen)
  return {
    ...gerippe,
    hochgeladen: gelesen.hochgeladen ?? dateien.length,
    hinweise: [
      ...hinweise,
      ...gescheitert.map((d) => `${d.name}: ${d.grund ?? 'nicht hochgeladen'}`),
    ],
  }
}
