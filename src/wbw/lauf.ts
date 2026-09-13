import 'server-only'
import { execFile } from 'node:child_process'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { filtereNachMarke } from './markenfilter'
import type { Bauart } from './karosserie'
import {
  MINDESTKORB,
  ZYKLEN,
  genugGefunden,
  modelleFuerStufe,
  toleranzenFuer,
  type Zyklusname,
  type Zyklusstufe,
} from './zyklus'
import { brauchbare, pruefeInserate, type Inseratsangabe, type Pruefurteil } from './pruefung'
import { fahrzeugKennung } from './ergebnis'
import { protokolliereWarnung } from '@/protokoll'
import { PORTAL_NAMEN, portalName } from './portalnamen'
import type { Kraftstoff } from './portalvokabular'

const fuehreAus = promisify(execFile)

/**
 * Führt einen WBW-Recherchelauf aus.
 *
 * Das Plugin unter `wbw-plugin/` bleibt dabei unangetastet und wird als
 * **eigener Prozess** aufgerufen — so ist es gebaut, und ein Absturz dort
 * reisst nicht die Anwendung mit.
 *
 * Was hier dazukommt, ist genau das, was dem Plugin für den Betrieb ohne
 * begleitendes Gespräch fehlt. Jeder Punkt steht für einen gemessenen Fall
 * vom 07.09.2026:
 *
 * | Zutat | Ohne sie |
 * | --- | --- |
 * | Suchzentrum geocodet | Abbruch: „Kein Zentrum für PLZ-Bereich 50 hinterlegt" (Köln) |
 * | Modellname **je Portal** | AutoScout24 will `E 53 AMG`, Kleinanzeigen `e_klasse` — `e_53_amg` liefert dort 0 E-Klassen |
 * | Bauart aus `car.shape` | Das Plugin leitete „Kombi" ab, gesucht war eine Limousine |
 * | Markenfilter | Ein Škoda Superb stand im Korb einer Mercedes-Suche |
 */

export interface WbwSubjekt {
  marke: string
  /** Der Name aus autoiXpert, z. B. `E Limousine (BM 213)`. Nur zur Anzeige. */
  modell: string
  /**
   * Die Baureihe, z. B. `E-Klasse`.
   *
   * Sie geht an Kleinanzeigen (siehe `modellProPortal`) **und** an die
   * KI-Prüfung: `modell` trägt bisweilen die Ausstattungslinie statt des
   * Fahrzeugs, und dann ist die Baureihe die einzige Angabe, an der die
   * Prüfung ein falsches Modell erkennen kann.
   */
  baureihe: string | null
  variante: string
  /** Monat/Jahr, `MM/JJJJ`. */
  ez: string
  mileage: number | null
  power: number | null
  /** `car.shape` aus autoiXpert, z. B. `sedan`. */
  bauart: Bauart | null
}

/**
 * Der Modellname je Portal. Die Portale führen **verschiedene Taxonomien**;
 * ein Name für beide gibt es nicht.
 */
export interface ModellProPortal {
  /** Aus der Modellliste von AutoScout24, z. B. `E 53 AMG`. */
  autoscout24?: string
  /** Die Baureihe, z. B. `E-Klasse`. Kleinanzeigen kennt keine Motorvarianten. */
  kleinanzeigen?: string
  /** Freitext für die Stichwortsuche. */
  mobilede?: string
}

export type Portal = 'autoscout24' | 'kleinanzeigen' | 'mobile.de'

// Der Anzeigename je Portal wohnt in ./portalnamen, nicht hier — die eigene
// Datei bleibt frei von `server-only`, damit belegseite.ts sie mitnutzen
// kann, ohne selbst einen Server- oder Browserkontext zu brauchen. Hier
// erneut exportiert, damit die bestehenden Importe aus '@/wbw/lauf' gültig
// bleiben.
export { PORTAL_NAMEN, portalName }

export interface WbwEingabe {
  subjekt: WbwSubjekt
  modellProPortal: ModellProPortal
  plz: string
  sollAusstattung: string[]
  getriebe?: 'Automatik' | 'Manuell'
  kraftstoff?: Kraftstoff
  tueren?: number
  radiusKm: number
  kmToleranz: number
  ezToleranzJahre: number
  leistungToleranzKw: number
  maxItemsProPortal: number
  portale: Portal[]
  /** Markenfremde Inserate aussortieren. Voreinstellung: ja. */
  markenfilter?: boolean
  /**
   * Die Modellliste von AutoScout24 zu dieser Marke.
   *
   * Aus ihr werden die gröberen Stufen gewählt — ohne sie bleibt es über
   * alle Zyklen bei dem einen Namen, und nur die Toleranzen weiten sich.
   */
  as24Modelle?: string[]
  /** Ab wie vielen brauchbaren Fahrzeugen aufgehört wird. Vorgabe: 8. */
  mindestzahl?: number
  /** Die KI-Prüfung abschalten — dann bleibt der Korb ungeprüft. */
  pruefen?: boolean
  /**
   * Zusätzliche Umgebungsvariablen für die Skripte dieses einen Laufs.
   *
   * Damit wird `WBW_ALLOW_PAID` **pro Lauf** gesetzt statt dauerhaft im
   * Container: die kostenpflichtige Stufe (Apify) ist dann eine bewusste
   * Entscheidung für diese eine Suche und nicht ein Schalter, den irgendwann
   * niemand mehr sieht.
   */
  umgebung?: Record<string, string>
}

export interface Schritt {
  name: string
  stand: 'laeuft' | 'fertig' | 'fehler' | 'leer'
  text?: string
}

export interface WbwErgebnis {
  ordner: string
  /** Der ausgewertete Lauf, wie `result.json` ihn enthält. */
  ergebnis: unknown
  /** Was der Markenfilter je Portal entfernt hat. */
  markenfremd: { portal: Portal; anzahl: number; erkannt: (string | null)[] }[]
  /**
   * Portale, die über eine andere als die erste Stufe beschafft wurden.
   *
   * Steht hier etwas, gehört es in die Benachrichtigung: der Korb kann
   * anders zustande gekommen sein als geplant. Ein stiller Rückfall ist
   * derselbe Fehler wie die stille PDF-Stufe.
   */
  rueckfaelle: Rueckfall[]
  protokoll: Schritt[]
  /** Was jeder gelaufene Zyklus ergeben hat. */
  zyklen: Zyklusbericht[]
  /** Das Urteil der KI-Prüfung je Fahrzeug, nach seiner Kennzeichnung. */
  urteile: Record<string, Pruefurteil>
  dateien: { html?: string; pdf?: string; linkliste?: string }
}

/**
 * Die Umgebung, in der die Plugin-Skripte laufen.
 *
 * Ergänzt wird nur, was fehlt. `KA_API_BASE` sagt dem Kleinanzeigen-Adapter,
 * wo die Schnittstelle steht — seit sie im Cockpit selbst liegt, ist das die
 * eigene Adresse. Im Betrieb setzt `starten.mjs` sie samt Zugangswort, bevor
 * der Server hochfährt; in der Entwicklung (`next dev`) läuft dieses Skript
 * nicht, und ohne diesen Rückfall bekäme das Plugin dort „KA_API_BASE fehlt"
 * und liefe stumm auf null Treffer — genau so gemessen am 07.09.2026.
 */
function laufUmgebung(zusatz?: Record<string, string>): NodeJS.ProcessEnv {
  const umgebung: NodeJS.ProcessEnv = { ...process.env, ...zusatz }
  if (!umgebung.KA_API_BASE) {
    umgebung.KA_API_BASE = `http://127.0.0.1:${process.env.PORT ?? '3000'}/api/kleinanzeigen`
  }
  return umgebung
}

/** Wo die Skripte des Plugins liegen. Im Abbild `/app/wbw-plugin`. */
function pluginPfad(): string {
  return process.env.WBW_PLUGIN_PFAD ?? join(process.cwd(), 'wbw-plugin')
}

/**
 * Ruft ein Plugin-Skript auf. Die Ausgabe wird als JSON gelesen, wo das
 * Skript JSON schreibt — sonst zählt nur, dass es durchlief.
 */
export async function rufeSkript(
  skript: string,
  argumente: string[],
  optionen: { cwd?: string; timeoutMs?: number; umgebung?: Record<string, string> } = {},
): Promise<string> {
  try {
    const { stdout } = await fuehreAus('node', [join(pluginPfad(), skript), ...argumente], {
      cwd: optionen.cwd,
      // Die Beschaffung eines Portals kann Minuten dauern — Kleinanzeigen holt
      // je Inserat eine Detailseite und pausiert dazwischen bewusst.
      timeout: optionen.timeoutMs ?? 15 * 60 * 1000,
      maxBuffer: 64 * 1024 * 1024,
      env: laufUmgebung(optionen.umgebung),
    })
    return stdout
  } catch (fehler) {
    // `execFile` wirft bei einem Rückgabewert ungleich null mit der nackten
    // Meldung „Command failed: node …". Der Grund steht im Ausgabestrom des
    // Skripts — die Plugin-Skripte schreiben ihn als `{"fehler": "…"}`. Ohne
    // ihn stand in der Oberfläche der Befehl statt der Ursache.
    throw new Error(`${skript}: ${grundAus(fehler)}`)
  }
}

/** Holt den Grund aus der Ausgabe eines gescheiterten Skripts. */
function grundAus(fehler: unknown): string {
  const f = fehler as { stdout?: string; stderr?: string; message?: string }
  for (const strom of [f.stdout, f.stderr]) {
    const text = strom?.trim()
    if (!text) continue
    try {
      const gelesen = JSON.parse(text) as { fehler?: string }
      if (gelesen.fehler) return gelesen.fehler
    } catch {
      // Kein JSON — dann die letzte Zeile, sie trägt meist die Meldung.
      const zeilen = text.split('\n').filter(Boolean)
      const letzte = zeilen[zeilen.length - 1]
      if (letzte) return letzte.slice(0, 300)
    }
  }
  return f.message?.slice(0, 300) ?? 'unbekannter Fehler'
}

/**
 * Löst die Postleitzahl in Koordinaten auf.
 *
 * Mit Wiederholung: der Geokodierdienst bremst wiederholte Anfragen aus und
 * antwortet dann mit nichts. Zweimal hintereinander gemessen —
 * `{"plz":"50997","lat":50.8651,…}` und unmittelbar danach
 * `{"fehler":"Für die PLZ 50997 liess sich kein Ort bestimmen."}`. Ohne
 * Wiederholung stirbt daran der ganze Lauf im ersten Schritt.
 */
export async function ermittleZentrum(
  plz: string,
  optionen: { versuche?: number; warte?: (ms: number) => Promise<void> } = {},
): Promise<{ lat: number; lon: number }> {
  const hoechstens = Math.max(1, optionen.versuche ?? 3)
  const warte = optionen.warte ?? ((ms: number) => new Promise((w) => setTimeout(w, ms)))
  let letzterGrund = ''

  for (let versuch = 1; versuch <= hoechstens; versuch++) {
    if (versuch > 1) await warte(versuch * 2000)
    try {
      const roh = await rufeSkript('zentrum.js', [plz], { timeoutMs: 60_000 })
      const daten = JSON.parse(roh) as { lat?: number; lon?: number; fehler?: string }
      if (daten.lat != null && daten.lon != null) return { lat: daten.lat, lon: daten.lon }
      letzterGrund = daten.fehler ?? `Für die PLZ ${plz} liess sich kein Ort bestimmen.`
    } catch (fehler) {
      letzterGrund = fehler instanceof Error ? fehler.message : String(fehler)
    }
  }

  throw new Error(
    `Für die PLZ ${plz} liess sich auch nach ${hoechstens} Versuchen kein Ort bestimmen: ${letzterGrund}`,
  )
}

export interface Modellliste {
  marke: string
  anzahl: number
  modelle: string[]
  /** Der Vorschlag, den das Portal selbst zum autoiXpert-Namen macht. */
  vorschlaege: string[]
  /** Gesetzt, wenn der autoiXpert-Name zufällig direkt passt. */
  aufloesung: { label: string; korrigiert: boolean } | null
}

/**
 * Die Modellnamen, die AutoScout24 für eine Marke wirklich kennt (357 bei
 * Mercedes-Benz). Der Sachverständige wählt daraus — geraten wird nichts,
 * denn ein unbekanntes Modell lässt das Portal stillschweigend fallen und
 * liefert dann die ganze Marke.
 */
export async function ermittleModelle(marke: string, wunsch?: string): Promise<Modellliste> {
  const roh = await rufeSkript('modelle.js', wunsch ? [marke, wunsch] : [marke], {
    timeoutMs: 90_000,
  })
  const daten = JSON.parse(roh) as Partial<Modellliste> & { fehler?: string }
  if (daten.fehler) throw new Error(daten.fehler)
  return {
    marke,
    anzahl: daten.anzahl ?? 0,
    modelle: daten.modelle ?? [],
    vorschlaege: daten.vorschlaege ?? [],
    aufloesung: daten.aufloesung ?? null,
  }
}

/** Der Dateiname, unter dem die Rohdaten eines Portals liegen. */
const ROHDATEI: Record<Portal, string> = {
  autoscout24: 'raw-autoscout.json',
  kleinanzeigen: 'raw-kleinanzeigen.json',
  'mobile.de': 'raw-mobile.json',
}

/**
 * Setzt den Modellnamen je Portal in die fertigen Such-Eingaben ein.
 *
 * `build-search-urls.js` nimmt einen Modellnamen für alle Portale — das kann
 * nicht stimmen, solange die Portale verschiedene Taxonomien führen. Statt
 * das Skript zu ändern, wird sein Ergebnis hier nachgezogen; das Plugin
 * bleibt aktualisierbar.
 */
export function setzeModelle(
  eingaben: Record<string, unknown>,
  modelle: ModellProPortal,
): Record<string, unknown> {
  const kopie: Record<string, unknown> = { ...eingaben }

  if (modelle.autoscout24 && kopie.autoScout && typeof kopie.autoScout === 'object') {
    kopie.autoScout = { ...(kopie.autoScout as object), model: modelle.autoscout24 }
  }
  if (modelle.kleinanzeigen && kopie.kleinanzeigen && typeof kopie.kleinanzeigen === 'object') {
    kopie.kleinanzeigen = {
      ...(kopie.kleinanzeigen as object),
      car_model: modelle.kleinanzeigen,
    }
  }
  if (modelle.mobilede && kopie.mobileDe && typeof kopie.mobileDe === 'object') {
    const vorher = kopie.mobileDe as { query?: string }
    kopie.mobileDe = { ...vorher, query: modelle.mobilede }
  }
  return kopie
}

/** Was ein Zyklus je Portal ergeben hat — Grundlage der Zyklus-Reports. */
/**
 * Ein Portal, das über eine andere als die erste Stufe beschafft wurde.
 *
 * Apify steht bewusst vorn: nur dafür ist gemessen, dass Umkreis,
 * Laufleistung und Baujahr am Portal wirken. Trägt stattdessen eine der
 * kostenlosen Stufen, ist der Korb anders zustande gekommen als geplant —
 * und das muss der Sachverständige sehen, bevor er das Gutachten
 * unterschreibt. Ein stiller Rückfall ist derselbe Fehler wie die stille
 * PDF-Stufe: es sieht aus, als sei alles wie immer gelaufen.
 */
export interface Rueckfall {
  portal: Portal
  zyklus: string
  /** Die Stufe, die getragen hat. */
  stufe: string
  /** Die Stufe, die hätte tragen sollen. */
  stattdessen: string
  /** Warum die erste Stufe nicht getragen hat, soweit protokolliert. */
  grund: string | null
  /**
   * Ob der Rückfall eine Entscheidung war und keine Überraschung.
   *
   * Die kostenpflichtige Stufe ist ein bewusster Haken in der Oberfläche.
   * Wer ihn nicht setzt, bekommt den kostenlosen Weg — das ist gewollt und
   * keine Warnung. Ein Rückfall, weil Apify **gescheitert** ist, ist eine.
   */
  bewusst: boolean
}

export interface Portalbericht {
  portal: Portal
  /** Der Modellname, mit dem gesucht wurde. */
  modell: string | null
  gefunden: number
  behalten: number
  /** Ordner des eigenen Reports dieses Zyklus und Portals. */
  reportordner: string | null
  fehler?: string
}

export interface Zyklusbericht {
  name: Zyklusname
  beschriftung: string
  toleranzen: ReturnType<typeof toleranzenFuer>
  portale: Portalbericht[]
  /** Fahrzeuge, die es in den vorherigen Zyklen noch nicht gab. */
  neu: number
  /** Davon nach der Prüfung als aufnehmbar beurteilt. */
  brauchbar: number
  /**
   * Wie viele Fahrzeuge nach diesem Zyklus im Korb lagen.
   *
   * Die Zahl, an der die Suche entscheidet, ob sie weitermacht — nicht
   * `brauchbar`. Die Prüfung urteilt über das Inserat, der Korb entsteht
   * danach aus den Filtern des Plugins.
   */
  imKorb: number
}

/**
 * Schreibt die Parameterdatei eines Zyklus.
 *
 * **Die Soll-Ausstattung steht bewusst nicht mehr in der Suchanfrage.** Die
 * Portale führen sie unvollständig — bei Kleinanzeigen stand sie am
 * 07.09.2026 bei keinem einzigen Inserat in der Ausstattungsliste, sondern
 * im Beschreibungstext. Wer danach filtert, wirft die halbe Trefferliste weg
 * und behält die Händler, die ihre Häkchen pflegen. Gelesen wird sie jetzt
 * von der KI-Prüfung, aus dem Fliesstext.
 */
function parameterFuer(
  eingabe: WbwEingabe,
  zentrum: { lat: number; lon: number },
  stufe: Zyklusstufe,
  modelle: ModellProPortal,
): Record<string, unknown> {
  const toleranzen = toleranzenFuer(eingabe, stufe)
  return {
    subject: {
      marke: eingabe.subjekt.marke,
      modell: modelle.kleinanzeigen ?? eingabe.subjekt.modell,
      variante: eingabe.subjekt.variante,
      ez: eingabe.subjekt.ez,
      mileage: eingabe.subjekt.mileage,
      power: eingabe.subjekt.power,
    },
    // Leer statt weggelassen: das Plugin erwartet das Feld, und eine leere
    // Liste heisst dort „nicht danach filtern".
    sollAusstattung: [],
    plz: eingabe.plz,
    zentrum,
    ...(eingabe.subjekt.bauart ? { karosserie: eingabe.subjekt.bauart } : {}),
    /*
      Die Bauart geht nur im ENGEN Zyklus an die Portale.

      Gemessen am 10.09.2026 schnitt `bodyType: "van"` den AutoScout24-Korb
      eines VW Sharan von zehn Treffern auf einen — dort meint `van` das
      Nutzfahrzeug und nicht die Großraumlimousine. Zyklus 1 sucht damit und
      liefert einen scharf getrennten Korb; reicht er nicht, sucht Zyklus 2
      ohne sie, und eine falsche Zuordnung kann den Lauf nicht mehr kosten.

      Getriebe und Kraftstoff gehen in jedem Zyklus hinaus: deren Vokabular
      ist eindeutig, das der Bauart nachweislich nicht.
    */
    bauartAmPortal: stufe.name === 'eng',
    ...toleranzen,
    ...(eingabe.getriebe ? { getriebe: eingabe.getriebe } : {}),
    ...(eingabe.kraftstoff ? { kraftstoff: eingabe.kraftstoff } : {}),
    ...(eingabe.tueren ? { tueren: eingabe.tueren } : {}),
    maxItemsProPortal: eingabe.maxItemsProPortal,
    kleinanzeigenLocId: null,
    wbwOpts: { eurProKm: 0.1, eurProEzMonat: 120 },
  }
}

/** Die Rohtreffer einer Datei — die Form wechselt je nach Herkunft. */
async function leseTreffer(pfad: string): Promise<Record<string, unknown>[]> {
  const roh = JSON.parse(await readFile(pfad, 'utf8')) as
    | { items?: Record<string, unknown>[] }
    | Record<string, unknown>[]
  return Array.isArray(roh) ? roh : (roh.items ?? [])
}

/**
 * Woran ein Fahrzeug über Zyklen hinweg wiedererkannt wird.
 *
 * Dieselbe Regel wie in der Anzeige (`fahrzeugKennung`) — sonst fänden die
 * Tabelle und die Urteile nicht zueinander.
 */
function kennzeichnung(eintrag: Record<string, unknown>): string {
  const url = typeof eintrag.url === 'string' ? eintrag.url : null
  const ersatz = eintrag.id ?? eintrag.adid ?? eintrag.guid
  const kennung = fahrzeugKennung(url, ersatz as string | number | null)
  // Ohne Adresse und ohne id bleibt nur der Inhalt selbst — besser als eine
  // leere Kennung, unter der alle Fahrzeuge dasselbe Urteil bekämen.
  return kennung || JSON.stringify(eintrag).slice(0, 200)
}

/**
 * Wie viele Fahrzeuge die Auswertung in den Korb gelegt hat.
 *
 * **Warum diese Zahl und nicht die der Prüfung.** Bis zum 08.09.2026 hörte
 * die Suche auf, sobald die KI-Prüfung genug Inserate für brauchbar hielt.
 * Das Protokoll meldete dann „8 brauchbare Vergleichsfahrzeuge — weitere
 * Zyklen nicht nötig", und im Korb stand ein einziges Fahrzeug. Beide Zahlen
 * stimmten: die Prüfung urteilt fachlich über das Inserat, der Korb entsteht
 * danach aus Toleranz-, Linien-, Karosserie- und Getriebefilter. Nur die
 * zweite Zahl steht am Ende im Gutachten, und nur an ihr darf sich die
 * Abbruchbedingung messen.
 */
export function korbgroesse(ergebnis: unknown): number {
  if (!ergebnis || typeof ergebnis !== 'object') return 0
  const daten = ergebnis as { statistik?: unknown; korb?: unknown }
  const statistik = daten.statistik as { imKorb?: unknown } | undefined
  if (typeof statistik?.imKorb === 'number' && Number.isFinite(statistik.imKorb)) {
    return statistik.imKorb
  }
  return Array.isArray(daten.korb) ? daten.korb.length : 0
}

/**
 * Das Beschaffungsprotokoll aus einer Rohdatei, sofern eines darin steht.
 *
 * Es belegt im Report, über welchen Weg ein Portal abgefragt wurde und ob
 * dabei ein kostenpflichtiger Dienst getragen hat. Beim Zusammenfassen der
 * Zyklen muss es mitwandern, sonst fehlt es im Gesamtreport.
 */
async function leseBeschaffungsprotokoll(pfad: string): Promise<unknown> {
  try {
    const roh = JSON.parse(await readFile(pfad, 'utf8')) as { beschaffungsprotokoll?: unknown }
    return Array.isArray(roh) ? null : (roh.beschaffungsprotokoll ?? null)
  } catch {
    return null
  }
}

/**
 * Ob ein Portal über eine andere als die erste Stufe beschafft wurde.
 *
 * Die erste Stufe in `providers.json` ist Apify — nur dafür ist gemessen,
 * dass Umkreis, Laufleistung und Baujahr am Portal wirken und ein
 * tragfähiger Korb herauskommt. Trägt eine andere, ist der Korb anders
 * zustande gekommen als geplant.
 *
 * Erkannt wird das am Protokoll selbst: `versuche[0]` ist immer die erste
 * Stufe — auch wenn sie übersprungen wurde. Steht dort eine andere als die,
 * die getragen hat, war es ein Rückfall. Das kommt ohne einen zweiten Blick
 * in `providers.json` aus, und damit können die beiden nicht auseinanderlaufen.
 */
export function erkenneRueckfall(
  portal: Portal,
  zyklus: string,
  beschaffung: unknown,
): Rueckfall | null {
  const p = beschaffung as
    | { getrageneStufe?: string | null; versuche?: { stufe?: string; ergebnis?: string; grund?: string; fehler?: string }[] }
    | null
    | undefined
  const getragen = p?.getrageneStufe
  const versuche = Array.isArray(p?.versuche) ? p.versuche : []
  // Ohne Ergebnis gibt es keinen Rückfall, sondern einen Fehlschlag — den
  // meldet der Aufrufer bereits an anderer Stelle.
  if (!getragen || versuche.length === 0) return null
  const erste = versuche[0]?.stufe
  if (!erste || erste === getragen) return null
  const gescheitert = versuche.find((v) => v.stufe === erste)
  const grund = gescheitert?.fehler ?? gescheitert?.grund ?? gescheitert?.ergebnis ?? null
  return {
    portal,
    zyklus,
    stufe: getragen,
    stattdessen: erste,
    grund,
    // Der Kostenschutz des Plugins wirft mit code L3_GESPERRT und einer
    // Meldung, die "WBW_ALLOW_PAID" nennt. Das ist der Haken in der
    // Oberfläche, nicht ein Fehler.
    bewusst: /WBW_ALLOW_PAID|kostenpflichtig und gesperrt/i.test(String(grund ?? "")),
  }
}

/**
 * Der Satz, der aus Rückfällen in die Benachrichtigung geht.
 *
 * Ohne Rückfall: `null` — dann steht in der Meldung nichts Zusätzliches.
 * Mehrfach dasselbe Portal (mehrere Zyklen) zählt einmal; wen es interessiert,
 * welcher Zyklus, der findet es im Protokoll.
 */
export function rueckfallHinweis(rueckfaelle: Rueckfall[]): {
  text: string
  warnung: boolean
} | null {
  if (!rueckfaelle || rueckfaelle.length === 0) return null
  const jePortal = new Map<Portal, Rueckfall>()
  for (const r of rueckfaelle) if (!jePortal.has(r.portal)) jePortal.set(r.portal, r)
  const eintraege = [...jePortal.values()]
  const teile = eintraege.map((r) => `${portalName(r.portal)} über ${r.stufe}`)
  const liste =
    teile.length === 1 ? teile[0] : `${teile.slice(0, -1).join(', ')} und ${teile.at(-1)}`

  // Wurde die kostenpflichtige Stufe schlicht nicht freigegeben, ist der
  // kostenlose Weg die getroffene Entscheidung — Hinweis, keine Warnung.
  if (eintraege.every((r) => r.bewusst)) {
    return {
      text:
        `${liste} beschafft — die kostenpflichtige Stufe war für diesen Lauf ` +
        'nicht freigegeben.',
      warnung: false,
    }
  }
  return {
    text:
      `Achtung: ${liste} beschafft, nicht über die vorgesehene Stufe. ` +
      'Der Korb kann anders zustande gekommen sein als geplant.',
    warnung: true,
  }
}

/**
 * Vereint die Rohtreffer zweier Zyklen desselben Portals.
 *
 * **Warum das nötig ist.** Der Gesamtkorb entsteht aus `run-report.js`, und
 * das Skript legt seine Quellen nach Portalnamen ab:
 *
 *     rawBySource[src] = loadItems(file);
 *
 * Zwei Zyklen desselben Portals sind zweimal `kleinanzeigen` — der zweite
 * überschreibt den ersten. Im Lauf vom 08.09.2026 holte Zyklus 1 fünfzehn
 * Treffer bei AutoScout24 und vierzig bei Kleinanzeigen, Zyklus 2 weitere
 * vierzig bei Kleinanzeigen. Geprüft wurden 94 Inserate, in die Auswertung
 * gingen 55: ein vollständiger Kleinanzeigen-Zyklus fiel weg, und keine Zahl
 * im Protokoll verriet es.
 *
 * Je Portal geht deshalb nur noch **eine** Datei hinaus, und diese Funktion
 * baut sie. Dubletten fallen dabei über dieselbe Kennung heraus, mit der auch
 * die Urteile zugeordnet werden — sonst stünde ein Fahrzeug, das zwei Zyklen
 * gefunden haben, zweimal im Median.
 *
 * Beim ersten Vorkommen bleibt es: der frühere Zyklus hat die engeren
 * Toleranzen gesucht, sein Datensatz ist der belastbarere.
 */
export function vereineRohtreffer(
  bisher: Record<string, unknown>[],
  neu: Record<string, unknown>[],
): Record<string, unknown>[] {
  const vereint = [...bisher]
  const gesehen = new Set(bisher.map(kennzeichnung))
  for (const eintrag of neu) {
    const kennung = kennzeichnung(eintrag)
    if (gesehen.has(kennung)) continue
    gesehen.add(kennung)
    vereint.push(eintrag)
  }
  return vereint
}

/** Übersetzt einen Rohtreffer in das, was die Prüfung braucht. */
function alsAngabe(eintrag: Record<string, unknown>, portal: Portal): Inseratsangabe {
  const text = (wert: unknown) => (typeof wert === 'string' && wert.trim() ? wert : null)
  const zahl = (wert: unknown) => {
    if (typeof wert === 'number' && Number.isFinite(wert)) return wert
    const ziffern = String(wert ?? '').replace(/[^\d]/g, '')
    return ziffern ? Number(ziffern) : null
  }
  const liste = (wert: unknown) =>
    Array.isArray(wert) ? wert.filter((w): w is string => typeof w === 'string') : []

  return {
    id: kennzeichnung(eintrag),
    quelle: portal,
    titel: text(eintrag.titel) ?? text(eintrag.title),
    beschreibung: text(eintrag.beschreibung) ?? text(eintrag.description),
    ausstattung: liste(eintrag.ausstattung),
    preis: zahl(eintrag.preis ?? eintrag.price),
    kilometerstand: zahl(eintrag.kilometerstand ?? eintrag.mileage),
    erstzulassung: text(eintrag.erstzulassung) ?? text(eintrag.ez),
    leistungKw: zahl(eintrag.leistungKw ?? eintrag.power),
    anzahlBilder: liste(eintrag.bilder).length,
  }
}

/**
 * Führt den ganzen Lauf aus — in Zyklen, von eng nach weit.
 *
 * `melde` bekommt nach jedem Schritt den Stand; daran hängt die
 * Fortschrittsanzeige.
 *
 * **Der Ablauf je Zyklus:** Parameter mit den geweiteten Toleranzen, die
 * Modellnamen der Stufe, ein Portaldurchlauf, ein eigener Report je Portal —
 * und danach die Prüfung der neu hinzugekommenen Fahrzeuge. Sind genug
 * brauchbare beisammen, hört es auf.
 *
 * **Der Gesamtkorb entsteht zum Schluss** aus den Rohtreffern aller
 * gelaufenen Zyklen, mit den Toleranzen des **letzten** Zyklus: mit denen des
 * ersten würde die Auswertung genau die Fahrzeuge wieder wegwerfen, für die
 * geweitet wurde.
 *
 * Dabei geht **eine Datei je Portal** hinaus, nicht eine je Zyklus und
 * Portal. `run-report.js` legt seine Quellen nach Portalnamen ab, und zwei
 * Zyklen desselben Portals überschrieben einander — siehe
 * `vereineRohtreffer`.
 */
export async function fuehreLaufAus(
  eingabe: WbwEingabe,
  melde: (schritt: Schritt) => void = () => {},
): Promise<WbwErgebnis> {
  const ordner = await mkdtemp(join(tmpdir(), 'wbw-'))
  const protokoll: Schritt[] = []
  const halteFest = (schritt: Schritt) => {
    protokoll.push(schritt)
    melde(schritt)
  }

  // --- Suchzentrum ---------------------------------------------------------
  halteFest({ name: 'Suchzentrum bestimmen', stand: 'laeuft' })
  const zentrum = await ermittleZentrum(eingabe.plz)
  halteFest({
    name: 'Suchzentrum bestimmen',
    stand: 'fertig',
    text: `PLZ ${eingabe.plz} → ${zentrum.lat.toFixed(4)}, ${zentrum.lon.toFixed(4)}`,
  })

  const markenfremd: WbwErgebnis['markenfremd'] = []
  const zyklen: Zyklusbericht[] = []
  /*
    Die Rohtreffer **je Portal**, über alle Zyklen vereint. Eine Liste je
    Zyklus ginge verloren: `run-report.js` legt seine Quellen nach Portalnamen
    ab, und zwei Zyklen desselben Portals überschreiben einander (siehe
    `vereineRohtreffer`).
  */
  const rohProPortal = new Map<Portal, Record<string, unknown>[]>()
  const protokollProPortal = new Map<Portal, unknown>()
  /** Portale, die über eine andere als die erste Stufe beschafft wurden. */
  const rueckfaelle: Rueckfall[] = []
  /*
    Das Hauptbuch für den Gesamtdeckel. Es liegt im Ordner des Vorgangs, weil
    die Portale als eigene Kindprozesse laufen — eine Zahl im Speicher würde
    das nicht überleben. Gleichzeitig ist es damit Teil des Belegs.
  */
  const budgetDatei = join(ordner, 'budget.json')
  /** Die Auswertung des zuletzt gelaufenen Zyklus — sie ist das Ergebnis. */
  let ergebnis: unknown = null
  /** Wo Bericht, Linkliste und PDF dieser Auswertung liegen. */
  let ergebnisOrdner = 'out'

  /**
   * Wertet den Gesamtkorb aus allem aus, was bis hierher beisammen ist.
   *
   * Je Portal geht **eine** Datei hinaus, nicht eine je Zyklus: `run-report.js`
   * legt seine Quellen nach Portalnamen ab, und gleiche Namen verdrängen
   * einander.
   *
   * `ohneLinie` lässt die Ausstattungslinie aus den Parametern. Das ist der
   * zweite Durchgang des weichen Linienfilters — siehe unten.
   */
  const werteAus = async (
    parameterdatei: string,
    unterordner: string,
    ohneLinie = false,
  ): Promise<unknown> => {
    const quellen: string[] = []
    for (const [portal, eintraege] of rohProPortal) {
      const datei = `${ROHDATEI[portal].replace(/\.json$/, '')}-gesamt.json`
      const beschaffung = protokollProPortal.get(portal)
      await writeFile(
        join(ordner, datei),
        JSON.stringify(
          { items: eintraege, ...(beschaffung ? { beschaffungsprotokoll: beschaffung } : {}) },
          null,
          2,
        ),
        'utf8',
      )
      quellen.push(`${portal}=${datei}`)
    }

    let datei = parameterdatei
    if (ohneLinie) {
      datei = parameterdatei.replace(/\.json$/, '-ohne-linie.json')
      const roh = JSON.parse(await readFile(join(ordner, parameterdatei), 'utf8')) as {
        subject?: Record<string, unknown>
      }
      await writeFile(
        join(ordner, datei),
        JSON.stringify({ ...roh, subject: { ...roh.subject, variante: '' } }, null, 2),
        'utf8',
      )
    }

    await rufeSkript('run-report.js', [datei, unterordner, ...quellen], {
      cwd: ordner,
      timeoutMs: 15 * 60 * 1000,
    })
    return JSON.parse(await readFile(join(ordner, unterordner, 'result.json'), 'utf8'))
  }
  const urteile = new Map<string, Pruefurteil>()
  const gesehen = new Set<string>()

  for (const stufe of ZYKLEN) {
    const modelle = modelleFuerStufe(
      eingabe.modellProPortal,
      eingabe.subjekt.modell,
      eingabe.as24Modelle ?? [],
      stufe,
    )
    const parameterdatei = `params-${stufe.name}.json`
    const eingabedatei = `search-inputs-${stufe.name}.json`

    await writeFile(
      join(ordner, parameterdatei),
      JSON.stringify(parameterFuer(eingabe, zentrum, stufe, modelle), null, 2),
      'utf8',
    )

    halteFest({ name: `${stufe.beschriftung}: Such-Eingaben`, stand: 'laeuft' })
    await rufeSkript('build-search-urls.js', [parameterdatei, eingabedatei], {
      cwd: ordner,
      timeoutMs: 60_000,
    })
    const eingaben = JSON.parse(await readFile(join(ordner, eingabedatei), 'utf8')) as Record<
      string,
      unknown
    >
    await writeFile(
      join(ordner, eingabedatei),
      JSON.stringify(setzeModelle(eingaben, modelle), null, 2),
      'utf8',
    )
    const toleranzen = toleranzenFuer(eingabe, stufe)
    halteFest({
      name: `${stufe.beschriftung}: Such-Eingaben`,
      stand: 'fertig',
      text:
        `${toleranzen.radiusKm} km Umkreis · ±${toleranzen.kmToleranz.toLocaleString('de-DE')} km · ` +
        `±${toleranzen.ezToleranzJahre} Jahre · ±${toleranzen.leistungToleranzKw} kW`,
    })

    // --- Beschaffung je Portal --------------------------------------------
    const berichte: Portalbericht[] = []
    const neueAngaben: Inseratsangabe[] = []

    for (const portal of eingabe.portale) {
      const datei = `${ROHDATEI[portal].replace(/\.json$/, '')}-${stufe.name}.json`
      const schrittname = `${stufe.beschriftung}: ${portalName(portal)}`
      const modell = modelle[portal === 'mobile.de' ? 'mobilede' : portal] ?? null

      halteFest({ name: schrittname, stand: 'laeuft' })
      try {
        await rufeSkript('fetch-portal.js', [portal, eingabedatei, datei], {
          cwd: ordner,
          umgebung: { ...eingabe.umgebung, WBW_BUDGET_DATEI: budgetDatei },
        })
      } catch (fehler) {
        const grund = fehler instanceof Error ? fehler.message.slice(0, 300) : String(fehler)
        berichte.push({ portal, modell, gefunden: 0, behalten: 0, reportordner: null, fehler: grund })
        halteFest({ name: schrittname, stand: 'fehler', text: grund })
        continue
      }

      const gefunden = await leseTreffer(join(ordner, datei))
      // Vor dem Markenfilter lesen: der schreibt die Datei neu, und das
      // Beschaffungsprotokoll stünde danach nicht mehr darin.
      const beschaffung = await leseBeschaffungsprotokoll(join(ordner, datei))
      if (beschaffung) protokollProPortal.set(portal, beschaffung)
      const rueckfall = erkenneRueckfall(portal, stufe.name, beschaffung)
      if (rueckfall) {
        rueckfaelle.push(rueckfall)
        halteFest({
          name: `${schrittname}: Rückfall auf ${rueckfall.stufe}`,
          stand: 'fehler',
          text:
            `Beschafft über ${rueckfall.stufe} statt ${rueckfall.stattdessen}` +
            (rueckfall.grund ? ` — ${rueckfall.grund}` : '') +
            '. Der Korb kann anders zustande gekommen sein als geplant.',
        })
      }
      if (gefunden.length === 0) {
        berichte.push({ portal, modell, gefunden: 0, behalten: 0, reportordner: null })
        halteFest({ name: schrittname, stand: 'leer', text: 'keine Treffer' })
        continue
      }

      let behalten = gefunden
      if (eingabe.markenfilter !== false) {
        const gefiltert = filtereNachMarke(gefunden, eingabe.subjekt.marke)
        behalten = gefiltert.behalten
        if (gefiltert.entfernt.length > 0) {
          markenfremd.push({
            portal,
            anzahl: gefiltert.entfernt.length,
            erkannt: gefiltert.entfernt.map((e) => e.erkannt),
          })
          await writeFile(
            join(ordner, datei),
            JSON.stringify(
              { items: behalten, ...(beschaffung ? { beschaffungsprotokoll: beschaffung } : {}) },
              null,
              2,
            ),
            'utf8',
          )
        }
      }

      // Der eigene Report dieses Zyklus und dieses Portals — er belegt, wie
      // tief gesucht wurde, und ist für sich vorlegbar.
      const reportordner = `./out/${stufe.name}-${portal.replace('.', '')}`
      let reportPfad: string | null = null
      try {
        await rufeSkript('run-report.js', [parameterdatei, reportordner, `${portal}=${datei}`], {
          cwd: ordner,
          timeoutMs: 10 * 60 * 1000,
        })
        reportPfad = join(ordner, reportordner)
      } catch (fehler) {
        // Ein misslungener Zwischenreport darf den Lauf nicht kosten — die
        // Rohdaten sind da und gehen in den Gesamtkorb.
        protokolliereWarnung('wbw.lauf', 'Ein Zyklus-Report liess sich nicht erzeugen.', {
          portal,
          zyklus: stufe.name,
          grund: fehler instanceof Error ? fehler.message.slice(0, 200) : String(fehler),
        })
      }

      for (const eintrag of behalten) {
        const kennung = kennzeichnung(eintrag)
        if (gesehen.has(kennung)) continue
        gesehen.add(kennung)
        neueAngaben.push(alsAngabe(eintrag, portal))
      }

      rohProPortal.set(portal, vereineRohtreffer(rohProPortal.get(portal) ?? [], behalten))
      berichte.push({
        portal,
        modell,
        gefunden: gefunden.length,
        behalten: behalten.length,
        reportordner: reportPfad,
      })
      halteFest({
        name: schrittname,
        stand: 'fertig',
        text:
          behalten.length === gefunden.length
            ? `${behalten.length} Treffer${modell ? ` · „${modell}"` : ''}`
            : `${behalten.length} von ${gefunden.length} — ${gefunden.length - behalten.length} markenfremd`,
      })
    }

    // --- Prüfung der neu hinzugekommenen Fahrzeuge ------------------------
    if (neueAngaben.length > 0 && eingabe.pruefen !== false) {
      const schrittname = `${stufe.beschriftung}: Inserate prüfen`
      halteFest({ name: schrittname, stand: 'laeuft' })
      const neueUrteile = await pruefeInserate(
        {
          subjekt: {
            marke: eingabe.subjekt.marke,
            modell: eingabe.subjekt.modell,
            baureihe: eingabe.subjekt.baureihe,
            variante: eingabe.subjekt.variante,
            ez: eingabe.subjekt.ez,
            kilometerstand: eingabe.subjekt.mileage,
            leistungKw: eingabe.subjekt.power,
            bauart: eingabe.subjekt.bauart,
          },
          sollAusstattung: eingabe.sollAusstattung,
        },
        neueAngaben,
      )
      for (const [id, urteil] of neueUrteile) urteile.set(id, urteil)
      const offen = [...neueUrteile.values()].filter((u) => u.ungeprueft).length
      halteFest({
        name: schrittname,
        stand: 'fertig',
        text:
          `${neueAngaben.length} geprüft · ${brauchbare(neueUrteile.values())} aufnehmbar` +
          (offen > 0 ? ` · ${offen} ohne Urteil` : ''),
      })
    }

    // --- Korb auswerten ----------------------------------------------------
    /*
      Nach jedem Zyklus, nicht erst am Schluss: die Abbruchbedingung zählte
      bisher die Urteile der KI-Prüfung, und die sagen nichts über den Korb.
      Am 08.09.2026 meldete der Lauf „8 brauchbare Vergleichsfahrzeuge —
      weitere Zyklen nicht nötig", und im Korb stand eines. Zyklus 3 wäre
      genau der Ausweg gewesen und lief nie.
    */
    const auswertungsname = `${stufe.beschriftung}: Korb auswerten`
    halteFest({ name: auswertungsname, stand: 'laeuft' })
    ergebnis = await werteAus(parameterdatei, `./out-${stufe.name}`)
    ergebnisOrdner = `out-${stufe.name}`
    let imKorb = korbgroesse(ergebnis)

    /*
      Weicher Linienfilter. Die Ausstattungslinie filtert im Plugin hart, und
      seit sie aus der DAT vorbelegt wird, greift sie auch: im selben Lauf
      entfernte sie 12 von 15 Fahrzeugen, die die Toleranzen überstanden
      hatten. Fachlich ist ein Highline kein Trendline — aber ein Korb aus
      einem Fahrzeug trägt kein Gutachten. Bleibt zu wenig übrig, wird die
      Linie für die Auswertung fallengelassen und das im Protokoll gesagt.
    */
    let ohneLinie = false
    if (imKorb < MINDESTKORB && eingabe.subjekt.variante.trim()) {
      const zweiter = await werteAus(parameterdatei, `./out-${stufe.name}-ohne-linie`, true)
      const zweiteZahl = korbgroesse(zweiter)
      if (zweiteZahl > imKorb) {
        ergebnis = zweiter
        ergebnisOrdner = `out-${stufe.name}-ohne-linie`
        imKorb = zweiteZahl
        ohneLinie = true
      }
    }

    halteFest({
      name: auswertungsname,
      stand: 'fertig',
      text:
        `${imKorb} im Korb` +
        (ohneLinie
          ? ` — ohne die Linie „${eingabe.subjekt.variante}", mit ihr waren es zu wenige`
          : ''),
    })

    const brauchbarGesamt = brauchbare(urteile.values())
    zyklen.push({
      name: stufe.name,
      beschriftung: stufe.beschriftung,
      toleranzen,
      portale: berichte,
      neu: neueAngaben.length,
      brauchbar: brauchbarGesamt,
      imKorb,
    })

    if (genugGefunden(imKorb, eingabe.mindestzahl)) {
      halteFest({
        name: 'Suche beendet',
        stand: 'fertig',
        text: `${imKorb} Fahrzeuge im Korb — weitere Zyklen nicht nötig`,
      })
      break
    }
  }

  if (rohProPortal.size === 0) {
    throw new Error('Kein Portal hat Treffer geliefert. Der Lauf wurde abgebrochen.')
  }

  if (!ergebnis) {
    throw new Error('Die Auswertung des Gesamtkorbs ist nicht zustande gekommen.')
  }

  return {
    ordner,
    ergebnis,
    markenfremd,
    rueckfaelle,
    protokoll,
    zyklen,
    urteile: Object.fromEntries(urteile),
    dateien: {
      html: join(ordner, ergebnisOrdner, 'WBW-Vergleichsfahrzeuge.html'),
      pdf: join(ordner, ergebnisOrdner, 'WBW-Vergleichsfahrzeuge.pdf'),
      linkliste: join(ordner, ergebnisOrdner, 'Linkliste.md'),
    },
  }
}
