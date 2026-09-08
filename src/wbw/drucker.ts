import 'server-only'
import { execFile } from 'node:child_process'
import { stat } from 'node:fs/promises'
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
  return [
    process.env.WBW_CHROME,
    process.env.CHROME_PATH,
    process.env.PUPPETEER_EXECUTABLE_PATH,
    '/usr/bin/chromium',
    'chromium',
    'chromium-browser',
    'google-chrome',
    'google-chrome-stable',
  ].filter((p): p is string => Boolean(p))
}

/** Ob überhaupt gedruckt werden kann — für eine Meldung vor der Arbeit. */
export async function druckerVorhanden(): Promise<boolean> {
  for (const bin of kandidaten()) {
    try {
      await fuehreAus(bin, ['--version'], { timeout: 15_000 })
      return true
    } catch {
      // nächster
    }
  }
  return false
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

  const argumente = [
    '--headless=new',
    '--disable-gpu',
    '--no-pdf-header-footer',
    `--print-to-pdf=${pdfPfad}`,
    // Gibt den eingebetteten Bildern Zeit, sich aufzubauen. Ohne das kam ein
    // PDF heraus, in dem die Bilder fehlten — vollständig aussehend und doch
    // unbrauchbar als Beleg.
    '--virtual-time-budget=20000',
  ]
  const adresse = `file://${encodeURI(htmlPfad)}`
  let letzterGrund = 'kein Browser gefunden'

  for (const bin of kandidaten()) {
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
        letzterGrund = `${bin} schrieb nur ${groesse} Byte`
      } catch (fehler) {
        letzterGrund = fehler instanceof Error ? fehler.message.slice(0, 200) : String(fehler)
      }
    }
  }

  throw new Error(`Das PDF liess sich nicht drucken: ${letzterGrund}`)
}
