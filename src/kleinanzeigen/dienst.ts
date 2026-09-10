import { holeSeite, type Abrufoptionen } from './abruf'
import { leseInserat, type Inserat } from './detailseite'
import { leseGesamtzahl, leseSeitenzahl, leseTreffer, setzeSeite, type Treffer } from './suchseite'

/**
 * Die beiden Vorgänge, die das WBW-Plugin braucht — in genau der Form, in der
 * der bisherige Dienst sie geliefert hat.
 *
 * Das Plugin bleibt damit **unverändert**: es spricht weiter gegen
 * `KA_API_BASE`, nur zeigt diese Adresse jetzt auf das Cockpit selbst. Wer
 * die Umgebungsvariable auf den alten Dienst zurückstellt, bekommt den alten
 * Dienst — der Austausch ist eine Zeile und keine Umstellung.
 */

const PORTAL = 'https://www.kleinanzeigen.de'

/** Nur Kleinanzeigen. Sonst wäre die Route ein offener Weiterleiter. */
export function istKleinanzeigenUrl(url: string): boolean {
  let adresse: URL
  try {
    adresse = new URL(url)
  } catch {
    return false
  }
  if (adresse.protocol !== 'https:') return false
  return adresse.hostname === 'www.kleinanzeigen.de' || adresse.hostname === 'kleinanzeigen.de'
}

export interface Suchergebnis {
  success: true
  results: Treffer[]
  unique_results: number
  total_results?: number
  time_taken: number
  pages_fetched: number
  warnungen: string[]
}

/**
 * Durchsucht Kleinanzeigen über eine fertige Such-URL.
 *
 * Aufgehört wird früher als verlangt, wenn die Seitennummerierung weniger
 * Seiten anbietet oder eine Seite leer bleibt — weitere Abrufe brächten
 * nichts und kosteten nur Frequenz.
 */
export async function sucheUeberUrl(
  url: string,
  maxSeiten = 1,
  optionen: Abrufoptionen = {},
): Promise<Suchergebnis> {
  if (!istKleinanzeigenUrl(url)) {
    throw new Error(`Keine Kleinanzeigen-Adresse: ${url}`)
  }

  const begonnen = Date.now()
  const gesammelt: Treffer[] = []
  const gesehen = new Set<string>()
  const warnungen: string[] = []
  let gesamt: number | undefined
  let seitenGesamt: number | null = null
  let geholt = 0

  const grenze = Math.min(Math.max(1, maxSeiten), 20)
  for (let seite = 1; seite <= grenze; seite++) {
    if (seitenGesamt !== null && seite > seitenGesamt) break

    const antwort = await holeSeite(setzeSeite(url, seite), optionen)
    geholt++
    if (antwort.status !== 200) {
      warnungen.push(`Seite ${seite}: HTTP ${antwort.status}`)
      break
    }

    if (seite === 1) {
      gesamt = leseGesamtzahl(antwort.html) ?? undefined
      seitenGesamt = leseSeitenzahl(antwort.html)
    }

    const treffer = leseTreffer(antwort.html)
    if (treffer.length === 0) {
      warnungen.push(`Seite ${seite}: keine Treffer — Abbruch`)
      break
    }
    for (const eintrag of treffer) {
      // Dieselbe Anzeige steht mitunter auf zwei Seiten (die oberen Plätze
      // sind bezahlte Einblendungen und wiederholen sich).
      if (gesehen.has(eintrag.adid)) continue
      gesehen.add(eintrag.adid)
      gesammelt.push(eintrag)
    }
  }

  return {
    success: true,
    results: gesammelt,
    unique_results: gesammelt.length,
    ...(gesamt !== undefined ? { total_results: gesamt } : {}),
    time_taken: Number(((Date.now() - begonnen) / 1000).toFixed(3)),
    pages_fetched: geholt,
    warnungen,
  }
}

export type Inseratergebnis =
  | { success: true; data: Inserat; time_taken: number }
  | { success: false; not_found: true; status: 'deleted' }

/**
 * Holt eine einzelne Anzeige über ihre Nummer.
 *
 * `https://www.kleinanzeigen.de/s-anzeige/<nummer>` liefert die Anzeige
 * unmittelbar — dieselbe Kurzform, die auch der bisherige Dienst benutzt.
 * Eine gelöschte Anzeige ergibt kein Scheitern, sondern die Auskunft, dass
 * sie fort ist; der Aufrufer wertet den Rest des Korbs weiter aus.
 */
export async function holeInserat(
  adid: string,
  optionen: Abrufoptionen = {},
): Promise<Inseratergebnis> {
  if (!/^\d{4,}$/.test(adid)) throw new Error(`Keine gültige Anzeigennummer: ${adid}`)

  const begonnen = Date.now()
  const url = `${PORTAL}/s-anzeige/${adid}`
  const antwort = await holeSeite(url, optionen)

  const fort =
    antwort.status === 404 ||
    !antwort.url.startsWith(`${PORTAL}/s-anzeige/`) ||
    antwort.html.includes('id="srchrslt-adexpired"')
  if (fort) return { success: false, not_found: true, status: 'deleted' }

  if (antwort.status !== 200) {
    throw new Error(`Kleinanzeigen antwortet mit HTTP ${antwort.status} für Anzeige ${adid}`)
  }

  return {
    success: true,
    data: leseInserat(antwort.html, antwort.url, url),
    time_taken: Number(((Date.now() - begonnen) / 1000).toFixed(3)),
  }
}
