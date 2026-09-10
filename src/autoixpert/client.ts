import {
  einzelAntwortSchema,
  fotolisteSchema,
  listenAntwortSchema,
  type Fotodaten,
  type Fotoformat,
  type Gutachten,
} from './typen'
import {
  AbrufregelVerletzt,
  abrufregel as standardRegel,
  pflichtfilter,
  pruefeGutachten,
  type Abrufregel,
  pruefeSchreibzugriff,
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

/**
 * Wie lange auf autoiXpert gewartet wird.
 *
 * Vorher gab es kein Zeitlimit — ein hängendes autoiXpert blockierte eine
 * Serveraktion unbegrenzt, und der Benutzer sah einen Knopf, der sich nie
 * wieder löste. 30 Sekunden reichen für ein Gutachten samt Anhängen; die
 * VXS-Datei (412 KB) kam in 1,3 Sekunden.
 */
const ZEITLIMIT_MS = 30_000

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
        signal: AbortSignal.timeout(ZEITLIMIT_MS),
      })
    } catch (fehler) {
      throw new AutoixpertFehler(nichtErreichbar(fehler))
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

  /**
   * Holt die DAT-Kalkulation als VXS-XML.
   *
   * Sie trägt zwei Dinge, die das Gutachten-Objekt nicht hat: die genaue
   * Fahrzeugbezeichnung (`SubModelName`, z. B. „E 53 AMG 4Matic+") und die
   * Kalkulationssummen. Siehe `vxs.ts`.
   *
   * Die Schnittstelle antwortet mit einem Fehler, wenn das Fahrzeug nicht mit
   * DAT identifiziert wurde, keine Kalkulation vorliegt oder dem Gutachten
   * kein DAT-Zugang zugeordnet ist. Das ist kein Störfall — viele Gutachten
   * haben schlicht keine Kalkulation.
   */
  async holeVxs(reportId: string): Promise<string | null> {
    const url = `${this.basisUrl}/reports/${encodeURIComponent(reportId)}/vxs`
    let antwort: Response
    try {
      antwort = await this.hole(url, {
        headers: { authorization: `Bearer ${this.token}`, accept: 'application/xml' },
        signal: AbortSignal.timeout(ZEITLIMIT_MS),
      })
    } catch (fehler) {
      throw new AutoixpertFehler(nichtErreichbar(fehler))
    }
    // Keine Kalkulation ist ein Ergebnis, kein Fehler.
    if (antwort.status === 404 || antwort.status === 400) return null
    if (!antwort.ok) {
      throw new AutoixpertFehler(
        `Die DAT-Kalkulation liess sich nicht laden (HTTP ${antwort.status}).`,
        antwort.status,
      )
    }
    return antwort.text()
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

  /* ---------------- Fotos ---------------- */

  /**
   * Die Bild-Metadaten eines Gutachtens.
   *
   * Nur die Angaben, nicht die Dateien: ein Fall mit 67 Fotos wäre sonst ein
   * Abruf von rund 200 MB. Die Dateien holt `holeFotoDatei`, und zwar einzeln
   * und in der Grösse, die gerade gebraucht wird.
   */
  async holeFotos(reportId: string): Promise<Fotodaten[]> {
    const ergebnis = await this.anfrage(`/reports/${encodeURIComponent(reportId)}/photos`)
    const geprueft = fotolisteSchema.safeParse(ergebnis)
    if (!geprueft.success) {
      throw new AutoixpertFehler(
        `Die Fotoliste von autoiXpert hat eine unerwartete Form: ${geprueft.error.issues
          .slice(0, 3)
          .map((i) => `${i.path.join('.')}: ${i.message}`)
          .join('; ')}`,
      )
    }
    return geprueft.data.photos
  }

  /**
   * Eine Bilddatei — als **Strom**, nicht als Puffer.
   *
   * Der Unterschied ist der Speicherbedarf: `arrayBuffer()` hielte ein
   * 3-MB-Foto vollständig im Arbeitsspeicher des Servers, und bei mehreren
   * Abrufen zugleich vervielfacht sich das. Weitergereicht wird stattdessen
   * der Körper der Antwort; der Server hält immer nur den gerade laufenden
   * Abschnitt.
   *
   * @param format `thumbnail` (400×300, ~50 KB), `rendered` (mit Formen) oder
   *   `original`. Am echten Fall gemessen: Vorschaubild 50 KB, Original 3 MB.
   */
  async holeFotoDatei(
    reportId: string,
    fotoId: string,
    format: Fotoformat = 'thumbnail',
  ): Promise<{ koerper: ReadableStream<Uint8Array> | null; typ: string; laenge: string | null }> {
    const url = new URL(
      `${this.basisUrl}/reports/${encodeURIComponent(reportId)}/photos/${encodeURIComponent(fotoId)}/download`,
    )
    url.searchParams.set('format', format)

    let antwort: Response
    try {
      antwort = await this.hole(url.toString(), {
        headers: { authorization: `Bearer ${this.token}` },
        // Ein Original hat 3 MB; das Zeitlimit gilt bis zur Antwortkopfzeile,
        // nicht bis zum letzten Byte des Stroms.
        signal: AbortSignal.timeout(ZEITLIMIT_MS),
      })
    } catch (fehler) {
      throw new AutoixpertFehler(nichtErreichbar(fehler))
    }

    if (!antwort.ok) {
      throw new AutoixpertFehler(
        `Das Foto liess sich nicht laden (HTTP ${antwort.status}).`,
        antwort.status,
      )
    }

    return {
      koerper: antwort.body,
      // autoiXpert schickt beim Original `binary/octet-stream`; der Browser
      // zeigt das als Download an statt als Bild. Der Typ steht in den
      // Metadaten und wird von dort gesetzt.
      typ: antwort.headers.get('content-type') ?? 'application/octet-stream',
      laenge: antwort.headers.get('content-length'),
    }
  }

  /**
   * Ändert die Angaben zu einem Foto.
   *
   * Schreibender Zugriff — die Sperre der Abrufregel gilt. Ohne
   * `AUTOIXPERT_SCHREIBEN=erlaubt` wirft das hier, bevor irgendetwas das Haus
   * verlässt.
   */
  async aendereFoto(
    reportId: string,
    fotoId: string,
    aenderung: Partial<{
      title: string
      description: string
      included_in_report: boolean
      included_in_residual_value_exchange: boolean
      included_in_repair_confirmation: boolean
      included_in_expert_statement: boolean
    }>,
  ): Promise<void> {
    pruefeSchreibzugriff(`Foto ${fotoId} beschriften`, this.regel)

    const url = `${this.basisUrl}/reports/${encodeURIComponent(reportId)}/photos/${encodeURIComponent(fotoId)}`
    let antwort: Response
    try {
      antwort = await this.hole(url, {
        method: 'PATCH',
        headers: {
          authorization: `Bearer ${this.token}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify(aenderung),
        signal: AbortSignal.timeout(ZEITLIMIT_MS),
      })
    } catch (fehler) {
      throw new AutoixpertFehler(nichtErreichbar(fehler))
    }

    if (!antwort.ok) {
      const text = await antwort.text().catch(() => '')
      throw new AutoixpertFehler(
        `Die Änderung wurde abgelehnt (HTTP ${antwort.status}). ${text.slice(0, 200)}`,
        antwort.status,
      )
    }
  }
}


/**
 * Die Meldung, wenn der Aufruf gar nicht ankam.
 *
 * Ein abgelaufenes Zeitlimit wird als solches benannt: „nicht erreichbar" und
 * „antwortet zu langsam" sind zwei verschiedene Störungen und führen zu zwei
 * verschiedenen Massnahmen.
 */
function nichtErreichbar(fehler: unknown): string {
  if (fehler instanceof Error && fehler.name === 'TimeoutError') {
    return `autoiXpert hat nicht innerhalb von ${ZEITLIMIT_MS / 1000} Sekunden geantwortet.`
  }
  return `autoiXpert ist nicht erreichbar: ${fehler instanceof Error ? fehler.message : String(fehler)}`
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
