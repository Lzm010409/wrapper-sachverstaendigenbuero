import 'server-only'
import { z } from 'zod'

/**
 * Zugriff auf sevDesk — **ausschliesslich lesend**.
 *
 * Diese Datei hat keine schreibende Methode, und das ist Absicht, nicht
 * Zufall: gebucht, gemahnt und storniert wird in sevDesk selbst und in den
 * n8n-Workflows, die es schon tun. Zwei Stellen, die dieselbe Rechnung
 * buchen, wären zwei Wahrheiten über dasselbe Geld. Wer hier eine
 * schreibende Methode ergänzt, hebt diese Entscheidung auf und sollte das
 * begründen.
 *
 * **Die Zuordnung zum Fall steckt in der Rechnungsnummer.** Am echten
 * Konto geprüft (09.09.2026): zur Akte `0926/2081TG` gehört die Rechnung
 * `0926/2081TG01`, zur Akte `1222_693TG` die Rechnung `1222_693TG01` — das
 * Aktenzeichen, gefolgt von einer laufenden Nummer. Ein Umweg über den
 * Pipedrive-Deal ist dafür nicht nötig; siehe `aktenzeichenschluessel`.
 *
 * **Beträge in Cent.** sevDesk liefert sie als Zeichenkette („1247.42").
 * Als Gleitkommazahl weitergereicht ergäbe die Summe zweier Rechnungen
 * irgendwann 1247.4199999999998, und der Vergleich „bezahlt = brutto"
 * schlüge fehl, obwohl das Geld da ist.
 */

export const STANDARD_BASIS_URL = 'https://my.sevdesk.de/api/v1'

/** Wie lange auf sevDesk gewartet wird. Eine Seite mit 1000 Rechnungen sind 2,4 MB. */
const ZEITLIMIT_MS = 30_000

/** Höchstwert, den die Schnittstelle je Seite zulässt. */
const SEITENGROESSE = 1000

/**
 * Obergrenze an Seiten je Abgleich. Am 09.09.2026 lagen 1444 Rechnungen im
 * Konto, also zwei Seiten. Fünf sind Luft nach oben und verhindern, dass
 * ein Fehler in der Abbruchbedingung zur Endlosschleife wird.
 */
const MAX_SEITEN = 5

/** Die Zustände, die sevDesk kennt — am Konto ausgezählt (09.09.2026). */
export const ZUSTAENDE = {
  50: 'Entwurf',
  100: 'Offen',
  200: 'Versendet',
  750: 'Teilbezahlt',
  1000: 'Bezahlt',
} as const

export class SevdeskFehler extends Error {
  constructor(
    nachricht: string,
    readonly status?: number,
  ) {
    super(nachricht)
    this.name = 'SevdeskFehler'
  }
}

export interface Rechnungsdaten {
  /**
   * Die Kennung aus sevDesk. Sie und nicht die Nummer ist die Identität
   * einer Rechnung: am Konto lag am 09.09.2026 die Nummer `0823/936TG01`
   * zweimal — einmal bezahlt, einmal offen, gleicher Betrag, gleicher Tag.
   */
  sevdeskId: string
  nummer: string
  /** Aktenzeichen ohne laufende Nummer und ohne Trennzeichen, kleingeschrieben. */
  schluessel: string
  status: number
  bruttoCent: number
  bezahltCent: number
  rechnungsdatum: Date | null
  zahldatum: Date | null
  /** Zahlungsziel in Tagen, wie es an der Rechnung steht. */
  zahlungszielTage: number | null
  mahnstufe: number | null
  /** Wann sevDesk die Rechnung zuletzt geändert hat — das Wasserzeichen des Abgleichs. */
  geaendertAm: Date
}

const rohSchema = z.object({
  id: z.union([z.string(), z.number()]).nullish(),
  invoiceNumber: z.string().nullish(),
  status: z.union([z.string(), z.number()]).nullish(),
  sumGross: z.union([z.string(), z.number()]).nullish(),
  paidAmount: z.union([z.string(), z.number()]).nullish(),
  invoiceDate: z.string().nullish(),
  payDate: z.string().nullish(),
  timeToPay: z.union([z.string(), z.number()]).nullish(),
  dunningLevel: z.union([z.string(), z.number()]).nullish(),
  update: z.string().nullish(),
})

const antwortSchema = z.object({ objects: z.array(z.unknown()).nullish() })

/**
 * Der Schlüssel, unter dem Rechnung und Fall zueinander finden.
 *
 * Zwei Dinge werden weggeräumt: die laufende Nummer am Ende (`…TG01`) und
 * die Trennzeichen. Das Büro schreibt das Aktenzeichen mal `0926/2081TG`,
 * mal `1222_693TG`; wer nur auf Gleichheit prüfte, fände die alten Fälle
 * nie.
 */
export function aktenzeichenschluessel(wert: string): string {
  return wert
    .trim()
    .replace(/\d{1,3}$/, '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toLowerCase()
}

/** Ein Betrag aus sevDesk in Cent. */
export function inCent(wert: unknown): number {
  const zahl = typeof wert === 'number' ? wert : Number.parseFloat(String(wert ?? ''))
  return Number.isFinite(zahl) ? Math.round(zahl * 100) : 0
}

function alsZahl(wert: unknown): number | null {
  const zahl = typeof wert === 'number' ? wert : Number.parseInt(String(wert ?? ''), 10)
  return Number.isFinite(zahl) ? zahl : null
}

function alsDatum(wert: unknown): Date | null {
  if (typeof wert !== 'string' || !wert) return null
  const datum = new Date(wert)
  return Number.isNaN(datum.getTime()) ? null : datum
}

/** Wandelt eine Rohrechnung um, oder gibt `null`, wenn sie unbrauchbar ist. */
export function zuRechnung(roh: unknown): Rechnungsdaten | null {
  const geprueft = rohSchema.safeParse(roh)
  if (!geprueft.success) return null
  const r = geprueft.data
  const sevdeskId = r.id === null || r.id === undefined ? '' : String(r.id).trim()
  const nummer = r.invoiceNumber?.trim()
  if (!sevdeskId) return null
  // Ohne Nummer ist die Rechnung keinem Fall zuzuordnen und für die Ampel
  // wertlos. Ohne Änderungszeitpunkt liesse sich der Abgleich nicht
  // fortsetzen — beides führt zum Auslassen, nicht zum Abbruch.
  if (!nummer) return null
  const geaendertAm = alsDatum(r.update)
  if (!geaendertAm) return null

  return {
    sevdeskId,
    nummer,
    schluessel: aktenzeichenschluessel(nummer),
    status: alsZahl(r.status) ?? 0,
    bruttoCent: inCent(r.sumGross),
    bezahltCent: inCent(r.paidAmount),
    rechnungsdatum: alsDatum(r.invoiceDate),
    zahldatum: alsDatum(r.payDate),
    zahlungszielTage: alsZahl(r.timeToPay),
    mahnstufe: alsZahl(r.dunningLevel),
    geaendertAm,
  }
}

export function sevdeskEingerichtet(): boolean {
  return Boolean(process.env.SEVDESK_API_TOKEN)
}

function basisUrl(): string {
  return process.env.SEVDESK_BASIS_URL ?? STANDARD_BASIS_URL
}

/**
 * Holt Rechnungen, die neuesten zuerst.
 *
 * `seit` bricht ab, sobald eine Rechnung älter als dieser Zeitpunkt kommt —
 * die Liste ist nach Änderungszeitpunkt absteigend sortiert. Beim ersten
 * Lauf steht hier `null` und es kommen alle; danach sind es die paar, die
 * sich seit dem letzten Abgleich geändert haben.
 */
export async function holeRechnungen(
  seit: Date | null,
  hole: typeof fetch = fetch,
): Promise<Rechnungsdaten[]> {
  const token = process.env.SEVDESK_API_TOKEN
  if (!token) throw new SevdeskFehler('sevDesk ist auf diesem Server nicht eingerichtet.')

  const alle: Rechnungsdaten[] = []
  for (let seite = 0; seite < MAX_SEITEN; seite += 1) {
    const url = new URL(`${basisUrl()}/Invoice`)
    url.searchParams.set('limit', String(SEITENGROESSE))
    url.searchParams.set('offset', String(seite * SEITENGROESSE))
    url.searchParams.set('sort', '-update')

    let antwort: Response
    try {
      antwort = await hole(url.toString(), {
        headers: { authorization: token },
        signal: AbortSignal.timeout(ZEITLIMIT_MS),
      })
    } catch (fehler) {
      const abgelaufen = fehler instanceof Error && fehler.name === 'TimeoutError'
      throw new SevdeskFehler(
        abgelaufen
          ? `sevDesk hat nicht innerhalb von ${ZEITLIMIT_MS / 1000} Sekunden geantwortet.`
          : `sevDesk ist nicht erreichbar: ${fehler instanceof Error ? fehler.message : String(fehler)}`,
      )
    }

    if (!antwort.ok) {
      throw new SevdeskFehler(`sevDesk antwortete mit ${antwort.status}.`, antwort.status)
    }

    const rumpf = antwortSchema.safeParse(await antwort.json())
    if (!rumpf.success) throw new SevdeskFehler('Die Antwort von sevDesk hatte eine unerwartete Form.')
    const objekte = rumpf.data.objects ?? []

    let veraltetErreicht = false
    for (const roh of objekte) {
      const rechnung = zuRechnung(roh)
      if (!rechnung) continue
      if (seit && rechnung.geaendertAm <= seit) {
        veraltetErreicht = true
        break
      }
      alle.push(rechnung)
    }

    if (veraltetErreicht || objekte.length < SEITENGROESSE) break
  }

  return alle
}
