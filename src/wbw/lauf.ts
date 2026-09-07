import 'server-only'
import { execFile } from 'node:child_process'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { filtereNachMarke } from './markenfilter'
import type { Bauart } from './karosserie'

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

export interface WbwEingabe {
  subjekt: WbwSubjekt
  modellProPortal: ModellProPortal
  plz: string
  sollAusstattung: string[]
  getriebe?: 'Automatik' | 'Manuell'
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
  protokoll: Schritt[]
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
async function rufeSkript(
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

/**
 * Führt den ganzen Lauf aus. `melde` bekommt nach jedem Schritt den Stand —
 * daran hängt die Fortschrittsanzeige.
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

  // --- Parameter -----------------------------------------------------------
  const params = {
    subject: {
      marke: eingabe.subjekt.marke,
      // Fürs Protokoll der Name aus autoiXpert; gesucht wird je Portal mit
      // dem gewählten Modellnamen (siehe `setzeModelle`).
      modell: eingabe.modellProPortal.kleinanzeigen ?? eingabe.subjekt.modell,
      variante: eingabe.subjekt.variante,
      ez: eingabe.subjekt.ez,
      mileage: eingabe.subjekt.mileage,
      power: eingabe.subjekt.power,
    },
    sollAusstattung: eingabe.sollAusstattung,
    plz: eingabe.plz,
    zentrum,
    // Die Bauart kommt aus `car.shape` und muss nicht mehr aus dem Korb
    // erraten werden.
    ...(eingabe.subjekt.bauart ? { karosserie: eingabe.subjekt.bauart } : {}),
    radiusKm: eingabe.radiusKm,
    kmToleranz: eingabe.kmToleranz,
    ezToleranzJahre: eingabe.ezToleranzJahre,
    leistungToleranzKw: eingabe.leistungToleranzKw,
    ...(eingabe.getriebe ? { getriebe: eingabe.getriebe } : {}),
    ...(eingabe.tueren ? { tueren: eingabe.tueren } : {}),
    maxItemsProPortal: eingabe.maxItemsProPortal,
    kleinanzeigenLocId: null,
    wbwOpts: { eurProKm: 0.1, eurProEzMonat: 120 },
  }
  await writeFile(join(ordner, 'params.json'), JSON.stringify(params, null, 2), 'utf8')

  // --- Such-Eingaben -------------------------------------------------------
  halteFest({ name: 'Such-Eingaben erzeugen', stand: 'laeuft' })
  await rufeSkript('build-search-urls.js', ['params.json', 'search-inputs.json'], {
    cwd: ordner,
    timeoutMs: 60_000,
  })
  const eingaben = JSON.parse(
    await readFile(join(ordner, 'search-inputs.json'), 'utf8'),
  ) as Record<string, unknown>
  await writeFile(
    join(ordner, 'search-inputs.json'),
    JSON.stringify(setzeModelle(eingaben, eingabe.modellProPortal), null, 2),
    'utf8',
  )
  halteFest({ name: 'Such-Eingaben erzeugen', stand: 'fertig' })

  // --- Beschaffung je Portal ----------------------------------------------
  const markenfremd: WbwErgebnis['markenfremd'] = []
  const quellen: string[] = []

  for (const portal of eingabe.portale) {
    const datei = ROHDATEI[portal]
    halteFest({ name: `${portal} durchsuchen`, stand: 'laeuft' })
    try {
      await rufeSkript('fetch-portal.js', [portal, 'search-inputs.json', datei], {
        cwd: ordner,
        umgebung: eingabe.umgebung,
      })
    } catch (fehler) {
      halteFest({
        name: `${portal} durchsuchen`,
        stand: 'fehler',
        text: fehler instanceof Error ? fehler.message.slice(0, 300) : String(fehler),
      })
      continue
    }

    const roh = JSON.parse(await readFile(join(ordner, datei), 'utf8')) as {
      items?: Record<string, unknown>[]
    }
    const gefunden = roh.items ?? []

    if (gefunden.length === 0) {
      halteFest({ name: `${portal} durchsuchen`, stand: 'leer', text: 'keine Treffer' })
      continue
    }

    // Markenfremdes hier aussortieren, nicht erst im Korb: der Trichter des
    // Reports zeigt sonst Zahlen, die niemand nachvollziehen kann.
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
          JSON.stringify({ ...roh, items: behalten }, null, 2),
          'utf8',
        )
      }
    }

    quellen.push(`${portal}=${datei}`)
    halteFest({
      name: `${portal} durchsuchen`,
      stand: 'fertig',
      text:
        behalten.length === gefunden.length
          ? `${behalten.length} Treffer`
          : `${behalten.length} von ${gefunden.length} Treffern — ${gefunden.length - behalten.length} markenfremd`,
    })
  }

  if (quellen.length === 0) {
    throw new Error('Kein Portal hat Treffer geliefert. Der Lauf wurde abgebrochen.')
  }

  // --- Auswerten und Report ------------------------------------------------
  halteFest({ name: 'Auswerten und Report erzeugen', stand: 'laeuft' })
  await rufeSkript('run-report.js', ['params.json', './out', ...quellen], {
    cwd: ordner,
    timeoutMs: 10 * 60 * 1000,
  })
  const ergebnis = JSON.parse(await readFile(join(ordner, 'out', 'result.json'), 'utf8'))
  halteFest({ name: 'Auswerten und Report erzeugen', stand: 'fertig' })

  return {
    ordner,
    ergebnis,
    markenfremd,
    protokoll,
    dateien: {
      html: join(ordner, 'out', 'WBW-Vergleichsfahrzeuge.html'),
      pdf: join(ordner, 'out', 'WBW-Vergleichsfahrzeuge.pdf'),
      linkliste: join(ordner, 'out', 'Linkliste.md'),
    },
  }
}
