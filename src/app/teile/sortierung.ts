/**
 * Der Sortierstand einer Liste.
 *
 * **Zwei Spielarten im Haus.** Der WBW-Vergleichskorb sortiert im Browser
 * (`korbtabelle.tsx`) — dort liegen alle Zeilen bereits vollständig geladen,
 * und ein Serverabruf je Klick wäre Wartezeit für etwas, das schon dasteht.
 * Die übrigen Listen sind serverseitig gefiltert und bei hundert Zeilen
 * gekappt (siehe `filterleiste.tsx`); dort muss auch die Sortierung in die
 * Abfrage, sonst sortiert ein Klick nur den ohnehin schon falschen
 * Ausschnitt. Deshalb steht der Sortierstand dort in der Adresse, genau wie
 * der Filter — weiterschickbar, als Lesezeichen brauchbar, vom
 * Zurück-Knopf erreichbar.
 *
 * Was beide Spielarten teilen, ist nur das Vokabular: dieselben zwei
 * Richtungen, dieselbe Regel, was ein unbekannter Wert bedeutet.
 */

export type Richtung = 'aufsteigend' | 'absteigend'

export interface Sortierstand<Feld extends string> {
  feld: Feld
  richtung: Richtung
}

/**
 * Liest den Sortierstand aus rohen `searchParams`-Werten.
 *
 * `null` heisst: kein gültiger Wunsch gesetzt — die Seite bleibt bei ihrer
 * eigenen Standardsortierung. Ein unbekanntes Feld (ein alter Verweis, ein
 * Tippfehler in der Adresse) fällt auf denselben Fall zurück, nicht auf
 * einen Fehler — dieselbe Haltung wie bei `leseReiter` in `reiterleiste.tsx`.
 */
export function leseSortierung<Feld extends string>(
  roh: { sortiert?: string; richtung?: string },
  gueltigeFelder: readonly Feld[],
): Sortierstand<Feld> | null {
  const feld = roh.sortiert
  if (!feld || !gueltigeFelder.includes(feld as Feld)) return null
  return { feld: feld as Feld, richtung: roh.richtung === 'absteigend' ? 'absteigend' : 'aufsteigend' }
}

/**
 * Die Adresse mit dem neuen Sortierstand — alle übrigen Parameter (Filter,
 * Suche) bleiben unangetastet. `stand: null` nimmt `sortiert`/`richtung`
 * wieder heraus und kehrt so zur Standardsortierung der Seite zurück.
 */
export function mitSortierung(
  bestehend: URLSearchParams,
  stand: Sortierstand<string> | null,
): URLSearchParams {
  const naechste = new URLSearchParams(bestehend)
  if (stand) {
    naechste.set('sortiert', stand.feld)
    naechste.set('richtung', stand.richtung)
  } else {
    naechste.delete('sortiert')
    naechste.delete('richtung')
  }
  return naechste
}
