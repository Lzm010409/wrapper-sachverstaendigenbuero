/**
 * Feldkarte je Apify-Actor.
 * ------------------------------------------------------------------
 * **Warum nicht wie bisher.** Die alte `mappe()` riet über Kandidatenlisten:
 *
 *     f.fahrzeugtyp = g("bodyType", "vehicleType", "Fahrzeugtyp");
 *
 * Kleinanzeigen legt die Bauart aber unter `attributes.Fahrzeugtyp` ab, und
 * `g` sieht nur die oberste Ebene. Ergebnis: `fahrzeugtyp` war bei **0 von 35**
 * Kleinanzeigen-Datensätzen gefüllt — und weil der Karosseriefilter einen
 * unbekannten Wert durchlässt, kam am 08.09.2026 ein VW Golf in den
 * Sharan-Korb. Eine Kandidatenliste, die danebengreift, meldet nichts. Sie
 * liefert `null`, und `null` sieht aus wie „das Portal weiss es nicht".
 *
 * Gemessen an den Prüfsteinen in `tests/fixtures/apify/` gingen so verloren:
 *
 *   | Portal        | Feld         | gefüllt |
 *   | ---           | ---          | ---     |
 *   | kleinanzeigen | fahrzeugtyp  | 0/35    |
 *   | kleinanzeigen | ausstattung  | 0/35    |
 *   | kleinanzeigen | leistungKw   | 35/35, aber in PS |
 *   | mobile.de     | lat / lon    | 0/20    |
 *   | mobile.de     | ort          | 0/20    |
 *
 * **Deshalb steht hier je Actor, wie das Feld wirklich heisst** — abgelesen
 * an echten Antworten vom 10.09.2026, nicht aus der Dokumentation. Ein
 * Actor, der seine Felder umbenennt, lässt die Karte danebengreifen wie jede
 * Liste. Der Unterschied ist `pflichtfelder`: was dort steht und trotzdem
 * leer bleibt, erzeugt eine Warnung statt eines stillen `null`.
 */
const { zahl, ez, ausstattung, leeresFahrzeug } = require("./gemeinsam.js");

/** Liest einen Punktpfad; verträgt fehlende Zwischenstufen. */
function lies(objekt, pfad) {
  return String(pfad).split(".").reduce((o, k) => (o == null ? undefined : o[k]), objekt);
}

/** Erster Pfad mit einem echten Wert. Leerer String und leere Liste zählen nicht. */
function ersterWert(raw, pfade) {
  for (const p of [].concat(pfade)) {
    const v = lies(raw, p);
    if (v != null && v !== "" && !(Array.isArray(v) && v.length === 0)) return v;
  }
  return null;
}

const FAKTOR_PS_JE_KW = 1.35962;

/**
 * Die Ausstattung eines Kleinanzeigen-Inserats.
 *
 * Kleinanzeigen führt keine Ausstattungsliste, sondern schreibt die Merkmale
 * als Ja/Nein-Einträge in dasselbe `attributes`-Objekt, in dem auch Marke,
 * Modell und Kilometerstand stehen. Genommen wird nur, was auf „true" steht —
 * der Schlüssel IST die Bezeichnung, und zwar auf Deutsch. Damit braucht
 * dieses Portal die Übersetzungstabelle gar nicht.
 */
function ausstattungAusAttributen(raw) {
  const a = raw && raw.attributes;
  if (!a || typeof a !== "object") return [];
  return Object.keys(a).filter((k) => a[k] === true || a[k] === "true");
}

/**
 * Je Actor: kanonisches Feld -> Pfad, Pfadliste oder Funktion.
 * Was fehlt, fehlt beim Actor wirklich (siehe Kommentare).
 */
const KARTEN = {
  autoscout24: {
    id: "listingId",
    url: ["url", "portalUrl"],
    titel: "title",
    /*
      NICHT `variant`. Das Feld heisst so, trägt bei AutoScout24 aber die
      Bauform — "Crew Van", "Cargo Van", "e-Berlingo Crew" — und nicht die
      Ausstattungslinie. Gemessen an 20 Datensätzen erkennt `detectLinie`
      daraus **0** Linien, aus `modelVersion` dagegen **9** (Highline,
      Comfortline, Trendline). Die alte Kandidatenliste fragte `variant`
      zuerst und schrieb damit bei der Hälfte der Inserate eine Bauform in
      das Feld, aus dem der Linienfilter liest.
    */
    variante: "modelVersion",
    preis: "price",
    kilometerstand: "mileageKm",
    erstzulassung: "firstRegistration",
    // AutoScout24 führt kW und PS getrennt — `powerKw` ist hier wirklich kW.
    leistungKw: "powerKw",
    getriebe: "transmission",
    kraftstoff: "fuelType",
    fahrzeugtyp: "bodyType",
    tueren: "numberOfDoors",
    plz: "zip",
    ort: "city",
    lat: "latitude",
    lon: "longitude",
    ausstattung: "equipment",
    bilder: "images",
    beschreibung: "description",
  },

  "mobile.de": {
    id: "listingId",
    url: ["canonicalUrl", "sourceUrl"],
    titel: "title",
    variante: "subTitle",
    preis: "price",
    kilometerstand: "mileageKm",
    // `firstRegistration` ist bereits "MM/JJJJ"; das Datum ist der Rückfall.
    erstzulassung: ["firstRegistration", "firstRegistrationDate"],
    leistungKw: "powerKw",
    getriebe: "transmission",
    kraftstoff: "fuelType",
    fahrzeugtyp: "bodyType",
    tueren: "doors",
    // mobile.de liefert KEINE Postleitzahl, nur den Ortsnamen — dafür die
    // Koordinaten des Verkäufers. Für den Umkreis reicht das; im Beleg steht
    // dann der Ort statt der PLZ.
    plz: null,
    ort: "location",
    lat: "sellerLatitude",
    lon: "sellerLongitude",
    ausstattung: "features",
    bilder: "imageUrls",
    beschreibung: "description",
  },

  kleinanzeigen: {
    id: "listingId",
    url: ["url", "portalUrl"],
    titel: "title",
    // Kleinanzeigen kennt keine Ausstattungslinie als eigenes Feld.
    variante: null,
    preis: "price",
    kilometerstand: ["mileageKm", "attributes.Kilometerstand"],
    erstzulassung: ["firstRegistration", "attributes.Erstzulassung"],
    /*
      Ein Fehler des Actors, gemessen an 35 Datensätzen: `powerKw` trägt die
      PS-Zahl. Beleg im selben Datensatz — powerKw=170 neben
      attributes.Leistung='170 PS'. Ungeprüft übernommen wäre jede Leistung um
      Faktor 1,36 zu hoch, und die Toleranz von ±10 kW hätte systematisch die
      falschen Fahrzeuge behalten. Niemand hätte es bemerkt: 170 ist eine
      plausible Zahl für einen Van.
    */
    leistungKw: (raw) => {
      const ps = zahl(ersterWert(raw, ["attributes.Leistung", "powerKw"]));
      return ps == null ? null : Math.round(ps / FAKTOR_PS_JE_KW);
    },
    getriebe: ["transmission", "attributes.Getriebe"],
    kraftstoff: ["fuel", "attributes.Kraftstoffart"],
    fahrzeugtyp: "attributes.Fahrzeugtyp",
    tueren: "attributes.Anzahl Türen",
    plz: "zipCode",
    ort: "location",
    lat: "latitude",
    lon: "longitude",
    ausstattung: ausstattungAusAttributen,
    bilder: "imageUrls",
    beschreibung: "description",
  },
};

/**
 * Felder, deren Fehlen ein Fehler ist und keine Auskunft des Portals.
 *
 * Ohne die ersten vier steht kein Fahrzeug im Gutachten. `fahrzeugtyp` steht
 * dabei, weil ihr Fehlen den Golf in den Sharan-Korb gelassen hat; sie fehlt
 * bei einzelnen Inseraten wirklich (der Verkäufer hat nichts eingetragen),
 * deshalb ist es eine Warnung und kein Abbruch.
 */
const PFLICHTFELDER = ["url", "preis", "kilometerstand", "erstzulassung", "fahrzeugtyp"];

/** Schreibweisen, die dieselbe Karte meinen. */
const NAMEN = { "mobile-de": "mobile.de", mobilede: "mobile.de", "mobile_de": "mobile.de" };
const karteFuer = (quelle) => KARTEN[NAMEN[quelle] || quelle] || null;

/**
 * Rohdatensatz -> kanonisches Fahrzeug nach der Karte des Actors.
 *
 * Liefert `null`, wenn es keine Karte gibt — der Aufrufer fällt dann auf die
 * alte Kandidatenliste zurück, statt die Treffer wegzuwerfen.
 */
function mappeMitKarte(raw, quelle, warnungen) {
  const karte = karteFuer(quelle);
  if (!raw || typeof raw !== "object" || !karte) return null;

  const f = leeresFahrzeug(quelle);
  for (const [feld, regel] of Object.entries(karte)) {
    if (regel == null) continue;
    f[feld] = typeof regel === "function" ? regel(raw, warnungen) : ersterWert(raw, regel);
  }

  // Aufbereitung der Felder, die nicht als Text in den Beleg gehen.
  f.id = f.id == null ? null : String(f.id);
  f.plz = f.plz == null ? null : String(f.plz);
  f.preis = zahl(f.preis);
  f.kilometerstand = zahl(f.kilometerstand);
  f.erstzulassung = ez(f.erstzulassung, warnungen);
  if (typeof f.leistungKw !== "number") f.leistungKw = zahl(f.leistungKw);
  f.lat = f.lat == null ? null : Number(f.lat);
  f.lon = f.lon == null ? null : Number(f.lon);
  f.ausstattung = ausstattung(f.ausstattung);
  f.bilder = Array.isArray(f.bilder)
    ? f.bilder.map((x) => (typeof x === "string" ? x : (x && (x.url || x.src)) || null)).filter(Boolean)
    : [];

  /*
    Die Selbstprüfung. Ein Feld, das die Karte verspricht und das trotzdem
    leer bleibt, ist entweder beim Portal wirklich nicht da — oder der Actor
    hat es umbenannt. Beides gehört ins Protokoll; nur so fällt der zweite
    Fall auf, bevor er einen Korb verdirbt.
  */
  if (Array.isArray(warnungen)) {
    for (const feld of PFLICHTFELDER) {
      if (karte[feld] != null && f[feld] == null) {
        warnungen.push(`${quelle}: ${feld} fehlt (Inserat ${f.id || f.url || "ohne Kennung"})`);
      }
    }
  }
  return f;
}

module.exports = { mappeMitKarte, KARTEN, PFLICHTFELDER, karteFuer, ersterWert, FAKTOR_PS_JE_KW };
