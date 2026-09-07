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

**Warum unverändert:** Das Plugin wird weiterentwickelt. Jede Änderung hier
müsste bei einer neuen Fassung von Hand nachgezogen werden. Was das Cockpit
zusätzlich braucht — Markenfilter, Fortschritt, Ablage — liegt deshalb in
`src/wbw/`, nicht in diesen Dateien.

Aktualisieren: den Ordner `skills/wbw-vergleichsfahrzeuge/scripts/` aus dem
Plugin hierher kopieren; die drei Dateien oben bleiben stehen. Zugangsdaten
gehören **nicht** hierher, sondern in die Umgebungsvariablen.
