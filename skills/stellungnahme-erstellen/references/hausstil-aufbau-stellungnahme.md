# Hausstil & Aufbau einer Stellungnahme

Diese Datei beschreibt Struktur, Tonfall und Formatierung einer Stellungnahme des Kfz-Sachverständigenbüros Thorsten Gollenstede, abgeleitet aus über 30 tatsächlich verschickten Stellungnahmen.

## 1. Briefkopf

**Status:** Die offizielle Word-Vorlage liegt vor unter `assets/briefkopf-vorlage.docx` und wird IMMER verwendet (kein Textnachbau mehr nötig). Das Original-Layout (vom Büro in Word gestaltet) liegt zusätzlich unverändert unter `assets/briefkopf-original.dotx`, falls die visuelle Gestaltung selbst einmal angepasst werden soll — für die normale Stellungnahme-Erstellung wird ausschließlich `briefkopf-vorlage.docx` benötigt.

### Technischer Aufbau von `briefkopf-vorlage.docx`

Vorgehen: docx-Skill, Abschnitt "Editing Existing Documents" (unpack → gezielte String-Ersetzungen mit dem Edit-Tool → repack). Die Vorlage enthält zwei seitenpositionierte Word-Textfelder (Datum, Adresse) sowie anschließend einen normalen Fließtext-Bereich für den eigentlichen Inhalt:

- **Datum-Textfeld** (rechtsbündig, oben): Platzhaltertext `Krefeld, 23.04.2026`. Durch das tatsächliche Erstellungsdatum ersetzen, Format `Krefeld, TT.MM.JJJJ`. Nur den Text ersetzen, Position/Größe des Textfelds unverändert lassen.
- **Adress-/Empfänger-Textfeld**, fünf Zeilen:
  1. `Kfz Sachverständigenbüro Gollenstede, Am Germannshof 15, 47807 Krefeld` — feste Rücksendeangabe, NICHT verändern.
  2. `Max Mustermann` — durch Name des Auftraggebers/Adressaten ersetzen (siehe Abschnitt 2).
  3. `Musterstraße 123` — durch Straße/Hausnummer ersetzen.
  4. `47807 Krefeld` — durch PLZ/Ort ersetzen.
  5. `Deutschland` — i.d.R. unverändert lassen, außer der Fall erfordert ausdrücklich etwas anderes.
- **Fließtext-Bereich** (kein Textfeld, normaler Absatzfluss): enthält die Platzhalter `[BETREFFZEILE]` und `[STELLUNGNAHME-TEXT: Anrede, Einleitungssatz, nummerierte Positionen, Ergebnis, Signatur]`. Beide durch den tatsächlichen Inhalt ersetzen (Aufbau siehe Abschnitte 3–9). Dieser Bereich ist bewusst NICHT als Textfeld umgesetzt, damit der Text bei längeren Stellungnahmen automatisch auf Folgeseiten umbricht — Kopf- und Fußzeile der Vorlage erscheinen dort automatisch erneut, ohne dass etwas Zusätzliches getan werden muss.

**Wichtig:** Vor `[BETREFFZEILE]` befinden sich bereits mehrere Leerabsätze, die absichtlich so bemessen sind, dass der Fließtext unterhalb des Datum-Textfelds beginnt. Diese Leerabsätze nicht entfernen oder kürzen — sonst überlappt der neue Text optisch mit dem Datum.

**Zwei technische Fallstricke beim Ersetzen (getestet, beide bestätigt):**
1. Word speichert jedes Textfeld doppelt ab (`mc:Choice` für aktuelle Word-Versionen, `mc:Fallback` für ältere) — der Datumstext und alle fünf Adresszeilen kommen dadurch JEWEILS ZWEIMAL im XML vor. Beim Ersetzen IMMER beide Vorkommen identisch ändern (z.B. per Skript/globalem Suchen-Ersetzen statt eines einzelnen eindeutigkeitsprüfenden String-Ersetzungsaufrufs).
2. Die Rücksendeangabe-Zeile (`Kfz Sachverständigenbüro Gollenstede, Am Germannshof 15, 47807 Krefeld`) endet ebenfalls auf "47807 Krefeld" — exakt der Platzhaltertext der vierten Adresszeile (PLZ/Ort des Empfängers). Beim Ersetzen der Empfänger-PLZ/Ort NIEMALS blind global nach "47807 Krefeld" suchen, sondern über den umgebenden Kontext (die Zeile folgt direkt auf die Straßenzeile und steht direkt vor der "Deutschland"-Zeile) eindeutig eingrenzen — sonst wird versehentlich auch die Rücksendeangabe verändert.

**Fallback (nur falls die Datei unerwartet fehlen sollte):** docx-Skill, "Creating New Documents" (docx-js), mit folgendem textbasiertem Briefkopf (rechtsbündiger Block oben, Arial, ca. 10pt):

```
Kfz-Sachverständigenbüro
Thorsten Gollenstede
Am Germannshof 15
47807 Krefeld
Tel.: 01575/1405748
E-Mail: info@gollenstede-sachverstand.de
Web: www.gollenstede-sachverstand.de
```

  Unterhalb linksbündig eine kurze Absenderzeile vor der Empfängeradresse: `Kfz Sachverständigenbüro Gollenstede, Am Germannshof 15, 47807 Krefeld`. Rechtsbündig über der Empfängeradresse das aktuelle Datum (Format TT.MM.JJJJ).

## 2. Empfängerblock

Je nach Auftraggeber unterschiedlich:
- Rechtsanwaltskanzlei (häufigster Fall): Name der Kanzlei, ggf. "Rechtsanwalt [Name]" oder "Rechtsanwältin [Name]", Straße, PLZ/Ort.
- Direkt der Versicherer (seltener).
- Ein Autohaus/Reparaturbetrieb, der im Auftrag eines Kunden anfragt.

Geht der Auftraggeber bereits klar aus dem Anschreiben/der Mail des Auftraggebers oder aus dem bisherigen Gesprächsverlauf hervor, diesen übernehmen. Andernfalls AKTIV beim Nutzer nachfragen: Name (Kanzlei/Auftraggeber) und vollständige Adresse (Straße, PLZ/Ort) — bevor der Empfängerblock in die Vorlage eingesetzt wird (siehe Abschnitt 1).

## 3. Betreffzeile

Format: `Betreff: Stellungnahme Abrechnung [Nachname/Firma des Anspruchstellers]` oder einfacher `Betreff: Stellungnahme [Nachname]`. Bei Flottenfällen/Firmenfahrzeugen den Firmennamen verwenden, ggf. mit Schadennummer ergänzt, wenn mehrere Fälle für denselben Halter unterschieden werden müssen, z.B.:
`Betreff: Stellungnahme Abrechnung Fahrlogistik Wächter GmbH, SNr.: [Schadennummer]`

Ist nicht bereits klar, wie der Fall referenziert werden soll (z.B. weil der Auftraggeber ein bestimmtes Aktenzeichen vorgegeben hat), AKTIV beim Nutzer nachfragen, wie die Betreffzeile lauten soll, bevor sie in den Platzhalter `[BETREFFZEILE]` der Vorlage (siehe Abschnitt 1) eingesetzt wird.

## 4. Anrede

Variiert je nach Empfänger:
- `Sehr geehrte Damen und Herren,` (wenn keine Ansprechperson bekannt/relevant)
- `Sehr geehrter Hr./Fr. [Nachname],` bzw. `Sehr geehrter Herr [Nachname],` / `Sehr geehrte Frau [Nachname],`

Den Nutzer fragen oder aus dem Anschreiben des Auftraggebers übernehmen, falls eine konkrete Ansprechperson bekannt ist.

## 5. Einleitungssatz

Fester Baustein, Datumsangabe und Medium (Schreiben/Mail) anpassen:

> mit dem Schreiben vom [Datum] überließen Sie uns das Abrechnungsschreiben des Versicherers mit der Bitte um Stellungnahme. Hierzu machen wir folgende Feststellungen:

Varianten, je nach tatsächlichem Übermittlungsweg:
- `mit der Mail vom [Datum] überließen Sie uns das Abrechnungsschreiben des Versicherers mit der Bitte um Stellungnahme. Hierzu machen wir folgende Feststellungen:`
- `mit dem Schreiben vom [Datum] überließen Sie uns u.a. den Kürzungsbericht des Dienstleisters [Kürzel] mit der Bitte um Stellungnahme. Hierzu machen wir folgende Feststellungen:`
- Bei direkter technischer Einzelfrage einer Kanzlei (siehe `allgemeine-vorbemerkung-und-sonderfaelle.md`, Abschnitt B.3) entfällt dieser Satz; statt dessen wird direkt auf die gestellte Frage eingegangen.

## 6. Optionale Vorbemerkung

Falls gewünscht/sinnvoll: der "Prüfberichte allgemein"-Block aus `allgemeine-vorbemerkung-und-sonderfaelle.md`, Teil A, eingefügt direkt nach dem Einleitungssatz, vor der ersten nummerierten Position. Mit dem Nutzer abstimmen, ob dieser Block gewünscht ist (Standard: nur bei Bedarf, nicht automatisch in jede Stellungnahme einfügen).

## 7. Nummerierte Positionen

Jede behandelte Kürzungsposition wird durchnummeriert (1., 2., 3., …) mit einer kurzen, fettgedruckten oder zumindest klar abgesetzten Kapitelüberschrift, die das Bauteil/den Kürzungsgrund benennt, z.B.:

```
1. Halterung Stoßfänger

[Fließtext-Gegenargument]
```

Positionen werden in der Reihenfolge behandelt, in der sie im Kürzungsschreiben/Prüfbericht erscheinen (nicht alphabetisch sortiert), außer der Nutzer wünscht eine andere Reihenfolge.

**Bei "nicht bestreiten":** Position wird in der finalen Stellungnahme schlicht NICHT erwähnt (kein Platzhalter, keine Lücke in der Nummerierung der sichtbaren Positionen – sie wird einfach weggelassen).

**Bei "ausdrücklich anerkannt":** Position wird als eigene Nummer aufgenommen, aber mit anerkennendem statt verteidigendem Text, siehe `argumente-kalkulation.md`, Abschnitt 10.

**Bilder/Fotobeispiele:** Fotos können einzelne Argumente untermauern (Detailaufnahmen, Vergleichsfotos eigener vs. versichererseitig vorgeschlagener Lackierbereich, Kalkulationsprogramm-Screenshots). Die Bildzuordnung läuft über die Sammelabfrage in Schritt 5 (`SKILL.md`, Abschnitt „Bildanlagen pro Position — Medien-Einsammlung & Zuordnung"): pro Position wird gefragt, ob ein oder mehrere Bilder beigefügt werden sollen; die Dateien lädt der Nutzer anschließend im Chat hoch und sie werden den Positionen zugeordnet. Im Word-Dokument stehen die Bilder **inline direkt unter der jeweiligen nummerierten Position** (Einbettung und Maße: `SKILL.md`, Schritt 7 und Abschnitt 10 unten). In der Klartext-Version steht an gleicher Stelle ein Marker `[Bild N: dateiname – siehe Word-Dokument]`.

## 8. Ergebnis-Absatz

Schließt die Stellungnahme ab, je nach Ausgang unterschiedlich formuliert:

**Vollständiger Widerspruch (alle/fast alle Positionen bestritten):**
> Die Schadenpositionen aus dem vorliegenden Gutachten sind zur Regulierung des entstandenen Schadens [in vollem Umfang / vollumfänglich] zu erstatten.

oder

> Die im Gutachten ausgewiesenen Schadenpositionen sind aus Sicht des Sachverständigen nicht zu beanstanden und in ausgewiesener Höhe zu erstatten.

**Teilweise Anerkennung (mind. eine Position ausdrücklich anerkannt oder Kalkulation angepasst, z.B. wegen korrigierter Stundenverrechnungssätze):**
> Die Schadenpositionen aus dem vorliegenden Gutachten, aktualisiert um die Stundenverrechnungssätze der Referenzwerkstatt aus [Monat/Jahr], sind zur Regulierung des entstandenen Schadens zu erstatten.

**Bei generell scharfer Kritik am Prüfbericht (z.B. nach Vorbemerkung-Block):**
> Die Abzüge des Prüfdienstleisters können aus Sachverständigensicht nicht nachvollzogen werden. Die Schadenpositionen aus dem vorliegenden Gutachten sind zur Regulierung des entstandenen Schadens vollumfänglich zu erstatten.

**Bei direkter technischer Einzelfrage (Sonderfall B.3):** Kurzes, direktes Fazit zur gestellten Frage statt eines allgemeinen Ergebnis-Absatzes.

## 9. Signatur

Zwei beobachtete Varianten, beide gültig – wenn nicht anders vom Nutzer gewünscht, die ausführlichere Variante verwenden:

```
Der Sachverständige

Mit freundlichen Grüßen
Sachverständigenbüro Gollenstede
```

oder kürzer, mit Namenskürzel:

```
Der Sachverständige
T.Gollenstede
```

## 10. Formatierungsregeln für das Word-Dokument

- Schriftart Arial, einheitlich im gesamten Dokument (siehe docx-Skill).
- Keine Aufzählungszeichen/Bullet-Points für die nummerierten Positionen verwenden – diese sind eigenständige Kapitel mit eigener Nummerierung, kein Bullet-Stil.
- Zitate von Gerichtsurteilen und Gesetzesnormen im Fließtext, nicht in separaten Kästen.
- Eingefügte Fotos/Screenshots: mit angemessener Breite (nicht über volle Seitenbreite, ca. 10–12 cm), zentriert, ohne Bildunterschrift, sofern im Originalfall auch keine Bildunterschrift verwendet wurde. Technisch in EMU angegeben (914400 EMU = 2,54 cm): 10 cm ≈ 3.600.000 EMU, 12 cm ≈ 4.320.000 EMU; Höhe stets proportional zum Originalverhältnis setzen (nicht verzerren). Einbettungsweg: `SKILL.md`, Schritt 7, Abschnitt „Bilder ins Word-Dokument einbetten".
- Seitengröße A4 (Standard für deutsche Geschäftsbriefe), Ränder ca. 2,5 cm.

## 11. Zwei Ausgabeformate

Am Ende des Workflows IMMER beide Formate erzeugen:
1. **Word-Dokument (.docx)** mit Briefkopf (Vorlage oder Textnachbau, siehe Abschnitt 1) – das eigentliche Versandschreiben.
2. **Klartext-Version (.txt oder .md)** – reiner Text ohne Layout, zur einfachen Weiterverarbeitung (z.B. Einfügen in eine E-Mail oder ein Anwaltsschreiben).

Beide Dateien im Output-Verzeichnis ablegen und dem Nutzer am Ende präsentieren.

## 12. Argumentationsauswahl pro Position

Argumente werden NIEMALS automatisch und kommentarlos aus der Bibliothek übernommen. Für jede Position werden dem Nutzer immer mehrere ausgearbeitete Optionen vorgelegt (Auswahl-Modus), es sei denn, der Nutzer hat ausdrücklich den Schnellmodus aktiviert. Siehe SKILL.md, Schritt 5 für den vollständigen Ablauf.

**Kurzregel:** Kein Argument ohne Auswahl — außer der Nutzer sagt ausdrücklich „automatisch".
