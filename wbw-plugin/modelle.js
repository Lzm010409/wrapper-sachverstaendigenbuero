/**
 * Gibt die Modellnamen aus, die ein Portal für eine Marke wirklich kennt.
 *
 *   node modelle.js "Mercedes-Benz"        -> JSON auf die Standardausgabe
 *
 * Warum es das braucht: autoiXpert liefert den Modellnamen der DAT
 * (`E Limousine (BM 213)`), die Portale führen ihre eigene Taxonomie
 * (`E 53 AMG`). Den Untertyp aus der autoiXpert-Maske gibt die Schnittstelle
 * nicht heraus — geprüft am 07.09.2026 an zwei Gutachten. Geraten wird
 * nichts: der Sachverständige wählt aus dieser Liste.
 *
 * Der Adapter liest die Liste ohnehin schon, um eine unbekannte Eingabe
 * abzuweisen. Hier wird nur derselbe Weg für sich genommen.
 */
const as24 = require("./adapters/autoscout24.js");

const BROWSER = {
  "user-agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36",
  "accept-language": "de-DE,de;q=0.9",
};

/** Marke in die Schreibweise des Portals bringen: klein, Bindestriche. */
function normMarke(marke) {
  return String(marke || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-");
}

async function modelleFuerMarke(marke) {
  const url = as24.bauSuchUrl({ autoScout: { make: normMarke(marke) } }, 1);
  const antwort = await fetch(String(url), { headers: BROWSER });
  if (!antwort.ok) throw new Error(`AutoScout24 antwortete HTTP ${antwort.status}`);
  const next = as24.findeNextData(await antwort.text());
  if (!next) throw new Error("AutoScout24: __NEXT_DATA__ nicht gefunden — Seitenaufbau geändert?");
  return as24.findeModelle(next);
}

async function main() {
  const marke = process.argv[2];
  if (!marke) {
    console.error("Aufruf: node modelle.js <Marke>");
    process.exit(2);
  }
  try {
    const modelle = modelleFuerMarke(marke);
    const liste = await modelle;
    const wunsch = process.argv[3];
    const ausgabe = { marke, anzahl: liste.length, modelle: liste };
    if (wunsch) {
      ausgabe.aufloesung = as24.aufloeseModell(wunsch, liste);
      ausgabe.vorschlaege = as24.modellVorschlaege(wunsch, liste);
    }
    process.stdout.write(JSON.stringify(ausgabe));
  } catch (fehler) {
    process.stdout.write(JSON.stringify({ fehler: fehler.message }));
    process.exit(1);
  }
}

if (require.main === module) main();
module.exports = { modelleFuerMarke, normMarke };
