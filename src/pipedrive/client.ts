/**
 * Pipedrive-Zugriff, bewusst schmal: das Cockpit liest den Deal zu einem Fall,
 * um Phase, Schadenhöhe, den Rechnungsverweis, Notizen und zugeordnete Mails
 * in der Fallakte zu zeigen.
 *
 * **Geschrieben wird hier nichts.** Das erledigen weiterhin die vorhandenen
 * n8n-Workflows — zwei Stellen, die denselben Deal pflegen, wären zwei
 * Wahrheiten über denselben Vorgang.
 *
 * Die Feldschlüssel stammen aus `GET /dealFields` des Kontos (abgefragt am
 * 07.09.2026). Sie sind kontospezifisch: wird ein Feld in Pipedrive neu
 * angelegt, bekommt es einen neuen Schlüssel, und dieser hier muss mit.
 *
 * **Drei Basis-Adressen, nicht eine.** Deals gibt es unter `/v2`, Notizen und
 * die Mail-Liste eines Deals ausschliesslich unter `/v1` — Pipedrive hat sie
 * nicht auf v2 gehoben. Die einzelne Mail (mit Textkörper) läuft dazu nur
 * über die eigene Subdomain des Kontos, nicht über `api.pipedrive.com` — live
 * geprüft am 08.09.2026, siehe Kommentar an `basisUrlMailbox`. Alle drei sind
 * eigene Umgebungsvariablen, nicht voneinander abgeleitet: eine geratene
 * Ableitung (`v2` durch `v1` ersetzen) bräche lautlos, sobald
 * `PIPEDRIVE_BASE_URL` einmal keine Versionsendung trägt.
 *
 * **Suche findet die ID, nicht den Deal.** `GET /deals/search` liefert ein
 * schlankes Trefferobjekt — verschachtelt (`stage.id` statt `stage_id`) und
 * mit `custom_fields` als blosser Werteliste, nicht als das Objekt, das die
 * Schlüssel in `dealFelder` erwartet. Am echten Fall 0926/2081TG gemessen
 * (08.09.2026) stand die Phase deshalb immer auf „unbekannt" und Schadenhöhe
 * sowie Rechnungsverweis blieben immer leer — unabhängig davon, ob der
 * richtige Deal getroffen wurde. Der volle, feldrichtige Deal kommt erst aus
 * `GET /deals/{id}`.
 */

export const dealFelder = {
  autoixpertId: 'f6970a4fb3ed5c0520ba2ff1c84ec3becb422659',
  autoixpertLink: '102c6f8c0eb82cace7aa8ed3e77c06dcd3485a2a',
  schadennummer: '21378b56f922a8095b261f1fcefb056bdf0c3ecf',
  kennzeichen: '00e9babb88454e04c01ae593a6402e8f9c401fb8',
  schadenhoeheBrutto: 'adb0956f0161f534c04d43a1627acb23e692fea6',
  schadenhoeheNetto: '4ceb36746f5a9faa66cce4e2aa68f9191d43d7dc',
  sevdeskRechnungId: 'd8863fcbcb97aeb225a9418261b5508c0410783f',
  sevdeskRechnungLink: 'ee8bc622d857b546eca74c56a303f1373b05047c',
  ausgebuchterBetrag: 'c4ae5d687eacc0bbe5c05a1d70ec447644d4eb3f',
  ausgebuchterBetragGrund: 'a037653e87dd01a3ab9946c9741ff2db41de64f3',
} as const

/** Phasen der Pipeline „Auftrag" (ID 2), abgefragt am 07.09.2026. */
export const phasenNamen: Record<number, string> = {
  6: 'Aufgenommen',
  7: 'In Bearbeitung',
  8: 'Versendet',
  9: 'Teilbezahlt',
  10: 'Bezahlt',
  11: 'Klage',
}

/**
 * Die einzige Pipeline, in der ein Fall gesucht wird. `phasenNamen` kennt nur
 * ihre Phasen — ein Treffer aus einer anderen Pipeline (z. B. Akquise) würde
 * ohnehin nur „unbekannt" zeigen, aber lieber gar nicht erst als Treffer
 * gelten als eine Phase aus dem falschen Zusammenhang zu behaupten.
 */
export const PIPELINE_AUFTRAG_ID = 2

/**
 * Der Lebenszyklus-Status eines Deals — unabhängig von der Phase. Ein Deal
 * kann in Phase „Versendet" stehen und trotzdem `lost` sein (Auftrag storniert,
 * Rechtsanwalt abgesagt), ohne dass sich die Phase ändert. Werte laut
 * `GET /dealFields` (Feld „Status"), abgefragt am 08.09.2026.
 */
export const statusNamen: Record<string, string> = {
  open: 'Offen',
  won: 'Gewonnen',
  lost: 'Verloren',
  deleted: 'Gelöscht',
}

/** CSS-Modifikator für die Statuspille — die Farbe trägt der Punkt, siehe `.marke-pille::before`. */
export const statusMarken: Record<string, string> = {
  open: 'm-entwurf',
  won: 'm-freigegeben',
  lost: 'm-zurueckgezogen',
  deleted: 'm-zurueckgezogen',
}

export interface Deal {
  id: number
  title?: string
  stage_id?: number
  pipeline_id?: number
  status?: string
  value?: number
  currency?: string
  custom_fields?: Record<string, unknown>
  [key: string]: unknown
}

/** Ein Trefferobjekt aus `GET /deals/search` — schlanker als ein `Deal`. */
export interface DealSucheTreffer {
  id: number
  title?: string
  pipeline?: { id?: number }
}

export type DealErgebnis =
  | { art: 'ohne_treffer' }
  | { art: 'mehrdeutig'; treffer: { id: number; title: string | null }[] }
  | { art: 'gefunden'; deal: Deal }

/**
 * Ein Deal, wie ihn `GET /deals` (Listenendpunkt) liefert — feldrichtig wie
 * `Deal`, aber ohne die Felder, die die Fälle-Liste nicht braucht.
 */
export interface DealUebersicht {
  id: number
  title?: string
  stage_id?: number
}

/** Eine Notiz zu einem Deal. `content` ist HTML — siehe `dealFelder`-Kommentar oben. */
export interface Notiz {
  id: number
  content: string
  add_time: string
  user_id?: number
  user?: { name?: string; email?: string }
}

interface MailPartei {
  email_address?: string
  name?: string
}

/** Die Metadaten einer Mail — ohne Textkörper, der kommt erst über `holeMailBody`. */
export interface MailMetadaten {
  id: number
  subject?: string
  message_time?: string
  add_time?: string
  mail_thread_id?: number
  deal_id?: number
  from?: MailPartei[]
}

/** Wie `MailMetadaten`, zusätzlich mit dem vollen HTML-Textkörper. */
export interface MailVoll extends MailMetadaten {
  body?: string
}

/**
 * Der Wert eines Pipedrive-Geldfeldes steckt je nach API-Fassung
 * unterschiedlich tief: mal als Zahl, mal als `{ value, currency }`.
 */
export function monetaerWert(roh: unknown): number | undefined {
  if (typeof roh === 'number') return roh
  if (roh && typeof roh === 'object' && 'value' in roh) {
    const wert = (roh as { value: unknown }).value
    if (typeof wert === 'number') return wert
  }
  return undefined
}

function token(): string {
  return process.env.PIPEDRIVE_API_TOKEN ?? ''
}

function basisUrl(): string {
  return process.env.PIPEDRIVE_BASE_URL ?? 'https://api.pipedrive.com/api/v2'
}

/** Notizen und die Mail-Liste eines Deals: siehe Kommentar am Dateianfang, warum eine zweite Basis. */
function basisUrlV1(): string {
  return process.env.PIPEDRIVE_BASE_URL_V1 ?? 'https://api.pipedrive.com/api/v1'
}

/**
 * Die einzelne Mail (`GET /mailbox/mailMessages/{id}`) läuft — anders als
 * jeder andere hier verwendete Aufruf — **nicht** über den allgemeinen
 * `api.pipedrive.com`-Zugang, sondern nur über die eigene Subdomain des
 * Kontos. Live geprüft am 08.09.2026: derselbe Aufruf über `api.pipedrive.com`
 * kam als 404 zurück, über `{firma}.pipedrive.com` mit demselben Token und
 * derselben Mail-ID kam der volle Inhalt. Die Mailbox-Anbindung hängt am
 * verbundenen Postfach des Kontos und wird offenbar nicht zentral verteilt.
 */
function basisUrlMailbox(): string {
  const domain = process.env.PIPEDRIVE_COMPANY_DOMAIN
  if (!domain) {
    throw new Error(
      'PIPEDRIVE_COMPANY_DOMAIN fehlt — ohne die Subdomain des Kontos lässt sich keine einzelne Mail laden.',
    )
  }
  return `https://${domain}.pipedrive.com/api/v1`
}

/**
 * Wie lange auf Pipedrive gewartet wird.
 *
 * Vorher gab es kein Zeitlimit. Ein hängendes Pipedrive hielt damit die
 * ganze Fallseite an — der Reiter „Vorgang" wartet auf diesen Aufruf, und
 * ohne Grenze wartet er, bis der Browser aufgibt. Zehn Sekunden sind
 * grosszügig für eine Suche und kurz genug, dass die Seite noch etwas
 * anzeigen kann.
 */
const ZEITLIMIT_MS = 10_000

/**
 * Obergrenze für `listeOffeneDeals`: 5 Seiten à 500 sind 2500 offene Deals —
 * weit über dem heutigen Bestand (121, Stand 08.09.2026). Eine Grenze
 * überhaupt, damit ein Fehler in `naechsterCursor` nicht zur Endlosschleife
 * gegen die Pipedrive-API wird.
 */
const MAX_SEITEN_OFFENE_DEALS = 5

interface Rumpf<T> {
  data?: T
  additional_data?: { next_cursor?: string | null }
}

async function anfrageRoh<T>(
  pfad: string,
  suche: Record<string, string | number | boolean>,
  basis: string,
): Promise<Rumpf<T>> {
  const url = new URL(basis + pfad)
  for (const [schluessel, wert] of Object.entries(suche)) {
    url.searchParams.set(schluessel, String(wert))
  }
  url.searchParams.set('api_token', token())

  let antwort: Response
  try {
    antwort = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(ZEITLIMIT_MS) })
  } catch (fehler) {
    // `AbortSignal.timeout` wirft einen `TimeoutError`. Ihn als solchen zu
    // benennen erspart die Frage, ob Pipedrive langsam oder unerreichbar war.
    const abgelaufen = fehler instanceof Error && fehler.name === 'TimeoutError'
    throw new Error(
      abgelaufen
        ? `Pipedrive hat auf ${pfad} nicht innerhalb von ${ZEITLIMIT_MS / 1000} Sekunden geantwortet.`
        : `Pipedrive ist nicht erreichbar: ${fehler instanceof Error ? fehler.message : String(fehler)}`,
      { cause: fehler },
    )
  }

  if (!antwort.ok) {
    throw new Error(`Pipedrive antwortete mit ${antwort.status} auf ${pfad}.`)
  }
  return (await antwort.json()) as Rumpf<T>
}

async function anfrage<T>(
  pfad: string,
  suche: Record<string, string | number | boolean> = {},
  basis: string = basisUrl(),
) {
  const rumpf = await anfrageRoh<T>(pfad, suche, basis)
  return rumpf.data
}

/**
 * Wie `anfrage`, gibt aber zusätzlich den Blätter-Cursor zurück. Nur die
 * Listenendpunkte (`GET /deals`) brauchen ihn — die übrigen Aufrufe hier
 * fragen genau ein Objekt ab und ignorieren `additional_data`.
 */
async function anfrageSeite<T>(
  pfad: string,
  suche: Record<string, string | number | boolean>,
  basis: string = basisUrl(),
): Promise<{ daten: T | undefined; naechsterCursor: string | null }> {
  const rumpf = await anfrageRoh<T>(pfad, suche, basis)
  return { daten: rumpf.data, naechsterCursor: rumpf.additional_data?.next_cursor ?? null }
}

export const pipedrive = {
  /**
   * Sucht den Deal zu einem Fall — **exakt am Titel**, denn der Titel ist
   * immer das Aktenzeichen. Vorher lief hier eine unscharfe Suche über
   * Titel, Notizen und Freifelder (`term` ohne `fields`/`exact_match`): ein
   * Aktenzeichen, das zufällig auch als Fragment in einer Notiz eines
   * anderen Deals stand, konnte den falschen Treffer liefern.
   *
   * Gefiltert wird zusätzlich auf die Pipeline „Auftrag" — ein Treffer aus
   * einer anderen Pipeline wäre ohnehin nicht mit `phasenNamen` zu lesen.
   * Bleibt mehr als ein Treffer übrig, wird das als eigener Zustand
   * gemeldet statt stillschweigend den ersten zu nehmen: zwei Deals mit
   * gleichem Aktenzeichen sind ein Datenfehler, den jemand ansehen muss.
   *
   * Die Suche liefert nur die ID feldrichtig; der eigentliche Deal kommt aus
   * einem zweiten Aufruf `GET /deals/{id}` — siehe Kommentar am Dateianfang.
   *
   * Ohne Zugangsdaten oder ohne Aktenzeichen wird gar nicht erst angefragt:
   * eine Anfrage ohne Token käme als Fehler zurück und stünde dann als
   * „kein Deal gefunden" in der Akte — was etwas anderes bedeutet.
   */
  async findeDeal(aktenzeichen: string): Promise<DealErgebnis> {
    if (!token() || !aktenzeichen.trim()) return { art: 'ohne_treffer' }

    const daten = await anfrage<{ items?: { item: DealSucheTreffer }[] }>('/deals/search', {
      term: aktenzeichen,
      fields: 'title',
      exact_match: true,
      limit: 5,
    })
    const treffer = (daten?.items ?? [])
      .map((eintrag) => eintrag.item)
      .filter((item) => item.pipeline?.id === PIPELINE_AUFTRAG_ID)

    if (treffer.length === 0) return { art: 'ohne_treffer' }
    if (treffer.length > 1) {
      return {
        art: 'mehrdeutig',
        treffer: treffer.map((t) => ({ id: t.id, title: t.title ?? null })),
      }
    }

    const deal = await anfrage<Deal>(`/deals/${treffer[0]!.id}`)
    if (!deal) return { art: 'ohne_treffer' }
    return { art: 'gefunden', deal }
  },

  /**
   * Alle offenen Deals der Pipeline „Auftrag" — für die Fälle-Liste, die
   * die Pipedrive-Phase zu bis zu hundert Fällen auf einen Blick zeigt.
   *
   * **Ein Aufruf statt einem pro Zeile.** `GET /deals` liefert bis zu 500
   * Deals je Seite feldrichtig (kein zweiter Aufruf nötig wie bei
   * `findeDeal`); am 08.09.2026 lagen alle 121 offenen Deals der Pipeline
   * in einer einzigen Seite. Die Fälle-Liste ordnet die Treffer danach
   * selbst dem angezeigten Aktenzeichen zu — hundert einzelne Suchen wären
   * hundert Aufrufe für etwas, das dieser eine schon mitbringt.
   *
   * Geblättert wird trotzdem, für den Tag, an dem es mehr als 500 offene
   * Deals gibt — mit einer Obergrenze an Seiten, damit ein Fehler in der
   * Abbruchbedingung nicht zu einer Endlosschleife wird.
   */
  async listeOffeneDeals(): Promise<DealUebersicht[]> {
    if (!token()) return []

    const alle: DealUebersicht[] = []
    let cursor: string | undefined
    for (let seite = 0; seite < MAX_SEITEN_OFFENE_DEALS; seite++) {
      const { daten, naechsterCursor } = await anfrageSeite<DealUebersicht[]>('/deals', {
        pipeline_id: PIPELINE_AUFTRAG_ID,
        status: 'open',
        limit: 500,
        ...(cursor ? { cursor } : {}),
      })
      alle.push(...(daten ?? []))
      if (!naechsterCursor) break
      cursor = naechsterCursor
    }
    return alle
  },

  /**
   * Notizen zu einem Deal. `deal_id` steht bereits fest — dieser Aufruf
   * folgt immer auf einen erfolgreichen `findeDeal`.
   */
  async listeNotizen(dealId: number): Promise<Notiz[]> {
    if (!token()) return []
    const daten = await anfrage<Notiz[]>('/notes', { deal_id: dealId, limit: 100 }, basisUrlV1())
    return daten ?? []
  },

  /**
   * Mail-Metadaten zu einem Deal — firmenweit, nicht nur das eigene Postfach.
   * Ohne Textkörper: der ist gross und wird nur gebraucht, wenn jemand die
   * Mail tatsächlich aufklappt (siehe `holeMailBody`).
   *
   * Jeder Eintrag kommt in einer Hülle (`{ object: 'mailMessage', data }`),
   * nicht als flaches Objekt — live am Fall 0926/2081TG geprüft (08.09.2026):
   * ohne das Auspacken stand `id` auf `undefined` und der nächste Aufruf
   * (`holeMailBody`) lief in eine 404.
   */
  async listeMails(dealId: number): Promise<MailMetadaten[]> {
    if (!token()) return []
    const daten = await anfrage<{ data?: MailMetadaten }[]>(
      `/deals/${dealId}/mailMessages`,
      { limit: 100, include_body: 0 },
      basisUrlV1(),
    )
    return (daten ?? []).map((eintrag) => eintrag.data).filter((mail) => mail !== undefined)
  },

  /**
   * Der volle Textkörper einer einzelnen Mail. Trägt `deal_id` in der
   * Antwort mit — die aufrufende Route prüft damit, dass die angefragte
   * Mail wirklich zum erwarteten Fall gehört, bevor sie den Inhalt
   * herausgibt.
   */
  async holeMailBody(mailId: number): Promise<MailVoll | undefined> {
    if (!token()) return undefined
    return anfrage<MailVoll>(`/mailbox/mailMessages/${mailId}`, { include_body: 1 }, basisUrlMailbox())
  },
}
