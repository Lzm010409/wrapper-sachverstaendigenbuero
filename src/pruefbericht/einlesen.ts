import 'server-only'
import { execFile } from 'node:child_process'
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'

const fuehreAus = promisify(execFile)

/**
 * Liest einen Prüfbericht ein.
 *
 * Die Entscheidung Text oder Bild fällt **je Seite**, nicht je Dokument.
 * Das ist keine Feinheit: Die Prüfberichte der Versicherer sind regelmäßig
 * Bündel aus digital erzeugtem Anschreiben und eingescanntem Prüfbericht.
 * Im vorliegenden HUK-Bündel tragen die Seiten 1–2 Text, die Seiten 3–6 des
 * DEKRA-Berichts dagegen nur ein Wasserzeichen — wer das Dokument als Ganzes
 * einstuft, verliert entweder den Bericht oder rastert unnötig alles.
 */

/** Ab wie vielen Zeichen eine Seite als textführend gilt. */
const TEXTSCHWELLE = 120

/** Auflösung für das Rastern. 150 dpi liest sich wie eine Papierkopie. */
const RASTER_DPI = 150

export type SeitenArt = 'text' | 'bild'

export interface Seite {
  nummer: number
  art: SeitenArt
  /** Bei `text`: der extrahierte Text. Bei `bild`: leer. */
  text: string
  /** Bei `bild`: JPEG als Base64, für die Bildauswertung. */
  bildBase64?: string
}

export interface EingelesenerBericht {
  seitenzahl: number
  seiten: Seite[]
  /** Wie viele Seiten Text trugen und wie viele gerastert werden mussten. */
  zusammenfassung: { text: number; bild: number }
}

export class Einlesefehler extends Error {
  constructor(nachricht: string) {
    super(nachricht)
    this.name = 'Einlesefehler'
  }
}

/** Zählt Zeichen ohne Leerraum — Wasserzeichen erzeugen sonst falschen Text. */
export function inhaltsZeichen(text: string): number {
  return text.replace(/\s+/g, '').length
}

/**
 * Entscheidet, ob eine Seite als textführend gilt.
 *
 * Gescannte Seiten liefern häufig trotzdem ein paar Zeichen — etwa ein
 * eingebettetes Wasserzeichen mit der Schadennummer. Deshalb eine Schwelle
 * statt einer Prüfung auf „leer".
 */
export function istTextseite(text: string): boolean {
  return inhaltsZeichen(text) >= TEXTSCHWELLE
}

async function seitenzahl(pfad: string): Promise<number> {
  const { stdout } = await fuehreAus('pdfinfo', [pfad], { maxBuffer: 1024 * 1024 })
  const treffer = stdout.match(/^Pages:\s+(\d+)/m)
  if (!treffer) throw new Einlesefehler('Die Seitenzahl liess sich nicht bestimmen.')
  return Number(treffer[1])
}

async function seitenText(pfad: string, seite: number): Promise<string> {
  try {
    const { stdout } = await fuehreAus(
      'pdftotext',
      ['-layout', '-f', String(seite), '-l', String(seite), pfad, '-'],
      { maxBuffer: 8 * 1024 * 1024 },
    )
    return stdout
  } catch {
    // Eine einzelne unlesbare Seite darf das Einlesen nicht abbrechen —
    // sie wird dann eben als Bild behandelt.
    return ''
  }
}

async function seitenBild(pfad: string, seite: number, ordner: string): Promise<string> {
  const praefix = join(ordner, `seite-${seite}`)
  await fuehreAus(
    'pdftoppm',
    ['-jpeg', '-r', String(RASTER_DPI), '-f', String(seite), '-l', String(seite), pfad, praefix],
    { maxBuffer: 1024 * 1024 },
  )

  // pdftoppm hängt je nach Seitenzahl unterschiedlich viele Stellen an.
  const dateien = await readdir(ordner)
  const treffer = dateien.find((d) => d.startsWith(`seite-${seite}-`) || d === `seite-${seite}.jpg`)
  if (!treffer) throw new Einlesefehler(`Seite ${seite} liess sich nicht rastern.`)

  return (await readFile(join(ordner, treffer))).toString('base64')
}

/**
 * Liest ein PDF ein und liefert je Seite Text oder Bild.
 *
 * `nurSeiten` begrenzt die Auswertung, etwa um bei einem Bündel nur den
 * Prüfbericht zu betrachten.
 */
export async function leseBericht(
  pdf: Buffer,
  optionen: {
    nurSeiten?: number[]
    /**
     * Wird nach jeder gelesenen Seite gerufen. Das Einlesen ist der lange
     * Teil des Vorgangs — vor allem bei gescannten Berichten, wo jede Seite
     * gerastert werden muss. Ohne Rückmeldung sieht der Balken dort aus,
     * als hänge er.
     */
    melde?: (stand: { seite: number; von: number; art: Seite['art'] }) => void
  } = {},
): Promise<EingelesenerBericht> {
  const ordner = await mkdtemp(join(tmpdir(), 'pruefbericht-'))
  const pfad = join(ordner, 'bericht.pdf')

  try {
    await writeFile(pfad, pdf)

    let anzahl: number
    try {
      anzahl = await seitenzahl(pfad)
    } catch {
      throw new Einlesefehler(
        'Die Datei liess sich nicht als PDF lesen. Bitte prüfen, ob es sich wirklich um ein PDF handelt.',
      )
    }

    const zuLesen = optionen.nurSeiten?.length
      ? optionen.nurSeiten.filter((s) => s >= 1 && s <= anzahl)
      : Array.from({ length: anzahl }, (_, i) => i + 1)

    const seiten: Seite[] = []
    for (const [i, nummer] of zuLesen.entries()) {
      const text = await seitenText(pfad, nummer)
      if (istTextseite(text)) {
        seiten.push({ nummer, art: 'text', text: text.trimEnd() })
      } else {
        seiten.push({
          nummer,
          art: 'bild',
          text: '',
          bildBase64: await seitenBild(pfad, nummer, ordner),
        })
      }
      optionen.melde?.({ seite: i + 1, von: zuLesen.length, art: seiten[i]!.art })
    }

    return {
      seitenzahl: anzahl,
      seiten,
      zusammenfassung: {
        text: seiten.filter((s) => s.art === 'text').length,
        bild: seiten.filter((s) => s.art === 'bild').length,
      },
    }
  } finally {
    await rm(ordner, { recursive: true, force: true })
  }
}

/** Prüft, ob die nötigen Werkzeuge vorhanden sind. */
export async function werkzeugeVorhanden(): Promise<{ ok: boolean; fehlend: string[] }> {
  const fehlend: string[] = []
  for (const werkzeug of ['pdfinfo', 'pdftotext', 'pdftoppm']) {
    try {
      await fuehreAus('which', [werkzeug])
    } catch {
      fehlend.push(werkzeug)
    }
  }
  return { ok: fehlend.length === 0, fehlend }
}
