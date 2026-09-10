import 'server-only'
import { neueKennung } from './kennung'
import { schwaerze, schwaerzeText } from './schwaerzen'

/**
 * Das Protokoll der Anwendung.
 *
 * **Was vorher war:** siebzehn `console.error` mit einem handgeschriebenen
 * deutschen Satz und dem Fehlerobjekt. Keiner trug den Benutzer, drei trugen
 * überhaupt eine fachliche Kennung. Es gab keine Stufen, kein Format, keine
 * Kennung — und keine Möglichkeit, aus einer Meldung des Benutzers („da kam
 * ein Fehler") die passende Zeile zu finden.
 *
 * **Vier Dinge machen dieses Protokoll aus:**
 *
 * 1. **Eine Kennung je Fehler.** Sie steht in der Zeile und wird dem Benutzer
 *    gezeigt. „Fehler K7M2-QP4X" ist eine Fehlermeldung, mit der man arbeiten
 *    kann.
 * 2. **Zusammenhang statt Prosa.** Nicht „Fehler beim Laden", sondern
 *    `{stelle: 'autoixpert.holeVxs', fallId: …, benutzerId: …, dauerMs: 4120}`.
 * 3. **Geschwärzt.** Kennzeichen, Fahrgestellnummern, E-Mail-Adressen und
 *    Token gehen nicht hinaus — siehe `schwaerzen.ts`. Die Schwärzung sitzt
 *    hier am Ausgang, nicht an den Aufrufstellen, weil man sie dort vergisst.
 * 4. **Eine Zeile, ein Ereignis, als JSON.** Damit lässt sich das
 *    Containerprotokoll durchsuchen und filtern, statt es zu lesen.
 *
 * **Was das Protokoll nicht ist:** ein Kanal an den Benutzer. Dafür gibt es
 * `src/melden/`. Hier steht, was der Betrieb wissen muss.
 */

export type Stufe = 'fehler' | 'warnung' | 'info'

/**
 * Der Zusammenhang eines Ereignisses.
 *
 * Die benannten Felder sind die, nach denen man wirklich sucht. Alles Weitere
 * darf dazu — es wird geschwärzt wie alles andere.
 */
export interface Zusammenhang {
  /** Fall-ID (unsere UUID), nicht das Aktenzeichen. */
  fallId?: string
  benutzerId?: string
  stellungnahmeId?: string
  laufId?: string
  /** Fremdsystem, z. B. `autoixpert`, `pipedrive`, `anthropic`. */
  dienst?: string
  /** Dauer in Millisekunden — nur wo sie gemessen wurde. */
  dauerMs?: number
  /** HTTP-Status eines Fremdaufrufs. */
  status?: number
  [weiteres: string]: unknown
}

export interface Eintrag {
  zeit: string
  stufe: Stufe
  /** Wo es passiert ist, in Punktschreibweise: `wbw.lauf.autoscout24`. */
  stelle: string
  meldung: string
  /** Nur bei Fehlern. */
  kennung?: string
  fehler?: { name: string; meldung: string; spur?: string; ursache?: string }
  [weiteres: string]: unknown
}

/**
 * Wohin ein Eintrag geht.
 *
 * Bewusst austauschbar: der Ausgang nach stdout steht hier, der zweite in die
 * Datenbank wird beim Start angemeldet. So bleibt dieses Modul frei von der
 * Datenbank und ist ohne sie zu prüfen.
 */
export type Ausgang = (eintrag: Eintrag) => void

/**
 * Die Ausgangsliste hängt am `globalThis`, nicht am Modul.
 *
 * **Warum das nötig ist.** Next bündelt `instrumentation.ts` getrennt vom
 * Anwendungscode. Beide importieren dieses Modul — und bekommen jeweils eine
 * eigene Instanz davon. Mit einem modul-lokalen Array meldete
 * `meldeFehlerlisteAn()` den Ausgang also in der einen Instanz an, während
 * jede Meldung aus einer Seite oder Serveraktion durch die andere lief und
 * die Datenbank nie erreichte. Am 08.09.2026 stand deshalb eine Warnung im
 * Containerprotokoll, die in der Fehlerliste der Anwendung fehlte.
 *
 * `Symbol.for` ist der Schlüssel, den beide Bündel gleich berechnen — die
 * einzige Klammer, die es über Bündelgrenzen hinweg gibt.
 */
const SCHLUESSEL = Symbol.for('gollenstede.protokoll.ausgaenge')

type Behaelter = { [SCHLUESSEL]?: Ausgang[] }

function alleAusgaenge(): Ausgang[] {
  const behaelter = globalThis as Behaelter
  return (behaelter[SCHLUESSEL] ??= [])
}

/**
 * Meldet einen zusätzlichen Ausgang an, z. B. die Fehlerliste.
 *
 * `name` macht die Anmeldung wiederholbar: Wird dieselbe Anwendung in zwei
 * Bündeln geladen, ruft jedes seinen `register()` — ohne diesen Namen stünde
 * am Ende jeder Fehler doppelt in der Liste.
 */
export function ergaenzeAusgang(ausgang: Ausgang, name?: string): void {
  const liste = alleAusgaenge()
  if (name) {
    if (liste.some((a) => (a as { protokollname?: string }).protokollname === name)) return
    Object.defineProperty(ausgang, 'protokollname', { value: name })
  }
  liste.push(ausgang)
}

/** Nur für Tests. */
export function setzeAusgaengeZurueck(): void {
  alleAusgaenge().length = 0
}

/**
 * Bereitet einen Fehler für das Protokoll auf — samt Ursachenkette.
 *
 * Die Stapelspur wird auf acht Zeilen gekürzt: die ersten sagen, wo es
 * passierte, der Rest ist der Weg durch das Framework und hilft niemandem.
 */
function ausFehler(fehler: unknown): Eintrag['fehler'] {
  if (fehler instanceof Error) {
    const ursache = fehler.cause
    return {
      name: fehler.name,
      meldung: schwaerzeText(fehler.message),
      spur: fehler.stack ? schwaerzeText(fehler.stack.split('\n').slice(0, 8).join('\n')) : undefined,
      ursache:
        ursache instanceof Error
          ? `${ursache.name}: ${schwaerzeText(ursache.message)}`
          : ursache !== undefined
            ? schwaerzeText(String(ursache))
            : undefined,
    }
  }
  return { name: 'Unbekannt', meldung: schwaerzeText(String(fehler)) }
}

function schreibe(eintrag: Eintrag): void {
  // Eine Zeile, ein Ereignis. `console.error` für Fehler und Warnungen, damit
  // die Trennung nach stdout und stderr erhalten bleibt.
  const zeile = JSON.stringify(eintrag)
  if (eintrag.stufe === 'fehler' || eintrag.stufe === 'warnung') console.error(zeile)
  else console.log(zeile)

  for (const ausgang of alleAusgaenge()) {
    try {
      ausgang(eintrag)
    } catch (ausnahme) {
      // Ein Ausgang, der scheitert, darf den Vorgang nicht mitnehmen, über
      // den er berichtet — und erst recht nicht das Protokollieren selbst.
      console.error(
        JSON.stringify({
          zeit: new Date().toISOString(),
          stufe: 'fehler',
          stelle: 'protokoll.ausgang',
          meldung: 'Ein Protokollausgang hat versagt.',
          fehler: ausFehler(ausnahme),
        }),
      )
    }
  }
}

function baue(stufe: Stufe, stelle: string, meldung: string, zusammenhang?: Zusammenhang): Eintrag {
  return {
    zeit: new Date().toISOString(),
    stufe,
    stelle,
    meldung: schwaerzeText(meldung),
    ...(schwaerze(zusammenhang ?? {}) as Record<string, unknown>),
  }
}

/**
 * Hält einen Fehler fest und gibt die Kennung zurück.
 *
 * Die Kennung gehört in die Meldung an den Benutzer — sie ist der einzige
 * Weg von „bei mir kam ein Fehler" zur richtigen Zeile im Protokoll.
 */
export function protokolliereFehler(
  stelle: string,
  meldung: string,
  fehler?: unknown,
  zusammenhang?: Zusammenhang,
): string {
  const kennung = neueKennung()
  schreibe({
    ...baue('fehler', stelle, meldung, zusammenhang),
    kennung,
    ...(fehler !== undefined ? { fehler: ausFehler(fehler) } : {}),
  })
  return kennung
}

export function protokolliereWarnung(
  stelle: string,
  meldung: string,
  zusammenhang?: Zusammenhang,
): void {
  schreibe(baue('warnung', stelle, meldung, zusammenhang))
}

export function protokolliereInfo(
  stelle: string,
  meldung: string,
  zusammenhang?: Zusammenhang,
): void {
  schreibe(baue('info', stelle, meldung, zusammenhang))
}

/**
 * Misst einen Fremdaufruf und hält ihn fest.
 *
 * Gemessen wird immer, protokolliert nur, was auffällt: ein Fehler oder ein
 * Aufruf, der länger als die Schwelle brauchte. Jeder geglückte schnelle
 * Aufruf im Protokoll wäre Rauschen, in dem die zwei wichtigen Zeilen
 * untergehen.
 */
export async function miss<T>(
  stelle: string,
  arbeit: () => Promise<T>,
  zusammenhang?: Zusammenhang & { langsamAbMs?: number },
): Promise<T> {
  const { langsamAbMs = 3000, ...rest } = zusammenhang ?? {}
  const begonnen = Date.now()
  try {
    const ergebnis = await arbeit()
    const dauerMs = Date.now() - begonnen
    if (dauerMs >= langsamAbMs) {
      protokolliereWarnung(stelle, 'Der Aufruf hat lange gebraucht.', { ...rest, dauerMs })
    }
    return ergebnis
  } catch (fehler) {
    protokolliereFehler(stelle, 'Der Aufruf ist gescheitert.', fehler, {
      ...rest,
      dauerMs: Date.now() - begonnen,
    })
    throw fehler
  }
}
