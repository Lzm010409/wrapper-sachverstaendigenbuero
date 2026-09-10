# Die WBW-Beschaffung über Apify

Stand: 10.09.2026. Alle Zahlen in diesem Papier stammen aus fünf echten
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

Fünf Probeläufe, zwei echte Fälle (VW Sharan 12/2010, Citroën Berlingo
03/2021), Gesamtkosten **0,239 $**.

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

### Gesuche kommen durch, auch mit gesetztem Filter

Im ungefilterten Sharan-Lauf stand *„Gesucht: SHARAN 7-Sitzer 2.0TDI"* mit
`adType: "WANTED"`, 11.000 € bei 20.000 km — ein Wunschpreis eines Käufers,
der als Vergleichsfahrzeug in den Median gegangen wäre.

Der Actor führt dafür einen Schalter, und ich habe ihn zweimal falsch
verstanden. Erst schrieb ich den **Ausgabewert** `OFFERED` ins Papier; das
Eingabeschema nimmt `angebote`. Dann korrigierte ich auf `angebote` und nannte
es Pflicht. Probelauf 4 hat auch das widerlegt:

| Lauf | Eingabe | Gesuche in der Antwort |
| --- | --- | --- |
| mehr verlangt | `adType: "angebote"` | 1 von 19 |
| ohne Umkreis | `adType: "angebote"` | 2 von 50 |
| nach Preis | `adType: "angebote"` | 1 von 14 |
| Startadresse | URL mit `anzeige:angebote` | 1 von 19 |

**Der Filter wirkt in keiner der vier Formen** — auch nicht über die
Portaladresse. Gesuche werden deshalb **nachträglich** verworfen, am
gelieferten Feld `adType !== 'OFFERED'`. Gesetzt wird `angebote` trotzdem: es
schadet nicht und kostet nichts.

### Probelauf 4: Kleinanzeigen sieht sehr wohl mehr als heute

Die Vermutung aus Probelauf 3 — der Actor hole nur die neueste Seite — ist
**widerlegt**. Fünf Läufe, ein Fall, je eine Variable, **0,068 $**:

| Lauf | Treffer | davon nicht von heute |
| --- | --- | --- |
| wie Probelauf 3 (`maxResults: 10`) | 5 | 0 |
| `maxResults: 50` | 19 | 0 |
| ohne Umkreis | 50 | 2 |
| **`sortBy: price_asc`** | 14 | **14** |
| Startadresse | 19 | 0 |

Die Sortierung war es. Voreingestellt ist `newest`, und Kleinanzeigen schiebt
Anzeigen laufend nach oben — die ersten Seiten zeigen deshalb fast nur den
heutigen Tag. Nach Preis sortiert kamen Inserate vom 22.08. bis 08.09. Der
Actor blättert; er blätterte nur durch eine Liste, die vorn nichts Älteres
enthält.

**Zwei Dinge, die dabei nebenbei sichtbar wurden.**

`maxResults` zählt die **geholten**, nicht die gelieferten Datensätze. Mit
Umkreis kamen 19 von 50 zurück, ohne Umkreis 50 von 50. Der Umkreis wirkt bei
Kleinanzeigen also als Nachfilter, und der Actor holt nicht nach, um die Zahl
aufzufüllen. Wer vierzig Fahrzeuge im Korb will, muss ein Vielfaches
verlangen.

Und **keine der drei Sortierungen liefert einen unverzerrten Korb.** `newest`
ist zeitlich verzerrt, `price_asc` liefert 14 von 14 Fahrzeugen unter 1.000 €
— darunter eine Rückbank für 50 €, ein *„Schlachter"*, ein *„Bastlerfahrzeug"*
und ein Citroën XM, also ein anderes Modell. `price_desc` wäre spiegelbildlich
verzerrt. Für einen Median ist beides unbrauchbar.

Der Ausweg ist nicht die Sortierung, sondern die **Enge der Grundmenge**:
stehen `autos.km_i` und `autos.ez_i`, ist kaum noch etwas da, was eine
Sortierung verzerren könnte. Genau das ist die nächste Messung — Probelauf 4
lief bewusst ohne Attributfilter, um die Sortierung isoliert zu sehen.

### Probelauf 5: Kleinanzeigen trägt — mit Tiefe

Der Probeaufbau der fertigen Beschaffung: alle gemessenen Filter zusammen,
je Fall einmal flach und einmal tief. Vier Läufe, **0,035 $**.

| Fall | Tiefe | geliefert | im Korb | verschiedene Einstelltage |
| --- | --- | --- | --- | --- |
| Sharan | 10 | 2 | 2 | 1 |
| Sharan | **80** | 17 | **17** | **7** |
| Berlingo | 10 | 1 | 1 | 1 |
| Berlingo | **80** | 18 | **18** | **16** |

Die Tiefe löst beide Probleme auf einmal. Der Korb wird gross genug — statt
zwei und einem Fahrzeug siebzehn und achtzehn — und er reicht zeitlich
zurück: der Berlingo-Korb spannt vom 27.07. bis zum 10.09.

**`sortBy` bleibt deshalb auf `newest`.** Probelauf 4 legte nahe, an der
Sortierung zu drehen; das wäre der falsche Hebel gewesen, weil jede
Preissortierung den Korb verzerrt. Es war nie die Sortierung, es war die
Tiefe.

Die Körbe sind plausibel: Sharan 3.900 bis 15.490 € bei einem Median von
10.400 €, Berlingo 8.990 bis 21.950 € bei 15.245 €.

### Zwei echte Sharans, verworfen von meinem eigenen Filter

Von 17 gelieferten Fahrzeugen fielen zwei an der Stufe *„richtiges Modell"*:

```
Modell='Weitere VW'   Vw Sharan 2.0 TDI          15.650 €
Modell='Weitere VW'   Vw sharan diesel 2.0 tdi    9.500 €
```

Beide sind Sharans. Der Verkäufer hat das Modell nicht eingetragen, und
Kleinanzeigen hat *„Weitere VW"* daraus gemacht. Mein Probeskript prüfte
`Modell ?? Titel` — weil `Modell` gesetzt war, kam der Titel nie zum Zug.
Mit `Modell` **und** Titel bleiben 17 von 17.

Ein Zwölftel des Korbs, verloren an eine Zeile, die ich selbst geschrieben
habe, um genau solche Verluste sichtbar zu machen. Daraus die Regel:

> **Modell, Marke und Bauart werden nie aus einem einzigen Feld entschieden.**
> Attributfeld und Titel zusammen, und bei Gleichstand gewinnt das
> grosszügigere Ergebnis.

Es ist dieselbe Sache wie *„Feel XL"* im Modellfeld der DAT, nur von der
anderen Seite: dort stand zu viel im Feld, hier zu wenig.

### Die Bauart-Gruppierung, jetzt mit Zahlen

Der Berlingo-Korb aus achtzehn Fahrzeugen trägt fünf verschiedene
Bauartangaben:

| Van/Bus | Andere Fahrzeugtypen | Kombi | Limousine | ohne Angabe |
| --- | --- | --- | --- | --- |
| 12 | 3 | 1 | 1 | 1 |

**Ein Drittel des Korbs heisst nicht „Van/Bus"** — und eine *„Limousine"* ist
bei einem Berlingo schlicht falsch eingetragen. Damit ist belegt, was bisher
aus zwanzig Datensätzen geschlossen war: die Bauartgruppe muss weit sein, und
eine fehlende Angabe darf nie zum Verwerfen führen.

### Die Lehre: Filter müssen sich nachweisen

Fünfmal in dieser Sitzung ist derselbe Fehler aufgetreten — ein Filter, der
lautlos nichts tut oder lautlos das Falsche tut. Beim vierten, `adType`, hatte
ich ihn schon als behoben ins Papier geschrieben. Der fünfte stand in dem
Skript, das die anderen aufdecken sollte. Deshalb bekommt die
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
| Angebote | — | — | `adType: angebote` — **wirkt nicht, nachfiltern** |
| Tiefe | — | — | **`maxResults: 80`** (10 ergab 1–2 Fahrzeuge) |
| Sortierung | — | — | `newest` — jede Preissortierung verzerrt |
| Details | `includeDetails: true` | `includeDetails: true` | `includeDetails: true` |
| **Bauart** | **nie** | **nie** | **nie** (kostet einen echten Sharan) |

Kleinanzeigen bekommt `attributeFilters` mit Kürzel. `startUrls` liefert
gemessen dasselbe und wird nicht gebraucht. Dass ein Tippfehler dort **still**
nicht filtert, bleibt wahr — dagegen steht die Selbstprüfung, nicht der
zweite Weg.

### 1b. Die Merkmale des Subjekts — nachgezogen 11.09.2026

**Der Befund.** `params.json` trug bereits `karosserie`, `getriebe` und
`tueren` — der Sachverständige gibt sie in der Maske ein — und **keine
einzige Portaleingabe benutzte sie.** Die Angaben wurden erhoben und
fallengelassen. In der Apify-Konsole waren deshalb Abfragen ohne diese Filter
zu sehen. Dasselbe galt für `leistungToleranzKw`: der Baustein rechnete mit
festen 20 % und liess das Feld liegen, das dafür ausgefüllt wird.

Dazu fehlte ein Merkmal ganz: **der Kraftstoff.** Das Gutachten führt kein
Feld dafür. Bei Modellen, die es als Verbrenner und als Stromer gibt — Smart,
Fiat 500, Mini — entscheidet er über den halben Korb. Er ist jetzt eine
Auswahl in der Maske, neben dem Getriebe; leer heisst nicht filtern.

| Merkmal | AutoScout24 | mobile.de | Kleinanzeigen |
| --- | --- | --- | --- |
| Kraftstoff | `fuelType: "electric"` | `fuelType: ["ELECTRIC"]` | `autos.fuel_s: "elektro"` |
| Getriebe | `transmission: "automatic"` | `transmission: ["AUTOMATIC_GEAR"]` | `autos.shift_s: "automatik"` |
| Zustand | `condition: "used"` | `condition: ["USED"]` | `autos.schaden_s: "nein"` |
| Leistung | — | `powerMin`/`Max` in PS | `autos.power_i` |
| Türen | — (Actor kennt keins) | — (Actor kennt keins) | `autos.anzahl_tueren_s: "2_3"` |
| Bauart | `bodyType: "hatchback"` | `bodyType: ["KLEINWAGEN"]` | `autos.typ_s: "kleinwagen"` |

**Drei Formen für dieselbe Sache.** mobile.de nimmt **Listen** in Versalien
mit Suffix (`["AUTOMATIC_GEAR"]`), AutoScout24 kleingeschriebene
Zeichenketten (`"automatic"`), Kleinanzeigen deutsche Tokens (`"automatik"`).
Ein Wert in der falschen Form wird von keinem dieser Actors abgelehnt — er
wird durchgereicht und filtert nichts. Die Zuordnung steht deshalb an **einer**
Stelle: `wbw-plugin/portalvokabular.js`, jeder Wert aus dem `enum` des
Eingabeschemas. Ein Test hält alle 112 Kombinationen aus Bauart, Kraftstoff
und Getriebe gegen diese Listen.

**Die Bauart geht nur in den engen Zyklus.** Zyklus 1 sucht mit ihr, und der
Filter ist in Apify zu sehen. Reicht der Korb nicht, sucht Zyklus 2 ohne sie —
so kann die gemessene Falle (`bodyType: "van"`, Korb von 10 auf 1) den Lauf
nicht mehr kosten. Getriebe und Kraftstoff gehen in jedem Zyklus hinaus; ihr
Vokabular ist eindeutig, das der Bauart nachweislich nicht.

**Was nicht übernommen wurde**, aus den Vorgabe-Objekten des
Sachverständigen — jeweils mit Grund:

| Vorgabe | stattdessen | warum |
| --- | --- | --- |
| `damageStatus: "ANY"` | `EXCLUDE` | Ein Unfallfahrzeug ist kein Vergleichsfahrzeug; mobile.de meldet den Status im Datensatz gar nicht |
| `includeDetails: false` | `true` | Ohne Details keine Koordinaten und keine Ausstattung — bei mobile.de hängt der ganze Umkreis daran |
| `"eletric"`, `"automatic"`, `"sedan"` | `elektro`, `automatik`, `limousine` | Kleinanzeigen führt deutsche Tokens; `"eletric"` ist zudem ein Tippfehler |
| `autos.km_i: 37000` | `"17000,57000"` | Eine einzelne Zahl filtert auf genau diesen Kilometerstand |
| `autos.marke: "Smart"` | `autos.marke_s: "smart"` | Kürzel `_s`, und die Tokens des Portals sind kleingeschrieben |

**Nachweisbar gemacht.** Die vollständige Eingabe je Portal und Zyklus steht
als `gesendeteEingabe` im Beschaffungsprotokoll des Laufs — Zeile für Zeile
gegen die Apify-Konsole haltbar, ohne den Lauf zu wiederholen.

**Und eine Selbstprüfung für den einen ungemessenen Wert.** Ob Kleinanzeigen
für Elektro wirklich `elektro` heisst, steht in keiner vorliegenden Quelle;
die Filterleiste zeigte nur benzin, diesel, lpg und hybrid. Statt zu raten und
zu hoffen, zählt die Beschaffung nach dem Abruf, wie viele gelieferte
Fahrzeuge einen anderen Kraftstoff tragen. Sind es welche, steht im
Protokoll, dass der Filter nicht gegriffen hat.

### 2. Feldkarte je Actor — umgesetzt

`wbw-plugin/adapters/feldkarte.js`, geprüft an 75 echten Datensätzen in
`tests/fixtures/apify/`. Was die Karte an Ausbeute geändert hat:

| Feld | AutoScout24 (20) | mobile.de (20) | Kleinanzeigen (35) |
| --- | --- | --- | --- |
| `fahrzeugtyp` | 20 | 20 | **0 → 34** |
| `ausstattung` | 20 | 20 | **0 → 35** |
| `tueren` | 20 | 20 | **0 → 35** |
| `ort` | 20 | **0 → 20** | **0 → 35** |
| `lat` / `lon` | 20 | **0 → 20** | 35 |
| `variante` | **Bauform → Linie** | 20 | — |
| `leistungKw` | 20 | 20 | 35, **jetzt in kW** |

Die übrigen Felder — `url`, `preis`, `kilometerstand`, `erstzulassung`,
`getriebe`, `kraftstoff`, `bilder`, `beschreibung` — trafen schon vorher.

**Warum es überhaupt danebenging.** Die alte `mappe()` riet über
Kandidatenlisten: `g("bodyType", "vehicleType", "Fahrzeugtyp")`. Kleinanzeigen
legt die Bauart unter `attributes.Fahrzeugtyp` ab, und `g` sah nur die oberste
Ebene. Eine Liste, die danebengreift, meldet nichts — sie liefert `null`, und
`null` sieht aus wie „das Portal weiss es nicht". So kam der Golf in den
Sharan-Korb.

**Drei Feldnamen, die lügen:**

| Feld | heisst | ist |
| --- | --- | --- |
| Kleinanzeigen `powerKw` | Kilowatt | **PS** — 170 neben `Leistung: "170 PS"` |
| AutoScout24 `variant` | Variante | **Bauform** — „Crew Van", „Cargo Van" |
| mobile.de `location` | Ort | Ortsname, **keine PLZ** — dafür `sellerLatitude` |

Bei `variant` hat mich die Messung korrigiert: `detectLinie` erkennt daraus
**0 von 20** Ausstattungslinien, aus `modelVersion` dagegen **9** (Highline,
Comfortline, Trendline). Die alte Liste fragte `variant` zuerst und schrieb
damit bei der Hälfte der Inserate eine Bauform in das Feld, aus dem der
Linienfilter liest.

**Die Selbstprüfung ist eingebaut.** `PFLICHTFELDER` nennt fünf Felder — Adresse,
Preis, Laufleistung, Erstzulassung, Bauart. Fehlt eines, steht es mit
Inseratkennung in den Warnungen des Beschaffungsprotokolls, statt still `null`
zu sein. Ein Actor ohne Karte wird weiter über die alte Liste abgebildet
(Treffer gehen nie verloren) — dass er ohne Karte läuft, steht ebenfalls dort.

**Der Vertrag hält.** Ein Test vergleicht die Feldnamen jedes abgebildeten
Fahrzeugs mit `leeresFahrzeug()`; ein zweiter prüft, dass keine Karte ein Feld
beschreibt, das der Vertrag nicht kennt. Beim Schreiben hiess ein Feld erst
`bauart` statt `fahrzeugtyp` — der Vertrag wäre still um ein Feld gewachsen
und um eines ärmer geworden. Genau der Weg, auf dem der Golf kam.

**Was nicht in der Karte steht.** `unfall` und `verkaeuferart` stehen in
keinem Vertragsfeld, und im ganzen Plugin liest sie niemand. Sie jetzt
mitzuschleppen hiesse, Werte zu tragen, die nirgends ankommen. Der
Unfallstatus wird bei mobile.de ohnehin am Portal gefiltert
(`damageStatus: EXCLUDE`).

### 2b. Der Bauartfilter — weich in drei Stufen

Mit der Feldkarte kommt die Bauart an. Damit tritt der umgekehrte Fehler in
den Vordergrund: der Filter verwirft echte Vergleichsfahrzeuge, weil die
Portale dieselbe Karosserie verschieden benennen und Verkäufer sie falsch
eintragen. Gemessen an den 35 Kleinanzeigen-Datensätzen:

| | Van | Kombi | Limousine | ohne Angabe |
| --- | --- | --- | --- | --- |
| nur aus dem Bauartfeld | 29 | 1 | 1 | 4 |
| Bauartfeld **plus Titel** | **34** | 1 | — | — |

**Der Titel rettet fast alles** — weil der Katalog Modellnamen kennt
(„sharan", „berlingo", „touran"). Ein als *Limousine* eingetragener
*„Citroën Berlingo Kasten Club M L1"* wird trotzdem als Van erkannt.

Drei Stufen halten den Rest ab:

1. **Unbekannt bleibt drin.** „Other", „OTHER", „Andere Fahrzeugtypen": drei
   Portale, drei Sammeltöpfe. Sie zu einer Bauart zu erklären hiesse raten.
2. **Verwandte bleiben drin.** AutoScout24 führte denselben Sharan mal als
   *Van*, mal als *Station Wagon*; ein echter *„Citroën Berlingo Shine
   Panorama/AHK"* trägt *Kombi*. Van und Kombi schliessen einander deshalb
   nicht aus — und nur die beiden, weil nur das gemessen ist. Limousine und
   Van bleiben ein echter Unterschied.
3. **Unter der Untergrenze gibt er auf.** Bleiben weniger als `MINDESTKORB`
   Fahrzeuge übrig, wird die Bauart fallengelassen und der Grund steht im
   Ergebnis. Dieselbe Regel wie beim Linienfilter.

Die Untergrenze kommt aus **einer** Quelle: `MINDESTKORB` in `src/wbw/zyklus.ts`
— dieselbe Zahl, ab der `ergebnis.ts` den Korb als zu klein meldet.

**Ein Prüfstein, der nichts prüft.** Der erste Regressionstest benutzte einen
Sharan — und der Filter tat nie etwas, weil schon der Titel „Sharan" die
Bauart entschied. Die Tests laufen deshalb gegen einen **Mercedes-Benz
Citan**: der steht in keiner Musterliste, dort entscheidet allein das Feld,
und dort muss die Weichheit tragen.

Im Vokabular fehlte genau ein Wert: `SMALL`, wie mobile.de den Kleinwagen
nennt. Alle übrigen 14 gemessenen Werte erkannte der Katalog bereits.

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
Lauf — bei Kleinanzeigen 80, weil die Tiefe dort der Hebel ist:
**rund 0,26 $ je Recherche.**

Der heutige Deckel `maxTotalChargeUsd: 0.5` gilt **je Aufruf** — bei neun
Aufrufen wären das 4,50 $. Er wird ein Gesamtdeckel für den Lauf, und die
kostenpflichtige Stufe bleibt zusätzlich ein bewusster Haken in der
Oberfläche.

### 5. Reihenfolge, Deckel und der Rückfall-Hinweis — umgesetzt

**Apify steht jetzt bei allen drei Portalen vorn**, die kostenlosen Stufen
bleiben als Rückfall darunter. Der Grund ist schmal und benennbar: nur für
Apify ist gemessen, dass Umkreis, Laufleistung und Baujahr am Portal wirken
und ein tragfähiger Korb herauskommt.

**Der Deckel gilt jetzt für den Lauf.** `maxTotalChargeUsd` ist bei Apify ein
Deckel **je Aufruf**. Er stand auf 0,50 $, und ein Lauf ruft drei Portale in
bis zu drei Zyklen auf — neun Aufrufe, also bis zu **4,50 $**, ohne dass
irgendwo eine Grenze gerissen wäre. Jeder einzelne Aufruf hätte sich an seinen
Deckel gehalten.

`wbw-plugin/budget.js` führt deshalb ein Hauptbuch im Ordner des Vorgangs. Es
liegt als Datei dort, weil die Portale als eigene Kindprozesse laufen — eine
Zahl im Speicher überlebt das nicht. Reserviert wird **pessimistisch**: der
volle Betrag vor dem Aufruf, der ungenutzte Teil danach zurück. Ein Prozess,
der abstürzt, hat damit zu viel abgebucht und nicht zu wenig.

| | Wert | Wirkung |
| --- | --- | --- |
| `maxTotalChargeUsd` je Aufruf | 0,20 $ | harte Grenze, von Apify durchgesetzt |
| Hauptbuch je Lauf | 1,00 $ | weiche Grenze, aus der Preisliste gerechnet |

**Die Schätzung ist eine Schätzung.** Was ein Lauf wirklich kostet, steht auf
der Abrechnung. Das Hauptbuch rechnet aus Grundpreis plus Preis je Datensatz —
die Zahlen stehen je Stufe in `providers.json` und stammen aus den
Probeläufen. Deshalb bleibt der Deckel je Aufruf zusätzlich bestehen.

**Ein Rückfall ist nie still.** Er steht im Protokoll des Laufs und in der
Benachrichtigung. Erkannt wird er am Beschaffungsprotokoll selbst:
`versuche[0]` ist immer die erste Stufe, auch wenn sie übersprungen wurde —
steht dort eine andere als die, die getragen hat, war es ein Rückfall. Das
kommt ohne einen zweiten Blick in `providers.json` aus, und damit können die
beiden nicht auseinanderlaufen.

**Zwei Arten von Rückfall, und nur eine ist eine Warnung.** Weil Apify jetzt
vorn steht und hinter dem Kosten-Haken liegt, würde ohne diese Unterscheidung
**jeder** Lauf ohne Haken eine Warnung erzeugen — eine, die nach der dritten
niemand mehr liest.

| Grund | Meldung |
| --- | --- |
| Kosten-Haken nicht gesetzt | Hinweis: „die kostenpflichtige Stufe war für diesen Lauf nicht freigegeben" |
| Apify gescheitert (HTTP, Zeitüberschreitung, Budget) | **Warnung**: „der Korb kann anders zustande gekommen sein als geplant" |

## Was offen bleibt

- ~~Trägt Kleinanzeigen einen Korb?~~ **Ja, mit Tiefe 80:** 17 und 18
  Fahrzeuge über 7 bzw. 16 Einstelltage.
- ~~Kleinanzeigen sieht nur den heutigen Tag.~~ **Widerlegt:** es war die
  Voreinstellung `sortBy: newest` in Verbindung mit zu geringer Tiefe.
- ~~Kein EZ-Filter bei Kleinanzeigen.~~ **Erledigt:** `autos.ez_i`, gemessen
  wirksam.
- ~~Liegt die magere Ausbeute am `attributeFilters`-Weg?~~ **Erledigt:**
  nein — `startUrls` liefert dieselben Inserate.
- ~~Welche Schreibweise trägt?~~ **Erledigt:** beide, identisch.
- ~~Lassen sich Gesuche am Portal ausschliessen?~~ **Nein.** Keine der vier
  Formen wirkt; sie werden nachträglich verworfen.
- ~~Die Bauart-Gruppierung ist ungemessen.~~ **Gemessen:** 6 von 18
  Fahrzeugen im Berlingo-Korb tragen nicht „Van/Bus", eines gar nichts.
- **Die Verkäuferart ist ungeklärt.** Der Sharan-Korb ist 9 gewerblich zu 6
  privat, der Berlingo-Korb 15 zu 3. Für einen Wiederbeschaffungswert zählt
  der Händlerpreis; ob und wie stark private Angebote den Median nach unten
  ziehen dürfen, ist eine fachliche Entscheidung, keine technische.
- **Ein echter Lauf im Cockpit hat nie stattgefunden.** Alles hier stammt aus
  Einzelaufrufen der Actors, nicht aus der Pipeline.

## Reihenfolge der Umsetzung

| | Scheibe | Abnehmbar durch |
| --- | --- | --- |
| 1 | Probeläufe | ✅ abgeschlossen, 0,076 $ |
| 1b | Probelauf 3: Kleinanzeigen-Schlüssel, EZ, `startUrls`, Bauart | ✅ abgeschlossen, 0,060 $ |
| 1c | Probelauf 4: sieht Kleinanzeigen mehr als den heutigen Tag? | ✅ ja, 0,068 $ — es war `sortBy` |
| 1d | Probelauf 5: enge Filter plus grosse Tiefe — trägt der Korb? | ✅ ja, 0,035 $ — 17 und 18 im Korb |
| 2 | Feldkarte + `mappe()` gegen die echten Datensätze | ✅ 30 Tests, Vertrag hält |
| 3 | Filter je Portal setzen, Gesuche nachfiltern, Selbstprüfung | Testfall: Subjekt → erwartetes Eingabeobjekt |
| 4 | Bauartfilter im Plugin auf die neuen Werte, weich | ✅ 25 Tests, Citan-Regressionsfall |
| 5 | Apify nach vorn, Gesamtdeckel, Rückfall-Hinweis | ✅ 20 Tests — offen: ein echter Lauf im Cockpit |
