# Die WBW-Beschaffung über Apify

Stand: 10.09.2026. Alle Zahlen in diesem Papier stammen aus zwei echten
Probeläufen gegen die Actors, nicht aus deren Dokumentation. Was gemessen ist,
steht mit Messwert da; was offen ist, steht als offen da.

## Warum überhaupt

Die Suche liefert Körbe, die kein Gutachten tragen. Der Lauf vom 08.09.2026
(VW Sharan, Fall 0826/2072TG) ist der Beleg: 94 geprüfte Inserate, 8 von der
KI als brauchbar beurteilt, **ein** Fahrzeug im Korb. Ein Teil davon lag an
der Auswertung und ist behoben (`53fdf2c`, `c578a61`, `998e697`). Der Rest
liegt an der Beschaffung, und dort an einer Stelle, die sich benennen lässt:

> Wir holen bundesweit und werfen hinterher weg, statt am Portal zu filtern.

Im Code stand als Begründung wörtlich *„kein PLZ-Umkreis am Actor → Geo wird
in pipeline.js per Luftlinie gefiltert"*. Das ist widerlegt. Alle drei Actors
führen einen Umkreisfilter, und er wirkt.

## Was gemessen wurde

Zwei Probeläufe, zwei echte Fälle (VW Sharan 12/2010, Citroën Berlingo
03/2021), Gesamtkosten **0,076 $**.

### Der Umkreis am Portal wirkt

Zehn Treffer, alle innerhalb des gesetzten Radius von 200 km:

| Portal | Entfernungen der Treffer |
| --- | --- |
| AutoScout24 | 7, 7, 9, 28, 41, 70, 83, 112, 143, 175 km |
| mobile.de | 7, 8, 42, 67, 114, 133, 154, 159, 163, 183 km |
| Kleinanzeigen | wirkt (Treffer in Ratingen, Soest, Cronenberg) |

Das ist der Hauptgewinn. Heute liefert `maxResults: 40` vierzig Fahrzeuge aus
ganz Deutschland, von denen der Umkreisfilter neun Zehntel verwirft. Mit
`radiusKm` am Actor sind alle vierzig im Umkreis.

### `bodyType` als Eingabefilter ist schädlich

Der erste Entwurf dieses Papiers empfahl, die Bauart am Portal zu filtern.
Der zweite Probelauf hat das widerlegt — eine Variable, beide Varianten
unmittelbar nacheinander:

| Fall | mit `bodyType: "van"` | ohne |
| --- | --- | --- |
| Sharan | 1 | **10** |
| Berlingo | 1 | **10** |

Der Grund: Eingabe- und Ausgabevokabular sind verschieden. Das Schema nimmt
`van` entgegen, das Ausgabefeld meldet `Van` — und trotzdem überlebt eines von
sieben. Der einzige Treffer mit Filter war ein *„Berlingo Kasten Club"*, also
ein echter Kastenwagen. `van` bedeutet bei AutoScout24 **Nutzfahrzeug**, nicht
Großraumlimousine.

Daraus die Regel dieses Papiers:

> **Am Portal filtern, was das Portal sauber kann** — Umkreis, Laufleistung,
> Baujahr, Preis, Leistung, Unfallstatus.
> **Die Bauart nachträglich aus dem gelieferten Feld filtern.** Der
> Karosseriefilter im Plugin existiert bereits; er scheiterte bisher nur
> daran, dass die Bauart `null` war.

Damit ist der Golf im Sharan-Korb gelöst, ohne den Korb zu verkleinern.

**Vorsicht bei der Gruppierung.** AutoScout24 klassifiziert denselben Sharan
mal als `Van`, mal als `Station Wagon`; beim Berlingo kamen fünf Bezeichnungen
für dasselbe Fahrzeug. Der Bauartfilter darf deshalb nicht hart auf einen Wert
filtern. Er braucht eine Gruppe (Van, Station Wagon, Transporter und Other
zählen als Großraum) und bleibt weich wie der Linienfilter: greift er zu hart,
wird er fallengelassen.

### `powerKw` bei Kleinanzeigen enthält PS

```
Kleinanzeigen  powerKw=170   attributes.Leistung='170 PS'
Kleinanzeigen  powerKw=131   attributes.Leistung='131 PS'
mobile.de      powerKw=110   powerPs=150          ← richtig
```

Ein Fehler im Actor. Ungeprüft übernommen wäre jede Leistungsangabe von
Kleinanzeigen um Faktor 1,36 zu hoch, und die Toleranz von ±10 kW hätte
systematisch die falschen Fahrzeuge behalten. Niemand hätte es bemerkt: 170
ist eine plausible Zahl.

Die Feldkarte rechnet für Kleinanzeigen deshalb `kW = PS / 1,35962`.

### Was `includeDetails` liefert

| | Treffer | `equipment` | `description` | Unfallstatus | Koordinaten | PLZ |
| --- | --- | --- | --- | --- | --- | --- |
| AutoScout24 | 10/10 | 10/10 | 10/10 | 10/10 `hadAccident` | ja | ja |
| mobile.de | 10/10 | 10/10 `features` | 10/10 | **0/10** | ja | **nein** |
| Kleinanzeigen | 2–3 | in `attributes` | ja | ja `vehicleCondition` | ja | ja |

Zwei Lücken, beide verkraftbar:

- **mobile.de meldet den Unfallstatus nicht.** Es braucht ihn auch nicht:
  `damageStatus: "EXCLUDE"` hat gewirkt, unter zehn Treffern war kein
  Unfallfahrzeug. Filtern ist besser als melden.
- **mobile.de liefert keine PLZ**, nur den Ortsnamen — dafür
  `sellerLatitude`/`sellerLongitude`. Für den Umkreis reicht das; im Beleg
  steht dann der Ort statt der PLZ.

### Laufzeiten

3,5 bis 22,4 Sekunden je Actorlauf. Der synchrone Aufruf
`run-sync-get-dataset-items` bleibt mit grossem Abstand im Zeitlimit.

## Der Umbau

### Der Vertrag bleibt

`leeresFahrzeug()` in `wbw-plugin/adapters/gemeinsam.js`. Alles dahinter —
`normalize.js` → `pipeline.js` → `run-report.js` → `result.json` →
`leseErgebnis` → Korbtabelle → Belege — bleibt unberührt. Dort hängen die
Tests: derselbe Vertrag hinein, derselbe Report heraus.

**Das öffnet das Plugin.** Bisher galt „`wbw-plugin/` bleibt unangetastet".
Diese Umstellung lebt genau dort. Eine bewusste Abkehr, keine nebenbei.

### 1. Filter je Portal

Was gesetzt wird — und was ausdrücklich **nicht**:

| | AutoScout24 | mobile.de | Kleinanzeigen |
| --- | --- | --- | --- |
| Modell | `make` + `model` | `make` + `model` (statt Freitext) | `attributeFilters` bzw. `startUrls` |
| Umkreis | `lat`/`lon`/`radiusKm` | `zipCode`/`radiusKm` | `lat`/`lon`/`radiusKm` |
| Laufleistung | `mileageTo` | `mileageMin`/`Max` | `autos.km` als `"min,max"` |
| Baujahr | `yearFrom`/`To` | `yearMin`/`Max` | — |
| Leistung | — | `powerMin`/`Max` | — |
| Unfall | — | `damageStatus: EXCLUDE` | — |
| Ausschluss | — | `excludeKeywords` (Export, Bastler) | `whatExclude` |
| Details | `includeDetails: true` | `includeDetails: true` | `includeDetails: true` |
| **Bauart** | **nie** | **nie** | **nie** |

Kleinanzeigen bekommt `startUrls`, wo `attributeFilters` nicht trägt: laut
Schema werden unbekannte Schlüssel *„sent as-is and may simply not narrow
results"* — ein Tippfehler filtert dort **still** nicht. Die Suchadressen baut
`build-search-urls.js` bereits.

### 2. Feldkarte je Actor

Statt der heutigen generischen `mappe()` mit Kandidatenlisten eine
deklarative Karte je Actor. Die drei liefern verschiedene Namen, und Raten ist
das, was brüchig wird:

| Ziel | AutoScout24 | mobile.de | Kleinanzeigen |
| --- | --- | --- | --- |
| `url` | `url` | `canonicalUrl` | `url` |
| `leistungKw` | `powerKw` | `powerKw` | `powerKw / 1,35962` |
| `bauart` | `bodyType` | `bodyType` | `attributes.Fahrzeugtyp` |
| `verkaeuferart` | `sellerType` | `sellerType` | `seller.type` |
| `unfall` | `hadAccident` | — (gefiltert) | `vehicleCondition` |
| `ausstattung` | `equipment` | `features` | `attributes` |
| `lat`/`lon` | `latitude`/`longitude` | `sellerLatitude`/`sellerLongitude` | `latitude`/`longitude` |
| `plz` | `zip` | — (nur `location`) | `zipCode` |

### 3. Ausstattung: Übersetzungstabelle

AutoScout24 und mobile.de liefern englisch (`Air conditioning`, `Park
Distance Control`), Kleinanzeigen deutsch, die Soll-Ausstattung aus der DAT
deutsch. Es kommt eine Zuordnungstabelle englisch → deutsch für die
geläufigen Merkmale.

**Das Pflegerisiko ist benannt:** eine unvollständige Tabelle lässt ein
Merkmal still durchfallen — dieselbe Fehlerklasse wie die Linienliste. Der
Abgleich am deutschen Beschreibungstext bleibt deshalb bestehen; die Tabelle
ergänzt ihn, sie ersetzt ihn nicht.

### 4. Reihenfolge und Kosten

Alle drei Portale laufen in jedem Zyklus. Apify wird erste Wahl; die
kostenlosen Stufen bleiben als Rückfall darunter — **und wenn ein Rückfall
greift, steht das im Protokoll und in der Benachrichtigung.** Ein stiller
Rückfall ist derselbe Fehler wie die stille PDF-Stufe.

Kosten: 0,005 $ je Actorlauf, 0,00049 (AS24) / 0,00059 (mobile.de) / 0,0004
(Kleinanzeigen) je Datensatz. Drei Portale, bis drei Zyklen, 40 Treffer je
Lauf: **rund 0,22 $ je Recherche.**

Der heutige Deckel `maxTotalChargeUsd: 0.5` gilt **je Aufruf** — bei neun
Aufrufen wären das 4,50 $. Er wird ein Gesamtdeckel für den Lauf, und die
kostenpflichtige Stufe bleibt zusätzlich ein bewusster Haken in der
Oberfläche.

## Was offen bleibt

- **Kleinanzeigen liefert wenig.** Zwei bis drei Treffer bei zehn
  angefragten. Ob das am `attributeFilters`-Weg liegt oder am Bestand, ist
  ungemessen. Der Gegentest wäre derselbe Lauf über `startUrls`.
- **Kein EZ-Filter bei Kleinanzeigen.** Der Schlüssel für die Erstzulassung
  ist nicht dokumentiert und wurde nicht erraten. Im Probelauf kamen deshalb
  Fahrzeuge von 2012 bis 2024 zurück.
- **Die Bauart-Gruppierung ist ungemessen.** Dass Van, Station Wagon und
  Other für einen Sharan alle „Großraum" heissen müssen, ist aus zwanzig
  Datensätzen geschlossen, nicht aus hundert.
- **Ein echter Lauf im Cockpit hat nie stattgefunden.** Alles hier stammt aus
  Einzelaufrufen der Actors, nicht aus der Pipeline.

## Reihenfolge der Umsetzung

| | Scheibe | Abnehmbar durch |
| --- | --- | --- |
| 1 | Probeläufe | ✅ abgeschlossen, 0,076 $ |
| 2 | Feldkarte + `mappe()` gegen die echten Datensätze | Vertrag hält, Tests grün |
| 3 | Filter je Portal vollständig setzen | Testfall: Subjekt → erwartetes Eingabeobjekt |
| 4 | Bauartfilter im Plugin auf die neuen Werte, weich | Sharan-Regressionsfall |
| 5 | Umhängen auf L0, Gesamtdeckel, Rückfall-Hinweis | ein echter Lauf im Cockpit |
