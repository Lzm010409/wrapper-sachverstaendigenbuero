# Inventur der Textbausteine aus dem OneDrive

Stand: 16.08.2026 · Schritt 1–3 von Weg C (herunterladen · lesbar machen · Inventur)

Dieses Dokument beschreibt, **was im OneDrive-Ordner `Sachverständigerei/Texte` liegt**, was davon
Textbaustein ist und was nicht, und wo die Bibliothek der App heute davon abweicht. Es verändert noch
nichts. Der Abgleich mit den vorhandenen 91 Einträgen — mit Begründung für jeden Eintrag, der bleibt
oder angepasst wird — ist der nächste Schritt und steht in einem eigenen Bericht.

**Die Texte selbst liegen nicht im Repository.** Sie stehen in einem Arbeitsordner ausserhalb
(`/tmp/bausteine/md`, 66 Dateien), weil die Originale durchgehend echte Mandantennamen, Anschriften,
Schadennummern, Kennzeichen, Fahrgestellnummern und Beträge enthalten. In die Datenbank geht später nur
die bereinigte Fassung.

---

## 1 Was im Ordner liegt

Der Ordner umfasst rund 360 MB. Der weitaus grösste Teil davon sind Bilder, nicht Text.

### 1.1 Die Ordnerstruktur

```
Texte/
├── (Wurzel)              ~45 Dateien — Gutachten- und Stellungnahme-Vorlagen, Quell-PDFs
├── Bausteine/            24 .odt — die eigentliche Bausteinsammlung
│   ├── Word/             ~170 .docx — dieselben Bausteine plus 36 weitere Themen
│   │   ├── 8 Unterordner — reine Bildordner (Beilackierung, Lackierfehler, …)
│   │   └── WBW/          5 vollständige WBW-Schreiben
│   └── Konturabdecken Dachflächen/   Bildordner
└── Stellungnahmen/       ~15 vollständige Stellungnahmen aus echten Fällen
```

### 1.2 Dreifache Ablage

Fast jede Datei liegt **dreimal**: einmal unter ihrem Namen und zweimal mit einem angehängten
Zeitstempel `- 2026-04-23T083…Z` bzw. `- 2026-04-23T151…Z`. Das sind Kopien aus zwei
Synchronisationsläufen vom 23.04.2026, keine inhaltlichen Fassungen. Sie wurden übergangen.

Zusätzlich liegen viele Themen doppelt als `.odt` (im Ordner `Bausteine/`) und als `.docx`
(in `Bausteine/Word/`). Wo beide vorlagen, wurde die `.odt` genommen; sie ist durchgehend die
vollständigere.

Aus rund 250 Dateien wurden so **66 unterscheidbare Dokumente**.

---

## 2 Was davon Textbaustein ist

### 2.1 Echte Kürzungsabwehr-Bausteine (49 Themen)

Das ist der Kern. Jedes Thema enthält ein bis acht Fassungen desselben Arguments — geschrieben für
verschiedene Fälle, nicht als bewusste Varianten angelegt.

| Bereich | Themen |
|---|---|
| Ersatzteile | E-Positionen · Reifendrucksensor · Befestigungssatz · Stoßfängerhalterungen · Dichtungen Rückleuchten · Fensterführung/Schachtleisten · Kabelbaum PDC |
| Lackierung | Beilackierung (eigener Text) · Beilackierung Kleinteile · Beilackierung Dachholm · Einlackierung · Teillackierung Außenblech · Lackierung ohne Stirnfläche · Musterblech · Farbtonbestimmung · Genius-Farbtonanalyse · Beipolieren · Lackierstufe · Teile ausgebaut lackieren · Lackierräder |
| Lackvorbereitung | Abdeckarbeit Kunststoff · Konturabdecken Heckklappe · Konturabdeckung Dachreling · Seitenscheiben · nicht wasserlöslichen Schmutz entfernen · Korrosionsschutz vor Spachtel |
| Arbeitszeit | Diagnose + Stützbetrieb · Test vor Reparatur · Probefahrt · Sichtprüfung · Felge prüfen · Reinigung Felge · Ausbau Radhausschalen (vorne/hinten) · Anlösen Heckverkleidung · Ausbau Dachreling · Einsatz Richtgerät · Rückverformungsarbeit · Vorrichten vor dem Austrennen · Schutzvorrichtung · Reparaturdauer (2 Rechenwege) |
| Nebenkosten | Verbringung · Entsorgung · Fahrzeugreinigung · Gleitmittel · Hohlraumschutz · Schwemmmaterial · Schutzmaßnahmen COVID-19 |
| Aufschläge | UPE-Aufschlag · Kleinteilezuschlag 2 % · Materialzuschlag Lack |
| Werkstattvergleich | Verweis auf Referenzwerkstatt (8 Fassungen) |
| Wertminderung | merkantile Wertminderung (3 Fassungen) |
| Rahmen | Prüfberichte allgemein (Fassung CE und Fassung DEKRA) · Ergebnis-Schlusssätze (4 Fassungen) |

### 2.2 Wiederbeschaffungswert (15 Bausteine, bisher nicht in der Bibliothek)

Im Unterordner `Bausteine/Word/WBW/` liegen fünf vollständige Schreiben zum Wiederbeschaffungswert.
Daraus liessen sich 15 klar abgegrenzte Bausteine herauslösen: rechnerische Ermittlung ohne
Besichtigung, Börsenrecherche mit Ausstattungskriterien, Mangellage am Gebrauchtwagenmarkt,
unzumutbarer Suchradius, bundesweite Suche bei seltenen Fahrzeugen, Privatverkauf ohne Gewährleistung,
Pflegezustand, Wertverbesserung durch kurz zuvor durchgeführte Reparatur, Minderkilometer und
Restlaufzeit der Hauptuntersuchung, Vorschaden mindert nicht, Nachlackierung ohne
Instandsetzungsspuren, Altschäden konkret beziffert, Altschäden der Vergleichsfahrzeuge nicht
nachprüfbar, Anhebung wegen abweichender Erstzulassung, Ergebnissatz.

### 2.3 Kein Textbaustein (6 Dokumente)

| Dokument | Was es ist |
|---|---|
| Gegenüberstellung · GegenüberstellungFzgbereitsrepariert · GegenüberstellungRoller | vollständige **Gutachtenvorlagen** für Fahrzeuggegenüberstellungen im Auftrag von Versicherern |
| Bsp. Nachbesichtigung anderer Gutachter | Nachbesichtigungsbericht — die Gegenrichtung zur Kürzungsabwehr |
| Rechnungsprüfung | Prüfauftrag eines Versicherers; lehnt eigene Positionen ab |
| Kaufwertentschädigung | Kasko-Wertermittlung nach AKB A.2.5.1.7 |
| Stellungnahme Spurenbild Reifen | Erwiderung auf ein Gegengutachten (Plausibilität) |
| Vorgehensweise Diebstahl | interne Checkliste, kein Brieftext |

Diese sind mitgeschrieben, aber als „gehört nicht in die Argumentbibliothek" markiert.

### 2.4 Fremdtext — vor einer Übernahme zu klären

`Bausteine/Beilackierung.odt` und `Bausteine/Word/Beilackierung.docx` sind **wörtlich** die
Musterformulierung *„RA028: Farbangleichende Beilackierung – Schriftsatz"* aus der Publikation
*Unfallregulierung effektiv* (IWW-ID 46574052, IWW Institut). Dasselbe gilt für die drei `.rtf`-Dateien
im Bausteine-Ordner (`503-vorteilsausgleich…`, `ra028-…`, `ra031-desinfektionskosten…`).

Das sind anwaltliche Schriftsätze eines fremden Verlags, keine Texte des Büros. Sie stehen unter
fremdem Urheberrecht und sind zudem für eine Klageschrift geschrieben, nicht für eine Stellungnahme
(„Beweis unter Verwahrung gegen die Beweislast: Sachverständigengutachten").

**Es gibt bereits die richtige Lösung dafür im Ordner:** `Word/Beilackierung1.docx` ist genau dieser
Inhalt, vom Büro in die eigene Sprache und in die Form einer Stellungnahme gebracht. Diese Fassung
wurde als Baustein aufgenommen, die IWW-Fassung nur als Quellennachweis vermerkt.

### 2.5 Belegquellen (PDF, kein Text zum Übernehmen)

`2015-23-2% Kleinersatzteile.pdf` (BVSK) · `Corona_Covid19_IFL.pdf` ·
`Schutzmaßnahmen Covid AZT.pdf` · `Schutzmaßnahmen COVID_HUK.pdf` ·
`Texte und Erklärungen zum Wiederbeschaffungswert.pdf` · `Textbeispiel Steine von LKW.pdf` ·
ein Artikel zur Lacktrocknung bei Elektrofahrzeugen · ein Artikel zur Mercedes-Vorgabe für
Lackierräder. Diese belegen Bausteine, sind aber selbst keine.

---

## 3 Wo die Bibliothek der App heute abweicht

Die Bibliothek zählte vor dem Abgleich **68 echte Einträge**: 55 im Bereich `kalkulation`, 4 in
`wertminderung`, 9 in `sonderfall`. Die Bereiche **`wbw` und `restwert` waren leer.**

> Berichtigung zur ersten Zählung: In der Entwicklungsdatenbank standen 91 Zeilen. Die Differenz
> sind 21 Wegwerf-Einträge aus den UI-Prüfläufen (`PA.3 … PG.3`, „Zurückgezogen ohne
> Gegenargument") und 2 Einträge, die aus einer Stellungnahme übernommen wurden. Die
> maßgebliche Zahl der aus den Referenzdateien migrierten Einträge ist 68.

Der Vergleich mit dem OneDrive zeigt: die vorhandenen Einträge stammen erkennbar aus genau diesen
Dokumenten. Die Sorge, die Bausteine könnten unvollständig übernommen worden sein, bestätigt sich —
aber nicht flächendeckend, sondern an bestimmten Stellen.

### 3.1 Vollständig fehlend

| Thema | Was im OneDrive liegt |
|---|---|
| **Schutzmaßnahmen COVID-19** | drei ausgearbeitete Fassungen — Werkstattumfrage/SVS, Inzidenzlage und Testpflicht, BGH-Ausrichtung des Gutachtens mit der AZT/ZKF/IFL-Studie (3 AW, 7,50 € Material). Dazu drei belegende PDF. In der Bibliothek kommt das Wort nicht vor. |
| **Nicht wasserlöslichen Schmutz entfernen** | eigener Baustein (Herstellervorgabe bei Altteilen, Wachs aus den Wasserabläufen) |
| **Lackierstufe** | eigener Baustein (Datensätze des Kalkulationsanbieters, Nachfrage beim Hersteller) |
| **Vorrichten vor dem Austrennen** | Argumentationshilfe eines Kollegen aus 2019 — Zugwerkzeug nur ansetzbar, solange die Seitenwand im Karosseriegefüge steht |
| **Wiederbeschaffungswert** | 15 Bausteine (siehe 2.2) — der Bereich `wbw` ist in der Datenbank leer, obwohl eine Quelldatei existiert |
| **Restwert** | kein einziger Eintrag; im OneDrive nur mittelbar in den Nachbesichtigungs- und WBW-Schreiben |

### 3.2 Vorhanden, aber dünner als die Quelle

- **Prüfberichte allgemein**: die Bibliothek hat einen Einleitungsblock. Das OneDrive hat **zwei**
  Fassungen mit unterschiedlichen Urteilen — die CE-Fassung (AG Neustadt a. Rbge. 41 C 327/20, dazu der
  Absatz zum fehlenden Sachbearbeiternamen) und die DEKRA-Fassung (AG Kiel 116 C 108/20). Beide teilen
  AG Stuttgart 49 C 270/22 und AG Berlin-Mitte 108 C 3195/19 sowie das VHV-Zitat zur
  Weisungsgebundenheit.
- **Verweis auf Referenzwerkstatt**: acht Fassungen im OneDrive, darunter zwei, die in der Bibliothek
  keine Entsprechung haben (Materialzuschlag der Werkstatt am Wohnort; Löhne anpassen, falls der
  Verweis rechtlich Bestand hat).
- **Reparaturdauer**: die Bibliothek kennt das Thema. Das OneDrive hat zusätzlich den ausgerechneten
  Weg — 6 produktive Stunden je Werktag, Summe der Arbeitswerte, daraus die Tageszahl.
- **Seitenscheiben**: sieben Fassungen (Metalleinfassung, Gummi mit Hartkunststoff-Designelement,
  Kunststoffrahmen, Metalleinlage mit Verweis auf die Schachtleisten, aufvulkanisierte Dichtung,
  Konturabdecken statt Pauschale, Konturabdeckung vorne links).

### 3.3 Ein Fehler in der Quelle

`Bausteine/Word/Dachreling.docx` bricht mitten im Satz ab: *„Ein scharfes Abdecken der Kontur der
Dachreling ist ebenfalls"*. Der Satz fehlt in allen drei Kopien. Beim Übernehmen ist er zu ergänzen.

---

## 4 Platzhalter

Die Gutachtenvorlagen benutzen die Seriendruckfelder des Gutachtensystems in doppelten geschweiften
Klammern: `{{ADat}}`, `{{FHNa1}}`, `{{FHStr}}`, `{{FzKz}}`, `{{FzHerst}}`, `{{FzIdent}}`, `{{FzErst}}`,
`{{FzTach1}}`, `{{VNNa1}}`, `{{ScDat}}`, `{{AErteil}}`, `{{BsDat}}`, `{{BsOrt}}`, `{{RepNto}}`,
`{{RepMw}}`, `{{RepBto}}`, `{{GQuelle}}`, `{{TVorsc}}`, `{{TAltsc}}`, `{{TBeme}}` und weitere.

Die Bausteine selbst enthalten **keine** Platzhalter. Sie sind für einen konkreten Fall geschrieben und
tragen dessen Zahlen und Namen im Fliesstext: Arbeitswerte, Kürzungsbeträge, Laufleistungen,
Stundensätze, Werkstattnamen, Farbtöne. Beim Aufbereiten wurde jede solche Stelle durch einen
Platzhalter in eckigen Klammern ersetzt — die Schreibweise, die die App kennt.

---

## 5 Was jetzt zu entscheiden ist

**Die vollständigen Briefvorlagen.** In `Bausteine/Word/` liegen zehn Dateien „Vorlage Stellungnahme
<Mandantenname>" (bis 14 MB, mit Bildstrecken), in `Texte/Stellungnahmen/` weitere fünfzehn
vollständige Stellungnahmen, benannt nach den enthaltenen Themen oder nach Mandanten. Das sind fertige
Briefe aus echten Fällen, keine Bausteine — aber sie zeigen, **welche Bausteine in welcher Reihenfolge
zusammen verwendet wurden**. Sie könnten als Muster für den Aufbau eines Schreibens dienen, statt als
Bibliothekseinträge.

Es sind zugleich die Dateien mit den meisten echten Daten. Sie sind bisher weder aufbereitet noch
übernommen.

**Der IWW-Fremdtext** (Abschnitt 2.4) — die eigene Fassung ist da und wurde genommen; wenn der
Schriftsatz trotzdem in die Bibliothek soll, ist das eine bewusste Entscheidung.

---

## 6 Wie es weitergeht

1. Gruppierung in Bereich/Abschnitt, Belege als „unbestätigt" erfassen, Platzhalter vereinheitlichen.
2. Abgleich mit den 91 vorhandenen Einträgen — **mit schriftlicher Begründung je Eintrag**, der
   unverändert bleibt oder angepasst wird. Gelöscht wird nichts.
3. Infrastruktur: Einlesepfad in der App, freiere Bereich-/Abschnittsvergabe, nachvollziehbare Herkunft
   je Eintrag.
4. Übernahme in Stapeln, alles zunächst als **Entwurf**.
