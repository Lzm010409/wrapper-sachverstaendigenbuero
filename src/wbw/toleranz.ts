/**
 * Wie weit ein Vergleichsfahrzeug abweichen darf — abhängig vom Fahrzeug,
 * nicht als feste Zahl.
 *
 * **Warum.** Die Vorgaben lagen bei ±25.000 km und ±1 Jahr, gleich für jedes
 * Fahrzeug. Im Lauf vom 08.09.2026 (VW Sharan, 12/2010, 162.390 km) blieben
 * von 48 Fahrzeugen im Umkreis **15** übrig; 33 fielen an genau diesen
 * Toleranzen. Das ist kein Zufall: bei einem sechzehn Jahre alten Van streut
 * die Laufleistung am Markt zwischen 120.000 und 260.000 km, und ein Baujahr
 * mehr oder weniger ist kein Unterschied. Bei einem drei Jahre alten Fahrzeug
 * mit 40.000 km ist beides ein grosser Unterschied.
 *
 * Eine feste Zahl ist deshalb für junge Fahrzeuge zu weit und für alte zu
 * eng. Diese Datei rechnet sie aus dem Fahrzeug aus.
 *
 * **Es bleibt ein Vorschlag.** Was hier herauskommt, füllt die Felder der
 * Oberfläche vor. Der Sachverständige sieht die Zahl und kann sie
 * überschreiben — nichts rechnet hinter seinem Rücken anders, als in den
 * Feldern steht.
 */

/** Die bisherigen festen Vorgaben — weiterhin die Untergrenze. */
export const KM_TOLERANZ_VORGABE = 25000
export const EZ_TOLERANZ_VORGABE = 1

/** Anteil der Laufleistung, der als Spanne gilt. */
const KM_ANTEIL = 0.2

/**
 * Obergrenze der km-Spanne.
 *
 * Jenseits davon vergleicht man keine Fahrzeuge mehr, sondern nur noch
 * Karosserien: zwischen 150.000 und 270.000 km liegen Motor, Getriebe und
 * Fahrwerk, nicht eine Preisdifferenz.
 */
const KM_HOECHSTENS = 60000

/**
 * Die km-Toleranz für eine Laufleistung.
 *
 * 20 % der Laufleistung, mindestens die alte Vorgabe, höchstens 60.000 km.
 * Für den Sharan mit 162.390 km sind das 32.000 km statt 25.000.
 */
export function kmToleranzFuer(
  laufleistung: number | null | undefined,
  vorgabe = KM_TOLERANZ_VORGABE,
): number {
  if (!laufleistung || laufleistung <= 0) return vorgabe
  const anteilig = Math.round((laufleistung * KM_ANTEIL) / 1000) * 1000
  return Math.min(KM_HOECHSTENS, Math.max(vorgabe, anteilig))
}

/**
 * Die EZ-Toleranz in Jahren für ein Fahrzeugalter.
 *
 * Bis fünf Jahre bleibt es bei einem Jahr, bis zehn sind es zwei, darüber
 * drei. Die Stufen sind grob, weil der Markt es auch ist — eine Nachkommastelle
 * täuschte eine Genauigkeit vor, die eine Gebrauchtwagenbörse nicht hat.
 *
 * @param ez Erstzulassung als `MM/JJJJ`
 */
export function ezToleranzFuer(
  ez: string | null | undefined,
  heute = new Date(),
  vorgabe = EZ_TOLERANZ_VORGABE,
): number {
  const alter = alterInJahren(ez, heute)
  if (alter === null) return vorgabe
  if (alter > 10) return Math.max(vorgabe, 3)
  if (alter > 5) return Math.max(vorgabe, 2)
  return vorgabe
}

/** Das Alter in Jahren, oder `null`, wenn die Erstzulassung nichts hergibt. */
function alterInJahren(ez: string | null | undefined, heute: Date): number | null {
  const treffer = /^(\d{1,2})\/(\d{4})$/.exec((ez ?? '').trim())
  if (!treffer) return null
  const monat = Number(treffer[1])
  const jahr = Number(treffer[2])
  if (monat < 1 || monat > 12) return null

  const jahre = heute.getFullYear() - jahr + (heute.getMonth() + 1 - monat) / 12
  // Ein Datum aus der Zukunft ist ein Tippfehler, kein junges Fahrzeug.
  return jahre < 0 ? null : jahre
}
