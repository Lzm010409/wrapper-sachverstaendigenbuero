/**
 * Die Eingabe des Bibliotheksformulars und ihre Prüfung.
 *
 * Bewusst ohne `server-only` und ohne Datenbankzugriff: dieselben Regeln
 * gelten im Browser (damit der Anleger sofort sieht, was fehlt) und auf dem
 * Server (weil ein Formular kein Schutz ist). Zwei Regelsätze an zwei Orten
 * wären zwei Regelsätze, die auseinanderlaufen.
 */

export const BEREICHE = [
  'kalkulation',
  'wertminderung',
  'wbw',
  'restwert',
  'sonderfall',
] as const

export type Bereich = (typeof BEREICHE)[number]

export const BEREICHSNAMEN: Record<Bereich, string> = {
  kalkulation: 'Kalkulation',
  wertminderung: 'Wertminderung',
  wbw: 'Wiederbeschaffungswert',
  restwert: 'Restwert',
  sonderfall: 'Sonderfälle',
}

export function istBereich(wert: string | undefined | null): wert is Bereich {
  return !!wert && (BEREICHE as readonly string[]).includes(wert)
}

/** Was aus dem Formular hereinkommt — durchweg Zeichenketten. */
export interface Eintragseingabe {
  bereich: string
  abschnitt: string
  titel: string
  typischeBegruendung: string
  gegenargument: string
  vorgehen: string
  hinweise: string
}

/** Was in die Spalten geht — geputzt, leere Felder als `null`. */
export interface SaubereEingabe {
  bereich: Bereich
  abschnitt: string
  titel: string
  typischeBegruendung: string | null
  gegenargument: string | null
  vorgehen: string | null
  hinweise: string | null
}

/**
 * Der Titel steht in der Liste, in der Suche und in der Kopfzeile der
 * Detailseite. 200 Zeichen sind grosszügig für eine Überschrift und
 * verhindern, dass jemand versehentlich einen ganzen Absatz hineinkopiert.
 */
const TITEL_HOECHSTLAENGE = 200

/** Leer heisst „nichts hinterlegt" — dafür steht `null`, keine leere Zeichenkette. */
function oderNull(wert: string): string | null {
  const geputzt = wert.trim()
  return geputzt.length > 0 ? geputzt : null
}

export function pruefeEingabe(roh: Eintragseingabe): {
  fehler?: string
  sauber?: SaubereEingabe
} {
  if (!istBereich(roh.bereich)) {
    return { fehler: 'Bitte einen Bereich wählen.' }
  }

  const titel = roh.titel.trim()
  if (!titel) {
    return { fehler: 'Ohne Titel findet den Eintrag später niemand wieder.' }
  }
  if (titel.length > TITEL_HOECHSTLAENGE) {
    return {
      fehler:
        `Der Titel ist mit ${titel.length} Zeichen zu lang (höchstens ${TITEL_HOECHSTLAENGE}). ` +
        'Er ist die Überschrift, nicht der Text — der lange Teil gehört ins Gegenargument.',
    }
  }

  const abschnitt = roh.abschnitt.trim()
  if (!abschnitt) {
    return {
      fehler:
        'Bitte einen Abschnitt wählen oder einen neuen eintragen — er ordnet den Eintrag ein.',
    }
  }

  const gegenargument = oderNull(roh.gegenargument)
  const vorgehen = oderNull(roh.vorgehen)
  if (!gegenargument && !vorgehen) {
    return {
      fehler:
        'Entweder ein Gegenargument oder ein Vorgehen wird gebraucht — sonst liefert der ' +
        'Eintrag nichts, was sich später übernehmen liesse.',
    }
  }

  return {
    sauber: {
      bereich: roh.bereich,
      abschnitt,
      titel,
      typischeBegruendung: oderNull(roh.typischeBegruendung),
      gegenargument,
      vorgehen,
      hinweise: oderNull(roh.hinweise),
    },
  }
}
