'use server'

import { eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { db } from '@/db'
import { fall } from '@/db/schema'
import { verlangeBenutzer } from '@/auth/sitzung'
import { verlangeRecht } from '@/rechte/zugriff'
import { clientAusUmgebung } from '@/autoixpert/client'
import { gutachtenSchema } from '@/autoixpert/typen'
import { kiVerfuegbar } from '@/ki/client'
import { beschriftePaket, naechstesPaket, type Fahrzeugkontext } from './assistent'
import { holeVorschaubilder } from './vorschaubilder'
import { ladeAnalyse, loescheAnalyse, setzeStand, speichereAnalyse } from './analyse-ablage'
import { ladeLexikon } from './lexikon-ablage'
import { beschrifteFoto } from './aktionen'
import type { Fotovorschlag } from './vorschlag'
import type { Verwendung } from './ansicht'
import type { Aktionsergebnis } from '@/melden/typen'

/**
 * Der Fotoassistent als Serveraktion.
 *
 * **Ein Paket je Aufruf, nicht der ganze Fall.** Ein Fall mit 67 Fotos
 * wären sechs Modellaufrufe hintereinander — eine gute Minute, in der eine
 * einzige Anfrage offen steht. Das überlebt kein Proxy zuverlässig, und der
 * Benutzer sähe eine Minute lang nichts als einen Kreisel. Stattdessen holt
 * sich die Oberfläche ein Paket nach dem anderen: jeder Aufruf dauert
 * Sekunden, der Fortschritt ist echt („24 von 67 beschriftet"), und bricht
 * einer ab, ist die Arbeit der vorigen nicht verloren.
 *
 * **Warum die Analyse kein eigenes Recht braucht.** Sie schreibt nichts nach
 * draussen und kostet Bruchteile eines Cents je Fall. Das Recht sitzt eine
 * Stufe später, beim Übernehmen — dort wirkt es im führenden System.
 */

export interface Analysefortschritt {
  /** Wie viele Fotos der Fall hat. */
  gesamt: number
  /** Wie viele davon einen Vorschlag haben. */
  beschriftet: number
  /** Wie viele in diesem Aufruf hinzukamen. */
  neu: number
  fertig: boolean
  fehler?: string
}

function abbruch(fehler: string): Analysefortschritt {
  return { gesamt: 0, beschriftet: 0, neu: 0, fertig: true, fehler }
}

/**
 * Beschriftet das nächste Paket Fotos.
 *
 * Aufrufen, bis `fertig` gesetzt ist. `fertig` heisst entweder „alle Fotos
 * haben einen Vorschlag" oder „dieser Aufruf hat nichts mehr zustande
 * gebracht" — im zweiten Fall wäre ein weiterer Versuch nur dieselbe
 * Störung noch einmal.
 */
export async function analysiereFotos(fallId: string): Promise<Analysefortschritt> {
  const benutzer = await verlangeBenutzer()

  if (!kiVerfuegbar()) {
    return abbruch('Die KI-Funktionen sind auf diesem Server nicht eingerichtet.')
  }
  const client = clientAusUmgebung()
  if (!client) return abbruch('autoiXpert ist auf diesem Server nicht eingerichtet.')

  const [zeile] = await db.select({ daten: fall.daten }).from(fall).where(eq(fall.id, fallId)).limit(1)
  const geprueft = zeile?.daten ? gutachtenSchema.safeParse(zeile.daten) : null
  if (!geprueft?.success) return abbruch('Zu diesem Fall fehlen die autoiXpert-Daten.')
  const gutachten = geprueft.data
  const reportId = gutachten.id || gutachten.external_id
  if (!reportId) return abbruch('Zu diesem Fall fehlt die autoiXpert-Kennung.')

  let fotos
  try {
    fotos = await client.holeFotos(reportId)
  } catch (fehler) {
    return abbruch(fehler instanceof Error ? fehler.message : String(fehler))
  }
  if (fotos.length === 0) return { gesamt: 0, beschriftet: 0, neu: 0, fertig: true }

  const vorhanden = await ladeAnalyse(fallId)
  const bekannt = new Map((vorhanden?.vorschlaege ?? []).map((v) => [v.fotoId, v]))
  // Ein Foto, das sich beim letzten Mal nicht laden liess, kommt nicht noch
  // einmal an die Reihe. Sonst belegte es in jedem weiteren Paket einen
  // Platz und der Lauf käme nie ans Ende.
  const gescheitert = new Set(vorhanden?.ohneVorschlag ?? [])

  const offen = naechstesPaket(fotos, new Set(bekannt.keys()), gescheitert)
  if (offen.length === 0) {
    return { gesamt: fotos.length, beschriftet: bekannt.size, neu: 0, fertig: true }
  }

  const kontext: Fahrzeugkontext = {
    marke: gutachten.car?.make ?? null,
    modell: gutachten.car?.model ?? null,
    kennzeichen: gutachten.car?.license_plate ?? null,
    schadenbeschreibung: gutachten.car?.damage_description ?? null,
  }

  // Die Stilvorlage kommt aus dem Fall selbst: was der Sachverständige hier
  // schon geschrieben hat, ist die beste Vorgabe für den Rest.
  const stilbeispiele = fotos
    .map((f) => f.description?.trim())
    .filter((b): b is string => Boolean(b))
    .slice(0, 8)

  const [bilder, teile] = await Promise.all([
    holeVorschaubilder(client, reportId, offen.map((f) => f.id)),
    ladeLexikon(),
  ])
  const neue = await beschriftePaket(kontext, stilbeispiele, teile, bilder)

  const alle: Fotovorschlag[] = [...bekannt.values(), ...neue]
  const geglueckt = new Set(neue.map((v) => v.fotoId))
  const ohneVorschlag = [
    ...gescheitert,
    ...offen.filter((f) => !geglueckt.has(f.id)).map((f) => f.id),
  ]
  await speichereAnalyse(fallId, benutzer.id, alle, ohneVorschlag)

  const fertig = neue.length === 0 || alle.length + ohneVorschlag.length >= fotos.length
  // Erst am Ende: die Oberfläche holt den Fortschritt aus der Rückgabe, und
  // sechs Neuberechnungen der Fallseite für einen Knopfdruck wären fünf zu
  // viel.
  if (fertig) revalidatePath(`/faelle/${fallId}`)

  return {
    gesamt: fotos.length,
    beschriftet: alle.length,
    neu: neue.length,
    // Kein Vorschlag zustande gekommen? Dann bringt das nächste Paket
    // dasselbe Ergebnis — hier ist Schluss, mit Grund.
    fertig,
    ...(neue.length === 0
      ? { fehler: 'Zu diesen Fotos kam kein Vorschlag zurück. Bitte später noch einmal versuchen.' }
      : {}),
  }
}

/**
 * Wirft die gespeicherte Analyse eines Falls weg — der nächste Lauf fängt
 * für alle Fotos wieder bei null an.
 *
 * **Wofür das gebraucht wird.** `analysiereFotos` lässt jedes Foto mit
 * Vorschlag aus, gleich welchen Stands — auch ein verworfener zählt als
 * „schon dran gewesen" und bekäme sonst nie einen zweiten Versuch. Ändert
 * sich das Fotolexikon oder will man nach einer schlechten Serie neu
 * anfangen, braucht es deshalb einen Schnitt, keinen Umweg über 67 Mal
 * „Verwerfen".
 *
 * **Was dabei nicht verloren geht.** Was schon nach autoiXpert übernommen
 * wurde, steht dort unverändert weiter — dieser Weg schreibt nirgendwo nach
 * aussen. Ein neuer Lauf schlägt für diese Fotos einfach noch einmal etwas
 * vor; nicht mehr, nicht weniger.
 */
export async function setzeAnalyseZurueck(fallId: string): Promise<Aktionsergebnis> {
  await verlangeBenutzer()
  await loescheAnalyse(fallId)
  revalidatePath(`/faelle/${fallId}`)
  return { hinweis: 'Analyse zurückgesetzt.' }
}

/**
 * Übernimmt einen Vorschlag nach autoiXpert.
 *
 * **Warum das Recht zweimal geprüft wird.** `beschrifteFoto` prüft es
 * ohnehin — dieselbe Prüfung, dieselbe Konstante. Sie steht hier trotzdem
 * noch einmal, weil jede exportierte Funktion einer `'use server'`-Datei
 * ein eigener Endpunkt ist und ihre Wache selbst tragen muss. Ein
 * Schutz, der nur über den Umweg einer anderen Funktion greift, ist beim
 * nächsten Umbau derjenige, der still verschwindet; `wache.test.ts`
 * verlangt ihn deshalb an Ort und Stelle.
 */
export async function uebernimmVorschlag(
  fallId: string,
  fotoId: string,
  beschreibung: string,
  verwendung: Verwendung,
): Promise<Aktionsergebnis> {
  await verlangeRecht('autoixpert.schreiben')

  const ergebnis = await beschrifteFoto(fallId, fotoId, {
    beschreibung,
    imGutachten: verwendung.imGutachten,
    inRestwertboerse: verwendung.inRestwertboerse,
    inReparaturbestaetigung: verwendung.inReparaturbestaetigung,
    inStellungnahme: verwendung.inStellungnahme,
  })
  if (ergebnis.fehler) return ergebnis

  // Erst nach dem geglückten Schreiben. Andersherum stünde der Vorschlag als
  // übernommen da, obwohl in autoiXpert nichts angekommen ist.
  await setzeStand(fallId, fotoId, 'uebernommen', beschreibung)
  revalidatePath(`/faelle/${fallId}`)
  return { hinweis: 'Übernommen.' }
}

/** Verwirft einen Vorschlag. Schreibt nichts nach autoiXpert. */
export async function verwirfVorschlag(fallId: string, fotoId: string): Promise<Aktionsergebnis> {
  await verlangeBenutzer()
  await setzeStand(fallId, fotoId, 'verworfen')
  revalidatePath(`/faelle/${fallId}`)
  return {}
}
