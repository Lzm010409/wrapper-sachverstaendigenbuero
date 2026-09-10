# Echte Antworten von Kleinanzeigen

Beide Dateien sind **unveränderte Antworten** von `www.kleinanzeigen.de`,
abgerufen am 07.09.2026 mit einem gewöhnlichen HTTP-Aufruf — ohne Browser,
ohne JavaScript, ohne Cookies. Genau das ist der Beleg dafür, dass die
Beschaffung im Cockpit ohne Chromium auskommt.

| Datei | Herkunft |
| --- | --- |
| `kleinanzeigen-suchseite.html` | `GET /s-autos/c216+autos.marke_s:mercedes_benz` |
| `kleinanzeigen-inserat.html` | `GET /s-anzeige/…/3455356908-216-2469` |

**Zwei Kürzungen, damit die Dateien in ein Verzeichnis passen** — beide
lassen den ausgewerteten Teil unberührt:

1. In der Suchseite stehen 5 der ursprünglich 27 Trefferkarten — darunter die
   beiden Sonderfälle: eine Anzeige ohne Preisangabe („VB") und eine mit einem
   46 Zeichen langen Ortsnamen. Die
   Zusammenfassung („1 - 25 von 93.071") und die Seitennummerierung sind
   vollständig erhalten, deshalb prüfen die Tests dort weiter gegen die
   echten Zahlen.
2. Die eingebetteten Skripte und die Zustandsdaten der Astro-Inseln sind
   durch einen Platzhalter ersetzt. Die Auswertung liest sie nicht — mit und
   ohne sie kommt dasselbe heraus, nachgemessen vor und nach der Kürzung.
   Die `application/ld+json`-Blöcke **innerhalb** der Trefferkarten bleiben,
   sie tragen Titel und Beschreibung.

Die Anzeigen sind öffentliche Inserate. Sie stehen hier, weil ein Test gegen
eine erfundene Seite nur beweist, dass der Leser die Erfindung versteht.
