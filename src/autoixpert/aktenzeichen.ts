/**
 * Aktenzeichen des Buros: `MMJJ/NNNNKK`, z. B. `0926/2081TG`
 * (Monat, Jahr, laufende Nummer, Kuerzel des Sachverstaendigen).
 *
 * In autoiXpert steht dasselbe Aktenzeichen an zwei Stellen in zwei
 * Schreibweisen:
 *
 * | Feld          | Schreibweise  | in der URL nutzbar |
 * | ------------- | ------------- | ------------------ |
 * | `token`       | `0926/2081TG` | nein               |
 * | `external_id` | `0926_2081TG` | ja                 |
 *
 * Der Schraegstrich in `token` waere in einem Pfad ein Trennzeichen; die
 * externe ID nutzt deshalb den Unterstrich. Aeltere Faelle haben ueberhaupt
 * keine externe ID - dort bleibt nur die Suche ueber `token`.
 */

const MUSTER = /^(\d{4})[/_-](\d+)([A-Za-z]{1,4})$/;

export interface Aktenzeichen {
  /** Anzeigeform mit Schraegstrich, wie im Gutachten sichtbar. */
  anzeige: string;
  /** Form der externen ID mit Unterstrich, in der URL verwendbar. */
  externeId: string;
}

/**
 * Nimmt eine beliebige Schreibweise entgegen und liefert beide Formen.
 * Gibt `null` zurueck, wenn die Eingabe kein Aktenzeichen ist (dann ist es
 * vermutlich eine technische ID und wird unveraendert benutzt).
 */
export function leseAktenzeichen(eingabe: string): Aktenzeichen | null {
  const treffer = MUSTER.exec(eingabe.trim());
  if (!treffer) return null;
  const monatJahr = treffer[1] ?? "";
  const nummer = treffer[2] ?? "";
  const kurz = (treffer[3] ?? "").toUpperCase();
  return {
    anzeige: `${monatJahr}/${nummer}${kurz}`,
    externeId: `${monatJahr}_${nummer}${kurz}`,
  };
}

/**
 * Reihenfolge, in der ein Fall gesucht wird - vom guenstigsten zum teuersten:
 * erst die externe ID (ein Lesezugriff), dann die Anzeigeform, zuletzt die
 * Eingabe selbst als technische ID. Erst wenn all das ins Leere laeuft, lohnt
 * die Suche ueber die Liste.
 */
export function abrufreihenfolge(eingabe: string): string[] {
  const bereinigt = eingabe.trim();
  const az = leseAktenzeichen(bereinigt);
  if (!az) return [bereinigt];

  const wege = [az.externeId, az.anzeige, bereinigt];
  return wege.filter((wert, index) => wege.indexOf(wert) === index);
}

/** Vergleichsform: ohne Trennzeichen und Leerraum, gross geschrieben. */
export function vergleichsform(wert: string): string {
  return wert.trim().toUpperCase().replace(/[\s/_-]/g, "");
}

/**
 * Die beiden Sichten auf einen Fall, getrennt gehalten:
 * angezeigt wird das Aktenzeichen mit Schraegstrich (`token`), verlinkt wird
 * ueber die externe ID mit Unterstrich, weil nur sie im Pfad erlaubt ist.
 * Fehlt eine der beiden Angaben, springt die andere ein - und zuletzt die
 * technische ID, damit ein Fall nie unerreichbar wird.
 */
export function fallKennungen(report: {
  token?: string;
  external_id?: string;
  id: string;
}): { anzeige: string; pfad: string } {
  const anzeige = report.token ?? leseAktenzeichen(report.external_id ?? "")?.anzeige ?? report.external_id ?? report.id;
  const pfad = report.external_id ?? leseAktenzeichen(report.token ?? "")?.externeId ?? report.token ?? report.id;
  return { anzeige, pfad };
}
