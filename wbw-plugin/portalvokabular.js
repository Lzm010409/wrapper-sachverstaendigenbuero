/**
 * Ein Merkmal, drei Portale, drei Schreibweisen.
 * ------------------------------------------------------------------
 * **Warum das eine eigene Datei ist.** Dieselbe Sache heisst bei jedem Actor
 * anders, und die Unterschiede sind nicht nur sprachlich:
 *
 *     Automatik  →  AutoScout24   "automatic"
 *                   mobile.de     ["AUTOMATIC_GEAR"]   ← Liste, versal, Suffix
 *                   Kleinanzeigen "automatik"          ← deutsch
 *
 * Ein Wert in der falschen Schreibweise wird von diesen Actors **nicht
 * abgelehnt**. Er wird durchgereicht und filtert einfach nichts — die Suche
 * liefert mehr Treffer als gewollt, und niemand sieht einen Fehler. Genau
 * diese Fehlerklasse hat in dieser Sitzung fünfmal zugeschlagen.
 *
 * Deshalb steht jede Zuordnung hier an EINER Stelle, und jede stammt aus dem
 * `enum` des Eingabeschemas des jeweiligen Actors (abgerufen am 10.09.2026) —
 * nicht aus dessen Fliesstext-Dokumentation und nicht aus einer Vermutung.
 *
 * **Warum hier und nicht im Cockpit.** Die Portaleingaben baut dieses Plugin.
 * Läge die Tabelle im Cockpit, gäbe es zwei Stellen, an denen ein Portalwort
 * steht — und zwei Stellen laufen auseinander. Das Cockpit kennt nur die
 * deutschen Begriffe („Automatik", „Elektro") und reicht sie in params.json
 * herein.
 */

/** `null` heisst: dieser Actor kennt das Merkmal nicht. Nichts erfinden. */

/**
 * Kraftstoff.
 *
 * AutoScout24 `enum`: petrol, diesel, electric, hybrid, plug-in hybrid, lpg,
 * cng, hydrogen. mobile.de `enum`: DIESEL, PETROL, ELECTRIC, HYBRID,
 * PLUG_IN_HYBRID, HYBRID_DIESEL, CNG, LPG, HYDROGEN, ETHANOL.
 *
 * Kleinanzeigen führt kein Schema; die Tokens stammen aus der Filterleiste
 * des Portals. Dort waren `benzin`, `diesel`, `lpg` und `hybrid` sichtbar —
 * **`elektro` und `cng` sind aus dem Muster geschlossen und ungemessen.**
 * Deshalb prüft die Beschaffung nach dem Abruf, ob die gelieferten Fahrzeuge
 * den angeforderten Kraftstoff tragen; ein falsches Token fällt so beim
 * ersten echten Lauf auf, statt still den Korb zu verderben.
 */
const KRAFTSTOFF = {
  Benzin:            { autoscout24: "petrol",         mobilede: "PETROL",         kleinanzeigen: "benzin" },
  Diesel:            { autoscout24: "diesel",         mobilede: "DIESEL",         kleinanzeigen: "diesel" },
  Elektro:           { autoscout24: "electric",       mobilede: "ELECTRIC",       kleinanzeigen: "elektro" },
  Hybrid:            { autoscout24: "hybrid",         mobilede: "HYBRID",         kleinanzeigen: "hybrid" },
  "Plug-in-Hybrid":  { autoscout24: "plug-in hybrid", mobilede: "PLUG_IN_HYBRID", kleinanzeigen: "hybrid" },
  LPG:               { autoscout24: "lpg",            mobilede: "LPG",            kleinanzeigen: "lpg" },
  CNG:               { autoscout24: "cng",            mobilede: "CNG",            kleinanzeigen: "cng" },
};

/**
 * Getriebe.
 *
 * AutoScout24 `enum`: automatic, manual, semi-automatic.
 * mobile.de `enum`: MANUAL_GEAR, AUTOMATIC_GEAR, SEMI_AUTOMATIC_GEAR.
 * Kleinanzeigen: automatik / manuell aus der Filterleiste.
 */
const GETRIEBE = {
  Automatik: { autoscout24: "automatic", mobilede: "AUTOMATIC_GEAR", kleinanzeigen: "automatik" },
  Manuell:   { autoscout24: "manual",    mobilede: "MANUAL_GEAR",    kleinanzeigen: "manuell" },
};

/**
 * Bauart — die riskanteste Zuordnung im Haus.
 *
 * AutoScout24 `enum`: sedan, station wagon, suv, hatchback, coupe,
 * convertible, van, transporter. mobile.de `enum`: LIMOUSINE, KOMBI,
 * KLEINWAGEN, COUPE, CABRIO, SUV, GELAENDEWAGEN, VAN, PICKUP.
 * Kleinanzeigen: kleinwagen, limousine, kombi, cabrio, suv, bus, coupe.
 *
 * Gemessen am 10.09.2026 schnitt `bodyType: "van"` den AutoScout24-Korb eines
 * VW Sharan von zehn Treffern auf einen — dort meint `van` das Nutzfahrzeug
 * und nicht die Großraumlimousine. Deshalb geht die Bauart nur in den
 * **engen** Zyklus (`params.bauartAmPortal`); reicht der Korb nicht, sucht
 * der nächste Zyklus ohne sie.
 *
 * Pickup hat bei AutoScout24 keine Entsprechung im Eingabeschema, obwohl das
 * AUSGABEfeld „SUV/Off-Road/Pick-Up" meldet. Also `null`, kein geratener Wert.
 */
const BAUART = {
  Limousine:  { autoscout24: "sedan",         mobilede: "LIMOUSINE",  kleinanzeigen: "limousine" },
  Kombi:      { autoscout24: "station wagon", mobilede: "KOMBI",      kleinanzeigen: "kombi" },
  Kleinwagen: { autoscout24: "hatchback",     mobilede: "KLEINWAGEN", kleinanzeigen: "kleinwagen" },
  "Coupé":    { autoscout24: "coupe",         mobilede: "COUPE",      kleinanzeigen: "coupe" },
  Cabrio:     { autoscout24: "convertible",   mobilede: "CABRIO",     kleinanzeigen: "cabrio" },
  SUV:        { autoscout24: "suv",           mobilede: "SUV",        kleinanzeigen: "suv" },
  Van:        { autoscout24: "van",           mobilede: "VAN",        kleinanzeigen: "bus" },
  Pickup:     { autoscout24: null,            mobilede: "PICKUP",     kleinanzeigen: null },
};

/**
 * Anzahl Türen — nur Kleinanzeigen führt sie im Eingabeschema.
 *
 * Das Portal kennt keine Einzelzahl, sondern zwei Gruppen. Ein Fahrzeug mit
 * drei Türen fällt in `2_3`, eines mit fünf in `4_5`.
 */
function tuerenFuer(tueren, portal) {
  if (portal !== "kleinanzeigen") return null;
  const n = Number(tueren);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n <= 3 ? "2_3" : "4_5";
}

const schlage = (tabelle, wert, portal) =>
  (wert != null && tabelle[wert] ? tabelle[wert][portal] : null) ?? null;

const kraftstoffFuer = (wert, portal) => schlage(KRAFTSTOFF, wert, portal);
const getriebeFuer = (wert, portal) => schlage(GETRIEBE, wert, portal);
const bauartFuer = (wert, portal) => schlage(BAUART, wert, portal);

/**
 * Ob eine GELIEFERTE Kraftstoffangabe zum angeforderten Kraftstoff passt.
 *
 * Die Portale schreiben ihn im Datensatz wieder anders als im Filter
 * ("Benzin", "PETROL", "Gasoline"), deshalb wird auf Wortstaemme geprueft und
 * nicht auf Gleichheit. Unbekanntes gilt als passend — ein Fahrzeug ohne
 * Angabe ist kein Beweis gegen den Filter.
 *
 * **Wofuer das da ist.** Ob Kleinanzeigen fuer Elektro wirklich `elektro`
 * heisst, steht in keiner Quelle, die vorliegt: die Filterleiste des Portals
 * zeigte nur benzin, diesel, lpg und hybrid. Ein falsches Token wird von
 * diesem Actor nicht abgelehnt, es filtert nur nichts. Diese Pruefung laesst
 * es beim ersten echten Lauf auffallen, statt still den Korb zu verderben.
 */
const KRAFTSTOFF_STAEMME = {
  Benzin: /benzin|petrol|gasoline|super|essence/i,
  Diesel: /diesel/i,
  Elektro: /elektro|electric|ev\b|strom/i,
  Hybrid: /hybrid/i,
  "Plug-in-Hybrid": /hybrid|plug/i,
  LPG: /lpg|autogas|fl(ü|ue)ssiggas/i,
  CNG: /cng|erdgas|natural gas/i,
};

function kraftstoffPasst(angefordert, geliefert) {
  const muster = angefordert ? KRAFTSTOFF_STAEMME[angefordert] : null;
  if (!muster) return true;
  const text = String(geliefert == null ? "" : geliefert).trim();
  if (!text) return true;
  return muster.test(text);
}

module.exports = {
  KRAFTSTOFF, GETRIEBE, BAUART,
  kraftstoffFuer, getriebeFuer, bauartFuer, tuerenFuer,
  kraftstoffPasst, KRAFTSTOFF_STAEMME,
};
