# Kürzungsabwehr-Werkbank

Webapp für das Kfz-Sachverständigenbüro Gollenstede: Stellungnahmen gegen
Kürzungsschreiben und Prüfberichte von Kfz-Versicherern, mit KI-gestützter
Pflege der Argumentbibliothek und Import von Falldaten aus autoiXpert.

Überführt die beiden Skills `stellungnahme-erstellen` und
`argumentbibliothek-erweitern` (unter [`skills/`](skills/)) in eine Anwendung.

**Läuft unter https://werkbank.gollenstede.app**

## Stand

| Phase | Inhalt | Status |
| --- | --- | --- |
| P0 | Gerüst, Datenbankschema, Anmeldung mit Rollen, Deployment | **fertig** |
| P1 | Argumentbibliothek: Migration, Suche, Detailansicht, Freigabe | **fertig** |
| P2 | autoiXpert-Anbindung: Fall über Aktenzeichen oder ID | **fertig** |
| P3 | Prüfbericht einlesen, Positionen auslesen, Argumentauswahl | **fertig** |
| P4 | Ausformulieren, vier Wächter, Word- und Klartext-Ausgabe | **fertig** |
| P4b | Der Schreibtisch: Brief-Editor mit Anmerkungen am Rand | **fertig** |
| P4c | Ziehen und Fallenlassen, Fortschritt, Erscheinungsbild | **fertig** |
| P4d | Oberfläche nach der Vorlage „Judia" | **fertig** |
| P4e | Bilder: einfügen, stufenlos ziehen, beschriften | **fertig** |
| P4f | Bildbibliothek mit Themen und Beschreibungen | **fertig** |
| P5 | Wirkungsstatistik, Prüfdienstleister-Bausteine | offen |

## Dokumente

- [Konzept](docs/konzept.html) — Entscheidungen E1–E6, Risiken R1–R4,
  Features F1–F9, Phasenplan P0–P5
- [Betrieb](docs/betrieb.md) — Coolify, Microsoft Entra, Einrichtung

## Schnellstart

```bash
pnpm install
cp .env.example .env.local          # DATABASE_URL eintragen
pnpm db:push                        # Schema anlegen
pnpm bibliothek:import              # 68 Einträge übernehmen
pnpm benutzer:anlegen --email du@example.org --name "Du" \
                      --rolle admin --passwort geheim
pnpm dev
```

## Befehle

| Befehl | Wirkung |
| --- | --- |
| `pnpm dev` | Entwicklungsserver |
| `pnpm check` | Typprüfung und Tests |
| `pnpm bibliothek:import --bericht` | Abgleichbericht, ohne zu schreiben |
| `pnpm bibliothek:import` | Referenzdateien in die Datenbank |
| `pnpm bibliothek:export` | Datenbank zurück nach Markdown |
| `pnpm benutzer:anlegen` | Zugang anlegen oder ändern |

## Aufbau

```
skills/                      Die Skills — versionierte fachliche Grundlage
src/bibliothek/
  parser.ts                  Markdown → strukturierte Einträge
  markdown-export.ts         Einträge → Markdown (der Rückweg)
  migration.ts               Abgleichbericht
  abfragen.ts                Suche und Detailabruf
  aktionen.ts                Freigabe, Beleg-Prüfung, Speichern
src/autoixpert/
  client.ts                  Zugriff auf die externe Schnittstelle
  felder.ts                  Falldaten → Platzhalter und Empfängervorschlag
src/pruefbericht/
  einlesen.ts                PDF → Seiten, je Seite Text oder Bild
  extraktion.ts              Kürzungspositionen auslesen
  sonderfaelle.ts            Prüfliste B.1-B.8
src/stellungnahme/
  treffer.ts                 Positionen → Bibliothekseinträge
  komposition.ts             Ausformulieren im Hausstil
src/dokument/
  typen.ts                   Der Dokumentbaum als reines JSON
  ziehen.ts                  Was beim Ziehen eines Bausteins mitwandert
  erzeugen.ts                Kopfdaten und Positionen → Schreiben
  nach-absaetzen.ts          Dokumentbaum → Absatzfolge der Ausgabe
  spur.ts                    Herkunft des Textes, aus dem Baum gelesen
  pruefung.ts                Dokumentbaum → Eingabe der vier Wächter
  editor-schema.ts           Die Editor-Erweiterungen (nur im Browser)
  editor-hilfen.ts           Griffe in den laufenden Editor
src/bilder/
  lesen.ts                   Format und Masse aus den Bytes, Masse in EMU
  ablage.ts                  Bilder in der Datenbank
  bibliothek.ts              Suche, Themen, Verwendungsnachweis
  themen.ts                  Schlagworte aus der Eingabe
src/export/
  waechter.ts                Die vier Prüfungen vor dem Export
  hausstil.ts                Aufbau des Schreibens
  docx.ts                    Word-Ausgabe über die Geschäftspapier-Vorlage
src/app/api/strom.ts         Ereignisstrom als Antwort (NDJSON)
src/app/teile/               Kreisel, Fortschrittsbalken, Erscheinungsschalter
src/auth/                    Sitzungen, Passwort, Microsoft Entra
src/db/schema.ts             Datenmodell
scripts/starten.mjs          Migration, Startbefüllung, Serverstart
```

## Der Schreibtisch

Geschrieben wird **im Brief**, nicht in einem Formular. Das Schreiben steht
als Dokumentbaum in der Datenbank und wird in einem Editor bearbeitet, der
nur kann, was die Word-Ausgabe versteht. Am rechten Rand steht je Position
eine Anmerkung — die vorgeschlagenen Treffer, die gesamte Bibliothek und
eigener Text —, aufgeklappt die, in der die Schreibmarke gerade steht. Ein
gewählter Baustein wird in der Blase bearbeitet und dann eingefügt; danach
ist er gewöhnlicher Fliesstext.

Die Nummerierung der Abschnitte entsteht aus ihrer Reihenfolge, nicht aus
dem Text: eine nicht bestrittene Position bleibt ausgegraut stehen, zählt
aber nicht mit, und die übrigen Nummern rücken nach.

Bausteine lassen sich **anklicken oder ziehen**. Wer zieht, sieht solange
die Abschnitte des Briefes umrandet; fallen gelassen wird hinter dem Absatz
unter dem Zeiger, nie mitten in einen Satz. Der Knopf bleibt gleichwertig —
Ziehen ist die Abkürzung, nicht der Weg.

### Die Bühne gehört dem Brief

Bei zwölf Positionen war vom Schreiben zuletzt kaum noch etwas zu sehen:
Kästen mit Fallangaben, Prüfliste und Empfängerformular standen
untereinander über dem Brief. Deshalb steht darüber jetzt **eine Zeile** —
Rückweg, Aktenzeichen, Betreff, Prüfdienstleister und Kürzungssumme. Was
selten gebraucht wird, klappt daneben auf: Prüfliste, Unklarheiten,
Empfänger.

Darunter liegt die Werkzeugleiste am Kopf fest, und in ihr die
**Positionsleiste**: eine Marke je Kürzungsposition, mit ihrer Nummer, ihrem
Stand (im Brief, noch leer, herausgenommen) und der Zahl offener
Beanstandungen. Ein Klick springt in den Abschnitt — bei zwölf Positionen
der kürzeste Weg an die Stelle, an der noch etwas fehlt.

Der Brief selbst hat eine **Zeilenbreite wie auf Papier** und steht mittig;
die Anmerkungen stehen rechts daneben, die offene mit einer Linie zu ihrem
Abschnitt. Der Abschnitt zur offenen Anmerkung wird hervorgehoben — als
Auszeichnung im Editor, nicht als Klasse von aussen an sein Element:
ProseMirror beobachtet seinen eigenen Baum und zeichnet alles neu, was es
dort nicht selbst geschrieben hat, samt der Bilder darin und einer gerade
laufenden Bewegung am Ziehgriff.

Abschnitte ohne Text schrumpfen auf eine gestrichelte Zeile zusammen — sie
bleiben sichtbar, nehmen aber keinen Platz mehr weg. Und wer nur lesen
will, schaltet auf **Fokus**: dann verschwindet die Randspalte und der Brief
bekommt die ganze Breite.

### Der Rahmen gehört dem Fall, der Text dem Verfasser

Zu jeder Kürzungsposition des Prüfberichts gehört ein Abschnitt — auch ein
leerer. Er trägt die Kennung der Position, und an dieser Kennung hängt
alles Weitere: die Anmerkung am Rand, die Herkunftsspur der Bausteine, die
Nummerierung. Wer eine Position nicht bestreiten will, nimmt sie über
**Nicht bestreiten** heraus; der Abschnitt bleibt dann stehen und wird
ausgelassen.

Daraus folgt, was beim Bearbeiten geschieht:

- Eine Änderung, die einen Abschnitt entfernt — etwa **alles markieren und
  ausschneiden** —, bekommt ihn leer zurück, an seiner alten Stelle. Der
  Text ist in der Ablage, der Rahmen bleibt im Brief.
- **Eingefügtes findet zurück an seinen Platz.** Enthält das eingefügte
  Stück Abschnitte, werden sie an ihrer Positionskennung erkannt und ihr
  Inhalt dort wiederhergestellt, wo er hingehört — nicht an der
  Schreibmarke, wo das Schema ihn meist gar nicht annehmen kann. Betreff,
  Anrede und Ergebnis kommen mit; die Signatur nicht, die stammt aus dem
  Hausstil. Ausschneiden und Einfügen über das ganze Schreiben ist damit
  ein vollständiger Hin- und Rückweg, Rückgängig eingeschlossen.
- Schreiben, die vor dieser Fassung Abschnitte verloren haben, **heilen
  beim Öffnen**: die fehlenden kommen leer an ihre Stelle zurück.
- Wer die **Überschrift** eines Abschnitts löscht, sieht an ihrer Stelle
  den Namen der Position als Schatten. Ein Abschnitt verschwindet damit nie
  spurlos aus dem Bild — sonst stünden die Marke in der Leiste und die
  Anmerkung am Rand scheinbar ohne Grund da.

Für eine Position gibt es deshalb zwei verschiedene Wege hinaus, und der
Unterschied ist wichtig:

| | **Nicht bestreiten** | **Position entfernen** |
| --- | --- | --- |
| Wofür | Die Kürzung wird hingenommen | Die Zeile ist gar keine Kürzung — falsch gelesen, doppelt, eine Zwischensumme |
| Abschnitt | bleibt ausgegraut stehen, wird nicht gedruckt | ist weg |
| Marke in der Leiste | bleibt, durchgestrichen | ist weg |
| Umkehrbar | jederzeit über „Doch bestreiten" | nein, mit Rückfrage |

Die Marken in der Leiste tragen die Zahlen des **Prüfberichts** — sie
stehen fest, solange die Position zum Fall gehört. Die Nummerierung im
Brief entsteht getrennt davon aus der Reihenfolge der Abschnitte mit Text;
welche Nummer eine Position im Schreiben hat, sagt der Hinweistext ihrer
Marke.

### Achtzehn Positionen

Ein Prüfbericht mit achtzehn Kürzungen ist kein Sonderfall. Drei Dinge
richten sich danach:

- **Die Marke im Papierrand.** Neben jedem Abschnitt steht seine Zahl. Ein
  Klick öffnet die Anmerkung dazu — dort, wo man gerade liest, statt sie am
  Rand zu suchen. Sie ist eine Auszeichnung des Editors, kein Text: im
  Word-Dokument taucht sie nicht auf.
- **Die Leiste bricht um**, statt waagerecht davonzulaufen. Vorher standen
  bei achtzehn Positionen die ersten Marken ausserhalb des Bildes.
- **Nichts legt sich mehr über die Leiste.** Prüfliste, Unklarheiten und
  Empfänger klappen als schwebende Kästen auf; sie öffnen sich nicht mehr
  von selbst und schliessen sich, sobald man daneben klickt.

Wer zu einem Abschnitt oder einer Anmerkung springt, findet sie nicht mehr
unter der festliegenden Kopfleiste: alles Anspringbare hält den nötigen
Abstand zum oberen Rand frei.

### Schnellauswahl über der Markierung

Markierter Text bekommt eine schwebende Leiste: Fett, Kursiv, Aufzählung,
nummerierte Liste, und das Entfernen von Fett und Kursiv. Mehr steht dort
nicht — ein Menü, das mehr anbietet als die Word-Ausgabe versteht, führt in
die Irre. In Betreff, Anrede und Überschrift bleibt sie weg, weil das
Schema dort keine Auszeichnung zulässt.

Das Entfernen löst ausdrücklich nur Fett und Kursiv, nicht alle Marken: die
Herkunftsmarke der Bausteine hängt am selben Text, und sie beiläufig
mitzulöschen hiesse, die Wirkungsstatistik still zu leeren.

### Wegräumen

Eine Stellungnahme lässt sich löschen — in der Liste über den Knopf am
rechten Rand der Zeile, im Schreiben über **Löschen** in der Kopfzeile.
Positionen, Bausteine und die Bilder des Falls gehen mit. Zwei Ausnahmen:
Bilder, die in der **Bildbibliothek** stehen, werden nur vom Fall gelöst —
sie gehören dort dem Büro, nicht diesem einen Schreiben. Und ein als
**versendet** vermerktes Schreiben lässt sich nicht löschen; wer es doch
loswerden will, nimmt den Vermerk zurück.

## Bilder

Ein Bild kommt an **jede** Stelle des Briefes: aus der Zwischenablage
eingefügt, als Datei hineingezogen oder über den Knopf in der Leiste.
Eingesetzt wird hinter dem Absatz unter dem Zeiger, nie mitten in einen
Satz.

Die Breite lässt sich **stufenlos** am Griff in der Ecke ziehen; während
des Ziehens steht die Breite in Zentimetern daneben. Voreinstellung sind
rund 12 cm — die Breite, die der Hausstil nennt. Gespeichert wird nicht die
Pixelzahl, sondern der Anteil des Satzspiegels: nur so bedeutet die Breite
auf dem Schirm dasselbe wie im Word-Dokument.

Unter jedem Bild steht eine **Beschriftung** als gewöhnlicher Text des
Dokuments — sie wird deshalb mitgeprüft, mitgedruckt und mit ausgegeben.
Freiwillig: der Hausstil verzichtet auf sie, wo der Originalfall es tat.

Im Word-Dokument landet das Bild als eingebettete Zeichnung mit festem
Seitenverhältnis, zentriert, mit der Beschriftung als kleinerer Absatz
darunter. In der Klartextfassung steht an gleicher Stelle der Marker
`[Bild N: dateiname – siehe Word-Dokument]`.

Die Bytes liegen in der Datenbank, nicht im Dateisystem: der Container ist
flüchtig. Im Dokumentbaum steht nur die Kennung — ein Bild als Datenstrom
im Baum würde jedes Speichern im Sekundentakt um Megabytes aufblähen.

## Bildbibliothek

Derselbe Gedanke wie bei den Argumenten: was einmal aufbereitet wurde,
bekommt **Titel, Beschreibung und Themen** und ist beim nächsten Fall
wieder da. Gesucht wird über alle vier Felder samt Dateiname; die Themen
sind freie Schlagworte und stehen zusätzlich als Filter bereit.

Gefüllt wird sie auf zwei Wegen: direkt hochladen, oder — der übliche Weg —
ein Bild aus einem Schreiben übernehmen. Was noch nicht übernommen ist,
steht auf der Seite unten und wartet auf einen Klick.

Im Brief steht die Bildbibliothek in der Randspalte: suchen, anklicken oder
in den Brief ziehen. Der Titel des Bildes wird dabei zur Beschriftung
vorgeschlagen.

Ein Bibliotheksbild wird beim Einfügen **nicht kopiert** — dieselbe Aufnahme
läge sonst vielfach in der Datenbank, und eine berichtigte Beschreibung
erreichte nur eine der Kopien. Deshalb lässt sich ein Bild auch nicht
löschen, solange es in einem Schreiben steht.

## Die Farbe einer Schaltfläche

Drei Bedeutungen, sonst nichts:

| Farbe | Bedeutung | Beispiele |
| --- | --- | --- |
| **Blau, gefüllt** | trägt die Arbeit voran — je Fläche genau eine | Dokument erzeugen · Prüfbericht auswerten · In den Brief einfügen · Speichern |
| **Grün** | gibt frei, bestätigt, meldet Vollzug | Freigeben (gefüllt) · Bestätigen · Versendet · Doch bestreiten · In die Bibliothek |
| **Rot** | löscht endgültig | Löschen · Position entfernen · Entfernen (Fundstelle) |
| Grau | alles Übrige | Fett, Kursiv, Fokus, Zurücksetzen, Nicht bestreiten, Aus der Bibliothek nehmen |

Rot steht **nur dort, wo etwas endgültig verschwindet**. Was sich
zurücknehmen lässt — „Nicht bestreiten", „Aus der Bibliothek nehmen",
„Zurückziehen" — bleibt grau; sonst stumpft die Warnung ab, und der eine
Knopf, der wirklich löscht, geht in der Menge unter.

Gefärbt wird der **Umriss**, gefüllt erst unter dem Zeiger — im Augenblick
vor dem Klick. So bleibt je Fläche genau ein lauter Knopf: der, der
weiterführt. Ein gesperrter Knopf lässt seine Farbe fahren und wird grau:
Er droht nicht mit etwas, das er gerade nicht tut.

Die Farbe ist nie das einzige Zeichen. Jeder rote Knopf sagt in Worten, was
er löscht, und fragt vorher nach; die Rückfrage nennt den Gegenstand beim
Namen.

## Zwei Proben im Browser

Zwei Skripte fahren die Anwendung in einem echten Browser:

```bash
pnpm exec tsx scripts/rundgang-brief.ts   # der Weg durch ein Schreiben
pnpm exec tsx scripts/ui-pruefung.ts      # jede Schaltfläche, zweimal
```

Der **Rundgang** geht den Weg des Sachverständigen: Brief öffnen, Anmerkung
aufklappen, Baustein bearbeiten und einfügen, Bild einsetzen und ziehen,
ausschneiden und einfügen, Dokument erzeugen. Er beanstandet, was dabei
schiefgeht, und bricht mit Fehlercode ab.

Die **Bedienprobe** geht statt dessen die Fläche ab: 66 Handgriffe, jeder
zweimal — das erste Mal zeigt, ob etwas geht, das zweite Mal, ob es auch
beim Wiederholen geht. Sie unterscheidet im Bericht zwischen *fehlerhaftem*
und *ungünstigem* Verhalten: ein Knopf, der nichts tut, ist ein Fehler; ein
Knopf, der etwas tut, ohne es zu sagen, ist ungünstig. Für die zerstörenden
Handgriffe — Position entfernen, Stellungnahme löschen — legt sie sich
Wegwerf-Schreiben an und räumt sie wieder weg; dafür braucht sie
`DATABASE_URL`.

## Warten mit Auskunft

Die beiden langen Vorgänge — Prüfbericht auswerten und Dokument erzeugen —
laufen als **Ereignisstrom** und melden, woran sie gerade arbeiten: Seite
für Seite beim Einlesen, dann Auslesen, Prüfliste, Anlegen. Der Balken zeigt
den Stand, darunter stehen die erledigten Schritte. Kurze Wege bekommen
einen Kreisel, keinen Balken.

Das Erscheinungsbild lässt sich in der Kopfleiste umschalten: hell, dunkel
oder wie das System. Die Wahl bleibt im Browser und wird vor dem ersten
Zeichnen gesetzt, damit nichts aufblitzt.

## Aussehen

Farben, Masse und Formen folgen der Vorlage „Judia" (Bootstrap 5.3): Blau
als einzige Signalfarbe, kühle Blaugrautöne für Text, helle Flächen mit
dünnen Rändern statt Schatten. Links eine schmale dunkle Schiene, daneben
das einklappbare Menü, darüber die Kopfleiste.

Eine Ausnahme ist Absicht: der Brief wird in einer Serifenschrift gesetzt.
Er soll wie ein Schreiben aussehen, nicht wie eine Bildschirmmaske.

## Zwei Grundregeln, die im Code verankert sind

**Die Bibliothek bleibt in beide Richtungen lesbar.** Markdown → Datenbank →
Markdown ist verlustfrei und durch Tests abgesichert. Solange der Rückexport
läuft, funktionieren die bestehenden Skills im Chat unverändert weiter — die
Webapp ist keine Einbahnstraße.

**Vier Wächter, laufend statt am Ende.** Offene Platzhalter und interne
Feldnotizen **sperren** den Export; Zahlen ohne Beleg im Fall und
Formulierungen an der RDG-Grenze **warnen**. Sie laufen bei jedem
gespeicherten Stand und erscheinen als Anmerkung am Rand, mit Sprung an die
beanstandete Stelle. Alle vier sind deterministisch — eine Sperre, die
selbst raten muss, ist keine Sperre.

**Die Herkunft klebt am Text.** Eingefügter Bibliothekstext trägt eine
Auszeichnung, die das Umformulieren überlebt. Nur deshalb bleibt
nachvollziehbar, welcher Eintrag in welchem Fall gewirkt hat — eine
Tabellenzeile hätte das erste freie Überschreiben nicht überstanden.

**Freigeben ist Menschensache.** Der Status `freigegeben` wird ausschließlich
über die Oberfläche gesetzt und verlangt die Rolle `freigeber`. Kein
KI-Aufruf erreicht diesen Weg. Unbestätigte Fundstellen sperren die Freigabe;
interne Hinweise sind im Datenmodell vom Exportpfad getrennt und können
deshalb auch durch einen Modellfehler nicht in ein versandtes Schreiben
geraten.
