import {
  einzelAntwortSchema,
  listenAntwortSchema,
  type Gutachten,
} from './typen'
import {
  AbrufregelVerletzt,
  abrufregel as standardRegel,
  pflichtfilter,
  pruefeGutachten,
  type Abrufregel,
} from './abrufregel'
import { abrufreihenfolge } from './aktenzeichen'

/**
 * Zugriff auf die externe autoiXpert-Schnittstelle (v1).
 *
 * Zwei Eigenheiten der Schnittstelle prägen diesen Client:
 *
 * 1. Das **Aktenzeichen liegt im Feld `token`**, nicht in `external_id`.
 *    `GET /reports/{report_id}` nimmt die interne ID und die `external_id`
 *    entgegen — das Aktenzeichen aber nicht. Für dieses gibt es auch keinen
 *    Filterparameter, nur die Sortierung `report_token`.
 *
 * 2. **Lesezugriffe sind kostenpflichtig**, je Gutachten einmalig. Ein
 *    Durchblättern der gesamten Liste würde also für jedes berührte Gutachten
 *    abgerechnet. Deshalb: erst der direkte Zugriff über den Pfad, und die
 *    Suche über das Aktenzeichen nur mit Sortierung, frühem Abbruch und
 *    einer harten Obergrenze an Seiten.
 */

export const STANDARD_BASIS_URL = 'https://app.autoixpert.de/externalApi/v1'

/** Höchstwert laut Dokumentation. */
const SEITENGROESSE = 50

/**
 * Obergrenze für die Aktenzeichen-Suche. Bei 50 Gutachten je Seite werden
 * damit höchstens 500 Gutachten berührt — genug für den Normalfall und
 * niedrig genug, um nicht unbemerkt Kosten zu verursachen.
 */
const MAX_SEITEN = 10

export class AutoixpertFehler extends Error {
  constructor(
    nachricht: string,
    readonly status?: number,
  ) {
    super(nachricht)
    this.name = 'AutoixpertFehler'
  }
}

export interface ClientOptionen {
  token: string
  basisUrl?: string
  /** Einspeisbar für Tests; sonst das globale `fetch`. */
  hole?: typeof fetch
  /**
   * Abrufregel. Voreinstellung ist die enge Fassung aus den
   * Umgebungsvariablen. Einspeisbar, damit Tests gegen feste Beispieldaten
   * laufen können, ohne die Sperre der Anwendung aufzuweichen.
   */
  regel?: Abrufregel
}

export interface Auflösung {
  gutachten: Gutachten
  /** Wie der Fall gefunden wurde — für die Rückmeldung an den Nutzer. */
  weg: 'id_oder_external_id' | 'aktenzeichen_suche'
  /** Wie viele Listenseiten die Suche gebraucht hat. */
  gelesendeSeiten: number
}

export class AutoixpertClient {
  private readonly token: string
  private readonly basisUrl: string
  private readonly hole: typeof fetch
  private readonly regel: Abrufregel

  constructor(optionen: ClientOptionen) {
    this.token = optionen.token
    this.basisUrl = (optionen.basisUrl ?? STANDARD_BASIS_URL).replace(/\/+$/, '')
    this.hole = optionen.hole ?? fetch
    this.regel = optionen.regel ?? standardRegel
  }

  private async anfrage(pfad: string, suche?: Record<string, string>): Promise<unknown> {
    const url = new URL(`${this.basisUrl}${pfad}`)
    for (const [schluessel, wert] of Object.entries(suche ?? {})) {
      url.searchParams.set(schluessel, wert)
    }

    let antwort: Response
    try {
      antwort = await this.hole(url.toString(), {
        headers: {
          authorization: `Bearer ${this.token}`,
          accept: 'application/json',
        },
      })
    } catch (fehler) {
      throw new AutoixpertFehler(
        `autoiXpert ist nicht erreichbar: ${fehler instanceof Error ? fehler.message : String(fehler)}`,
      )
    }

    if (antwort.status === 404) {
      throw new AutoixpertFehler('Nicht gefunden.', 404)
    }
    if (antwort.status === 401 || antwort.status === 403) {
      throw new AutoixpertFehler(
        'Der API-Zugang wurde abgelehnt. Bitte AUTOIXPERT_API_TOKEN in den Umgebungsvariablen prüfen — eine Einstellungsseite gibt es dafür nicht.',
        antwort.status,
      )
    }
    if (antwort.status === 429) {
      throw new AutoixpertFehler(
        'Das Anfragenlimit von autoiXpert ist erreicht. Bitte später erneut versuchen.',
        429,
      )
    }
    if (!antwort.ok) {
      const text = await antwort.text().catch(() => '')
      throw new AutoixpertFehler(
        `autoiXpert antwortete mit HTTP ${antwort.status}. ${text.slice(0, 200)}`,
        antwort.status,
      )
    }

    return antwort.json()
  }

  /** Holt ein Gutachten über die interne ID oder die externe ID. */
  async holeGutachten(reportId: string): Promise<Gutachten> {
    const roh = await this.anfrage(`/reports/${encodeURIComponent(reportId)}`)
    const geprueft = einzelAntwortSchema.safeParse(roh)
    if (!geprueft.success) {
      throw new AutoixpertFehler(
        `Die Antwort von autoiXpert hat eine unerwartete Form: ${geprueft.error.issues
          .slice(0, 3)
          .map((i) => `${i.path.join('.')}: ${i.message}`)
          .join('; ')}`,
      )
    }
    pruefeGutachten(geprueft.data.report, this.regel)
    return geprueft.data.report
  }

  /** Eine Seite der Gutachtenliste. */
  async listeGutachten(optionen: {
    limit?: number
    sort?: 'report_token' | 'completion_date' | 'order_date' | 'updated_at' | 'created_at'
    sortDirection?: 'asc' | 'desc'
    nextPage?: string
  } = {}) {
    const suche: Record<string, string> = {
      limit: String(optionen.limit ?? SEITENGROESSE),
    }
    if (optionen.sort) suche.sort = optionen.sort
    if (optionen.sortDirection) suche.sort_direction = optionen.sortDirection
    if (optionen.nextPage) suche.next_page = optionen.nextPage

    // Die Abrufregel steht bewusst am Ende: sie ueberschreibt, was der
    // Aufrufer gesetzt hat, und ist damit nicht umgehbar.
    Object.assign(suche, pflichtfilter(this.regel))

    const roh = await this.anfrage('/reports', suche)
    const geprueft = listenAntwortSchema.safeParse(roh)
    if (!geprueft.success) {
      throw new AutoixpertFehler('Die Gutachtenliste hat eine unerwartete Form.')
    }
    return geprueft.data
  }

  /**
   * Sucht ein Gutachten anhand des Aktenzeichens.
   *
   * Da die Schnittstelle keinen Filter auf `token` anbietet, wird die Liste
   * nach `report_token` sortiert durchblättert. Der Vergleich ist bewusst
   * unempfindlich gegen Gross-/Kleinschreibung und Leerraum — Aktenzeichen
   * werden im Alltag nicht immer gleich geschrieben.
   */
  async sucheNachAktenzeichen(
    aktenzeichen: string,
    beiSeite?: (seite: number, gesehen: number) => void,
  ): Promise<{ gutachten: Gutachten | null; seiten: number; abgebrochen: boolean }> {
    const gesucht = normalisiere(aktenzeichen)
    let nextPage: string | undefined
    let seiten = 0
    let gesehen = 0

    while (seiten < MAX_SEITEN) {
      const seite = await this.listeGutachten({
        sort: 'report_token',
        sortDirection: 'asc',
        nextPage,
      })
      seiten++
      gesehen += seite.reports.length
      beiSeite?.(seiten, gesehen)

      for (const g of seite.reports) {
        if (g.token && normalisiere(g.token) === gesucht) {
          return { gutachten: g, seiten, abgebrochen: false }
        }
      }

      if (!seite.has_more || !seite.next_page) {
        return { gutachten: null, seiten, abgebrochen: false }
      }
      nextPage = seite.next_page
    }

    // Obergrenze erreicht: lieber ehrlich melden als still nichts finden.
    return { gutachten: null, seiten, abgebrochen: true }
  }

  /**
   * Löst eine Nutzereingabe auf: Aktenzeichen, interne ID oder externe ID.
   *
   * Der direkte Pfadzugriff kommt zuerst, weil er genau ein Gutachten liest.
   * Erst wenn der ins Leere läuft, wird gesucht.
   */
  async loeseAuf(eingabe: string): Promise<Auflösung> {
    const bereinigt = eingabe.trim()
    if (!bereinigt) throw new AutoixpertFehler('Bitte ein Aktenzeichen oder eine ID eingeben.')

    // Reihenfolge: externe ID (0926_2081TG), Anzeigeform (0926/2081TG),
    // dann die Eingabe als technische ID. Jeder Weg ist ein Lesezugriff,
    // die Suche darunter kostet bis zu 500 - deshalb erst alle billigen Wege.
    for (const weg of abrufreihenfolge(bereinigt)) {
      try {
        const gutachten = await this.holeGutachten(weg)
        return { gutachten, weg: 'id_oder_external_id', gelesendeSeiten: 0 }
      } catch (fehler) {
        // Eine Regelverletzung ist ein Ergebnis, kein Fehlschlag des Weges.
        if (fehler instanceof AbrufregelVerletzt) throw fehler
        if (!(fehler instanceof AutoixpertFehler) || fehler.status !== 404) throw fehler
      }
    }

    const ergebnis = await this.sucheNachAktenzeichen(bereinigt)
    if (ergebnis.gutachten) {
      return {
        gutachten: ergebnis.gutachten,
        weg: 'aktenzeichen_suche',
        gelesendeSeiten: ergebnis.seiten,
      }
    }

    if (ergebnis.abgebrochen) {
      throw new AutoixpertFehler(
        `Kein Gutachten mit dem Aktenzeichen „${bereinigt}" in den ersten ` +
          `${ergebnis.seiten * SEITENGROESSE} Gutachten gefunden. ` +
          'Die Suche wurde abgebrochen, um keine unnötigen Lesezugriffe abzurechnen. ' +
          'Mit der technischen ID lässt sich der Fall direkt laden.',
        404,
      )
    }

    throw new AutoixpertFehler(
      `Kein Gutachten mit dem Aktenzeichen, der ID oder der externen ID „${bereinigt}" gefunden.`,
      404,
    )
  }
}

/** Vergleichsform für Aktenzeichen: ohne Leerraum, klein geschrieben. */
export function normalisiere(wert: string): string {
  return wert.trim().toLowerCase().replace(/\s+/g, '')
}

/** Erzeugt einen Client aus den Umgebungsvariablen, oder `null`. */
export function clientAusUmgebung(): AutoixpertClient | null {
  const token = process.env.AUTOIXPERT_API_TOKEN
  if (!token) return null
  return new AutoixpertClient({
    token,
    basisUrl: process.env.AUTOIXPERT_BASIS_URL ?? STANDARD_BASIS_URL,
  })
}
