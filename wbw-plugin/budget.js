/**
 * Ein Gesamtdeckel für den ganzen Lauf, nicht je Aufruf.
 * ------------------------------------------------------------------
 * **Das Problem.** `maxTotalChargeUsd` gilt bei Apify **je Aufruf**. Der Wert
 * stand auf 0,50 $, und ein Lauf ruft drei Portale in bis zu drei Zyklen auf —
 * neun Aufrufe, also bis zu **4,50 $**, ohne dass irgendwo eine Grenze
 * gerissen wäre. Jeder einzelne Aufruf hätte sich an seinen Deckel gehalten.
 *
 * **Warum eine Datei.** Die Portale laufen als eigene Kindprozesse
 * (`fetch-portal.js` je Portal je Zyklus). Eine Zahl im Speicher überlebt das
 * nicht. Das Hauptbuch liegt deshalb im Ordner des Vorgangs, neben den
 * Rohdaten — es ist Teil des Belegs, nicht nur eine Schranke.
 *
 * **Pessimistisch reserviert.** Vor dem Aufruf wird der volle Deckel
 * abgebucht, nach dem Aufruf der nicht verbrauchte Teil zurückgegeben. Ein
 * Prozess, der abstürzt, hat damit zu viel abgebucht und nicht zu wenig — die
 * Richtung, in der ein Fehler nichts kostet.
 *
 * **Die Schätzung ist eine Schätzung.** Was ein Lauf wirklich kostet, steht
 * auf der Apify-Abrechnung. Hier wird aus der Preisliste gerechnet
 * (Grundpreis je Actorlauf + Preis je Datensatz), gemessen in den Probeläufen.
 * Deshalb bleibt der Deckel je Aufruf zusätzlich bestehen: er ist die harte
 * Grenze, dieses Hauptbuch die weiche.
 */
const fs = require("fs");
const path = require("path");

/** Voreinstellung für den ganzen Lauf. Eine Recherche kostet rund 0,26 $. */
const VOREINSTELLUNG_USD = 1.0;

function lies(datei) {
  try {
    const d = JSON.parse(fs.readFileSync(datei, "utf8"));
    if (typeof d.restUsd === "number" && Number.isFinite(d.restUsd)) return d;
  } catch { /* fehlt oder kaputt -> neu anlegen */ }
  return null;
}

function schreib(datei, stand) {
  fs.mkdirSync(path.dirname(path.resolve(datei)), { recursive: true });
  fs.writeFileSync(datei, JSON.stringify(stand, null, 2), "utf8");
}

/** Legt das Hauptbuch an, falls es fehlt. Ein vorhandenes bleibt unberührt. */
function eroeffne(datei, deckelUsd = VOREINSTELLUNG_USD) {
  const vorhanden = lies(datei);
  if (vorhanden) return vorhanden;
  const stand = { deckelUsd, restUsd: deckelUsd, buchungen: [], eroeffnet: new Date().toISOString() };
  schreib(datei, stand);
  return stand;
}

/**
 * Reserviert bis zu `wunschUsd` und liefert, was bewilligt wurde.
 *
 * Ist nichts mehr übrig, kommt 0 zurück — der Aufrufer muss dann selbst
 * entscheiden, ob er abbricht. Ein Deckel von 0 an Apify zu senden wäre ein
 * Aufruf, der sofort abbricht und trotzdem den Grundpreis kostet.
 */
function reserviere(datei, wunschUsd, wofuer) {
  if (!datei) return wunschUsd; // ohne Hauptbuch gilt nur der Deckel je Aufruf
  const stand = eroeffne(datei);
  const bewilligt = Math.max(0, Math.min(wunschUsd, stand.restUsd));
  stand.restUsd = Number((stand.restUsd - bewilligt).toFixed(6));
  stand.buchungen.push({ art: "reserviert", usd: bewilligt, wofuer, zeitpunkt: new Date().toISOString() });
  schreib(datei, stand);
  return bewilligt;
}

/** Gibt den nicht verbrauchten Teil einer Reservierung zurück. */
function erstatte(datei, betragUsd, wofuer) {
  if (!datei || !(betragUsd > 0)) return;
  const stand = eroeffne(datei);
  stand.restUsd = Number(Math.min(stand.deckelUsd, stand.restUsd + betragUsd).toFixed(6));
  stand.buchungen.push({ art: "erstattet", usd: betragUsd, wofuer, zeitpunkt: new Date().toISOString() });
  schreib(datei, stand);
}

/**
 * Was ein Actorlauf gekostet hat — aus der Preisliste, nicht von der
 * Abrechnung. Die Preise stehen je Stufe in providers.json und stammen aus
 * den Probeläufen vom 10.09.2026.
 */
function schaetzeKosten(anzahlDatensaetze, preise = {}) {
  const grund = preise.grundpreisUsd ?? 0.005;
  const jeSatz = preise.preisJeDatensatzUsd ?? 0.0006;
  return Number((grund + Math.max(0, anzahlDatensaetze) * jeSatz).toFixed(6));
}

module.exports = { eroeffne, lies, reserviere, erstatte, schaetzeKosten, VOREINSTELLUNG_USD };
