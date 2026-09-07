/**
 * Abrufregel gegen die autoiXpert-Schnittstelle.
 *
 * Zwei Gruende, warum diese Regel im Code steht und nicht nur im Aufruf:
 *
 * 1. **Auftrag des Betreibers.** Fuer den laufenden Ausbau duerfen nur offene
 *    Gutachten ab Mai 2026 gelesen werden, und es darf nichts geschrieben oder
 *    geloescht werden. Eine Regel, an die man sich erinnern muss, ist keine.
 *
 * 2. **Kosten.** Lesezugriffe werden je Gutachten einmalig abgerechnet. Jeder
 *    Abruf, der ueber die freigegebene Menge hinausgeht, kostet Geld - auch ein
 *    versehentlicher.
 *
 * Die Werte sind ueber Umgebungsvariablen loesbar, damit die Sperre spaeter
 * geweitet werden kann, ohne den Code anzufassen. Voreinstellung ist die enge
 * Fassung.
 */
export interface Abrufregel {
  /** Nur Gutachten, die noch nicht abgeschlossen sind. */
  nurOffene: boolean;
  /** Frühestes Anlagedatum als ISO-Zeitstempel, oder undefined für keine Grenze. */
  fruehestensErstellt?: string;
  /** Schreibende Zugriffe (POST/PATCH/DELETE/Upload). */
  schreibenErlaubt: boolean;
}

export const abrufregel: Abrufregel = {
  nurOffene: process.env.AUTOIXPERT_NUR_OFFENE !== "false",
  fruehestensErstellt:
    process.env.AUTOIXPERT_FRUEHESTENS ?? "2026-05-01T00:00:00.000Z",
  schreibenErlaubt: process.env.AUTOIXPERT_SCHREIBEN === "erlaubt",
};

/** Wird geworfen, wenn ein Aufruf die Abrufregel verletzt. */
export class AbrufregelVerletzt extends Error {
  constructor(nachricht: string) {
    super(nachricht);
    this.name = "AbrufregelVerletzt";
  }
}

/** Filter, die jede Listenabfrage tragen muss. */
export function pflichtfilter(regel: Abrufregel = abrufregel) {
  const filter: Record<string, string> = {};
  if (regel.nurOffene) filter.is_open = "true";
  if (regel.fruehestensErstellt) filter.created_at_gte = regel.fruehestensErstellt;
  return filter;
}

/**
 * Prueft ein einzeln geladenes Gutachten gegen die Regel.
 * Der Einzelabruf ueber `/reports/{id}` kennt keine Filterparameter - dort ist
 * die Pruefung nachgelagert die einzige Moeglichkeit.
 */
export function pruefeGutachten(
  gutachten: {
    state?: string | null;
    created_at?: string | null;
    token?: string | null;
    id?: string | null;
  },
  regel: Abrufregel = abrufregel,
): void {
  const bezeichnung = gutachten.token ?? gutachten.id ?? "unbekannt";

  if (regel.nurOffene && gutachten.state === "locked") {
    throw new AbrufregelVerletzt(
      `Gutachten ${bezeichnung} ist abgeschlossen. Die aktuelle Abrufregel lässt nur offene Gutachten zu.`,
    );
  }

  if (regel.fruehestensErstellt && gutachten.created_at) {
    if (new Date(gutachten.created_at) < new Date(regel.fruehestensErstellt)) {
      throw new AbrufregelVerletzt(
        `Gutachten ${bezeichnung} wurde vor dem ${regel.fruehestensErstellt.slice(0, 10)} angelegt und liegt außerhalb der Abrufregel.`,
      );
    }
  }
}

/** Sperre fuer schreibende Zugriffe. */
export function pruefeSchreibzugriff(was: string, regel: Abrufregel = abrufregel): void {
  if (!regel.schreibenErlaubt) {
    throw new AbrufregelVerletzt(
      `Schreibender Zugriff (${was}) ist gesperrt. Zum Lösen AUTOIXPERT_SCHREIBEN=erlaubt setzen — bewusst und nicht dauerhaft.`,
    );
  }
}

/**
 * Offene Regel fuer Tests: prueft die Mechanik des Clients, nicht die Sperre.
 * Die Sperre selbst hat eigene Tests (tests/abrufregel.test.ts).
 */
export const OHNE_EINSCHRAENKUNG: Abrufregel = {
  nurOffene: false,
  schreibenErlaubt: true,
}
