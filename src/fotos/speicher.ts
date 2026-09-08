import 'server-only'
import { createHash } from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import { mkdir, stat, unlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'

/**
 * Der Zwischenspeicher für Vorschaubilder.
 *
 * **Warum es ihn gibt.** Ein Fall hat schnell 67 Fotos. Am echten Fall
 * 0926/2081TG gemessen (08.09.2026):
 *
 * | | Grösse | Abrufdauer |
 * | --- | --- | --- |
 * | Vorschaubild (400×300) | 50 KB | ~1,0 s |
 * | Original (3000×2250) | 3,0 MB | ~1,3 s |
 *
 * Das Raster braucht 67 Vorschaubilder — beim ersten Mal 3,4 MB und gut
 * eine Minute, wenn man sie nacheinander holt. Jedes weitere Öffnen des
 * Reiters wäre dasselbe noch einmal, denn autoiXpert schickt keine
 * brauchbaren Cache-Angaben mit (`etag: original` steht an **jedem** Bild,
 * ist also wertlos, und `cache-control` fehlt ganz).
 *
 * **Warum auf der Platte und nicht in der Datenbank.** Vorschaubilder sind
 * abgeleitete Daten: sie lassen sich jederzeit neu holen. In der Datenbank
 * liessen sie sie wachsen und die Sicherungen schwerer werden, ohne dass
 * etwas gewonnen wäre. Der Container ist flüchtig — nach einem Neustart ist
 * der Speicher leer, und das ist in Ordnung.
 *
 * **Warum nicht die Originale.** 67 × 3 MB je Fall füllen jede Platte, und
 * ein Original sieht man einzeln an. Sie werden durchgereicht, nicht abgelegt.
 */

/** Wie lange ein Vorschaubild gilt. */
const HALTBARKEIT_MS = 7 * 24 * 60 * 60 * 1000

function wurzel(): string {
  return process.env.FOTO_SPEICHER ?? join(tmpdir(), 'cockpit-fotos')
}

/**
 * Der Ablageort einer Datei.
 *
 * Der Name ist ein Hash und nicht die ID: IDs kommen von aussen, und ein
 * Dateiname aus fremder Eingabe ist der klassische Weg aus dem Verzeichnis
 * heraus. Ein Hash kann keine Schrägstriche und keine Punkte enthalten.
 */
function pfadFuer(reportId: string, fotoId: string, format: string): string {
  const name = createHash('sha256').update(`${reportId}/${fotoId}/${format}`).digest('hex')
  // Zwei Zeichen als Unterverzeichnis: ein Verzeichnis mit zehntausenden
  // Einträgen wird auf jedem Dateisystem langsam.
  return join(wurzel(), name.slice(0, 2), name)
}

/** Liest ein Vorschaubild aus dem Speicher, oder `null`. */
export async function ausSpeicher(
  reportId: string,
  fotoId: string,
  format: string,
): Promise<{ strom: ReadableStream<Uint8Array>; laenge: number } | null> {
  const pfad = pfadFuer(reportId, fotoId, format)
  try {
    const daten = await stat(pfad)
    if (Date.now() - daten.mtimeMs > HALTBARKEIT_MS) {
      await unlink(pfad).catch(() => {})
      return null
    }
    return {
      strom: Readable.toWeb(createReadStream(pfad)) as ReadableStream<Uint8Array>,
      laenge: daten.size,
    }
  } catch {
    return null
  }
}

/**
 * Legt ein Vorschaubild ab, während es zum Browser geht.
 *
 * Der Strom wird geteilt: ein Zweig geht an den Browser, der andere auf die
 * Platte. Sonst müsste die Datei erst vollständig gelesen, dann geschrieben
 * und dann noch einmal gesendet werden — dreimal derselbe Weg und die ganze
 * Datei im Arbeitsspeicher.
 *
 * Scheitert das Schreiben, ist das kein Grund, dem Benutzer das Bild
 * vorzuenthalten: der Zweig wird verworfen, der Browser bekommt seins.
 */
export async function inSpeicher(
  reportId: string,
  fotoId: string,
  format: string,
  strom: ReadableStream<Uint8Array>,
): Promise<ReadableStream<Uint8Array>> {
  const pfad = pfadFuer(reportId, fotoId, format)
  const [fuerBrowser, fuerPlatte] = strom.tee()

  void (async () => {
    try {
      await mkdir(join(pfad, '..'), { recursive: true })
      // Erst unter einem Zwischennamen, dann umbenennen — sonst läge bei
      // einem Abbruch eine halbe Datei da, die beim nächsten Mal als
      // vollständiges Bild gelesen würde.
      const vorlaeufig = `${pfad}.${process.pid}.teil`
      // `Readable.fromWeb` erwartet den Node-eigenen Typ; der Web-Strom aus
      // `fetch` ist derselbe zur Laufzeit, nur anders getippt.
      await pipeline(
        Readable.fromWeb(fuerPlatte as unknown as Parameters<typeof Readable.fromWeb>[0]),
        createWriteStream(vorlaeufig),
      )
      const { rename } = await import('node:fs/promises')
      await rename(vorlaeufig, pfad)
    } catch (fehler) {
      console.error('Vorschaubild liess sich nicht ablegen:', fehler)
      void fuerPlatte.cancel().catch(() => {})
    }
  })()

  return fuerBrowser
}
