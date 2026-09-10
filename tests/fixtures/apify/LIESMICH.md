# Echte Antworten der drei Apify-Actors

Alle drei Dateien sind Antworten von `run-sync-get-dataset-items`, abgerufen
am **10.09.2026** in den Probeläufen zum Konzept
`docs/wbw-beschaffung-apify.md`. Gesamtkosten aller Probeläufe: 0,239 $.

| Datei | Actor | Herkunft |
| --- | --- | --- |
| `autoscout24.json` | `blackfalcondata/autoscout24-scraper` | Probelauf 2, beide Fälle ohne `bodyType` |
| `mobile-de.json` | `blackfalcondata/mobile-de-scraper` | Probelauf 1, beide Fälle |
| `kleinanzeigen.json` | `blackfalcondata/kleinanzeigen-scraper` | Probelauf 5, beide Fälle mit `maxResults: 80` |

Die zwei Fälle sind echte Vorgänge: ein **VW Sharan 12/2010** (der Fall, in
dem am 08.09.2026 ein Golf im Korb landete) und ein **Citroën Berlingo
03/2021** (der Fall, in dem „Feel XL" als Modellname geführt wurde).

**Zwei Kürzungen, beide ausserhalb des Ausgewerteten:**

1. `imageUrls` / `images` auf die ersten zwei Einträge. Die Feldkarte prüft,
   *dass* Bilder ankommen und in welcher Form — nicht wie viele.
2. `descriptionHtml` und `descriptionMarkdown` entfernt. Beide wiederholen
   `description` Wort für Wort in anderer Auszeichnung; ausgewertet wird
   `description`.

Alles andere steht unverändert da, einschliesslich der Fehler der Actors:

- Kleinanzeigen schreibt die **PS-Zahl in das Feld `powerKw`** — im selben
  Datensatz steht `powerKw: 170` neben `attributes.Leistung: "170 PS"`.
- Kleinanzeigen liefert **Gesuche** (`adType: "WANTED"`), obwohl im Aufruf
  `adType: "angebote"` stand.
- AutoScout24 nennt ein Feld `variant`, trägt dort aber die Bauform
  („Crew Van"), nicht die Ausstattungslinie.
- mobile.de liefert **keine Postleitzahl**, nur Ortsnamen und Koordinaten.

Genau deshalb stehen sie hier. Ein Test gegen eine erfundene Antwort
beweist nur, dass der Leser die Erfindung versteht.

Die Inserate sind öffentlich. Personenbezogene Angaben über den
Verkäufernamen des Inserats hinaus stehen nicht darin.
