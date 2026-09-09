import 'server-only'
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { protokolliereWarnung } from '@/protokoll'
import { fahrzeugKennung } from './ergebnis'
import { belegname, eindeutig, paketname } from './dateiname'
import { belegseite, type Belegfahrzeug, type Belegkopf } from './belegseite'
import { druckeHtml } from './drucker'
import type { Pruefurteil } from './urteil'

/**
 * Die Belege, die in den Gutachtenordner gehen.
 *
 * Zwei Arten, und sie beantworten verschiedene Fragen:
 *
 * - **Der Einzelbeleg** tritt an die Stelle des ausgedruckten Inserats. Er
 *   wird gebraucht, wenn der Wiederbeschaffungswert niedrig ist: dort wiegt
 *   jedes einzelne Vergleichsfahrzeug schwer, und ein Versicherer will es
 *   nachrechnen können.
 * - **Das Portalpaket** zeigt, was ein Portal beigetragen hat — ein
 *   Dokument je Quelle, damit sich die Herkunft des Korbs belegen lässt.
 *
 * In beiden stehen **nur die angehakten Fahrzeuge**. Was der Sachverständige
 * verworfen hat, gehört nicht in den Gutachtenordner: es müsste dort erklärt
 * werden, und die Erklärung wäre „das habe ich ausgeschlossen".
 */

/** Höchstens so viele Bilder je Inserat — drei füllen die Zeile im Ausdruck. */
const BILDER_JE_INSERAT = 3

/** Ein Bild über diese Grösse bläht den Beleg, ohne ihn besser zu machen. */
const BILD_HOECHSTENS = 1_500_000

export interface Belegdatei {
  name: string
  pfad: string
  art: 'einzelbeleg' | 'portalpaket'
  /** Nur beim Paket. */
  portal?: string
  bytes: number
}

export interface Belegergebnis {
  dateien: Belegdatei[]
  /** Was auffiel, ohne den Vorgang zu kosten — steht in der Meldung. */
  hinweise: string[]
}

/**
 * Holt ein Bild und macht eine `data:`-Adresse daraus.
 *
 * Eingebettet statt verlinkt: ein verlinktes Bild ist beim Drucken vielleicht
 * da und vielleicht nicht — und in einem Jahr, wenn jemand den Beleg
 * heraussucht, sicher nicht mehr.
 */
async function holeBild(adresse: string): Promise<string | null> {
  try {
    const antwort = await fetch(adresse, { signal: AbortSignal.timeout(10_000) })
    if (!antwort.ok) return null

    const typ = antwort.headers.get('content-type') ?? 'image/jpeg'
    if (!typ.startsWith('image/')) return null

    const puffer = Buffer.from(await antwort.arrayBuffer())
    if (puffer.byteLength === 0 || puffer.byteLength > BILD_HOECHSTENS) return null

    return `data:${typ};base64,${puffer.toString('base64')}`
  } catch {
    // Ein fehlendes Bild ist ein magerer Beleg, kein gescheiterter.
    return null
  }
}

function text(wert: unknown): string | null {
  return typeof wert === 'string' && wert.trim() ? wert.trim() : null
}

function zahl(wert: unknown): number | null {
  if (typeof wert === 'number' && Number.isFinite(wert)) return wert
  const ziffern = String(wert ?? '').replace(/[^\d]/g, '')
  return ziffern ? Number(ziffern) : null
}

function liste(wert: unknown): string[] {
  return Array.isArray(wert) ? wert.filter((w): w is string => typeof w === 'string') : []
}

/**
 * Ein Fahrzeug, bevor seine Bilder eingebettet sind — dann stehen erst die
 * Adressen fest, nicht die Bilder selbst.
 */
type Rohfahrzeug = Omit<Belegfahrzeug, 'bilder'> & { bildadressen: string[] }

/** Liest alle Rohdateien eines Laufs und behält die gewählten Fahrzeuge. */
async function sammleFahrzeuge(ordner: string, kennungen: Set<string>): Promise<Rohfahrzeug[]> {
  const dateien = (await readdir(ordner)).filter(
    (d) => d.startsWith('raw-') && d.endsWith('.json'),
  )
  const gefunden = new Map<string, Rohfahrzeug>()

  for (const datei of dateien) {
    const roh = JSON.parse(await readFile(join(ordner, datei), 'utf8')) as
      | { items?: Record<string, unknown>[] }
      | Record<string, unknown>[]
    const eintraege = Array.isArray(roh) ? roh : (roh.items ?? [])

    for (const e of eintraege) {
      const kennung = fahrzeugKennung(text(e.url), (e.id ?? e.adid) as string | null)
      if (!kennungen.has(kennung) || gefunden.has(kennung)) continue

      gefunden.set(kennung, {
        kennung,
        quelle: text(e.quelle) ?? 'unbekannt',
        titel: text(e.titel),
        url: text(e.url),
        preis: zahl(e.preis),
        kilometerstand: zahl(e.kilometerstand),
        erstzulassung: text(e.erstzulassung),
        leistungKw: zahl(e.leistungKw),
        getriebe: text(e.getriebe),
        kraftstoff: text(e.kraftstoff),
        plz: text(e.plz),
        ort: text(e.ort),
        ausstattung: liste(e.ausstattung),
        beschreibung: text(e.beschreibung),
        bildadressen: liste(e.bilder).slice(0, BILDER_JE_INSERAT),
      })
    }
  }

  // In der Reihenfolge der Auswahl, nicht in der der Dateien: so heissen die
  // Belege bei einem zweiten Lauf gleich.
  return [...kennungen].flatMap((k) => {
    const f = gefunden.get(k)
    return f ? [f] : []
  })
}

/**
 * Das Merkmal, das ein Fahrzeug im Korb besonders macht.
 *
 * Zuerst das, was die Prüfung im Inserat wiedergefunden hat — sie hat den
 * Fliesstext gelesen und weiss, was gegenüber der Soll-Ausstattung zählt.
 * Sonst das erste Merkmal des Inserats. Findet sich nichts, bleibt der
 * Dateiname eben kürzer.
 */
export function merkmalFuer(
  fahrzeug: { ausstattung: string[] },
  urteil: Pruefurteil | undefined,
): string | null {
  return urteil?.erkannteAusstattung[0] ?? fahrzeug.ausstattung[0] ?? null
}

export async function erzeugeBelege(optionen: {
  ordner: string
  kennungen: string[]
  urteile: Record<string, Pruefurteil>
  kopf: Belegkopf
  /** Einzelbelege nur beim niedrigen Wiederbeschaffungswert. */
  mitEinzelbelegen: boolean
}): Promise<Belegergebnis> {
  const { ordner, kennungen, urteile, kopf, mitEinzelbelegen } = optionen
  const ziel = join(ordner, 'belege')
  await mkdir(ziel, { recursive: true })

  const roh = await sammleFahrzeuge(ordner, new Set(kennungen))
  if (roh.length === 0) {
    throw new Error('Zu den gewählten Fahrzeugen finden sich keine Rohdaten mehr.')
  }

  const hinweise: string[] = []
  if (roh.length < kennungen.length) {
    hinweise.push(
      `Zu ${kennungen.length - roh.length} von ${kennungen.length} gewählten Fahrzeugen ` +
        'liegen keine Rohdaten mehr vor — sie fehlen in den Belegen.',
    )
  }

  // Bilder einbetten. Nacheinander und nicht nebeneinander: bei acht
  // Fahrzeugen à drei Bildern wären es 24 gleichzeitige Abrufe an dieselben
  // zwei Hosts, und die bremsen dann alle.
  const fahrzeuge: Belegfahrzeug[] = []
  let ohneBild = 0
  for (const { bildadressen, ...rest } of roh) {
    const bilder: string[] = []
    for (const adresse of bildadressen) {
      const eingebettet = await holeBild(adresse)
      if (eingebettet) bilder.push(eingebettet)
    }
    if (bilder.length === 0 && bildadressen.length > 0) ohneBild += 1
    fahrzeuge.push({ ...rest, bilder })
  }
  if (ohneBild > 0) {
    hinweise.push(
      ohneBild === 1
        ? 'Bei einem Fahrzeug liessen sich die Bilder nicht laden.'
        : `Bei ${ohneBild} Fahrzeugen liessen sich die Bilder nicht laden.`,
    )
    protokolliereWarnung('wbw.belege', 'Bilder liessen sich nicht einbetten.', {
      anzahl: ohneBild,
      von: fahrzeuge.length,
    })
  }

  const dateien: Belegdatei[] = []
  /** Belege, deren Druck scheiterte — sie fehlen, der Rest geht trotzdem. */
  const nichtGedruckt: { name: string; grund: string }[] = []

  // --- Einzelbelege ---------------------------------------------------------
  if (mitEinzelbelegen) {
    const namen = eindeutig(
      fahrzeuge.map((f) =>
        belegname({
          kilometerstand: f.kilometerstand,
          erstzulassung: f.erstzulassung,
          merkmal: merkmalFuer(f, urteile[f.kennung]),
        }),
      ),
    )
    for (const [i, f] of fahrzeuge.entries()) {
      const name = namen[i]!
      const datei = await versucheSchreiben(
        ziel,
        name,
        belegseite(kopf, [f], name),
        'einzelbeleg',
        undefined,
        nichtGedruckt,
      )
      if (datei) dateien.push(datei)
    }
  }

  // --- Portalpakete ---------------------------------------------------------
  const nachPortal = new Map<string, Belegfahrzeug[]>()
  for (const f of fahrzeuge) {
    const bisher = nachPortal.get(f.quelle) ?? []
    bisher.push(f)
    nachPortal.set(f.quelle, bisher)
  }

  for (const [portal, gruppe] of nachPortal) {
    const name = paketname(portal)
    const datei = await versucheSchreiben(
      ziel,
      name,
      belegseite(kopf, gruppe, name),
      'portalpaket',
      portal,
      nichtGedruckt,
    )
    if (datei) dateien.push(datei)
  }

  /*
    Ein gescheiterter Druck kostet seinen Beleg, nicht alle. Am 08.09.2026
    brach `erzeugeBelege` beim ersten Fehlschlag ab: im Gutachtenordner landete
    nichts, obwohl sechs Fahrzeuge im Korb lagen und die Seiten längst
    gerendert waren. Was sich drucken lässt, geht jetzt hinaus; was fehlt,
    steht im Hinweis.
  */
  if (nichtGedruckt.length > 0) {
    hinweise.push(
      (nichtGedruckt.length === 1
        ? 'Ein Beleg liess sich nicht drucken und fehlt im Ordner: '
        : `${nichtGedruckt.length} Belege liessen sich nicht drucken und fehlen im Ordner: `) +
        nichtGedruckt.map((n) => n.name).join(', ') +
        `. Grund: ${nichtGedruckt[0]!.grund}`,
    )
    protokolliereWarnung('wbw.belege', 'Belege liessen sich nicht drucken.', {
      anzahl: nichtGedruckt.length,
      grund: nichtGedruckt[0]!.grund,
    })
  }

  if (dateien.length === 0) {
    throw new Error(
      `Kein einziger Beleg liess sich drucken. ${nichtGedruckt[0]?.grund ?? ''}`.trim(),
    )
  }

  return { dateien, hinweise }
}

/**
 * Schreibt einen Beleg und verschluckt einen gescheiterten Druck.
 *
 * Der Fehlschlag wird festgehalten, nicht geworfen: ein Browser, der bei
 * einem Beleg aussteigt, darf nicht die übrigen fünf mitnehmen.
 */
async function versucheSchreiben(
  ziel: string,
  name: string,
  html: string,
  art: Belegdatei['art'],
  portal: string | undefined,
  gescheitert: { name: string; grund: string }[],
): Promise<Belegdatei | null> {
  try {
    return await schreibe(ziel, name, html, art, portal)
  } catch (fehler) {
    gescheitert.push({
      name,
      grund: fehler instanceof Error ? fehler.message.slice(0, 300) : String(fehler),
    })
    return null
  }
}

async function schreibe(
  ziel: string,
  name: string,
  html: string,
  art: Belegdatei['art'],
  portal?: string,
): Promise<Belegdatei> {
  const htmlPfad = join(ziel, `${name}.html`)
  const pdfPfad = join(ziel, name)
  await writeFile(htmlPfad, html, 'utf8')
  await druckeHtml(htmlPfad, pdfPfad)
  const { stat } = await import('node:fs/promises')
  return { name, pfad: pdfPfad, art, bytes: (await stat(pdfPfad)).size, ...(portal ? { portal } : {}) }
}
