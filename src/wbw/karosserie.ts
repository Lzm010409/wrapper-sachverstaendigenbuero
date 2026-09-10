/**
 * Übersetzt die Fahrzeugart aus autoiXpert (`car.shape`) in die Bauart-
 * Bezeichnung, die das WBW-Plugin führt.
 *
 * **Warum das zählt:** Die Pipeline filtert den Korb auf die Bauart des
 * Subjektfahrzeugs. Ist sie nicht angegeben, *leitet sie sie ab* — sie nimmt
 * die häufigste Bauart im Korb als Referenz. Im Lauf vom 07.09.2026 ging das
 * schief:
 *
 *     karoInfo: { subjekt: null, referenz: "Kombi", abgeleitet: true }
 *
 * Gesucht war eine Mercedes **E-Limousine**. Der Korb bestand überwiegend aus
 * Kombis, also galt „Kombi" als Referenz — und damit wäre eine Limousine als
 * Abweichler aussortiert worden. Genau verkehrt herum.
 *
 * autoiXpert weiß die Bauart: `car.shape` steht bei jedem Gutachten
 * (`sedan` bei der E-Limousine, `suv` bei der G-Klasse — an beiden echten
 * Fällen geprüft). Sie muss nur übersetzt werden.
 */

/**
 * Die Bauarten des Plugins: Cabrio, Coupé, Kombi, SUV, Van, Pickup,
 * Kleinwagen, Limousine (siehe `KAROSSERIEN` in `ausstattung-matcher.js`).
 */
export type Bauart =
  | 'Cabrio'
  | 'Coupé'
  | 'Kombi'
  | 'SUV'
  | 'Van'
  | 'Pickup'
  | 'Kleinwagen'
  | 'Limousine'

/**
 * Dieselben Bauarten zur Laufzeit.
 *
 * Der Typ allein reicht nicht: die Werkzeugdefinition der KI-Prüfung braucht
 * die Liste als `enum`, und das Zod-Schema daneben ebenso. Zwei getippte
 * Listen liefen auseinander, sobald eine Bauart dazukommt.
 */
export const BAUARTEN: Bauart[] = [
  'Cabrio',
  'Coupé',
  'Kombi',
  'SUV',
  'Van',
  'Pickup',
  'Kleinwagen',
  'Limousine',
]

/**
 * `car.shape` aus autoiXpert → Bauart des Plugins.
 *
 * Nicht jede Fahrzeugart hat eine Entsprechung: Motorrad, Wohnmobil, LKW,
 * Anhänger und Fahrrad kennt die Bauart-Prüfung des Plugins nicht — für sie
 * ist eine Vergleichsfahrzeugsuche über die Autoportale ohnehin nicht der
 * richtige Weg. Sie ergeben `null`, und dann filtert die Pipeline nicht auf
 * die Bauart, statt auf eine falsche zu filtern.
 */
const NACH_BAUART: Record<string, Bauart> = {
  sedan: 'Limousine',
  compact: 'Kleinwagen',
  coupe: 'Coupé',
  stationWagon: 'Kombi',
  suv: 'SUV',
  convertible: 'Cabrio',
  van: 'Van',
  // Das Plugin führt „transporter" als Schreibweise von Van.
  transporter: 'Van',
  pickup: 'Pickup',
}

/** Fahrzeugarten ohne Entsprechung — bewusst benannt, nicht vergessen. */
const OHNE_ENTSPRECHUNG = new Set([
  'bicycle',
  'e-bike',
  'pedelec',
  'motorcycle',
  'motorHome',
  'caravanTrailer',
  'trailer',
  'truck',
  'semiTruck',
  'semiTrailer',
  'bus',
])

/**
 * Gibt die Bauart zurück, oder `null`, wenn autoiXpert keine oder eine
 * Fahrzeugart ohne Entsprechung liefert.
 */
export function bauartAusShape(shape: string | null | undefined): Bauart | null {
  if (!shape) return null
  const wert = shape.trim()
  if (!wert) return null

  const treffer = NACH_BAUART[wert]
  if (treffer) return treffer

  // Schreibweise abweichend? Der Vergleich ohne Rücksicht auf Gross- und
  // Kleinschreibung fängt `stationwagon` ebenso wie `stationWagon`.
  const klein = wert.toLowerCase()
  for (const [schluessel, bauart] of Object.entries(NACH_BAUART)) {
    if (schluessel.toLowerCase() === klein) return bauart
  }

  // Unbekannt und nicht in der Liste der bewusst Übergangenen: das ist ein
  // neuer Wert der Schnittstelle. Auch dann wird nicht geraten.
  if (!OHNE_ENTSPRECHUNG.has(wert)) return null
  return null
}

/** Für die Anzeige: die deutsche Bezeichnung der Fahrzeugart. */
export function shapeBezeichnung(shape: string | null | undefined): string | null {
  if (!shape) return null
  const namen: Record<string, string> = {
    bicycle: 'Fahrrad',
    'e-bike': 'E-Bike',
    pedelec: 'Pedelec',
    sedan: 'Limousine',
    compact: 'Kompaktwagen',
    coupe: 'Coupé',
    stationWagon: 'Kombi',
    suv: 'SUV',
    convertible: 'Cabrio',
    van: 'Van',
    transporter: 'Transporter',
    motorcycle: 'Motorrad',
    pickup: 'Pickup',
    motorHome: 'Wohnmobil',
    caravanTrailer: 'Wohnwagen',
    trailer: 'Anhänger',
    truck: 'LKW',
    semiTruck: 'Sattelzugmaschine',
    semiTrailer: 'Sattelauflieger',
    bus: 'Bus',
  }
  return namen[shape] ?? null
}
