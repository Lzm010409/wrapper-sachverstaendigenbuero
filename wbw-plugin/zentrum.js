/**
 * Löst eine Postleitzahl in Koordinaten auf.
 *
 *   node zentrum.js 50997     -> {"plz":"50997","lat":50.86,"lon":6.95}
 *
 * Der Geo-Filter des Plugins kennt nur die hinterlegten PLZ-Bereiche
 * 47 (Krefeld), 41 (Neuss) und 40 (Düsseldorf) und **bricht ab**, wenn ein
 * anderer Bereich kommt — bei Köln (50997) endete der Lauf mit
 *   „Kein Zentrum für PLZ-Bereich 50 hinterlegt".
 *
 * Im geführten Gespräch trägt der Sachverständige das Zentrum von Hand nach
 * (SKILL.md, Schritt 2). Eine Anwendung kann das nicht verlangen. `geocode.js`
 * kann es längst — es wurde nur für die Fahrzeuge benutzt, nicht für das
 * Suchzentrum.
 */
const { geocodeZips } = require("./geocode.js");

async function zentrumFuerPlz(plz) {
  const bereinigt = String(plz || "").trim();
  if (!/^\d{4,5}$/.test(bereinigt)) throw new Error(`„${plz}" ist keine Postleitzahl.`);
  const treffer = await geocodeZips([bereinigt]);
  const koordinaten = treffer instanceof Map ? treffer.get(bereinigt) : treffer[bereinigt];
  if (!koordinaten) throw new Error(`Für die PLZ ${bereinigt} liess sich kein Ort bestimmen.`);
  return { plz: bereinigt, lat: koordinaten.lat, lon: koordinaten.lon };
}

async function main() {
  try {
    process.stdout.write(JSON.stringify(await zentrumFuerPlz(process.argv[2])));
  } catch (fehler) {
    process.stdout.write(JSON.stringify({ fehler: fehler.message }));
    process.exit(1);
  }
}

if (require.main === module) main();
module.exports = { zentrumFuerPlz };
