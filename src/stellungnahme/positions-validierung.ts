/**
 * Prüft die Eingaben aus dem Bearbeiten-Formular einer Kürzungsposition.
 *
 * Eigene, „use server"-freie Datei: `editor-aktionen.ts` trägt die Anweisung
 * `'use server'` über der ganzen Datei, und jeder Export von dort wird damit
 * zu einer Server Action, die eine async Funktion sein muss. Diese Prüfung
 * ist reine Rechenlogik ohne Datenbankzugriff — sie gehört weder in eine
 * Server Action noch soll sie eine sein, unter anderem damit sie sich ohne
 * Datenbank-Mock testen lässt.
 */

export interface PositionsfelderEingabe {
  bezeichnung: string
  /** Als Text aus dem Formular — leer heisst „kein Betrag". */
  betragGutachten: string
  betragGekuerzt: string
}

export interface GeprueftePositionsfelder {
  bezeichnung: string
  betragGutachten: number | null
  betragGekuerzt: number | null
}

/**
 * Bezeichnung darf nicht leer sein, Beträge sind entweder leer (= kein
 * Betrag) oder eine nichtnegative Zahl mit höchstens zwei Nachkommastellen.
 * Eine Regel, die den gekürzten Betrag zum Gutachtenbetrag ins Verhältnis
 * setzt, gibt es bewusst nicht — ein gekürzter Betrag über dem
 * Gutachtenbetrag kommt vor (Nachforderung) und ist keine Fehleingabe.
 */
export function pruefePositionsfelder(
  eingabe: PositionsfelderEingabe,
): { werte: GeprueftePositionsfelder } | { fehler: string } {
  const bezeichnung = eingabe.bezeichnung.trim()
  if (!bezeichnung) return { fehler: 'Die Bezeichnung darf nicht leer sein.' }

  const betrag = (text: string, feld: string): { wert: number | null } | { fehler: string } => {
    const getrimmt = text.trim()
    if (!getrimmt) return { wert: null }
    // Zwei Nachkommastellen, Punkt als Trennzeichen — dieselbe Schreibweise
    // wie überall sonst in dieser Anwendung (siehe `pruefbericht/schema.ts`).
    if (!/^\d+(\.\d{1,2})?$/.test(getrimmt)) {
      return { fehler: `${feld}: bitte eine nichtnegative Zahl mit höchstens zwei Nachkommastellen.` }
    }
    return { wert: Math.round(Number(getrimmt) * 100) / 100 }
  }

  const gutachten = betrag(eingabe.betragGutachten, 'Gutachten-Betrag')
  if ('fehler' in gutachten) return gutachten
  const gekuerzt = betrag(eingabe.betragGekuerzt, 'Gekürzter Betrag')
  if ('fehler' in gekuerzt) return gekuerzt

  return {
    werte: { bezeichnung, betragGutachten: gutachten.wert, betragGekuerzt: gekuerzt.wert },
  }
}
