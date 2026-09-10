# Die WBW-Beschaffung über Apify

Stand: 10.09.2026. Alle Zahlen in diesem Papier stammen aus drei echten
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

Drei Probeläufe, zwei echte Fälle (VW Sharan 12/2010, Citroën Berlingo
03/2021), Gesamtkosten **0,136 $**.

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

### Die Attributschlüssel bei Kleinanzeigen

Die Filterleiste des Portals nennt die Schlüssel, die der Actor unter
`attributeFilters` erwartet. Sie tragen ein Typkürzel: `_s` für Text, `_i` für
Zahl, `_b` für Ja/Nein. Gegen die Datensätze aus Probelauf 1 gehalten, passen
sie eins zu eins auf die deutschen Feldnamen in `attributes`:

| Feld in `attributes` | Schlüssel | Werte |
| --- | --- | --- |
| Marke | `autos.marke_s` | `volkswagen`, `mercedes_benz`, `citroen`, `sonstige_autos` … |
| Erstzulassung | `autos.ez_i` | Jahr, `1910`–`2026`, als `"von,bis"` |
| Kilometerstand | `autos.km_i` | `5000`–`150000`, als `"von,bis"` |
| Leistung | `autos.power_i` | **PS**, nicht kW — `34`–`252` |
| Fahrzeugzustand | `autos.schaden_s` | `ja` / `nein` |
| Kraftstoffart | `autos.fuel_s` | `benzin`, `diesel`, `lpg`, `hybrid` |
| Getriebe | `autos.shift_s` | `automatik`, `manuell` |
| Fahrzeugtyp | `autos.typ_s` | `kleinwagen`, `limousine`, `kombi`, `cabrio`, `suv`, `bus`, `coupe` |
| Anzahl Türen | `autos.anzahl_tueren_s` | `2_3`, `4_5` |
| HU bis | `autos.tuevy_i` | Jahr |
| Schadstoffklasse | `autos.schadstoffklasse_s` | `euro4`, `euro5`, `euro6` |
| Außenfarbe | `global.farbe` | — |

Die Ausstattung sind Ja/Nein-Schlüssel, und jeder von ihnen entspricht genau
einem deutschen Feldnamen aus dem Datensatz: `autos.trailer_coupling_b`
(Anhängerkupplung), `autos.park_assistant_b` (Einparkhilfe),
`autos.alluminium_rims_b` (Leichtmetallfelgen), `autos.xenon_led_light_b`,
`autos.air_conditioning_b` (Klimaanlage), `autos.navi_b`,
`autos.radio_tuner_b`, `autos.bluetooth_b`, `autos.handsfree_speaker_b`
(Freisprecheinrichtung), `autos.sunroof_b` (Schiebedach/Panoramadach),
`autos.seat_heating_b` (Sitzheizung), `autos.speed_control_b` (Tempomat),
`autos.non_smoking_b` (Nichtraucher-Fahrzeug), `autos.abs_b`,
`autos.full_service_history_b` (Scheckheftgepflegt).

**Damit ist die halbe Übersetzungstabelle geschenkt.** Kleinanzeigen liefert
die Ausstattung ohnehin deutsch; die Tabelle aus Abschnitt 3 wird nur für
AutoScout24 und mobile.de gebraucht.

### Probelauf 3: was die Schlüssel wirklich tun

Zehn Läufe, zwei Fälle, **0,060 $**. Je Fall zuerst ein Lauf ganz ohne Filter
als Lineal, dann beide Schreibweisen und `startUrls` unmittelbar danach.

| Lauf | Sharan | davon ausserhalb km / EZ | Berlingo | davon ausserhalb km / EZ |
| --- | --- | --- | --- | --- |
| ohne Filter | 4 | 4 / 1 | 5 | 5 / 4 |
| ohne Kürzel (`autos.km`) | 2 | **0 / 0** | 1 | **0 / 0** |
| mit Kürzel (`autos.km_i`) | 2 | **0 / 0** | 1 | **0 / 0** |
| `startUrls` | 2 | 0 / 0 | 1 | 0 / 0 |

**Die Schlüssel filtern, und die Schreibweise ist gleichgültig.** Beide Formen
lieferten in beiden Fällen dieselben Inserate — identische `listingId`. Der
Actor übersetzt also selbst; auch `autos.ez`, das er gar nicht dokumentiert,
kam mit Kürzel wie ohne durch. Das Lineal macht es beweiskräftig: ungefiltert
lagen 4 von 4 beziehungsweise 5 von 5 Fahrzeugen ausserhalb der km-Spanne,
gefiltert keines mehr.

**`startUrls` ist nicht besser.** Dieselben Inserate, dieselbe Anzahl. Damit
ist der offene Punkt beantwortet: die magere Ausbeute liegt **nicht** am
`attributeFilters`-Weg. Wir nehmen `attributeFilters` mit Kürzel — die Form,
die das Portal selbst in seine Adresse schreibt.

### Der Bauartfilter kostet auch bei Kleinanzeigen ein echtes Fahrzeug

| | ohne Bauartfilter | mit `autos.typ: bus` |
| --- | --- | --- |
| Sharan | 4 | **3** |
| Berlingo | 5 | 5 |

Beim Berlingo war er harmlos: er warf den *„Berlingo 75Ps Kastenwagen"*
(`Andere Fahrzeugtypen`) hinaus und zog ein weiteres Van/Bus nach.

Beim Sharan warf er den *„VW Sharan 2.0 Diesel 2010"* hinaus — einen echten
Sharan, den der Verkäufer als **Kombi** eingetragen hat. Kein Grenzfall,
sondern genau das Fahrzeug, das in den Korb gehört.

Damit gilt die Regel dieses Papiers auch für Kleinanzeigen, aus einem zweiten
Grund: bei AutoScout24 ist das Eingabevokabular falsch, bei Kleinanzeigen ist
die Eingabe des Verkäufers falsch. **Die Bauart wird nachträglich gefiltert,
nie am Portal.**

### Zwei Funde, nach denen niemand gesucht hat

**Kleinanzeigen liefert Gesuche.** Im ungefilterten Sharan-Lauf stand
*„Gesucht: SHARAN 7-Sitzer 2.0TDI"* mit `adType: "WANTED"`, 11.000 € und
20.000 km. Ein Wunschpreis eines Käufers, kein Angebot. Ungefiltert wäre er
als Vergleichsfahrzeug in den Median gegangen. Der Actor führt dafür einen
Schalter — und der ist selbst schon die nächste Falle: das **Eingabefeld**
`adType` nimmt `angebote`, das **Ausgabefeld** desselben Namens meldet
`OFFERED`. Wer den gelieferten Wert zurückschreibt, filtert nichts. Genau der
Fehler, der bei AutoScout24 `van` hiess. Gesetzt wird `angebote`, und das ist
**Pflicht**, kein Feinschliff.

**Kleinanzeigen liefert nur den heutigen Tag.** Über alle drei Probeläufe
hinweg tragen **31 von 31** Datensätzen dasselbe Einstelldatum — den Tag des
Laufs. Und ohne jeden Filter kamen bei `maxResults: 10` nur 4 (Sharan)
beziehungsweise 5 (Berlingo) Fahrzeuge zurück.

Beides zusammen liest sich so: der Actor holt die erste, nach Datum sortierte
Seite und filtert den Umkreis danach lokal. Was gestern eingestellt wurde,
sieht er nicht. Für einen Wertermittlungskorb ist das der Unterschied zwischen
dem Markt und dem, was heute Morgen zufällig inseriert wurde.

**Gemessen ist das Symptom, nicht die Ursache.** Der Gegentest ist billig und
steht aus: derselbe Lauf mit `maxResultsPerQuery` deutlich über 10, und einer
über eine Startadresse mit Seitenzahl. Bis dahin ist Kleinanzeigen nicht die
dritte gleichwertige Quelle, als die dieses Papier es bisher geführt hat.

### Die Lehre: Filter müssen sich nachweisen

Dreimal in dieser Sitzung ist derselbe Fehler aufgetreten — ein Filter, der
lautlos nichts tut oder lautlos das Falsche tut. Deshalb bekommt die
Beschaffung eine Selbstprüfung: **nach jedem Abruf wird gezählt, wie viele
gelieferte Fahrzeuge die gesetzten Spannen verletzen.** Verletzt mehr als eine
Handvoll sie, hat der Portalfilter nicht gegriffen; das steht dann im
Protokoll, und der Nachfilter räumt auf. Genau diese Zählung hat den Befund
oben erst beweiskräftig gemacht — sie kostet nichts und sie schläft nie.


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
| Modell | `make` + `model` | `make` + `model` (statt Freitext) | `query` + `autos.marke_s` |
| Umkreis | `lat`/`lon`/`radiusKm` | `zipCode`/`radiusKm` | `lat`/`lon`/`radiusKm` |
| Laufleistung | `mileageTo` | `mileageMin`/`Max` | `autos.km_i` als `"min,max"` |
| Baujahr | `yearFrom`/`To` | `yearMin`/`Max` | `autos.ez_i` als `"min,max"` |
| Leistung | — | `powerMin`/`Max` | `autos.power_i` (**in PS**) |
| Unfall | — | `damageStatus: EXCLUDE` | `autos.schaden_s: nein` |
| Ausschluss | — | `excludeKeywords` (Export, Bastler) | `whatExclude` |
| Angebote | — | — | **`adType: angebote`** (sonst Gesuche) |
| Details | `includeDetails: true` | `includeDetails: true` | `includeDetails: true` |
| **Bauart** | **nie** | **nie** | **nie** (kostet einen echten Sharan) |

Kleinanzeigen bekommt `attributeFilters` mit Kürzel. `startUrls` liefert
gemessen dasselbe und wird nicht gebraucht. Dass ein Tippfehler dort **still**
nicht filtert, bleibt wahr — dagegen steht die Selbstprüfung, nicht der
zweite Weg.

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

- **Kleinanzeigen sieht nur den heutigen Tag.** 31 von 31 Datensätzen tragen
  das Einstelldatum des Laufs; ungefiltert kamen 4 und 5 statt der angefragten
  10. Der Gegentest — `maxResultsPerQuery` deutlich höher, und eine
  Startadresse mit Seitenzahl — steht aus und ist der wichtigste offene Punkt
  dieses Papiers. Fällt er schlecht aus, ist Kleinanzeigen eine Ergänzung und
  keine dritte gleichwertige Quelle.
- ~~Kein EZ-Filter bei Kleinanzeigen.~~ **Erledigt:** `autos.ez_i`, gemessen
  wirksam.
- ~~Liegt die magere Ausbeute am `attributeFilters`-Weg?~~ **Erledigt:**
  nein — `startUrls` liefert dieselben Inserate.
- ~~Welche Schreibweise trägt?~~ **Erledigt:** beide, identisch.
- **Die Bauart-Gruppierung ist ungemessen.** Dass Van, Station Wagon und
  Other für einen Sharan alle „Großraum" heissen müssen, ist aus zwanzig
  Datensätzen geschlossen, nicht aus hundert. Der als **Kombi** eingetragene
  Sharan zeigt, dass die Gruppe weit sein muss.
- **Ein echter Lauf im Cockpit hat nie stattgefunden.** Alles hier stammt aus
  Einzelaufrufen der Actors, nicht aus der Pipeline.

## Reihenfolge der Umsetzung

| | Scheibe | Abnehmbar durch |
| --- | --- | --- |
| 1 | Probeläufe | ✅ abgeschlossen, 0,076 $ |
| 1b | Probelauf 3: Kleinanzeigen-Schlüssel, EZ, `startUrls`, Bauart | ✅ abgeschlossen, 0,060 $ |
| 1c | Probelauf 4: sieht Kleinanzeigen mehr als den heutigen Tag? | Treffer mit älterem Einstelldatum |
| 2 | Feldkarte + `mappe()` gegen die echten Datensätze | Vertrag hält, Tests grün |
| 3 | Filter je Portal vollständig setzen, Gesuche ausschliessen, Selbstprüfung | Testfall: Subjekt → erwartetes Eingabeobjekt |
| 4 | Bauartfilter im Plugin auf die neuen Werte, weich | Sharan-Regressionsfall |
| 5 | Umhängen auf L0, Gesamtdeckel, Rückfall-Hinweis | ein echter Lauf im Cockpit |
