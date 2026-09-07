/**
 * Der Abruf einer Kleinanzeigen-Seite: nacheinander, mit Abstand, mit
 * Wiederholung.
 *
 * **Warum kein Browser.** Der bisherige Dienst fährt für jede Seite ein
 * Chromium hoch (Playwright). Gebraucht wird das nicht: Kleinanzeigen liefert
 * Trefferliste **und** Detailseite fertig gerendert aus — Titel, Preis, Ort,
 * Laufleistung, Erstzulassung, Ausstattung stehen im HTML, das der erste
 * Aufruf zurückgibt. Am 07.09.2026 nachgemessen: ein schlichtes `curl` ohne
 * JavaScript, ohne Cookies, ohne Browser holt dieselben 27 Treffer und
 * dieselben 15 Merkmalzeilen wie der Dienst.
 *
 * **Was der Browser tatsächlich abfing** — und was hier an seine Stelle
 * tritt: Kleinanzeigen weist Anfragen zeitweise mit HTTP 403 ab
 * („IP-Bereich vorübergehend gesperrt"). Das ist keine Browsererkennung
 * sondern eine Frequenzbremse; gemessen an sechs Aufrufen in Folge:
 *
 *     403 200 200 403 403 200      ohne Pause
 *     200 200 200                  mit vier Sekunden Abstand
 *
 * Deshalb: **ein** Abruf zur Zeit, ein Mindestabstand dazwischen, und bei
 * einer Abweisung wird gewartet und erneut gefragt. Das ist zugleich der
 * rücksichtsvollere Umgang mit einem fremden Server als der bisherige.
 */

/** Ein gewöhnlicher Desktop-Browser. Feststehend — hier wird nichts rotiert. */
const KENNUNG =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36'

const KOPFZEILEN: Record<string, string> = {
  'User-Agent': KENNUNG,
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'de-DE,de;q=0.9',
  'Cache-Control': 'no-cache',
}

function zahlAusUmgebung(name: string, ersatz: number): number {
  const roh = process.env[name]
  if (!roh) return ersatz
  const wert = Number.parseInt(roh, 10)
  return Number.isFinite(wert) && wert >= 0 ? wert : ersatz
}

/** Mindestabstand zwischen zwei Abrufen. */
function abstandMs(): number {
  return zahlAusUmgebung('KLEINANZEIGEN_ABSTAND_MS', 1500)
}

/** Wartezeiten nach einer Abweisung, in Millisekunden. */
const WARTEN = [2000, 5000, 12000]

export function schlafe(ms: number): Promise<void> {
  return new Promise((weiter) => setTimeout(weiter, ms))
}

/**
 * Die Warteschlange. Alle Abrufe dieses Prozesses reihen sich hier ein — ein
 * zweiter Recherchelauf soll die Frequenzbremse nicht doppelt auslösen.
 */
let schlange: Promise<unknown> = Promise.resolve()
let zuletzt = 0

function nacheinander<T>(arbeit: () => Promise<T>): Promise<T> {
  const naechster = schlange.then(async () => {
    const wartezeit = zuletzt + abstandMs() - Date.now()
    if (wartezeit > 0) await schlafe(wartezeit)
    zuletzt = Date.now()
    return arbeit()
  })
  // Die Kette darf nicht an einem Fehler zerbrechen, sonst steht jeder
  // folgende Abruf still.
  schlange = naechster.catch(() => undefined)
  return naechster
}

export interface Antwort {
  status: number
  html: string
  /** Die Adresse nach etwaigen Weiterleitungen. */
  url: string
  /** Wie oft gefragt werden musste — steht im Protokoll des Laufs. */
  versuche: number
}

export interface Abrufoptionen {
  /** Höchstzahl der Versuche, Voreinstellung 4. */
  versuche?: number
  zeitlimitMs?: number
  /** Naht für Tests. */
  hole?: typeof fetch
  /** Naht für Tests: nicht wirklich warten. */
  warte?: (ms: number) => Promise<void>
}

/**
 * Holt eine Seite.
 *
 * Wiederholt wird bei 403, 429 und Serverfehlern — den Antworten, die nach
 * einer Pause anders ausfallen können. Bei 404 (Anzeige gelöscht) nicht: die
 * Antwort ist ein Ergebnis, kein Fehler, und wird unverändert zurückgegeben.
 */
export async function holeSeite(url: string, optionen: Abrufoptionen = {}): Promise<Antwort> {
  const hoechstens = Math.max(1, optionen.versuche ?? 4)
  const zeitlimit = optionen.zeitlimitMs ?? 30_000
  const hole = optionen.hole ?? fetch
  const warte = optionen.warte ?? schlafe

  let letzterStatus = 0
  let letzterFehler: unknown = null

  for (let versuch = 1; versuch <= hoechstens; versuch++) {
    if (versuch > 1) await warte(WARTEN[Math.min(versuch - 2, WARTEN.length - 1)] ?? 12000)

    const ergebnis = await nacheinander(async (): Promise<Antwort | 'nochmal'> => {
      const abbruch = AbortSignal.timeout(zeitlimit)
      try {
        const antwort = await hole(url, { headers: KOPFZEILEN, redirect: 'follow', signal: abbruch })
        letzterStatus = antwort.status
        if (antwort.status === 403 || antwort.status === 429 || antwort.status >= 500) {
          // Der Rumpf wird gelesen und verworfen, damit die Verbindung frei wird.
          await antwort.text().catch(() => '')
          return 'nochmal'
        }
        return {
          status: antwort.status,
          html: await antwort.text(),
          url: antwort.url || url,
          versuche: versuch,
        }
      } catch (fehler) {
        letzterFehler = fehler
        return 'nochmal'
      }
    })

    if (ergebnis !== 'nochmal') return ergebnis
  }

  const grund =
    letzterStatus > 0
      ? `HTTP ${letzterStatus}`
      : letzterFehler instanceof Error
        ? letzterFehler.message
        : 'unbekannter Fehler'
  throw new Error(
    `Kleinanzeigen antwortet nach ${hoechstens} Versuchen nicht: ${grund} (${url})`,
  )
}

/** Nur für Tests: den Abstand zurücksetzen, damit sie nicht warten müssen. */
export function setzeSchlangeZurueck(): void {
  schlange = Promise.resolve()
  zuletzt = 0
}
