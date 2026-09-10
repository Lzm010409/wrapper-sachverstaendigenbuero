import type { Extraktion } from './schema'

/**
 * Die strukturellen Sonderfälle B.1 bis B.8 aus
 * `skills/stellungnahme-erstellen/references/allgemeine-vorbemerkung-und-sonderfaelle.md`
 * als Prüfliste (Konzept F4).
 *
 * Bewusst ohne Modellaufruf: die Prüfungen setzen auf der bereits
 * strukturierten Extraktion auf und sind damit sofort, kostenfrei und
 * nachvollziehbar. Sie entscheiden nichts, sondern melden — die Bewertung
 * bleibt beim Sachverständigen.
 */

export type Dringlichkeit = 'hinweis' | 'pruefen' | 'wichtig'

export interface Sonderfallbefund {
  kennung: string
  titel: string
  dringlichkeit: Dringlichkeit
  befund: string
  /** Was zu tun ist, wörtlich am Skill orientiert. */
  handlung: string
}

const ENTHAELT = (text: string | null | undefined, woerter: string[]): boolean => {
  if (!text) return false
  const klein = text.toLowerCase()
  return woerter.some((w) => klein.includes(w))
}

/**
 * B.1 — Bündelung mit unfallfremden Dokumenten.
 *
 * Beide vorliegenden Testsendungen sind solche Bündel. Wird das übersehen,
 * argumentiert die Stellungnahme gegen eine Honorarkürzung, die gar nicht
 * Gegenstand ist.
 */
function pruefeB1(e: Extraktion): Sonderfallbefund | null {
  const unfallfremd = e.abschnitte.filter((a) => !a.fuerStellungnahmeRelevant)
  if (unfallfremd.length === 0) return null

  return {
    kennung: 'B.1',
    titel: 'Bündelung mit unfallfremden Abschnitten',
    dringlichkeit: 'wichtig',
    befund:
      `Die Sendung enthält ${unfallfremd.length} Abschnitt${unfallfremd.length === 1 ? '' : 'e'}, ` +
      `${unfallfremd.length === 1 ? 'der' : 'die'} nicht zur Reparaturkostenabrechnung ` +
      `${unfallfremd.length === 1 ? 'gehört' : 'gehören'}: ` +
      unfallfremd.map((a) => `${a.bezeichnung} (S. ${a.seiteVon}–${a.seiteBis})`).join(', '),
    handlung:
      'Diese Abschnitte gegenüber dem Auftraggeber kurz benennen und von der Bearbeitung ' +
      'ausnehmen, sofern sie nicht ausdrücklich gewünscht ist.',
  }
}

/** B.2 — Versicherer-eigenes Gegengutachten statt externem Prüfbericht. */
function pruefeB2(e: Extraktion): Sonderfallbefund | null {
  const hatDienstleister = Boolean(e.pruefdienstleister?.trim())
  const nenntVersicherer = ENTHAELT(e.pruefdienstleister, [
    'huk',
    'allianz',
    'lvm',
    'axa',
    'ergo',
    'r+v',
    'devk',
    'versicherung',
  ])

  if (hatDienstleister && !nenntVersicherer) return null

  return {
    kennung: 'B.2',
    titel: 'Möglicherweise versicherereigenes Gegengutachten',
    dringlichkeit: 'pruefen',
    befund: hatDienstleister
      ? `Als prüfende Stelle ist „${e.pruefdienstleister}" genannt — das wirkt wie der Versicherer selbst, nicht wie ein externer Prüfdienstleister.`
      : 'Es ist kein externer Prüfdienstleister erkennbar.',
    handlung:
      'Prüfen, ob der Versicherer selbst ein Gegengutachten erstellt hat. Dann greift eine ' +
      'andere Argumentationslinie als beim Prüfbericht eines Dienstleisters.',
  }
}

/** B.4 — Teil-Anerkennung innerhalb einer Sammelposition. */
function pruefeB4(e: Extraktion): Sonderfallbefund | null {
  const sammel = e.positionen.filter((p) => p.zusammengefassteZeilen.length >= 3)
  if (sammel.length === 0) return null

  return {
    kennung: 'B.4',
    titel: 'Sammelpositionen mit mehreren Einzelteilen',
    dringlichkeit: 'pruefen',
    befund:
      `${sammel.length} Position${sammel.length === 1 ? '' : 'en'} fasst mehrere Zeilen zusammen: ` +
      sammel
        .map((p) => `${p.bezeichnung} (${p.zusammengefassteZeilen.length} Zeilen)`)
        .join(', '),
    handlung:
      'Prüfen, ob alle Teile gleich zu bewerten sind oder ob ein Teilsplit nötig ist — ' +
      'einzelne Teile lassen sich anerkennen, ohne die ganze Position aufzugeben.',
  }
}

/**
 * B.7 — Grundlagenfehler durch falsches Fahrzeug.
 *
 * Der teuerste Fehler, wenn er übersehen wird: liegt dem Prüfbericht ein
 * anderes Fahrzeug zugrunde, ist jede weitere Auseinandersetzung über
 * Einzelpositionen hinfällig.
 */
function pruefeB7(e: Extraktion, fahrzeugAusFall?: string | null): Sonderfallbefund | null {
  const imBericht = findeKennzeichen(e.fahrzeug)
  const imFall = findeKennzeichen(fahrzeugAusFall)

  if (!imBericht || !imFall) {
    return {
      kennung: 'B.7',
      titel: 'Fahrzeugabgleich nicht möglich',
      dringlichkeit: 'hinweis',
      befund: !imBericht
        ? 'Im Prüfbericht ist kein Kennzeichen erkennbar.'
        : 'Zum Fall liegt kein Kennzeichen vor, gegen das sich abgleichen liesse.',
      handlung:
        'Von Hand abgleichen, ob dem Prüfbericht dasselbe Fahrzeug zugrunde liegt wie dem Gutachten.',
    }
  }

  if (vereinheitliche(imBericht) === vereinheitliche(imFall)) return null

  return {
    kennung: 'B.7',
    titel: 'Grundlagenfehler: abweichendes Kennzeichen',
    dringlichkeit: 'wichtig',
    befund: `Der Prüfbericht nennt „${imBericht}", der Fall „${imFall}".`,
    handlung:
      'Vorrangig klären. Liegt dem Prüfbericht ein anderes Fahrzeug zugrunde, ist die ' +
      'Auseinandersetzung über Einzelpositionen hinfällig.',
  }
}

/**
 * Sucht ein deutsches Kfz-Kennzeichen in einem Freitext.
 *
 * Bewusst streng: ein Trennzeichen zwischen Erkennungsnummer und Ziffern ist
 * Pflicht, und Kleinschreibung zählt nicht. Eine lockerere Regel liest aus
 * einer Typbezeichnung wie „Passat Variant (3B6 ab 11.00)" das vermeintliche
 * Kennzeichen „ab 11" heraus — und löst damit einen Fehlalarm auf der
 * höchsten Dringlichkeitsstufe aus.
 */
export function findeKennzeichen(text: string | null | undefined): string | null {
  if (!text) return null
  const treffer = text.match(
    /\b[A-ZÄÖÜ]{1,3}[-\s][A-ZÄÖÜ]{1,2}[-\s]?\d{1,4}\s?[EH]?(?![\d.,])/,
  )
  return treffer?.[0]?.trim() ?? null
}

/** Vergleichsform: nur Buchstaben und Ziffern. */
function vereinheitliche(kennzeichen: string): string {
  return kennzeichen.toUpperCase().replace(/[^A-ZÄÖÜ0-9]/g, '')
}

/** Eine Kürzung ohne erkennbaren Betrag lässt sich nicht beziffern. */
function pruefeBetraege(e: Extraktion): Sonderfallbefund | null {
  const ohne = e.positionen.filter(
    (p) => p.betragGutachten === null || p.betragGekuerzt === null,
  )
  if (ohne.length === 0) return null

  return {
    kennung: 'Beträge',
    titel: 'Positionen ohne bezifferte Kürzung',
    dringlichkeit: 'pruefen',
    befund: `${ohne.length} von ${e.positionen.length} Positionen tragen keinen vollständigen Betrag: ${ohne
      .map((p) => p.bezeichnung)
      .slice(0, 5)
      .join(', ')}${ohne.length > 5 ? ' …' : ''}`,
    handlung:
      'Beträge im Prüfbericht nachsehen und ergänzen. Ohne sie lässt sich die Kürzungssumme ' +
      'nicht beziffern und kein Verhältnismäßigkeitsargument führen.',
  }
}

/** Weicht die Summe der Einzelpositionen von der ausgewiesenen Differenz ab? */
function pruefeSummenabgleich(e: Extraktion): Sonderfallbefund | null {
  if (e.summeGutachten === null || e.summeGekuerzt === null) return null

  const ausgewiesen = Math.round((e.summeGutachten - e.summeGekuerzt) * 100) / 100
  const ausPositionen = e.positionen.reduce((s, p) => {
    if (p.betragGutachten === null || p.betragGekuerzt === null) return s
    return s + (p.betragGutachten - p.betragGekuerzt)
  }, 0)
  const gerundet = Math.round(ausPositionen * 100) / 100

  // Ein paar Cent Abweichung sind Rundung, ein größerer Abstand nicht.
  if (Math.abs(ausgewiesen - gerundet) <= 1) return null

  return {
    kennung: 'Summen',
    titel: 'Einzelpositionen erklären die Kürzung nicht vollständig',
    dringlichkeit: 'pruefen',
    befund:
      `Der Bericht weist eine Kürzung von ${ausgewiesen.toFixed(2)} € aus, die erfassten ` +
      `Positionen ergeben ${gerundet.toFixed(2)} €.`,
    handlung:
      'Prüfen, ob eine Position übersehen wurde. Bei einem Werkstattvergleich verteilt sich ' +
      'die Kürzung oft über die gesamte Kalkulation und lässt sich nicht Zeile für Zeile zuordnen.',
  }
}

/**
 * Läuft die Prüfliste ab.
 *
 * `fahrzeugAusFall` kommt aus den autoiXpert-Falldaten, sofern ein Fall
 * zugeordnet ist — nur dann lässt sich B.7 überhaupt prüfen.
 */
export function pruefeSonderfaelle(
  extraktion: Extraktion,
  fahrzeugAusFall?: string | null,
): Sonderfallbefund[] {
  const befunde = [
    pruefeB7(extraktion, fahrzeugAusFall),
    pruefeB1(extraktion),
    pruefeB2(extraktion),
    pruefeB4(extraktion),
    pruefeBetraege(extraktion),
    pruefeSummenabgleich(extraktion),
  ].filter((b): b is Sonderfallbefund => b !== null)

  const rang: Record<Dringlichkeit, number> = { wichtig: 0, pruefen: 1, hinweis: 2 }
  return befunde.sort((a, b) => rang[a.dringlichkeit] - rang[b.dringlichkeit])
}
