/**
 * Ob eine Zeichenkette wie eine UUID aussieht.
 *
 * Ohne diese Prüfung ginge ein Tippfehler in der Adresse (z. B.
 * `/api/v1/stellungnahmen/unfug`) ungeprüft als Kennung an die Datenbank —
 * Postgres bricht die Abfrage dann mit „invalid input syntax for type uuid"
 * ab, und aus einer schlichten 404 würde ein 500 mit Stapelspur. Dieselbe
 * Prüfung steht bereits vor `/stellungnahmen/[id]` im angemeldeten Bereich
 * (siehe dort); hier als gemeinsame Funktion, weil sie an vier API-Routen
 * gebraucht wird.
 */
const KENNUNG = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function istUuid(text: string): boolean {
  return KENNUNG.test(text)
}
