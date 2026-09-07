---
name: stellungnahme-erstellen
description: >
  This skill should be used when the user wants to draft, write, or respond to a
  "Kürzungsschreiben", "Prüfbericht", or insurer cost-reduction letter for a Kfz
  damage claim, or asks to "Stellungnahme erstellen", "Abrechnung Versicherer prüfen",
  "Kürzungsschreiben prüfen", "Stellungnahme gegen Versicherer schreiben", or uploads
  a Kürzungsschreiben/Prüfbericht PDF together with a request for a response. Covers
  Kalkulation (Reparaturkosten), Wertminderung (merkantiler Minderwert), and
  WBW/Restwert-type insurer cost reductions. Bietet außerdem einen
  "individuell"-Modus, in dem ausschließlich der Hausstil und das Geschäftspapier
  (Briefkopf-Vorlage) genutzt werden und der Nutzer die Argumentation selbst vorgibt —
  die Argumentbibliothek wird dabei nicht verwendet. Auslöser u.a.:
  "individuelle Stellungnahme", "eigene Argumentation", "nur der Rahmen/Briefkopf",
  "ich gebe die Argumente selbst vor".
metadata:
  version: "0.6.0"
---

# Stellungnahme gegen Kürzungsschreiben erstellen

Dieser Skill führt den vollständigen Workflow zur Erstellung einer Stellungnahme gegen ein Kürzungsschreiben eines Kfz-Versicherers durch: Eingang lesen, Kürzungstyp erkennen, jede Kürzungsposition extrahieren, pro Position eine Behandlung festlegen, das fertige Schreiben zusammensetzen und als Word-Dokument sowie als Klartext ausgeben.

## Modus-Erkennung — ZUERST bestimmen

Bevor der Fortschrittsplan angelegt wird, bestimme den Arbeitsmodus:

- **Standard-Modus (Voreinstellung):** Der volle Workflow mit Bibliotheksabgleich (Schritte 0–7 unten). Anwenden, wenn nichts anderes gesagt wird.
- **Individuell-Modus:** Anwenden, wenn der Nutzer sinngemäß sagt „individuelle Stellungnahme", „eigene Argumentation", „nur der Rahmen/Briefkopf", „ich gebe die Argumente selbst vor", „nutze nur die Formulierungen/den Hausstil" o.ä. In diesem Modus wird die **Argumentbibliothek nicht verwendet** — nur der Hausstil-Rahmen und das Geschäftspapier. Der vollständige Ablauf steht im Abschnitt **„Individuell-Modus"** direkt vor Schritt 1. Ist unklar, ob der Nutzer den Individuell-Modus meint, kurz nachfragen.

## Schritt 0: Fortschrittsplan anlegen — ZWINGEND ZUERST

**Der allererste Akt dieses Skills ist es, ALLE folgenden Schritte gleichzeitig als native Cowork-Aufgaben anzulegen — bevor eine einzige Datei gelesen, ein einziger Befehl ausgeführt oder irgendeine inhaltliche Arbeit begonnen wird.** Nicht einen Schritt anlegen und dann anfangen — alle auf einmal, dann erst loslegen.

Cowork zeigt die Tasks automatisch in der rechten Sidebar unter „Fortschritt" an und hakt sie ab, sobald sie abgeschlossen sind. KEIN `show_widget` verwenden.

**Im Standard-Modus** alle vier Steps gleichzeitig anlegen:
1. PDF einlesen (Bildextraktion)
2. Referenzdateien laden
3. Kürzungspositionen extrahieren & Behandlung festlegen
4. Stellungnahme verfassen & Ausgabe erzeugen

**Im Individuell-Modus** stattdessen diese drei Steps gleichzeitig anlegen:
1. Optional: Kürzungsschreiben einlesen (nur Empfänger/Aktenzeichen/Betreff)
2. Rahmendaten & eigene Argumentation einsammeln
3. Stellungnahme verfassen & Ausgabe erzeugen

Erst wenn alle Tasks angelegt sind, beginnt die inhaltliche Arbeit.

Lade vor der ersten inhaltlichen Bearbeitung die passenden Referenzdateien aus `references/`:
- `argumente-kalkulation.md` — kanonische Gegenargumente zu Reparaturkosten-Kürzungen (Ersatzteile, Lackierung, Arbeitsposition, Nebenkosten, Aufschläge, Werkstattvergleich, Wertverbesserung/NfA, Vorschaden). **Im Individuell-Modus NICHT laden.**
- `argumente-wertminderung.md` — kanonische Gegenargumente zu Wertminderungs-Kürzungen. **Im Individuell-Modus NICHT laden.**
- `allgemeine-vorbemerkung-und-sonderfaelle.md` — wiederverwendbarer Einleitungsblock plus strukturelle Lessons-Learned (Dokumentbündel, Versicherer-eigenes Gegengutachten, Grundlagenfehler etc.).
- `hausstil-aufbau-stellungnahme.md` — Struktur, Tonfall, Briefkopf-Logik, Ergebnis-Formulierungen, Formatierung. **Im Individuell-Modus die zentrale und einzige inhaltliche Referenz.**
- `argumente-wbw.md` — Bausteine für WBW-Kürzungen (Szenario A: Pauschalkürzung tabellarisch; Szenario B: Vergleichsfahrzeuge angreifen). IMMER laden wenn WBW-Kürzung erkannt. **Im Individuell-Modus NICHT laden.**

---

## Individuell-Modus

Dieser Modus erstellt eine Stellungnahme, deren Argumentation vollständig vom Nutzer kommt. Der Skill steuert nur den Hausstil-Rahmen und das Geschäftspapier bei — die Argumentbibliothek (`argumente-kalkulation.md`, `argumente-wertminderung.md`, `argumente-wbw.md`) wird **nicht geladen und nicht verwendet**. Es findet **kein** Kürzungstyp-Routing, **keine** Positions-Extraktion aus dem Prüfbericht und **kein** Bibliotheksabgleich statt. Die Schritte 2, 2a, 3, 4 und 5 des Standard-Workflows entfallen komplett.

Geladen wird ausschließlich `hausstil-aufbau-stellungnahme.md`. Die Ausgabe (Schritt 7, inkl. Geschäftspapier/Briefkopf-Vorlage) ist identisch zum Standard-Modus.

### I-1: Optional Eingang einlesen (nur Metadaten)

Hat der Nutzer ein Kürzungsschreiben/Prüfbericht-PDF hochgeladen, lies es **nur**, um folgende Rahmendaten zu übernehmen:
- Empfänger/Auftraggeber (Kanzlei, Versicherer, Autohaus) und dessen Adresse
- Aktenzeichen / Schadennummer
- Name des Anspruchstellers (für die Betreffzeile)
- Datum und Medium (Schreiben/Mail) des Anschreibens (für den Einleitungssatz)

Textextraktion mit `pdftotext -layout datei.pdf -`; bei Scans die Seiten rastern (`pdftoppm -jpeg -r 150 datei.pdf seite`) und visuell lesen — genau wie in Schritt 1. **Extrahiere KEINE Kürzungspositionen und leite KEINE Argumente ab** — die Argumentation gibt der Nutzer selbst vor (I-2). Lädt der Nutzer kein PDF hoch, überspringe die Extraktion und frage die Rahmendaten in I-2 direkt ab.

### I-2: Rahmendaten & eigene Argumentation einsammeln

Stelle in EINEM einzigen `ask_user_input`-Aufruf die noch offenen Punkte zusammen. Was bereits aus I-1 oder dem Gesprächsverlauf feststeht, NICHT erneut fragen — nur kurz spiegeln.

Abzufragen:
1. **Empfänger** (Name/Kanzlei + vollständige Adresse) — sofern nicht aus I-1 bekannt.
2. **Betreffzeile** bzw. Anspruchsteller-Name/Aktenzeichen — sofern nicht aus I-1 bekannt.
3. **Anrede** — konkrete Ansprechperson oder „Sehr geehrte Damen und Herren,".
4. **Datum/Medium des Anschreibens** für den Einleitungssatz — sofern nicht aus I-1 bekannt. Alternativ: Einleitungssatz weglassen, wenn es sich um eine direkte technische Einzelfrage handelt (siehe `hausstil-aufbau-stellungnahme.md`, Abschnitt 5).
5. **Vorbemerkung zu Prüfberichten einfügen?** → Ja/Nein (Block aus `allgemeine-vorbemerkung-und-sonderfaelle.md`, Teil A).
6. **Eigene Argumentation** — die eigentliche inhaltliche Eingabe des Nutzers. Bitte ihn, seine Punkte frei zu liefern: entweder als durchnummerierte Positionen (je Position eine kurze Überschrift + sein Argument) oder als Fließtext/Stichpunkte. Er kann so viele oder so wenige Positionen angeben wie er möchte.

Für die eigene Argumentation gilt:
- Der Nutzer kann pro Position eine Überschrift (Bauteil/Kürzungsgrund) und einen Argumenttext liefern, oder einfach seine Gedanken als Stichpunkte — der Skill formt sie in den Hausstil (nummerierte Positionen mit klar abgesetzter Überschrift, sachlich-bestimmter Tonfall).
- **Die Substanz der Argumentation wird nicht verändert, nicht ergänzt und nicht „aus der Bibliothek verbessert".** Der Skill glättet nur Formulierung, Tonfall und Struktur (z.B. Konjunktive zu bestimmter Sprache im Hausstil, siehe Hinweise unten). Ist ein Punkt inhaltlich unklar oder fehlt eine Angabe (Betrag, Bauteilseite, Datum), NICHT erfinden — kurz nachfragen.
- Möchte der Nutzer zu einer Position ein Bild/Foto beifügen, kann er das angeben; die Datei lädt er im Chat hoch. Zuordnung und Einbettung laufen wie im Standard („Bildanlagen pro Position", Schritt 7).

### I-3: Stellungnahme zusammensetzen & Ausgabe erzeugen

Setze das Schreiben nach `hausstil-aufbau-stellungnahme.md` zusammen:
1. Briefkopf → Datum, Empfänger, Betreff (Geschäftspapier, siehe Schritt 7 / Abschnitt 1)
2. Anrede, Einleitungssatz (sofern gewünscht)
3. Optional: Vorbemerkung zu Prüfberichten
4. Nummerierte Positionen — **wörtlich die vom Nutzer gelieferte Argumentation**, nur in den Hausstil eingebettet
5. Ergebnis-Absatz (passende Variante aus `hausstil-aufbau-stellungnahme.md`, Abschnitt 8 — mit dem Nutzer abstimmen, falls nicht offensichtlich)
6. Signatur

Zeige dem Nutzer den vollständigen Entwurf zur Durchsicht und nimm Korrekturen auf. Erzeuge dann die Ausgabe **exakt wie in Schritt 7** (Word-Dokument auf Basis von `assets/briefkopf-vorlage.docx` = Geschäftspapier, plus Klartext-Version). Bild-Einbettung, Dateinamen-Konvention und Präsentation identisch zu Schritt 7.

Danach endet der Individuell-Modus — die Schritte 1–6 unten sind nur für den Standard-Modus relevant.

---

## Schritt 1: Eingang lesen

Nimm das/die vom Nutzer bereitgestellte(n) Dokument(e) entgegen (i.d.R. ein PDF des Kürzungsschreibens/Prüfberichts, manchmal zusätzlich das ursprüngliche Schadengutachten zum Abgleich).

1. Versuche zuerst Textextraktion: `pdftotext -layout datei.pdf -`. Wenn dabei sinnvoller, vollständiger Text herauskommt, ist das Dokument digital/textbasiert.
2. Liefert die Textextraktion nichts, nur Bruchstücke oder offensichtlich verstümmelten Text (häufig bei eingescannten Prüfberichten von Drittanbietern wie ControlExpert, DEKRA, ClaimsControlling), rastere die betroffenen Seiten zu Bildern: `pdftoppm -jpeg -r 150 datei.pdf seite` und lies die Seiten visuell (Bild-Ansicht), genau wie ein Mensch einen Scan lesen würde. Tabellen mit Kürzungsbeträgen sind in dieser Bibliothek fast immer in solchen gerasterten Prüfberichten enthalten.
3. Bei mehrseitigen PDFs IMMER alle Seiten durchgehen, nicht nur die erste – Begründungstexte und Zahlen stehen oft auf späteren Seiten ("Ergebnis der Prüfung", "Technische Prüfung", "Kfz-technische Prüfung").
4. Prüfe aktiv auf Dokumentbündel mit unfallfremden Abschnitten (Sachverständigenhonorar-Prüfung, Nutzungsausfall-Prüfbericht, Totalschaden/WBW-Abrechnung vor einer separaten Kalkulation) – siehe `allgemeine-vorbemerkung-und-sonderfaelle.md`, Abschnitt B.1. Benenne solche Abschnitte kurz gegenüber dem Nutzer und schließe sie von der weiteren Bearbeitung aus, sofern sie nicht explizit gewünscht ist.

## Schritt 2: Kürzungstyp erkennen

Bestimme den Typ anhand der TATSÄCHLICH vorhandenen Kürzungspositionen, nicht allein anhand von Schlagwörtern im Anschreiben:

- **Kalkulation** — Kürzungen bei Arbeitslohn, Ersatzteilen, Lackierung, Nebenkosten, Stundenverrechnungssätzen etc. (mit Abstand am häufigsten).
- **Wertminderung** — Kürzung/Anzweiflung des merkantilen Minderwerts.
- **WBW** — Kürzung des Wiederbeschaffungswerts (z.B. abweichende Marktwert-Einschätzung, Ablehnung des DAT-Werts, Benennung eigener Vergleichsfahrzeuge).
- **Restwert** — Kürzung/Anpassung des Restwerts (z.B. abweichendes Restwertgebot).
- **Kombination** — mehrere der obigen Typen im selben Dokument.

Prüfe außerdem auf die strukturellen Sonderfälle aus `allgemeine-vorbemerkung-und-sonderfaelle.md`, Teil B (insbesondere B.2: Versicherer-eigenes Gegengutachten statt externem Prüfbericht, und B.7: Grundlagenfehler durch falsches Fahrzeug).

Teile dem Nutzer kurz mit, welchen Typ/welche Typen du erkannt hast, bevor du mit der Extraktion fortfährst.

## Schritt 2a: WBW-Routing (nur wenn WBW-Kürzung erkannt)

Liegt eine WBW-Kürzung vor (allein oder in Kombination mit Kalkulation), bestimme sofort das WBW-Szenario aus `argumente-wbw.md`:

**Routing-Entscheidung:**
- Hat der Versicherer konkrete Vergleichsfahrzeuge benannt? → **Szenario B**
- Hat der Versicherer pauschal gekürzt ohne Vergleichsfahrzeuge? → **Szenario A**
- Ist aus dem Dokument nicht eindeutig erkennbar? → Nutzer fragen

**Nur WBW (kein Kalkulations-Anteil):**
- Workflow läuft ausschließlich über den WBW-Pfad aus `argumente-wbw.md`
- Schritt 3 entfällt (keine Kalkulations-Positionen zu extrahieren)
- Schritt 4 entfällt
- Schritt 5 wird ersetzt durch den WBW-Abfrage-Block (siehe unten)
- Schritt 6 folgt dem WBW-Aufbau

**WBW + Kalkulation kombiniert:**
- WBW-Block wird als erste Gruppe in der Sammelabfrage (Schritt 5) behandelt
- Kalkulations-Positionen folgen als zweite Gruppe im selben `ask_user_input`-Aufruf
- Im fertigen Dokument steht WBW zuerst (Abschnitt I), Kalkulation danach (Abschnitt II)
- Einleitungssatz nennt beide Kürzungstypen

## Schritt 3: Jede Kürzungsposition extrahieren

Liste JEDE einzelne Kürzungsposition mit folgenden Angaben:
- Kurzbezeichnung (Bauteil/Kürzungsgrund)
- Gekürzter Betrag bzw. Arbeitswerte (falls angegeben)
- Wörtliche oder sinngemäße Begründung des Versicherers/Prüfdienstleisters

Fasse zusammengehörige Einzelpositionen, die offensichtlich zur selben Kürzungsentscheidung gehören (z.B. mehrere Arbeitslohn- und Lackierpositionen, die alle aus einer einzigen "Beilackierung nicht erforderlich"-Entscheidung folgen), zu EINER Position für die Stellungnahme zusammen — orientiere dich dabei daran, wie es in den Referenzdateien gehandhabt wird (eine inhaltliche Entscheidung des Prüfdienstleisters kann mehrere Kalkulationszeilen betreffen).

Bei einer Sammelposition mit mehreren gleichartigen Einzelteilen (z.B. 12 gestrichene E-Teile): prüfe, ob alle Teile gleich zu bewerten sind, oder ob ein Teilsplit nötig ist (siehe Sonderfall B.4).

## Schritt 4: Pro Position einen passenden Eintrag suchen

**WBW-Positionen überspringen diesen Schritt** — sie werden direkt in Schritt 5 (WBW-Abfrage-Block) behandelt.

Für jede Kalkulations- oder Wertminderungs-Position:
1. Durchsuche `argumente-kalkulation.md` bzw. `argumente-wertminderung.md` nach einem inhaltlich passenden Eintrag (Abgleich über Kategorie + Stichwort/Thema, nicht nur exakte Bauteilnamen — z.B. "Halteleiste Stoßfänger" und "Führungsprofil Stoßfänger" fallen unter denselben Eintrag "Halterung Stoßfänger").
2. Bewerte die Qualität des Treffers:
   - **Direkter Treffer** — Thema und Begründung passen eng, das hinterlegte Gegenargument kann mit angepassten Details (Beträge, Bauteilseite, Datum) direkt verwendet werden.
   - **Teiltreffer** — die Grundidee passt, aber Details unterscheiden sich deutlich; das Gegenargument muss inhaltlich angepasst werden.
   - **Kein Treffer** — keine passende Vorlage vorhanden (häufig bei WBW/Restwert oder bei sehr individuellen Sachverhalten wie Vorschaden-Abgrenzung, Grundlagenfehlern oder ungewöhnlichen Einzelbauteilen).

### Pflichtabgleich vor Verwendung eines Bibliothekseintrags

Ein Bibliothekstext ist ein Baustein, kein fertiger Absatz. Bevor ein Eintrag (egal ob "Direkter Treffer" oder "Teiltreffer") einer Position zugeordnet und in Schritt 5 vorgeschlagen wird, geh die folgenden Punkte aktiv durch — nicht nur gedanklich, sondern so, dass sich das Ergebnis im vorgeschlagenen Text widerspiegelt:

- **Platzhalter und Beispielwerte ersetzen.** Viele Einträge enthalten Platzhalter (`[Betrag]`, `[Bauteilseite]`, `[Datum]`, `[Marke]`) oder Beispielwerte aus dem ursprünglichen Fall (z.B. konkrete Eurobeträge, Prozentsätze, "links"/"rechts"). Jeder dieser Werte muss durch den tatsächlichen Wert des aktuellen Falls ersetzt werden. Bleibt ein Wert unklar (z.B. weil der Betrag aus dem Kürzungsschreiben nicht eindeutig hervorgeht), das offen lassen und beim Nutzer nachfragen — nicht den Beispielwert aus der Bibliothek stehen lassen.
- **Vorbedingungen prüfen, nicht unterstellen.** Manche Argumente sind nur richtig, wenn eine bestimmte Tatsache im aktuellen Fall tatsächlich zutrifft (z.B. "Fahrzeug wurde lückenlos in einer Markenwerkstatt gewartet", "eigene Nachfrage bei der Referenzwerkstatt ergab andere Sätze", "ein Vorschaden-Gutachten liegt vor", "Fotos belegen die Beschädigung"). Diese Vorbedingungen NIEMALS automatisch als erfüllt annehmen, nur weil sie im Bibliothekseintrag so beschrieben sind. Im Zweifel beim Nutzer nachfragen.
- **Passt die Begründung des Prüfdienstleisters wirklich zum Eintrag?** Zwei Kürzungen können nach Bauteilname identisch aussehen, aber aus unterschiedlichen Gründen erfolgen (z.B. "nicht nachvollziehbar dokumentiert" vs. "vom Hersteller nicht vorgesehen" vs. "Doppelberechnung"). Das im Kürzungsschreiben tatsächlich verwendete Argument des Prüfdienstleisters bestimmt, welche Variante/welcher Absatz aus dem Eintrag passt — nicht nur der Bauteilname. Passt keine der hinterlegten Varianten wirklich, ist das ein Teiltreffer, kein direkter Treffer.
- **Kennzeichnen, was übernommen und was angepasst wurde.** Wird ein Eintrag in Schritt 5 vorgeschlagen, immer kurz mitteilen, welche Werte konkret eingesetzt wurden und – bei einem Teiltreffer – was inhaltlich gegenüber dem Bibliothekstext geändert wurde.

## Schritt 5: Pro Position Argumentationsoptionen vorlegen und Behandlung festlegen

### Schnellmodus vs. Auswahl-Modus

**Auswahl-Modus (Standard):** Für jede Position werden mehrere Argumentationsoptionen vorgelegt und der Nutzer wählt interaktiv aus.

**Schnellmodus:** Sagt der Nutzer sinngemäß „nimm einfach die Standardargumente", „automatisch" o.ä., aktiviere den Schnellmodus: Wähle pro Position automatisch Option A und erstelle die Stellungnahme ohne weitere Argument-Rückfragen. Am Ende eine kompakte Übersicht zeigen, was pro Position gewählt wurde, mit der Möglichkeit zur nachträglichen Korrektur. **Auch im Schnellmodus wird genau einmal nach Bildern gefragt** (siehe „Bildanlagen pro Position" unten): eine einzige `single_select`-Frage „Möchtest du zu einer oder mehreren Positionen Bilder beifügen? → Nein / Ja, ich lade welche hoch". Bei „Ja" greift der Abschnitt „Medien-Einsammlung & Zuordnung". Bei „Nein" läuft der Schnellmodus ohne weitere Unterbrechung durch.

---

### Auswahl-Modus: Alle Positionen auf einmal abfragen

**Zuerst** für ALLE Positionen gleichzeitig die besten Bibliotheksargumente ermitteln (Schritt 4 für alle Positionen vollständig abschließen). Erst dann die Abfrage starten — niemals Position für Position abfragen und dazwischen warten.

**Ablauf (zweistufig, einmalig):**

**Stufe 1 — Detailansicht als `show_widget`:**
Ein einziges HTML-Widget zeigt ALLE Positionen untereinander mit ihren vollständig ausgearbeiteten Optionen. Pro Position:
- Positionstitel + Kürzungsbetrag als Überschrift
- Versichererbegründung kursiv
- Jede Option als Karte mit Treffer-Badge (Direkter Treffer / Teiltreffer / Kein Treffer), vollständigem Argumentationstext und ggf. ⚠️-Hinweis bei Vorbedingungen

Dieses Widget dient als Referenz zum Lesen — die eigentliche Auswahl passiert in Stufe 2.

**Stufe 2 — Kompakte Sammelabfrage per `ask_user_input`:**
EINEN einzigen `ask_user_input`-Aufruf mit ALLEN Positionen gleichzeitig als separate `single_select`-Fragen. Pro Position eine Frage, z.B.:
- Frage: „Position 1 — Oberflächenlackierung Tür vorne (−179 €)"
  Optionen: „A – Aus einem Guss (Direkter Treffer)", „B – [Kurztitel]", „Eigene Stichpunkte", „Nicht bestreiten"
- Frage: „Position 2 — Schutzleiste Ersatzteil (−67,25 €)"
  Optionen: „A – Folgekürzung Pos.1 (Direkter Treffer)", „B – Eigenständiger Angriff", „A+B kombinieren", „Nicht bestreiten"
- … (alle weiteren Positionen)

Der Nutzer wählt für alle Positionen auf einmal aus — dann erst geht es weiter. KEIN sequenzielles Abfragen Position für Position.

**Zusätzlich pro Position eine Bildfrage:** Direkt im selben `ask_user_input`-Aufruf bekommt jede Position eine zweite `single_select`-Frage „Bild zu Position X beifügen? → Nein / Ja". So entscheidet der Nutzer pro Argument, ob ein oder mehrere Fotos zur Untermauerung dazukommen sollen. Die eigentlichen Dateien werden NICHT hier hochgeladen (das Button-Widget kann keine Uploads entgegennehmen) — sie werden im nachgelagerten Abschnitt „Medien-Einsammlung & Zuordnung" eingesammelt.

**Regeln:**
- Option A ist immer der beste Bibliothekstreffer. Bei mehreren gleichwertigen Treffern A/B/C anbieten.
- Gibt es nur einen Treffer: Option A + „Eigene Stichpunkte" + „Nicht bestreiten".
- Vorbedingungen mit ⚠️ im Optionstitel kennzeichnen, z.B. „A – Werkstattvergleich ⚠️ Nachfrage nötig".
- Wählt der Nutzer „Eigene Stichpunkte" für eine Position, danach einmalig alle offenen Stichpunkt-Eingaben sammeln.
- Die Bildfrage „Bild zu Position X beifügen?" wird für JEDE Position gestellt — außer für Positionen, die offensichtlich schon als „Nicht bestreiten" feststehen (diese erscheinen nicht im Schreiben, ein Bild wäre sinnlos).

### Bildanlagen pro Position — Medien-Einsammlung & Zuordnung

Dieser Abschnitt greift, sobald der Nutzer für mindestens eine Position „Ja" bei der Bildfrage gewählt hat (im Auswahl-Modus) bzw. die globale Bildfrage im Schnellmodus mit „Ja" beantwortet hat.

**Ablauf:**
1. Liste dem Nutzer in einer kurzen Nachricht alle Positionen auf, für die er „Ja" gewählt hat, und bitte ihn, die zugehörigen Bilder in den Chat hochzuladen. Hochgeladene Dateien liegen anschließend unter `/mnt/user-data/uploads/`.
2. Bei der Zuordnung gilt:
   - Hat der Nutzer für genau eine Position „Ja" gewählt und genau eine Datei hochgeladen → Zuordnung ist eindeutig, keine Rückfrage nötig (kurz bestätigen).
   - Sind mehrere Positionen mit „Ja" markiert ODER mehrere Dateien hochgeladen → die Zuordnung aktiv klären: welche Datei(en) gehören zu welcher Position und in welcher Reihenfolge. Dafür nach dem Upload einen kompakten `ask_user_input`-Aufruf nutzen (pro hochgeladener Datei eine `single_select`-Frage „Datei `name.jpg` gehört zu welcher Position?" mit den „Ja"-Positionen als Optionen), oder — wenn der Nutzer die Zuordnung schon im Klartext mitgeschickt hat — diese übernehmen und nur kurz zur Bestätigung spiegeln.
   - Mehrere Bilder pro Position sind erlaubt. Reihenfolge = Reihenfolge des Uploads, sofern der Nutzer nichts anderes angibt.
3. **Fehlende Datei:** Ist eine Position mit „Ja" markiert, aber es wurde keine passende Datei hochgeladen → aktiv nachfragen, nicht stillschweigend weglassen.
4. **Bild für „Nicht bestreiten":** Wird ein Bild versehentlich einer Position zugeordnet, die als „Nicht bestreiten" behandelt wird → den Nutzer darauf hinweisen, dass diese Position nicht im Schreiben erscheint, und fragen, ob das Bild zu einer anderen Position soll oder entfällt.
5. Halte das Ergebnis als klare Zuordnungstabelle fest (Position → Dateiname(n) → Reihenfolge) und gib sie an Schritt 6/7 weiter. Diese Zuordnung ist die Grundlage für die Bildeinbettung in der Ausgabe.

Akzeptierte Formate: PNG, JPG/JPEG (Standard bei Foto/Screenshot). Andere Formate (z.B. HEIC) vor der Einbettung nach JPG konvertieren.

Frage außerdem einmalig (als zusätzliche Frage im selben `ask_user_input`-Aufruf ganz oben), an wen die Stellungnahme geht und ob die Vorbemerkung eingefügt werden soll.

### WBW-Abfrage-Block (ersetzt oder ergänzt die Sammelabfrage bei WBW-Kürzung)

**Nur WBW:** Der WBW-Abfrage-Block ersetzt die gesamte Sammelabfrage.
**WBW + Kalkulation:** Der WBW-Abfrage-Block erscheint als erste Gruppe im `ask_user_input`, die Kalkulations-Positionen folgen als zweite Gruppe.

**Stufe 1 — WBW-Detailansicht als `show_widget`:**
Zeige das erkannte Szenario (A oder B) mit einer kurzen Beschreibung was im jeweiligen Szenario passiert. Bei Szenario A: zeige die Vorlage aus `argumente-wbw.md` mit den noch fehlenden Datenpunkten. Bei Szenario B: zeige die Stilbeschreibung und die offene Stichpunkt-Frage — keine Kategorieliste.

**Stufe 2 — WBW-Sammelabfrage per `ask_user_input`:**

Für **Szenario A** folgende Fragen stellen:
- „Stil der WBW-Darlegung" → Optionen: „Kurz/tabellarisch (Szenario A)", „Ausführlich mit Fließtext"
- „Eigene zusätzliche Argumente?" → Optionen: „Nein", „Ja, ich gebe Stichpunkte an"

Für **Szenario B** keine Kategorienauswahl — direkt zur Stichpunkt-Abfrage (siehe „Stichpunkt-Abfrage für Szenario B" weiter unten). Der Nutzer gibt frei an, welche Punkte er ansprechen möchte.

Nach der Auswahl: benötigte Basiswerte (eigener WBW, Versicherer-WBW, Versichererbegründung) aus dem Kürzungsschreiben entnehmen — sind diese nicht im Dokument, beim Nutzer nachfragen.

### Stichpunkt-Abfrage für Szenario B

Szenario B arbeitet ohne starre Kategorien. Stattdessen eine einzige offene Frage an den Nutzer:

> „Welche konkreten Unterschiede oder Mängel der Vergleichsfahrzeuge möchtest du ansprechen? Gib einfach Stichpunkte — ich formuliere daraus den ausführlichen Text."

Der Nutzer antwortet frei. Der Agent baut aus den gelieferten Stichpunkten vollständige Absätze mit Fettüberschriften im Gollenstede-Stil (siehe `argumente-wbw.md`, Szenario B). Keine Kategorien vorschlagen, keine Liste abhaken — der Nutzer bestimmt was relevant ist.

Einzige Pflichtangaben die vorab sichergestellt sein müssen (aus dem Kürzungsschreiben oder per Nachfrage):
- Eigener WBW (€) und Versicherer-WBW (€)
- Versichererbegründung (wörtlich oder sinngemäß)

Alles andere — Ausstattung, Farbe, km, Marktlage — kommt aus den Stichpunkten des Nutzers. Keine Annahmen treffen wenn ein Stichpunkt unklar ist: kurz nachfragen, dann formulieren.

Liegen Screenshots vor: Fotoanlage am Ende ergänzen.

## Schritt 6: Stellungnahme zusammensetzen

Bevor das Schreiben zusammengesetzt wird, Auftraggeber (Empfänger) und Betreffzeile festlegen: Geht beides bereits klar aus dem bisherigen Gesprächsverlauf oder dem Anschreiben/der Mail des Auftraggebers hervor, übernehmen. Andernfalls AKTIV beim Nutzer nachfragen (siehe `hausstil-aufbau-stellungnahme.md`, Abschnitt 2 und 3).

Setze das Schreiben gemäß `hausstil-aufbau-stellungnahme.md` zusammen. Der Aufbau hängt vom erkannten Typ ab:

**Nur Kalkulation / Wertminderung (unveränderter Standard-Aufbau):**
1. Briefkopf → Datum, Empfänger, Betreff
2. Anrede, Einleitungssatz
3. Optional: Vorbemerkung zu Prüfberichten
4. Nummerierte Positionen
5. Ergebnis-Absatz
6. Signatur

**Nur WBW:**
1. Briefkopf → Datum, Empfänger, Betreff (Betreff nennt „Kürzung des Wiederbeschaffungswerts")
2. Anrede, Einleitungssatz (WBW-Vorlage aus `argumente-wbw.md`)
3. WBW-Block: Szenario A (Tabelle) oder Szenario B (freie Stichpunkte, Gollenstede-Stil) gemäß Auswahl
4. Abschlussformel (WBW-Vorlage aus `argumente-wbw.md`)
5. Optional: Fotoanlage (bei Szenario B mit eigener Recherche)
6. Signatur

**WBW + Kalkulation kombiniert:**
1. Briefkopf → Datum, Empfänger, Betreff (nennt beide Kürzungstypen)
2. Anrede, Einleitungssatz (nennt beide Kürzungstypen)
3. **I. Wiederbeschaffungswert** — WBW-Block (Szenario A oder B)
4. **II. Reparaturkostenabrechnung** — nummerierte Kalkulations-Positionen (ggf. mit Vorbemerkung)
5. Ergebnis-Absatz (fasst beide Bereiche zusammen)
6. Optional: Fotoanlage am Ende
7. Signatur

Zeige dem Nutzer den vollständigen Entwurf zur Durchsicht, bevor die Ausgabedateien final erzeugt werden. Nimm Korrekturwünsche auf.

**Bildanlagen pro Position (inline):** Wurden in Schritt 5 Bilder zugeordnet, werden sie **inline direkt unter der jeweiligen nummerierten Position** platziert — unmittelbar nach dem Fließtext-Gegenargument dieser Position, vor der nächsten Position. Mehrere Bilder einer Position erscheinen untereinander in der festgelegten Reihenfolge. Bei WBW-Positionen können Bilder alternativ als Fotoanlage am Ende geführt werden (bestehender Ansatz, Szenario B); für Kalkulations-/Wertminderungs-Positionen ist die Inline-Platzierung der Standard. Die technische Einbettung erfolgt in Schritt 7.

## Schritt 7: Ausgabe erzeugen

Erzeuge IMMER beide Formate (siehe `hausstil-aufbau-stellungnahme.md`, Abschnitt 11):
1. **Word-Dokument** — Vorlage `assets/briefkopf-vorlage.docx` verwenden: docx-Skill, "Editing Existing Documents" (unpack → die in `hausstil-aufbau-stellungnahme.md`, Abschnitt 1 beschriebenen Platzhalter gezielt per Edit-Tool ersetzen → repack). Nur falls die Datei unerwartet fehlen sollte, ersatzweise docx-Skill, "Creating New Documents" (docx-js) mit dem Textnachbau-Briefkopf aus `hausstil-aufbau-stellungnahme.md`.
2. **Klartext-Version** — identischer Inhalt ohne Layout, als `.txt` oder `.md`.

### Bilder ins Word-Dokument einbetten

Bei „Editing Existing Documents" (entpackte Vorlage) werden Bilder NICHT per String-Ersetzung eingefügt, sondern über den OOXML-Weg des docx-Skills (Abschnitt „Images"):
1. Bilddatei nach `word/media/` kopieren (eindeutige Namen, z.B. `image-pos2-1.jpg`).
2. Relationship in `word/_rels/document.xml.rels` ergänzen (`Type=".../image"`, `Target="media/..."`).
3. Content-Type in `[Content_Types].xml` sicherstellen (`<Default Extension="jpg" ContentType="image/jpeg"/>` bzw. `png`).
4. An der richtigen Stelle in `document.xml` — direkt nach dem letzten Absatz des Gegenarguments der jeweiligen Position — einen Absatz mit `<w:drawing><wp:inline>`-Block einfügen, der per `r:embed` auf die Relationship zeigt.

**Formatierung (deckt sich mit `hausstil-aufbau-stellungnahme.md`, Abschnitt 10):**
- Breite ca. 10–12 cm, Höhe proportional zum Seitenverhältnis des Originalbilds (NICHT verzerren). Größe wird in EMU angegeben: 914400 EMU = 2,54 cm, also entspricht 10 cm ≈ 3.600.000 EMU, 12 cm ≈ 4.320.000 EMU. Höhe = Breite × (Originalhöhe / Originalbreite). Bildmaße vorab auslesen (z.B. mit Python/PIL), um das Verhältnis korrekt zu setzen.
- Zentriert (`<w:jc w:val="center"/>` im Absatz).
- Ohne Bildunterschrift.

### Bilder in der Klartext-Version

Die Klartext-Datei kann keine Binärbilder enthalten. An der Stelle, an der im Word-Dokument ein Bild steht, einen Marker einfügen — direkt nach dem Gegenargument-Text der Position, in eigener Zeile:

```
[Bild 1: image-pos2-1.jpg – siehe Word-Dokument]
```

Bei mehreren Bildern einer Position fortlaufend nummerieren (`[Bild 1: …]`, `[Bild 2: …]`). Den Originaldateinamen verwenden, damit die Datei eindeutig zuordenbar bleibt.

Dateinamen-Konvention: `Stellungnahme_[Nachname-oder-Firma]_[JJJJ-MM-TT].docx` bzw. `.txt`. Lege beide Dateien im Output-Verzeichnis ab und präsentiere sie dem Nutzer am Ende.

## Hinweise zur Arbeitsweise

- Frage nicht alles auf einmal ab — gehe Schritt für Schritt vor, aber fasse zusammen, was klar ist, und frage nur bei echten Unklarheiten nach.
- Bleibe beim sachlichen, fachlich-bestimmten Tonfall des Hausstils (siehe Beispieltexte in den Referenzdateien) — keine Schwächung der Position durch Konjunktive ("könnte", "müsste") an Stellen, an denen die Originaltexte bestimmt formulieren ("ist erforderlich", "ist zu erstatten").
- Wenn für eine Position weder ein Bibliothekstreffer noch eigene Stichpunkte des Nutzers vorliegen, schlage NICHT automatisch "nicht bestreiten" vor, sondern weise aktiv darauf hin, dass für diese Position eine Entscheidung fehlt.
- Bei WBW-Positionen immer `argumente-wbw.md` verwenden — Szenario A (tabellarisch) und Szenario B (stichpunktbasiert, freie Formulierung im Gollenstede-Stil) sind dort vollständig hinterlegt.
- **Ein Bibliothekseintrag ist nie automatisch fertig.** Kein Bibliothekstext darf unverändert und unkommentiert in eine Stellungnahme übernommen werden, ohne dass (a) alle Platzhalter/Beispielwerte durch die echten Fallwerte ersetzt wurden, (b) etwaige Vorbedingungen des Arguments tatsächlich für diesen Fall bestätigt wurden, und (c) dem Nutzer sichtbar gemacht wurde, was konkret eingesetzt bzw. angepasst wurde. Im Zweifelsfall lieber eine Position als Teiltreffer markieren und aktiv nachfragen.
- **Individuell-Modus:** Wählt der Nutzer den Individuell-Modus, wird die Argumentbibliothek gar nicht geladen. Die Argumentation kommt vollständig vom Nutzer; der Skill steuert nur Hausstil-Rahmen und Geschäftspapier bei und verändert die Substanz der gelieferten Argumente nicht (nur Formulierung/Struktur im Hausstil). Bei fehlenden oder unklaren Angaben nachfragen, nicht erfinden.
