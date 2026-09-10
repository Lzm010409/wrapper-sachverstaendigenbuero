/**
 * Parser für die bestehenden Markdown-Referenzdateien der Argumentbibliothek.
 *
 * Das Format ist in `skills/stellungnahme-erstellen/references/` vorgegeben:
 *
 *   ### 1.2 Halterung Stoßfänger
 *   **Typische Begründung:** …
 *   **Gegenargument:**
 *   > …
 *   **Hinweise:** …
 *   **Ergänzung – Titel:** …
 *   **Varianten je nach Bauteilart:**
 *   - *Bezeichnung:* "…"
 *
 * Der Parser bleibt bewusst frei von Datenbank- und Netzzugriffen, damit er
 * gegen die echten Dateien getestet werden kann.
 */

export type Bereich = 'kalkulation' | 'wertminderung' | 'wbw' | 'restwert' | 'sonderfall'
export type PlatzhalterArt = 'wert' | 'regieanweisung'

export interface GeparsteVariante {
  bezeichnung: string
  text: string
}

export interface GeparsteErgaenzung {
  titel: string
  text: string
}

export interface GeparsterPlatzhalter {
  schluessel: string
  art: PlatzhalterArt
}

export interface GeparsterBeleg {
  gericht: string
  aktenzeichen: string | null
  rohtext: string
}

export interface GeparsterEintrag {
  nummer: string
  titel: string
  bereich: Bereich
  abschnitt: string
  typischeBegruendung: string | null
  /** Leer, wenn der Eintrag stattdessen nur eine Handlungsanweisung trägt. */
  gegenargument: string
  /**
   * Handlungsanweisung statt fertigem Text — so führen die
   * Wertminderungseinträge 3 und 4 ihre Behandlung („wird in der Praxis
   * teils nicht bestritten", „andernfalls Argument 1 verwenden").
   */
  vorgehen: string | null
  hinweise: string | null
  haeufigkeitText: string | null
  varianten: GeparsteVariante[]
  ergaenzungen: GeparsteErgaenzung[]
  platzhalter: GeparsterPlatzhalter[]
  vorbedingungsKandidaten: string[]
  belege: GeparsterBeleg[]
  quelldatei: string
  /** Auffälligkeiten, die im Migrationsbericht landen. */
  warnungen: string[]
}

export interface DateiKonfiguration {
  datei: string
  bereich: Bereich
  /** Auf welcher Überschriftenebene die Einträge stehen: 2 = `##`, 3 = `###`. */
  eintragEbene: 2 | 3
}

/**
 * Die vier Referenzdateien unterscheiden sich in der Überschriftenebene:
 * `argumente-kalkulation.md` gliedert in Abschnitte (`##`) mit Einträgen
 * darunter (`###`), `argumente-wertminderung.md` führt die Einträge direkt
 * auf `##`. Deshalb ist die Ebene konfigurierbar und nicht geraten.
 */
export const STANDARD_DATEIEN: DateiKonfiguration[] = [
  { datei: 'argumente-kalkulation.md', bereich: 'kalkulation', eintragEbene: 3 },
  { datei: 'argumente-wertminderung.md', bereich: 'wertminderung', eintragEbene: 2 },
  { datei: 'argumente-wbw-bausteine.md', bereich: 'wbw', eintragEbene: 3 },
]

/**
 * `argumente-wbw.md` wird bewusst nicht als Argumenteinträge migriert: die
 * Datei enthält zwei Szenario-Vorlagen mit Einleitungssatz, Tabellenblock und
 * Abschlussformel, keine Kürzungsgrund/Gegenargument-Paare. Der
 * Migrationsbericht weist sie ausdrücklich als „nicht migriert" aus, damit sie
 * nicht still unter den Tisch fällt.
 *
 * Das war lange die einzige WBW-Datei — und damit stand der Bereich `wbw` in
 * der Bibliothek leer da, obwohl das Büro sehr wohl WBW-Argumente verwendet.
 * Sie lagen nur nicht in dieser Datei, sondern in fünf vollständigen
 * Schreiben im Textbestand. Daraus ist `argumente-wbw-bausteine.md`
 * entstanden; die Szenario-Datei bleibt daneben stehen, weil sie etwas
 * anderes leistet: sie beschreibt den Aufbau des Schreibens, nicht die
 * einzelnen Argumente.
 */
export const NICHT_MIGRIERT = [
  {
    datei: 'argumente-wbw.md',
    grund:
      'Szenario-Vorlagen für den Aufbau des Schreibens statt Argumenteinträge — ' +
      'die WBW-Argumente selbst stehen in argumente-wbw-bausteine.md.',
  },
] as const

/** Wörter, die auf eine zu bestätigende Tatsachenvoraussetzung hindeuten. */
const VORBEDINGUNG_SIGNALE = [
  'sofern',
  'falls vorhanden',
  'nur wenn',
  'setzt voraus',
  'vorausgesetzt',
  'lückenlos',
  'scheckheft',
  'eigene nachfrage',
  'sofern verfügbar',
  'falls verfügbar',
]

const GERICHT_MUSTER =
  /\b(BGH|BVerfG|OLG|LG|AG|KG)\s+([A-ZÄÖÜ][a-zäöüßA-ZÄÖÜ.-]*(?:\s[A-ZÄÖÜ][a-zäöüß.-]+)?)/g

/**
 * Trennt einen Klammerausdruck in einzusetzenden Wert und Arbeitsauftrag.
 *
 * `[Betrag]` ist ein Wert. `[Mit Screenshots aus dem Kalkulationsprogramm
 * belegen, die die Behauptung widerlegen.]` ist eine Regieanweisung — sie
 * beschreibt eine Handlung und ist erkennbar an Länge und Satzbau.
 */
export function klassifiziereKlammerausdruck(inhalt: string): PlatzhalterArt {
  const t = inhalt.trim()
  if (t.length > 45) return 'regieanweisung'
  // Ein Satzzeichen mitten im Ausdruck trennt zwei Sätze. Abkürzungen wie
  // „o.ä." und „z.B." haben keinen Leerraum dahinter und zählen nicht.
  if (/[.!?]\s+\S/.test(t)) return 'regieanweisung'
  // Mehr als vier Wörter deutet auf einen Satz statt auf ein Feld hin.
  if (t.split(/\s+/).length > 4) return 'regieanweisung'
  return 'wert'
}

/** Sammelt alle Klammerausdrücke eines Textes, ohne Dubletten. */
export function findePlatzhalter(...texte: string[]): GeparsterPlatzhalter[] {
  const gefunden = new Map<string, GeparsterPlatzhalter>()
  for (const text of texte) {
    // Markdown-Links `[Titel](url)` sind keine Platzhalter.
    const bereinigt = text.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    for (const treffer of bereinigt.matchAll(/\[([^\][]+)\]/g)) {
      const inhalt = treffer[1]
      if (!inhalt) continue
      const schluessel = inhalt.trim()
      if (!schluessel || gefunden.has(schluessel)) continue
      gefunden.set(schluessel, {
        schluessel,
        art: klassifiziereKlammerausdruck(schluessel),
      })
    }
  }
  return [...gefunden.values()]
}

/** Findet Gerichtszitate, damit sie als unverifizierte Belege angelegt werden. */
export function findeBelege(...texte: string[]): GeparsterBeleg[] {
  const gefunden = new Map<string, GeparsterBeleg>()
  for (const text of texte) {
    for (const treffer of text.matchAll(GERICHT_MUSTER)) {
      const rohtext = treffer[0].trim().replace(/[.,;]$/, '')
      if (gefunden.has(rohtext)) continue
      // Aktenzeichen stehen häufig direkt hinter dem Gericht.
      const rest = text.slice((treffer.index ?? 0) + treffer[0].length, (treffer.index ?? 0) + treffer[0].length + 60)
      const az = rest.match(/\b(?:Az\.?:?\s*)?(\d{1,3}\s?[A-Z]{1,3}\s?\d{1,5}\/\d{2,4})/)
      gefunden.set(rohtext, {
        gericht: rohtext,
        aktenzeichen: az?.[1]?.trim() ?? null,
        rohtext,
      })
    }
  }
  return [...gefunden.values()]
}

function findeVorbedingungsKandidaten(...texte: string[]): string[] {
  const treffer: string[] = []
  for (const text of texte) {
    for (const satz of text.split(/(?<=[.!?])\s+/)) {
      const klein = satz.toLowerCase()
      if (VORBEDINGUNG_SIGNALE.some((s) => klein.includes(s))) {
        const gekuerzt = satz.trim()
        if (gekuerzt.length > 10 && !treffer.includes(gekuerzt)) treffer.push(gekuerzt)
      }
    }
  }
  return treffer
}

/** Entfernt die Zitatzeichen eines Markdown-Blockzitats. */
function entferneZitatzeichen(text: string): string {
  return text
    .split('\n')
    .map((z) => z.replace(/^>\s?/, ''))
    .join('\n')
    .trim()
}

/**
 * Zerlegt den Rumpf eines Eintrags in seine fettgedruckten Felder.
 * Rückgabe ist eine Liste, weil `**Ergänzung – …**` mehrfach vorkommen kann.
 */
function teileInFelder(rumpf: string): { label: string; inhalt: string }[] {
  const felder: { label: string; inhalt: string }[] = []
  const muster = /^\*\*([^*]+?):?\*\*[ \t]*/gm
  const treffer = [...rumpf.matchAll(muster)]

  if (treffer.length === 0) {
    if (rumpf.trim()) felder.push({ label: '', inhalt: rumpf.trim() })
    return felder
  }

  // Text vor dem ersten Feld gehört zu keinem Label (selten, aber möglich).
  const vorspann = rumpf.slice(0, treffer[0]!.index).trim()
  if (vorspann) felder.push({ label: '', inhalt: vorspann })

  treffer.forEach((t, i) => {
    const start = (t.index ?? 0) + t[0].length
    const ende = i + 1 < treffer.length ? treffer[i + 1]!.index : rumpf.length
    felder.push({
      label: (t[1] ?? '').trim(),
      inhalt: rumpf.slice(start, ende).trim(),
    })
  })

  return felder
}

/** Liest eine Variantenliste vom Format `- *Bezeichnung:* Text`. */
function parseVarianten(inhalt: string): GeparsteVariante[] {
  const varianten: GeparsteVariante[] = []
  for (const zeile of inhalt.split('\n')) {
    const t = zeile.trim()
    if (!t.startsWith('-')) continue
    const ohneStrich = t.replace(/^-\s*/, '')
    const m = ohneStrich.match(/^\*([^*]+?):?\*\s*(.*)$/)
    if (m) {
      varianten.push({
        bezeichnung: (m[1] ?? '').trim().replace(/:$/, ''),
        text: (m[2] ?? '').trim().replace(/^"|"$/g, '').replace(/^„|"$/g, ''),
      })
    } else if (ohneStrich) {
      varianten.push({ bezeichnung: '', text: ohneStrich })
    }
  }
  return varianten
}

/** Zerlegt eine Überschrift wie `1.2 Halterung Stoßfänger` in Nummer und Titel. */
export function teileUeberschrift(text: string): { nummer: string; titel: string } {
  // Erlaubt „1", „1.2" und die Sonderfall-Notation „B.7".
  const m = text.trim().match(/^((?:[A-Z]\.)?\d+(?:\.\d+)*)\.?\s+(.*)$/)
  if (m) return { nummer: m[1] ?? '', titel: (m[2] ?? '').trim() }
  return { nummer: '', titel: text.trim() }
}

/**
 * Parst eine komplette Referenzdatei.
 *
 * Warnungen werden gesammelt statt geworfen: eine unerwartete Struktur soll
 * im Migrationsbericht sichtbar werden, nicht den ganzen Lauf abbrechen.
 */
export function parseReferenzdatei(
  inhalt: string,
  konfig: DateiKonfiguration,
): GeparsterEintrag[] {
  const zeilen = inhalt.split('\n')
  const eintraege: GeparsterEintrag[] = []

  let aktuellerAbschnitt = ''
  let offeneUeberschrift: string | null = null
  let rumpf: string[] = []

  const abschluss = () => {
    if (offeneUeberschrift === null) return
    const eintrag = baueEintrag(offeneUeberschrift, rumpf.join('\n'), aktuellerAbschnitt, konfig)
    if (eintrag) eintraege.push(eintrag)
    offeneUeberschrift = null
    rumpf = []
  }

  const eintragPraefix = '#'.repeat(konfig.eintragEbene) + ' '
  const abschnittPraefix = '## '

  for (const zeile of zeilen) {
    if (zeile.startsWith(eintragPraefix)) {
      abschluss()
      offeneUeberschrift = zeile.slice(eintragPraefix.length).trim()
      if (konfig.eintragEbene === 2) aktuellerAbschnitt = offeneUeberschrift
      continue
    }

    // Bei dreistufigen Dateien merkt sich der Parser den umgebenden Abschnitt.
    if (konfig.eintragEbene === 3 && zeile.startsWith(abschnittPraefix) && !zeile.startsWith('### ')) {
      abschluss()
      aktuellerAbschnitt = zeile.slice(abschnittPraefix.length).trim()
      continue
    }

    // Eine Überschrift höherer Ordnung beendet den laufenden Eintrag.
    if (zeile.startsWith('# ')) {
      abschluss()
      continue
    }

    if (offeneUeberschrift !== null) rumpf.push(zeile)
  }

  abschluss()
  return eintraege
}

function baueEintrag(
  ueberschrift: string,
  rumpfText: string,
  abschnitt: string,
  konfig: DateiKonfiguration,
): GeparsterEintrag | null {
  const { nummer, titel } = teileUeberschrift(ueberschrift)
  const warnungen: string[] = []

  if (!nummer) warnungen.push('Keine Gliederungsnummer in der Überschrift erkannt.')

  const felder = teileInFelder(rumpfText)

  let typischeBegruendung: string | null = null
  let gegenargument = ''
  let vorgehen: string | null = null
  let hinweise: string | null = null
  const varianten: GeparsteVariante[] = []
  const ergaenzungen: GeparsteErgaenzung[] = []
  const freitexte: string[] = []

  for (const { label, inhalt } of felder) {
    const l = label.toLowerCase()

    if (l.startsWith('typische begründung')) {
      typischeBegruendung = inhalt
    } else if (l.startsWith('gegenargument')) {
      // Mehrere Gegenargument-Blöcke (z.B. „(allgemein)") werden verbunden.
      const text = entferneZitatzeichen(inhalt)
      gegenargument = gegenargument ? `${gegenargument}\n\n${text}` : text
    } else if (l.startsWith('vorgehen')) {
      vorgehen = vorgehen ? `${vorgehen}\n\n${inhalt}` : inhalt
    } else if (l.startsWith('hinweis')) {
      hinweise = hinweise ? `${hinweise}\n\n${inhalt}` : inhalt
    } else if (l.startsWith('ergänzung')) {
      ergaenzungen.push({
        titel: label.replace(/^Ergänzung\s*[–-]\s*/i, '').trim() || 'Ergänzung',
        text: entferneZitatzeichen(inhalt),
      })
    } else if (l.startsWith('varianten')) {
      // Aufzählung mehrerer Varianten unter einem Sammellabel.
      varianten.push(...parseVarianten(inhalt))
    } else if (l.startsWith('variante')) {
      // Einzelne, benannte Variante — z.B. „**Variante Motorhaube …:**".
      varianten.push({
        bezeichnung: label.replace(/^Variante\s*[–-]?\s*/i, '').trim() || 'Variante',
        text: entferneZitatzeichen(inhalt),
      })
    } else if (label === '') {
      freitexte.push(inhalt)
    } else {
      // Die Bibliothek kennt weitere benannte Zusatzblöcke („Sonderfall –",
      // „Rechtsrahmen", „Technischer Hintergrund", „Berechnungsbeispiel").
      // Das ist der Normalfall und keine Auffälligkeit — sie werden als
      // zuschaltbare Ergänzungen übernommen.
      ergaenzungen.push({ titel: label, text: entferneZitatzeichen(inhalt) })
      if (label.length > 120) {
        warnungen.push(`Ungewöhnlich langes Feldlabel — bitte ansehen: „${label.slice(0, 80)}…"`)
      }
    }
  }

  // Einige Einträge (z.B. 1.4) formulieren das Gegenargument als Fließtext
  // ohne eigenes Label. Dann tritt der Freitext an seine Stelle.
  if (!gegenargument && freitexte.length > 0) {
    gegenargument = entferneZitatzeichen(freitexte.join('\n\n'))
    warnungen.push('Gegenargument ohne Label erkannt — aus dem Fließtext übernommen.')
  }

  // Ein Eintrag ohne Gegenargument ist zulässig, solange er ein Vorgehen
  // beschreibt — nur wenn beides fehlt, ist wirklich etwas schiefgelaufen.
  if (!gegenargument && !vorgehen) {
    warnungen.push('Weder Gegenargument noch Vorgehen gefunden.')
  }

  const variantenTexte = varianten.map((v) => v.text)
  const ergaenzungsTexte = ergaenzungen.map((e) => e.text)

  return {
    nummer,
    titel,
    bereich: konfig.bereich,
    abschnitt: abschnitt || titel,
    typischeBegruendung,
    gegenargument,
    vorgehen,
    hinweise,
    haeufigkeitText: hinweise ? extrahiereHaeufigkeit(hinweise) : null,
    varianten,
    ergaenzungen,
    platzhalter: findePlatzhalter(gegenargument, ...variantenTexte, ...ergaenzungsTexte),
    vorbedingungsKandidaten: findeVorbedingungsKandidaten(
      gegenargument,
      hinweise ?? '',
      ...variantenTexte,
    ),
    belege: findeBelege(gegenargument, ...variantenTexte, ...ergaenzungsTexte),
    quelldatei: konfig.datei,
    warnungen,
  }
}

/**
 * Die Sonderfall-Datei ist anders gebaut als die Argumentdateien:
 *
 *   Teil A — ein wiederverwendbarer Vorbemerkungsblock mit einer
 *            ausführlicheren Variante darunter (`### Variante …`)
 *   Teil B — acht strukturelle Regeln B.1 bis B.8
 *
 * Würde man sie mit `parseReferenzdatei` lesen, ginge der Vorbemerkungstext
 * selbst verloren, weil er auf `##`-Ebene steht und die Regeln auf `###`.
 * Deshalb ein eigener Weg statt einer verbogenen Konfiguration.
 */
export function parseSonderfaelle(inhalt: string, datei: string): GeparsterEintrag[] {
  const zeilen = inhalt.split('\n')
  const eintraege: GeparsterEintrag[] = []

  let teilAText: string[] = []
  /*
    Alle Fassungen des Vorbemerkungsblocks, nicht nur eine.

    Hier stand ein einzelner Platz, der beim zweiten `###` unter Teil A
    stillschweigend überschrieben wurde — die vorherige Fassung fiel ersatzlos
    aus der Bibliothek, ohne Warnung. Aufgefallen ist es erst, als eine dritte
    Fassung dazukam. Eine Liste kann nichts verlieren.
  */
  const teilAVarianten: { bezeichnung: string; text: string[] }[] = []
  let inTeilA = false

  let offeneRegel: string | null = null
  let regelRumpf: string[] = []

  const regelAbschluss = () => {
    if (offeneRegel === null) return
    const { nummer, titel } = teileUeberschrift(offeneRegel)
    const text = regelRumpf.join('\n').trim()
    eintraege.push({
      nummer,
      titel,
      bereich: 'sonderfall',
      abschnitt: 'Teil B: Strukturelle Sonderfälle',
      typischeBegruendung: null,
      gegenargument: '',
      // Sonderfälle beschreiben eine Prüfhandlung, keinen fertigen Absatz.
      vorgehen: text,
      hinweise: null,
      haeufigkeitText: null,
      varianten: [],
      ergaenzungen: [],
      platzhalter: findePlatzhalter(text),
      vorbedingungsKandidaten: [],
      belege: findeBelege(text),
      quelldatei: datei,
      warnungen: nummer ? [] : ['Keine Gliederungsnummer in der Überschrift erkannt.'],
    })
    offeneRegel = null
    regelRumpf = []
  }

  for (const zeile of zeilen) {
    if (/^## Teil A/i.test(zeile)) {
      inTeilA = true
      continue
    }
    if (/^## Teil B/i.test(zeile)) {
      inTeilA = false
      continue
    }

    if (inTeilA) {
      if (zeile.startsWith('### ')) {
        teilAVarianten.push({ bezeichnung: zeile.slice(4).trim(), text: [] })
        continue
      }
      const offen = teilAVarianten.at(-1)
      if (offen) offen.text.push(zeile)
      else teilAText.push(zeile)
      continue
    }

    if (zeile.startsWith('### ')) {
      regelAbschluss()
      offeneRegel = zeile.slice(4).trim()
      continue
    }
    if (zeile.startsWith('## ') || zeile.startsWith('# ')) {
      regelAbschluss()
      continue
    }
    if (offeneRegel !== null) regelRumpf.push(zeile)
  }

  regelAbschluss()

  const vorbemerkung = entferneZitatzeichen(teilAText.join('\n')).trim()
  if (vorbemerkung) {
    const varianten = teilAVarianten
      .map((v) => ({
        bezeichnung: v.bezeichnung,
        text: entferneZitatzeichen(v.text.join('\n')).trim(),
      }))
      .filter((v) => v.text)
    const variantenTexte = varianten.map((v) => v.text)
    eintraege.unshift({
      nummer: 'A',
      titel: 'Prüfberichte allgemein — wiederverwendbarer Einleitungsblock',
      bereich: 'sonderfall',
      abschnitt: 'Teil A: Vorbemerkung',
      typischeBegruendung: null,
      gegenargument: vorbemerkung,
      vorgehen: null,
      hinweise: null,
      haeufigkeitText: null,
      varianten,
      ergaenzungen: [],
      platzhalter: findePlatzhalter(vorbemerkung, ...variantenTexte),
      vorbedingungsKandidaten: [],
      belege: findeBelege(vorbemerkung, ...variantenTexte),
      quelldatei: datei,
      warnungen: [],
    })
  }

  return eintraege
}

/** Zieht Angaben wie „in über 10 Fällen" aus den Hinweisen. */
export function extrahiereHaeufigkeit(hinweise: string): string | null {
  const m = hinweise.match(
    /((?:sehr häufige|häufigste|eine der häufigsten|in (?:über|mehr als) \d+ Fällen|in nahezu jedem)[^.;]*)/i,
  )
  return m?.[1]?.trim() ?? null
}
