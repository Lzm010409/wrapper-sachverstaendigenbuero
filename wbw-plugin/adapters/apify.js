/**
 * Stufe L3 — Apify. LETZTE Rückfallebene, KOSTENPFLICHTIG.
 * ------------------------------------------------------------------
 * Bleibt bewusst erhalten: die Eskalationskette hat nur Sinn, wenn die unterste
 * Ebene wirklich trägt. Die drei Actors sind dieselben wie vor der Umstellung
 * (siehe references/beschaffung.md).
 *
 * Kostenschutz: Dieses Modul verweigert den Lauf, solange WBW_ALLOW_PAID nicht
 * auf "1" steht. `npm test` setzt die Variable nicht — ein versehentlicher
 * kostenpflichtiger Lauf im normalen Testlauf schlägt damit fehl, statt Geld
 * zu kosten.
 *
 * Schnittstelle (Apify REST v2):
 *   POST /v2/acts/{actor}/run-sync-get-dataset-items?token=…&maxTotalChargeUsd=…
 *   Rumpf = das Actor-Input-Objekt, Antwort = das Dataset als JSON-Array.
 */
const { holeJson, zahl, ez, ausstattung, leeresFahrzeug, fehlendeZugangsdaten } = require("./gemeinsam.js");
const { mappeMitKarte } = require("./feldkarte.js");
const { reserviere, erstatte, schaetzeKosten } = require("../budget.js");
const { kraftstoffPasst } = require("../portalvokabular.js");

const BASIS = "https://api.apify.com/v2";

function pruefeFreigabe() {
  if (process.env.WBW_ALLOW_PAID !== "1") {
    const e = new Error(
      "L3 Apify ist kostenpflichtig und gesperrt. Zum bewussten Freischalten " +
      "WBW_ALLOW_PAID=1 setzen (siehe TESTKONZEPT.md, Abschnitt 1)."
    );
    e.code = "L3_GESPERRT";
    throw e;
  }
}

function token() {
  const t = process.env.APIFY_TOKEN;
  if (!t) throw fehlendeZugangsdaten("L3 Apify", ["APIFY_TOKEN"]);
  return t;
}

/**
 * Rohdatensatz eines Apify-Actors -> kanonisches Fahrzeug.
 *
 * Zuerst die Feldkarte des Actors (feldkarte.js): sie weiss, wie die Felder
 * bei diesem Actor wirklich heissen, und meldet ein fehlendes Pflichtfeld,
 * statt es still auf `null` zu lassen.
 *
 * Für einen Actor ohne Karte bleibt die alte Kandidatenliste stehen. Sie
 * trifft schlechter, aber sie trifft irgendetwas — und ein neu eingetragener
 * Actor soll Treffer liefern und nicht null, bis jemand die Karte ergänzt.
 * Dass er ohne Karte läuft, steht in den Warnungen.
 */
function mappe(raw, quelle, warnungen) {
  if (!raw || typeof raw !== "object") return null;
  const nachKarte = mappeMitKarte(raw, quelle, warnungen);
  if (nachKarte) return nachKarte;
  if (Array.isArray(warnungen) && !warnungen.some((w) => String(w).includes("ohne Feldkarte"))) {
    warnungen.push(`${quelle}: ohne Feldkarte abgebildet — Felder werden geraten (feldkarte.js ergänzen)`);
  }
  const g = (...pfade) => {
    for (const p of pfade) {
      const v = p.split(".").reduce((o, k) => (o == null ? undefined : o[k]), raw);
      if (v != null && v !== "") return v;
      if (raw[p] != null && raw[p] !== "") return raw[p];
    }
    return null;
  };
  const f = leeresFahrzeug(quelle);
  f.id = g("id", "listingId", "adId", "offerId", "adid") != null ? String(g("id", "listingId", "adId", "offerId", "adid")) : null;
  f.url = g("url", "canonicalUrl", "detailUrl", "link", "adUrl");
  f.titel = g("title", "name", "makeModel", "headline");
  f.variante = g("variant", "subTitle", "trimLevel", "modelVersion");
  f.preis = zahl(g("price.total.amount", "price.amount", "priceGross", "price", "priceValue"));
  f.kilometerstand = zahl(g("attributes.Mileage", "mileageKm", "mileage", "km", "kilometers"));
  f.erstzulassung = ez(g("attributes.First Registration", "firstRegistration", "firstRegistrationDate", "ez", "year"), warnungen);
  const p = g("attributes.Power", "powerKw", "power", "kw", "enginePower");
  f.leistungKw = zahl(p) != null && /ps/i.test(String(p)) && !/kw/i.test(String(p)) ? Math.round(zahl(p) / 1.35962) : zahl(p);
  f.getriebe = g("transmission", "gearbox");
  f.kraftstoff = g("fuel", "fuelType", "Kraftstoffart");
  f.fahrzeugtyp = g("bodyType", "vehicleType", "Fahrzeugtyp");
  f.tueren = g("doors", "numberOfDoors");
  f.plz = g("dealerDetails.addressStructured.zip", "location.zipcode", "zipCode", "zip", "plz");
  f.ort = g("location.city", "city", "ort");
  const la = g("dealerDetails.location.latitude", "location.latitude", "latitude", "lat");
  const lo = g("dealerDetails.location.longitude", "location.longitude", "longitude", "lon", "lng");
  f.lat = la != null ? Number(la) : null;
  f.lon = lo != null ? Number(lo) : null;
  f.ausstattung = ausstattung(g("features", "equipment", "options", "extras"));
  const b = g("images", "imageUrls", "photos", "pictures");
  f.bilder = Array.isArray(b) ? b.map((x) => (typeof x === "string" ? x : (x && (x.url || x.src)) || null)).filter(Boolean) : [];
  f.beschreibung = g("description", "descriptionText");
  if (f.plz != null) f.plz = String(f.plz);
  return f;
}

/**
 * Wirft Gesuche weg — nicht am Portal, sondern hier.
 *
 * Der Eingabeschalter `adType: "angebote"` wirkt bei Kleinanzeigen
 * nachweislich nicht: in allen vier gemessenen Formen kamen Gesuche durch,
 * auch über eine Portaladresse mit `anzeige:angebote` (1 von 19, 2 von 50,
 * 1 von 14, 1 von 19 Treffern). Ein Gesuch trägt den Wunschpreis eines
 * Käufers — im Probelauf stand ein „Gesucht: SHARAN 7-Sitzer 2.0TDI" mit
 * 11.000 € bei 20.000 km zwischen den Angeboten. Ungefiltert wäre er als
 * Vergleichsfahrzeug in den Median gegangen.
 *
 * Geprüft wird nur, was eine Angabe trägt. AutoScout24 und mobile.de führen
 * kein `adType`; für sie ist das hier ein Durchreicher.
 */
function nurAngebote(roh) {
  return (roh || []).filter((x) => x == null || x.adType == null || x.adType === "OFFERED");
}

/** Führt den Actor synchron aus und liefert die Dataset-Items. */
async function holen(eingaben, opts = {}) {
  pruefeFreigabe();
  const actor = opts.actor;
  if (!actor) throw new Error("L3 Apify: kein Actor in providers.json hinterlegt");
  const inputKey = opts.inputKey;
  const input = inputKey ? eingaben[inputKey] : eingaben;
  if (!input) throw new Error(`L3 Apify: Eingabeblock "${inputKey}" fehlt in search-inputs.json`);

  /*
    Zwei Deckel, und beide werden gebraucht.

    `maxTotalChargeUsd` gilt bei Apify **je Aufruf** — bei drei Portalen in bis
    zu drei Zyklen sind das neun Aufrufe. Der alte Wert 0,50 $ je Aufruf ergab
    also bis zu 4,50 $, ohne dass irgendwo eine Grenze gerissen wäre.

    Das Hauptbuch in `budget.js` deckelt den ganzen Lauf. Reserviert wird
    pessimistisch: der volle Betrag vor dem Aufruf, der ungenutzte Teil danach
    zurück. Fehlt das Hauptbuch, bleibt es beim Deckel je Aufruf — dann
    verhält sich alles wie bisher.
  */
  const wunsch = opts.maxTotalChargeUsd ?? 0.5;
  const deckel = reserviere(opts.budgetDatei, wunsch, `${opts.quelle || actor}`);
  if (opts.budgetDatei && deckel <= 0) {
    const e = new Error(
      `L3 Apify: Der Gesamtdeckel des Laufs ist erschöpft (${opts.budgetDatei}). ` +
      "Kein weiterer kostenpflichtiger Aufruf."
    );
    e.code = "BUDGET_ERSCHOEPFT";
    throw e;
  }

  const url = `${BASIS}/acts/${encodeURIComponent(actor.replace("/", "~"))}/run-sync-get-dataset-items`
    + `?token=${encodeURIComponent(token())}`
    + `&maxTotalChargeUsd=${encodeURIComponent(String(deckel))}`;
  const t0 = Date.now();
  const r = await holeJson(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
    timeoutMs: opts.timeoutMs ?? 600000,
  });
  if (r.status < 200 || r.status >= 300) {
    // Auch ein gescheiterter Aufruf kann den Grundpreis gekostet haben —
    // erstattet wird deshalb nur, was darüber hinaus reserviert war.
    erstatte(opts.budgetDatei, Math.max(0, deckel - schaetzeKosten(0, opts)), `${opts.quelle || actor} (HTTP ${r.status})`);
    throw new Error(`L3 Apify: HTTP ${r.status} für Actor ${actor}`);
  }
  const roh = Array.isArray(r.daten) ? r.daten : [];
  const geschaetzt = schaetzeKosten(roh.length, opts);
  erstatte(opts.budgetDatei, Math.max(0, deckel - geschaetzt), `${opts.quelle || actor}`);
  const warnungen = [];
  const quelle = opts.quelle || "apify";

  const angebote = nurAngebote(roh);
  const gesuche = roh.length - angebote.length;
  if (gesuche > 0) warnungen.push(`${quelle}: ${gesuche} Gesuch(e) verworfen (adType != OFFERED)`);

  const items = angebote.map((x) => mappe(x, quelle, warnungen)).filter(Boolean);

  /*
    Hat der Kraftstofffilter gegriffen?

    Diese Actors lehnen einen unbekannten Wert nicht ab — sie reichen ihn
    durch, und er filtert nichts. Ob Kleinanzeigen fuer Elektro wirklich
    `elektro` heisst, steht in keiner Quelle, die vorliegt. Statt zu raten und
    zu hoffen, wird nachgezaehlt: kommen Fahrzeuge mit anderem Kraftstoff
    zurueck, hat der Filter nicht gegriffen, und das steht im Protokoll.
  */
  const erwarteterKraftstoff = opts.erwartet && opts.erwartet.kraftstoff;
  let fremderKraftstoff = 0;
  if (erwarteterKraftstoff) {
    fremderKraftstoff = items.filter((f) => !kraftstoffPasst(erwarteterKraftstoff, f.kraftstoff)).length;
    if (fremderKraftstoff > 0) {
      warnungen.push(
        `${quelle}: Kraftstofffilter "${erwarteterKraftstoff}" hat nicht gegriffen — ` +
        `${fremderKraftstoff} von ${items.length} Fahrzeugen tragen einen anderen Kraftstoff. ` +
        "Vermutlich kennt der Actor das gesendete Token nicht (portalvokabular.js)."
      );
    }
  }
  return {
    items,
    protokoll: {
      abrufe: [{ url: `${BASIS}/acts/${actor}/run-sync-get-dataset-items`, status: r.status, ms: Date.now() - t0, zeitpunkt: new Date().toISOString() }],
      actor, maxTotalChargeUsd: deckel, geschaetzteKostenUsd: geschaetzt,
      rohTreffer: roh.length, gesuche, fremderKraftstoff, warnungen,
      /*
        Die vollstaendige Eingabe, wie sie an Apify ging.

        Ohne sie laesst sich nicht nachpruefen, ob ein Filter ueberhaupt
        hinausging — man sieht nur das Ergebnis und muss raten. Sie steht
        hier, damit sie sich Zeile fuer Zeile gegen die Apify-Konsole halten
        laesst, ohne den Lauf zu wiederholen. Der Zugangstoken steckt in der
        URL und nicht im Rumpf; saubereProtokollDaten redigiert ihn zusaetzlich.
      */
      gesendeteEingabe: input,
      kostenpflichtig: true,
    },
    roh,
  };
}

module.exports = { holen, mappe, nurAngebote, pruefeFreigabe, BASIS };
