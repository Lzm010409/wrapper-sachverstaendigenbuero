import 'server-only'
import { execFile } from 'node:child_process'
import { access, stat } from 'node:fs/promises'
import { constants } from 'node:fs'
import { promisify } from 'node:util'

const fuehreAus = promisify(execFile)

/**
 * Druckt eine HTML-Datei in ein PDF.
 *
 * **Warum Chromium und keine PDF-Bibliothek.** Der Beleg soll aussehen wie
 * das, was am Bildschirm steht — dieselbe Schrift, dieselben Abstände,
 * dieselben Bilder. Eine Bibliothek hiesse, die Darstellung ein zweites Mal
 * zu schreiben und sie ab dann doppelt zu pflegen.
 *
 * Bis zum 08.09.2026 lag im Abbild gar kein Browser. Die PDF-Stufe des
 * Plugins suchte `chrome`, `chromium` und `msedge`, fand nichts und gab
 * still auf: im Ordner lagen HTML und Linkliste, nie ein PDF, und niemand
 * bekam davon etwas zu sehen. Deshalb wirft dieser Drucker, statt zu
 * schweigen.
 */

/** Wo Chromium liegt. `WBW_CHROME` gewinnt — im Abbild ist es gesetzt. */
function kandidaten(): string[] {
  const alle = [
    process.env.WBW_CHROME,
    process.env.CHROME_PATH,
    process.env.PUPPETEER_EXECUTABLE_PATH,
    '/usr/bin/chromium',
    // Dorthin zeigt der Symlink des Debian-Pakets. Ist `/usr/bin/chromium`
    // beschädigt, liegt das Programm trotzdem hier.
    '/usr/lib/chromium/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/google-chrome-stable',
    'chromium',
    'chromium-browser',
    'google-chrome',
    'google-chrome-stable',
  ].filter((p): p is string => Boolean(p))

  // `WBW_CHROME` zeigt im Abbild auf `/usr/bin/chromium`, das gleich darunter
  // noch einmal steht. Zweimal derselbe Aufruf heisst zweimal dieselbe
  // Wartezeit und zweimal dieselbe Meldung — im Protokoll vom 08.09.2026 gut
  // zu sehen.
  return [...new Set(alle)]
}

/**
 * Zeilen, die Chromium in jedem Container schreibt und die nichts erklären.
 *
 * Ohne diesen Filter verdrängen ein Dutzend D-Bus-Meldungen die eine Zeile,
 * die den Abbruch begründet.
 */
const GESCHWAETZ = /dbus|Failed to connect to the bus|NameHasOwner|Fontconfig|GLES|libva/i

/**
 * Der Grund eines gescheiterten Aufrufs — aus der Fehlerausgabe, nicht aus
 * der Kommandozeile.
 *
 * **Warum das nötig ist.** Node baut die Meldung eines gescheiterten
 * `execFile` als `Command failed: <ganze Kommandozeile>\n<stderr>`. Die
 * Kommandozeile von Chromium ist über 200 Zeichen lang — jede Kürzung behält
 * damit genau sie und wirft den Grund weg. Am 08.09.2026 stand deshalb im
 * Protokoll:
 *
 *     Das PDF liess sich nicht drucken: /usr/bin/chromium: Command failed:
 *     /usr/bin/chromium --headless=new … --no-sandbox file:///
 *
 * Der Browser war da, er scheiterte, und warum blieb wieder unsichtbar —
 * dieselbe Blindheit wie zuvor, nur eine Ebene tiefer.
 */
export function grundAusFehler(fehler: unknown): string {
  if (typeof fehler === 'string') return fehler.slice(0, 400)

  const f = fehler as { stderr?: unknown; message?: unknown }
  const stderr = typeof f.stderr === 'string' ? f.stderr : ''
  const zeilen = stderr
    .split('\n')
    .map((z) => z.trim())
    .filter(Boolean)
    .filter((z) => !GESCHWAETZ.test(z))

  if (zeilen.length > 0) {
    // Die letzten Zeilen tragen den Abbruch; davor steht der Anlauf.
    return zeilen.slice(-3).join(' | ').slice(0, 400)
  }

  const meldung = typeof f.message === 'string' ? f.message : String(fehler)
  // Die Kommandozeile weglassen: sie sagt nichts über den Abbruch und frisst
  // sonst den ganzen Platz.
  const ohneBefehl = meldung.replace(/^Command failed: [^\n]*/, '').trim()
  if (ohneBefehl) return ohneBefehl.slice(0, 400)

  /*
    Bleibt nur die Kommandozeile, ist die Ausgabe leer — dann tragen Signal und
    Rückgabewert die einzige Auskunft, die es gibt. Die Kommandozeile noch
    einmal hinzuschreiben half niemandem.
  */
  const lage = fehler as { code?: unknown; signal?: unknown; killed?: unknown }
  if (lage.killed && lage.signal) {
    return `nach Zeitüberschreitung abgebrochen (${String(lage.signal)}), ohne Ausgabe`
  }
  if (lage.signal) return `durch ${String(lage.signal)} beendet, ohne Ausgabe`
  if (lage.code !== undefined) return `abgebrochen mit Rückgabewert ${String(lage.code)}, ohne Ausgabe`
  return 'abgebrochen ohne Ausgabe'
}

/** Ein einzelner Versuch, einen Browser zu benutzen. */
export interface Druckversuch {
  pfad: string
  /** Ob unter diesem Pfad überhaupt etwas Ausführbares liegt. */
  vorhanden: boolean
  /** Woran es scheiterte — `null`, wenn es geklappt hat. */
  grund: string | null
}

/** Ob unter einem Pfad etwas Ausführbares liegt. Namen ohne `/` sagen nichts. */
async function istVorhanden(pfad: string): Promise<boolean> {
  if (!pfad.includes('/')) return false
  try {
    await access(pfad, constants.X_OK)
    return true
  } catch {
    return false
  }
}

/**
 * Formt aus allen Versuchen eine Meldung, die den Grund nennt.
 *
 * **Warum das eine eigene Funktion ist.** Bis zum 08.09.2026 merkte sich der
 * Drucker nur den *letzten* Fehlschlag. Der letzte Kandidat der Liste heisst
 * `google-chrome-stable` und ist von niemandem eingerichtet — seine
 * ENOENT-Meldung überschrieb jeden echten Grund. Im Protokoll stand dann
 *
 *     Das PDF liess sich nicht drucken: spawn google-chrome-stable ENOENT
 *
 * und zwar unabhängig davon, was wirklich los war. Wer das liest, sucht nach
 * einem Browser, den er nie konfiguriert hat.
 *
 * Unterschieden wird deshalb zweierlei: **kein Browser im Abbild** — dann ist
 * die Einrichtung schuld — und **Browser da, Druck gescheitert** — dann sagt
 * sein eigener Grund, was zu tun ist.
 */
export function druckfehlerMeldung(versuche: Druckversuch[]): string {
  const vorhandene = versuche.filter((v) => v.vorhanden)

  if (vorhandene.length === 0) {
    const gesucht = versuche.map((v) => v.pfad).join(', ')
    return (
      'Das PDF liess sich nicht drucken: im Abbild ist kein Browser installiert. ' +
      `Gesucht wurde unter ${gesucht || '— keine Kandidaten —'}. ` +
      'Erwartet wird Chromium unter dem Pfad aus WBW_CHROME.'
    )
  }

  // Der erste vorhandene führt: das ist der konfigurierte, und sein Grund ist
  // der, der zählt. Die übrigen stehen dahinter, damit nichts verlorengeht.
  const zeilen = vorhandene.map((v) => `${v.pfad}: ${v.grund ?? 'ohne Grund'}`)
  return `Das PDF liess sich nicht drucken: ${zeilen.join(' — ')}`
}

/** Ob überhaupt gedruckt werden kann — für eine Meldung vor der Arbeit. */
export async function druckerVorhanden(): Promise<boolean> {
  return (await sucheDrucker()) !== null
}

/**
 * Das Ergebnis der Suche, einmal gemerkt.
 *
 * `/api/gesundheit` wird alle 30 Sekunden abgefragt. Ohne diesen Speicher
 * startete jede Abfrage bis zu elf Prozesse, nur um dieselbe Antwort zu
 * bekommen — ein Browser wandert nicht zur Laufzeit ins Abbild.
 */
let gemerkterDrucker: { pfad: string | null } | null = null

/**
 * Der erste Browser, der sich starten lässt — oder `null`.
 *
 * Wird beim Start, vor dem Erzeugen der Belege und von der Zustandsauskunft
 * gefragt, damit ein fehlender Browser auffällt, bevor jemand eine Recherche
 * darauf verwendet.
 */
export async function sucheDrucker(): Promise<string | null> {
  if (gemerkterDrucker) return gemerkterDrucker.pfad

  for (const bin of kandidaten()) {
    try {
      await fuehreAus(bin, ['--version'], { timeout: 15_000 })
      gemerkterDrucker = { pfad: bin }
      return bin
    } catch {
      // nächster
    }
  }
  gemerkterDrucker = { pfad: null }
  return null
}

/** Für Tests: die gemerkte Antwort verwerfen. */
export function vergissDrucker(): void {
  gemerkterDrucker = null
}

export async function druckeHtml(htmlPfad: string, pdfPfad: string): Promise<void> {
  /*
   * Erst prüfen, ob es die Vorlage gibt.
   *
   * Chromium druckt auch, was es nicht findet: Es rendert seine eigene
   * Seite „Die Datei wurde nicht gefunden", und die ergibt ein PDF von rund
   * 20 KB — gross genug, um jede Grössenprüfung zu bestehen. Am 08.09.2026
   * gemessen. Ohne diesen Riegel läge im Gutachtenordner ein Beleg, der wie
   * ein Beleg aussieht und eine Fehlermeldung ist.
   */
  const vorlage = await stat(htmlPfad).catch(() => null)
  if (!vorlage?.isFile() || vorlage.size < 200) {
    throw new Error(`Das PDF liess sich nicht drucken: ${htmlPfad} ist keine brauchbare Vorlage.`)
  }

  /*
    Ein eigenes Profilverzeichnis neben dem PDF.
    
    Chromium legt sonst eines unter `$HOME` an. Im Abbild läuft der Dienst als
    `werkbank`, ein Systembenutzer ohne angelegtes Heimatverzeichnis — dann
    schlägt der Start je nach Fassung fehl, und die Meldung landete bis zum
    08.09.2026 hinter der Kürzung.
  */
  const profil = `${pdfPfad}.profil`

  const argumente = [
    '--headless=new',
    '--disable-gpu',
    // Im Container sind `/dev/shm` standardmässig 64 MB. Reicht das dem
    // Renderer nicht, stirbt er mitten im Druck — der häufigste Grund dafür,
    // dass Chromium zwar `--version` beantwortet und trotzdem nichts druckt.
    '--disable-dev-shm-usage',
    `--user-data-dir=${profil}`,
    '--no-pdf-header-footer',
    `--print-to-pdf=${pdfPfad}`,
    // Gibt den eingebetteten Bildern Zeit, sich aufzubauen. Ohne das kam ein
    // PDF heraus, in dem die Bilder fehlten — vollständig aussehend und doch
    // unbrauchbar als Beleg.
    '--virtual-time-budget=20000',
  ]
  const adresse = `file://${encodeURI(htmlPfad)}`
  const versuche: Druckversuch[] = []

  for (const bin of kandidaten()) {
    const vorhanden = await istVorhanden(bin)
    let grund: string | null = null

    // Zweiter Anlauf ohne Sandbox: Chromium verweigert den Start als root,
    // und genau so läuft es in manchen Containern.
    for (const zusatz of [[], ['--no-sandbox']]) {
      try {
        await fuehreAus(bin, [...argumente, ...zusatz, adresse], { timeout: 120_000 })
        const groesse = (await stat(pdfPfad)).size
        // Ein Chromium, das den Druck abbricht, hinterlässt trotzdem eine
        // Datei — leer oder ein paar hundert Byte gross. Sie sähe im Ordner
        // aus wie ein Beleg und wäre keiner.
        if (groesse > 8000) return
        grund = `schrieb nur ${groesse} Byte`
      } catch (fehler) {
        grund = grundAusFehler(fehler)
      }
    }

    /*
      Ein Aufruf, der mit ENOENT scheitert, sagt dasselbe wie eine fehlende
      Datei — auch für einen blossen Namen ohne Pfad, den `istVorhanden` nicht
      beurteilen kann. Beides gehört zusammen, damit die Meldung „kein Browser
      im Abbild" nicht an einem Namen scheitert, der nie einer war.
    */
    versuche.push({ pfad: bin, vorhanden: vorhanden && !/ENOENT/.test(grund ?? ''), grund })
  }

  throw new Error(druckfehlerMeldung(versuche))
}
