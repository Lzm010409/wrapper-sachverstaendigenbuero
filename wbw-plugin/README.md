# WBW-Plugin — unverändert übernommen

Die Skripte des Plugins `wbw-vergleichsfahrzeug-finder` (Version 0.2.0),
Wort für Wort wie ausgeliefert. Sie werden vom Cockpit als **eigene Prozesse**
aufgerufen, so wie sie gedacht sind — nicht in die Anwendung hineingezogen.

Dazugekommen sind nur drei Dateien, die das Plugin nicht mitbringt und die
eine Anwendung braucht:

| Datei | Wozu |
| --- | --- |
| `package.json` | `"type": "commonjs"`. Das Cockpit ist ein ESM-Paket; ohne diese Datei hielte Node die `.js` des Plugins für ESM und fände `require` nicht. So bleibt jede Plugin-Datei unverändert. |
| `modelle.js` | Liefert die Modellnamen, die ein Portal für eine Marke wirklich kennt. |
| `zentrum.js` | Löst eine Postleitzahl in Koordinaten auf. |

## Zwei Eingriffe, beide begründet

Am Plugin selbst wurde zweimal etwas geändert. Beides gehört bei einer neuen
Fassung des Plugins geprüft — und beides gehört in das Plugin-Projekt
zurückgemeldet, damit die Änderung hier wieder entfällt.

| Datei | Was | Warum |
| --- | --- | --- |
| `adapters/kleinanzeigen.js` | Trennzeichen im Suchbegriff: `_` statt `-` | Kleinanzeigen führt `marke_s:mercedes_benz`. Mit `mercedes-benz` wird der Filter **stillschweigend fallengelassen**: gemessen 5 statt 27 Mercedes auf der ersten Seite, bei `model_s:t-roc` sogar 0 statt 25. |
| `providers.json` | Begründung der Stufe L1 richtiggestellt | Dort stand, der direkte Zugriff auf kleinanzeigen.de werde IP-gesperrt. Am 07.09.2026 nachgemessen stimmt das so nicht: es ist eine Frequenzbremse, die nach einer Pause wieder durchlässt. Der Endpunkt selbst (`KA_API_BASE`) ist unverändert — er zeigt nur auf das Cockpit statt auf einen zweiten Dienst. |

**Warum sonst unverändert:** Das Plugin wird weiterentwickelt. Jede Änderung hier
müsste bei einer neuen Fassung von Hand nachgezogen werden. Was das Cockpit
zusätzlich braucht — Markenfilter, Fortschritt, Ablage — liegt deshalb in
`src/wbw/`, nicht in diesen Dateien.

Aktualisieren: den Ordner `skills/wbw-vergleichsfahrzeuge/scripts/` aus dem
Plugin hierher kopieren; die drei Dateien oben bleiben stehen. Zugangsdaten
gehören **nicht** hierher, sondern in die Umgebungsvariablen.
