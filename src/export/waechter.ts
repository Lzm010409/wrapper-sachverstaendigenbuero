/**
 * Die vier Prüfungen vor dem Export (Konzept R1 bis R4).
 *
 * Alle vier sind deterministisch und laufen ohne Modellaufruf. Das ist
 * Absicht: eine Sperre, die selbst raten muss, ist keine Sperre. Sie melden
 * und begründen, sie formulieren nichts um — die Entscheidung bleibt beim
 * Sachverständigen.
 */

export type Schwere = 'sperrt' | 'warnt'

export interface Befund {
  kennung: 'R1' | 'R2' | 'R3' | 'R4'
  schwere: Schwere
  titel: string
  /** Wo es klemmt — Positionsnummer oder „Dokument". */
  stelle: string
  text: string
  /**
   * Der beanstandete Wortlaut, buchstabengetreu.
   *
   * Damit findet die Oberfläche die Stelle im Brief wieder und markiert
   * sie. Ohne ihn wäre ein Befund eine Behauptung, die der Schreibende
   * selbst suchen muss.
   */
  fundstelle?: string
  /** Abschnitt, in dem der Befund steckt — für die Anmerkung am Rand. */
  positionId?: string | null
}

export interface PruefBaustein {
  positionNummer: number
  positionBezeichnung: string
  text: string
  /** Interne Hinweise des zugrunde liegenden Bibliothekseintrags. */
  interneHinweise?: string | null
  positionId?: string | null
}

export interface PruefEingabe {
  bausteine: PruefBaustein[]
  /** Alle Zahlen, die im Fall belegt sind: Beträge, Laufleistung, Daten. */
  belegteZahlen: string[]
  /** Der vollständige Text, der exportiert werden soll. */
  gesamttext: string
}

/* ------------------------------------------------------------------ *
 * R1 — Offene Platzhalter und Regieanweisungen
 * ------------------------------------------------------------------ */

/**
 * Findet Klammerausdrücke, die im fertigen Schreiben nichts zu suchen haben.
 *
 * Das grösste tatsächliche Risiko ist nicht die erfundene Fundstelle,
 * sondern der Bibliotheks-Beispielwert, der stehen bleibt: ein fremder
 * Eurobetrag, ein falsches „links" statt „rechts".
 */
export function findeOffeneKlammern(text: string): string[] {
  const gefunden = new Set<string>()
  // Markdown-Links sind keine Platzhalter.
  const bereinigt = text.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
  for (const treffer of bereinigt.matchAll(/\[([^\][]+)\]/g)) {
    const inhalt = treffer[1]?.trim()
    if (inhalt) gefunden.add(inhalt)
  }
  return [...gefunden]
}

function pruefeR1(eingabe: PruefEingabe): Befund[] {
  const befunde: Befund[] = []
  for (const b of eingabe.bausteine) {
    // Je Platzhalter ein Befund: nur so lässt sich jeder einzeln im Brief
    // markieren und abarbeiten.
    for (const offen of findeOffeneKlammern(b.text)) {
      befunde.push({
        kennung: 'R1',
        schwere: 'sperrt',
        titel: 'Offener Platzhalter',
        stelle: `Position ${b.positionNummer} — ${b.positionBezeichnung}`,
        fundstelle: `[${offen}]`,
        positionId: b.positionId ?? null,
        text:
          `Noch nicht ersetzt: [${offen}]. Ein stehen gebliebener Beispielwert aus der ` +
          'Bibliothek ist im versandten Schreiben schlimmer als eine Rückfrage.',
      })
    }
  }
  return befunde
}

/* ------------------------------------------------------------------ *
 * R4 — Interne Hinweise im Dokument
 * ------------------------------------------------------------------ */

/**
 * Wortlaut, der aus den internen Feldnotizen der Bibliothek stammt.
 *
 * Sätze wie „Funktioniert besonders gut, wenn der Kürzungsbetrag klein ist"
 * oder Verweise auf frühere Akten dürfen niemals nach aussen. Auf
 * Datenmodellebene sind Hinweise bereits vom Exportpfad getrennt; diese
 * Prüfung fängt ab, was auf anderem Weg hineingerät — etwa durch Einfügen
 * von Hand oder eine Ausformulierung, die zu viel übernommen hat.
 */
const INTERNE_SIGNALE = [
  'funktioniert besonders gut',
  'sehr häufige position',
  'in über',
  'in mehr als',
  'eine der häufigsten',
  'im zweifel den nutzer',
  'nutzer fragen',
  'beim nutzer',
  'siehe eintrag',
  'vgl. fall',
  'beobachtet in fall',
  'breit anwendbar',
]

function pruefeR4(eingabe: PruefEingabe): Befund[] {
  const befunde: Befund[] = []

  for (const b of eingabe.bausteine) {
    const klein = b.text.toLowerCase()

    for (const signal of INTERNE_SIGNALE) {
      if (klein.includes(signal)) {
        befunde.push({
          kennung: 'R4',
          schwere: 'sperrt',
          titel: 'Interne Notiz im Text',
          stelle: `Position ${b.positionNummer} — ${b.positionBezeichnung}`,
          fundstelle: b.text.slice(klein.indexOf(signal), klein.indexOf(signal) + signal.length),
          positionId: b.positionId ?? null,
          text: `Der Text enthält „${signal}" — das klingt nach einer Feldnotiz und gehört nicht in ein versandtes Schreiben.`,
        })
        break
      }
    }

    // Wörtlich übernommene Hinweise sind der eindeutigste Fall.
    if (b.interneHinweise) {
      const satz = b.interneHinweise
        .split(/(?<=[.!?])\s+/)
        .map((s) => s.trim())
        .filter((s) => s.length > 30)
        .find((s) => b.text.includes(s))
      if (satz) {
        befunde.push({
          kennung: 'R4',
          schwere: 'sperrt',
          titel: 'Interner Hinweis wörtlich übernommen',
          stelle: `Position ${b.positionNummer} — ${b.positionBezeichnung}`,
          fundstelle: satz,
          positionId: b.positionId ?? null,
          text: `Aus den internen Hinweisen übernommen: „${satz.slice(0, 90)}…"`,
        })
      }
    }
  }

  return befunde
}

/* ------------------------------------------------------------------ *
 * R2a — Zahlen, die nicht belegt sind
 * ------------------------------------------------------------------ */

/** Zieht Geldbeträge und andere Zahlen aus einem Text. */
export function findeZahlen(text: string): string[] {
  const gefunden = new Set<string>()
  // Deutsche Schreibweise: 1.234,56 — aber auch 179,75 oder 22.
  for (const treffer of text.matchAll(/\b\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?\b|\b\d+(?:,\d{1,2})\b/g)) {
    gefunden.add(treffer[0])
  }
  return [...gefunden]
}

/**
 * Bringt eine Zahl auf eine Vergleichsform.
 *
 * Der Punkt ist zweideutig: in „2.983,64" trennt er Tausender, in „2983.64"
 * die Nachkommastellen. Wer ihn immer entfernt, macht aus einem bereits
 * normalisierten Betrag die hundertfache Summe — und der Zahlen-Wächter
 * schlägt dann bei genau den Beträgen an, die belegt sind.
 */
export function normalisiereZahl(zahl: string): string {
  let roh = zahl.trim()

  if (roh.includes(',')) {
    // Deutsche Schreibweise: Punkt trennt Tausender, Komma die Nachkommastellen.
    roh = roh.replace(/\./g, '').replace(',', '.')
  } else if (/^\d{1,3}(?:\.\d{3})+$/.test(roh)) {
    // Reine Tausendergliederung ohne Nachkommastellen, etwa „1.234".
    roh = roh.replace(/\./g, '')
  }
  // Sonst bleibt der Punkt, was er ist: das Dezimaltrennzeichen.

  const wert = Number(roh)
  return Number.isNaN(wert) ? zahl : String(wert)
}

/**
 * Zahlen, die klein und alltäglich sind, taugen nicht als Prüfgegenstand:
 * Aufzählungen, Prozentangaben in Textbausteinen, Jahreszahlen.
 */
function istPruefenswert(zahl: string): boolean {
  const wert = Number(normalisiereZahl(zahl))
  if (Number.isNaN(wert)) return false
  // Unter 10 sind es fast immer Aufzählungen oder Stückzahlen.
  if (wert < 10) return false
  // Jahreszahlen prüft der Zahlen-Wächter nicht.
  if (Number.isInteger(wert) && wert >= 1900 && wert <= 2100) return false
  return true
}

function pruefeZahlen(eingabe: PruefEingabe): Befund[] {
  const belegt = new Set(eingabe.belegteZahlen.map(normalisiereZahl))
  const befunde: Befund[] = []

  for (const b of eingabe.bausteine) {
    const unbelegte = findeZahlen(b.text)
      .filter(istPruefenswert)
      .filter((z) => !belegt.has(normalisiereZahl(z)))

    if (unbelegte.length === 0) continue

    befunde.push({
      kennung: 'R2',
      schwere: 'warnt',
      titel: 'Zahl ohne Beleg im Fall',
      stelle: `Position ${b.positionNummer} — ${b.positionBezeichnung}`,
      fundstelle: unbelegte[0],
      positionId: b.positionId ?? null,
      text:
        `Im Text stehen Zahlen, die weder in den Falldaten noch in der Kürzungstabelle ` +
        `vorkommen: ${unbelegte.slice(0, 6).join(', ')}. Bitte prüfen — Beispielwerte aus ` +
        'der Bibliothek sehen echten Beträgen zum Verwechseln ähnlich.',
    })
  }

  return befunde
}

/* ------------------------------------------------------------------ *
 * R3 — Die RDG-Grenze
 * ------------------------------------------------------------------ */

/**
 * Formulierungen, die von der technischen Feststellung in die
 * Rechtsberatung hinüberreichen.
 *
 * Als Sachverständiger wird technisch begründet, nicht rechtlich beraten.
 * Zu jedem Signal gehört ein Vorschlag, wie sich dasselbe technisch sagen
 * lässt — eine Warnung ohne Ausweg wird weggeklickt.
 */
export const RDG_SIGNALE: { muster: RegExp; hinweis: string; statt: string }[] = [
  {
    muster: /\bSie haben (?:einen )?Anspruch\b/i,
    hinweis: 'Anspruchsfeststellung',
    statt: 'aus technischer Sicht ist … erforderlich',
  },
  {
    muster: /\bAnspruch auf (?:Erstattung|Zahlung|Ersatz)\b/i,
    hinweis: 'Anspruchsfeststellung',
    statt: 'die Position ist technisch erforderlich und damit zu erstatten',
  },
  {
    muster: /\b(?:ist|sind) (?:der Versicherer|die Versicherung) verpflichtet\b/i,
    hinweis: 'Rechtspflicht des Versicherers behauptet',
    statt: 'die Kürzung ist aus Sachverständigensicht nicht nachvollziehbar',
  },
  {
    muster: /\bwir raten Ihnen\b|\bwir empfehlen Ihnen rechtlich\b/i,
    hinweis: 'Empfehlung mit Beratungscharakter',
    statt: 'aus technischer Sicht spricht … dafür',
  },
  {
    muster: /\bklagen Sie\b|\bKlage (?:erheben|einreichen)\b/i,
    hinweis: 'Handlungsempfehlung zum Rechtsweg',
    statt: 'ohne rechtliche Bewertung — die Einschätzung obliegt der Kanzlei',
  },
  {
    muster: /\bwiderrechtlich\b|\brechtswidrig\b/i,
    hinweis: 'rechtliche Bewertung',
    statt: 'technisch nicht nachvollziehbar',
  },
  {
    muster: /\bSchadensersatzanspruch\b/i,
    hinweis: 'Anspruchsbegriff',
    statt: 'Schadenposition',
  },
]

/**
 * Konjunktive, die die eigene Feststellung schwächen.
 *
 * Der Hausstil verlangt ausdrücklich bestimmte Sprache: „ist erforderlich"
 * statt „könnte erforderlich sein". Das ist keine Stilfrage — ein
 * Sachverständiger, der seine eigene Feststellung relativiert, liefert dem
 * Prüfdienstleister das Argument frei Haus.
 */
export const WEICHE_FORMULIERUNGEN = [
  /\bkönnte (?:erforderlich|notwendig|nötig)\b/i,
  /\bmüsste (?:eigentlich|wohl)\b/i,
  /\bvermutlich (?:erforderlich|notwendig)\b/i,
  /\beventuell (?:erforderlich|notwendig)\b/i,
]

function pruefeRdg(eingabe: PruefEingabe): Befund[] {
  const befunde: Befund[] = []

  for (const b of eingabe.bausteine) {
    for (const signal of RDG_SIGNALE) {
      const treffer = b.text.match(signal.muster)
      if (!treffer) continue
      befunde.push({
        kennung: 'R3',
        schwere: 'warnt',
        titel: `RDG-Grenze: ${signal.hinweis}`,
        stelle: `Position ${b.positionNummer} — ${b.positionBezeichnung}`,
        fundstelle: treffer[0],
        positionId: b.positionId ?? null,
        text: `„${treffer[0]}" — als Sachverständiger wird technisch begründet, nicht rechtlich beraten. Stattdessen etwa: ${signal.statt}.`,
      })
    }

    for (const weich of WEICHE_FORMULIERUNGEN) {
      const treffer = b.text.match(weich)
      if (!treffer) continue
      befunde.push({
        kennung: 'R3',
        schwere: 'warnt',
        titel: 'Weiche Formulierung',
        stelle: `Position ${b.positionNummer} — ${b.positionBezeichnung}`,
        fundstelle: treffer[0],
        positionId: b.positionId ?? null,
        text: `„${treffer[0]}" schwächt die eigene Feststellung. Der Hausstil formuliert bestimmt: „ist erforderlich".`,
      })
    }
  }

  return befunde
}

/* ------------------------------------------------------------------ *
 * Gesamtprüfung
 * ------------------------------------------------------------------ */

export interface Pruefergebnis {
  befunde: Befund[]
  /** Sperrende Befunde verhindern den Export. */
  gesperrt: boolean
  zusammenfassung: { sperrt: number; warnt: number }
}

export function pruefeVorExport(eingabe: PruefEingabe): Pruefergebnis {
  const befunde = [
    ...pruefeR1(eingabe),
    ...pruefeR4(eingabe),
    ...pruefeZahlen(eingabe),
    ...pruefeRdg(eingabe),
  ]

  const sperrt = befunde.filter((b) => b.schwere === 'sperrt').length
  return {
    befunde,
    gesperrt: sperrt > 0,
    zusammenfassung: { sperrt, warnt: befunde.length - sperrt },
  }
}
