#!/usr/bin/env node
/**
 * Baut DETERMINISTISCH die Such-Eingaben für die drei Apify-Actors aus
 * params.json und schreibt search-inputs.json.
 *
 * **Jeder Wert hier ist gemessen.** Ein Filter, den ein Actor nicht kennt,
 * wird laut Schema „sent as-is and may simply not narrow results" — er
 * scheitert **lautlos** und liefert nur einen schlechteren Korb. Deshalb
 * steht hinter jeder Zeile ein Probelauf und keine Vermutung; die
 * Messwerte stehen in `docs/wbw-beschaffung-apify.md`.
 *
 * Drei Dinge, die dieser Baustein bewusst NICHT tut:
 *
 *   1. **Keine Bauart am Portal.** Bei AutoScout24 schnitt `bodyType: "van"`
 *      den Korb von zehn auf eins — dort heisst `van` Nutzfahrzeug. Bei
 *      Kleinanzeigen warf `autos.typ_s: "bus"` einen echten Sharan hinaus,
 *      den der Verkäufer als „Kombi" eingetragen hatte. Die Bauart wird
 *      nachträglich aus dem gelieferten Feld gefiltert (pipeline.js).
 *   2. **Keine geratenen Schlüssel.** Was nicht in einer echten Antwort
 *      gewirkt hat, steht hier nicht.
 *   3. **Kein `null` als Filterwert.** Fehlt eine Angabe, fehlt der Filter —
 *      ein gesendetes `null` ist ein Filter auf „nichts".
 *
 * Aufruf: node build-search-urls.js <params.json> <search-inputs.json>
 */
const fs = require("fs");

// Marken-Schreibweise für AutoScout24-URL-Slug (lowercase) und mobile.de.
const MARKEN_SLUG = {
  vw: "volkswagen", volkswagen: "volkswagen",
  mercedes: "mercedes-benz", "mercedes benz": "mercedes-benz", "mercedes-benz": "mercedes-benz",
  bmw: "bmw", audi: "audi", opel: "opel", ford: "ford", skoda: "skoda", seat: "seat",
  toyota: "toyota", renault: "renault", peugeot: "peugeot", fiat: "fiat", hyundai: "hyundai",
  kia: "kia", mazda: "mazda", nissan: "nissan", volvo: "volvo", mini: "mini",
  citroen: "citroen", "citroën": "citroen", dacia: "dacia",
};
// mobile.de erwartet die Portal-Schreibweise der Marke ("VW", nicht "volkswagen").
const MARKEN_MOBILE = {
  volkswagen: "VW", "mercedes-benz": "Mercedes-Benz", bmw: "BMW", audi: "Audi",
  opel: "Opel", ford: "Ford", skoda: "Skoda", seat: "Seat", toyota: "Toyota",
  renault: "Renault", peugeot: "Peugeot", fiat: "Fiat", hyundai: "Hyundai",
  kia: "Kia", mazda: "Mazda", nissan: "Nissan", volvo: "Volvo", mini: "MINI",
  citroen: "Citroen", dacia: "Dacia",
};

/**
 * Wörter, die ein Inserat als Vergleichsfahrzeug ausschliessen.
 *
 * Gemessen: ein Probelauf lieferte eine **Rückbank für 50 €** als Fahrzeug,
 * dazu einen „Schlachter", ein „Bastlerfahrzeug" und einen Citroën XM — also
 * ein anderes Modell. Die Freitextsuche trifft alles, was den Modellnamen im
 * Titel trägt.
 */
const AUSSCHLUSSWORTE = ["teile", "ersatzteil", "rückbank", "schlachtfest", "schlachter",
  "bastler", "export", "motorschaden", "getriebeschaden", "unfall", "teileträger"];

/**
 * Wie tief bei Kleinanzeigen geholt wird.
 *
 * `maxResults` zählt dort die **geholten**, nicht die gelieferten Datensätze:
 * mit Umkreisfilter kamen 19 von 50 zurück, ohne 50 von 50 — der Umkreis
 * wirkt lokal, und der Actor holt nicht nach. Gemessen am Sharan-Fall:
 * Tiefe 10 ergab 2 Fahrzeuge im Korb, Tiefe 80 ergab 17.
 */
const KLEINANZEIGEN_TIEFE = 80;

const FAKTOR_PS_JE_KW = 1.35962;
/** Spanne um die Leistung. Breit genug für Modellpflegen desselben Motors. */
const LEISTUNG_SPANNE = 0.2;

function num(v) { if (v == null) return null; const m = String(v).replace(/[^\d]/g, ""); return m ? parseInt(m, 10) : null; }
function jahr(ez) { const m = String(ez || "").match(/(19|20)\d{2}/); return m ? parseInt(m[0], 10) : null; }
function markeSlug(marke) { const k = String(marke || "").toLowerCase().trim(); return MARKEN_SLUG[k] || k.replace(/\s+/g, "-"); }
function modellSlug(modell) { return String(modell || "").toLowerCase().trim().replace(/[\/\s]+/g, "-"); }

/**
 * Marke für Kleinanzeigen: die eigenen Tokens des Portals, kleingeschrieben
 * mit Unterstrich ("mercedes_benz"). Gemessen wirksam für "volkswagen" und
 * "citroen".
 */
function markeKleinanzeigen(marke) { return markeSlug(marke).replace(/-/g, "_"); }

/**
 * mobile.de-Schreibweise. Eine unbekannte Marke wird durchgereicht statt
 * verschluckt — lieber der Originalname als gar kein Filter.
 */
function markeMobile(marke) {
  const slug = markeSlug(marke);
  return MARKEN_MOBILE[slug] || String(marke || "").trim();
}

function build(params) {
  const s = params.subject || {};
  const y = jahr(s.ez);
  const ezTol = params.ezToleranzJahre ?? 1;
  const kmTol = params.kmToleranz ?? 25000;
  const km = num(s.mileage);
  const jahrVon = y != null ? y - ezTol : null;
  const jahrBis = y != null ? y + ezTol : null;
  const kmVon   = km != null ? Math.max(0, km - kmTol) : null;
  const kmBis   = km != null ? km + kmTol : null;
  const plz = params.plz ? String(params.plz) : null;
  const radius = params.radiusKm ?? 200;
  const maxItems = params.maxItemsProPortal ?? 60;

  // Das Suchzentrum kommt aus dem Cockpit (zentrum.js geocodet die PLZ).
  // Ohne Koordinate bleibt der Umkreisfilter weg, statt null zu senden.
  const z = params.zentrum && params.zentrum.lat != null && params.zentrum.lon != null
    ? { lat: Number(params.zentrum.lat), lon: Number(params.zentrum.lon) }
    : null;
  const umkreis = z ? { lat: z.lat, lon: z.lon, radiusKm: radius } : {};

  // Leistung in PS — beide Portale, die danach filtern, nehmen PS entgegen.
  const ps = s.leistungKw != null ? Math.round(Number(s.leistungKw) * FAKTOR_PS_JE_KW) : null;
  const psVon = ps != null ? Math.round(ps * (1 - LEISTUNG_SPANNE)) : null;
  const psBis = ps != null ? Math.round(ps * (1 + LEISTUNG_SPANNE)) : null;

  const stichwort = [s.marke, s.modell].filter(Boolean).join(" ").trim();

  // ---- AutoScout24 -------------------------------------------------------
  // Der Umkreis wirkt: zehn Treffer, alle innerhalb 200 km (7 … 175 km).
  // Der Actor kennt kein `mileageFrom`, nur `mileageTo`.
  const autoScout = {
    make: markeSlug(s.marke),
    model: modellSlug(s.modell),
    countries: ["DE"],
    ...(jahrVon != null ? { yearFrom: jahrVon } : {}),
    ...(jahrBis != null ? { yearTo: jahrBis } : {}),
    ...(kmBis != null ? { mileageTo: kmBis } : {}),
    ...umkreis,
    maxResults: maxItems,
    includeDetails: true,
    // Ohne Residential-Proxy blockt AutoScout24 die Detailseiten und liefert
    // still leere Detailfelder — GPS, Ausstattung, kW. Und ohne Detailseite
    // gibt es keine Koordinate, an der der Umkreis greifen könnte.
    proxyConfiguration: { useApifyProxy: true, apifyProxyGroups: ["RESIDENTIAL"] },
  };

  // ---- mobile.de ---------------------------------------------------------
  // Strukturierte Marke/Modell statt Freitext; nativer PLZ-Umkreis.
  // `damageStatus: EXCLUDE` hat gewirkt — unter zehn Treffern war kein
  // Unfallfahrzeug. Das ist wichtig, weil mobile.de den Unfallstatus im
  // Datensatz gar nicht meldet (0 von 10). Filtern statt melden.
  const mobileDe = {
    make: markeMobile(s.marke),
    ...(s.modell ? { model: String(s.modell) } : {}),
    category: "CAR",
    ...(jahrVon != null ? { yearMin: jahrVon } : {}),
    ...(jahrBis != null ? { yearMax: jahrBis } : {}),
    ...(kmVon != null ? { mileageMin: kmVon } : {}),
    ...(kmBis != null ? { mileageMax: kmBis } : {}),
    ...(psVon != null ? { powerMin: psVon, powerMax: psBis } : {}),
    ...(plz ? { zipCode: plz, radiusKm: radius } : {}),
    damageStatus: "EXCLUDE",
    excludeKeywords: { fields: ["title", "description"], words: AUSSCHLUSSWORTE },
    maxResults: maxItems,
    includeDetails: true,
    sort: "relevance",
  };

  // ---- Kleinanzeigen -----------------------------------------------------
  // Die Attributschlüssel stammen aus der Filterleiste des Portals und tragen
  // ein Typkürzel (_s Text, _i Zahl). Gemessen: ungefiltert lagen 4 von 4
  // bzw. 5 von 5 Fahrzeugen ausserhalb der km-Spanne, gefiltert keines mehr.
  const attributeFilters = { "autos.marke_s": markeKleinanzeigen(s.marke) };
  if (kmVon != null) attributeFilters["autos.km_i"] = `${kmVon},${kmBis}`;
  if (jahrVon != null) attributeFilters["autos.ez_i"] = `${jahrVon},${jahrBis}`;

  const kleinanzeigen = {
    query: stichwort,
    category: "autos",
    ...umkreis,
    attributeFilters,
    // Der Actor nimmt "angebote" entgegen — wirkt aber nachweislich nicht:
    // in allen vier gemessenen Formen kamen Gesuche durch, auch über eine
    // Portaladresse mit `anzeige:angebote`. Gesetzt bleibt es, weil es nichts
    // kostet; verworfen werden Gesuche in adapters/apify.js am Feld `adType`.
    adType: "angebote",
    whatExclude: AUSSCHLUSSWORTE,
    // sortBy bleibt auf der Voreinstellung `newest`. Jede Preissortierung
    // verzerrt den Korb: `price_asc` lieferte 14 von 14 Fahrzeugen unter
    // 1.000 €. Der Hebel ist die Tiefe, nicht die Sortierung.
    maxResults: Math.max(KLEINANZEIGEN_TIEFE, maxItems),
    includeDetails: true,
  };

  return {
    mobileDe, autoScout, kleinanzeigen,
    _abgeleitet: { jahr: y, jahrVon, jahrBis, kmVon, kmBis, plz, radius,
      zentrum: z, leistungPs: ps },
  };
}

function main() {
  const [, , inPath, outPath] = process.argv;
  if (!inPath || !outPath) {
    console.error("Aufruf: node build-search-urls.js <params.json> <search-inputs.json>");
    process.exit(1);
  }
  const out = build(JSON.parse(fs.readFileSync(inPath, "utf8")));
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2), "utf8");
  console.log("mobile.de    :", JSON.stringify(out.mobileDe));
  console.log("AutoScout24  :", JSON.stringify(out.autoScout));
  console.log("Kleinanzeigen:", JSON.stringify(out.kleinanzeigen));
}

if (require.main === module) main();
module.exports = { build };
