# Schreibtisch `/stellungnahmen/[id]` — Prüfer PG

Datensätze (nach dem Abschluss neu erzeugt, Kennungen daher aktualisiert):

| | Betreff | Kennung | Positionen |
|---|---|---|---|
| A | `PG A — leer, ohne Positionen` | `141c8a80-…` | 0, Entwurf |
| B | `PG B — drei Positionen, vollständig` | `dd78526e-…` | 3, Fall `PG-0726/2011TG` |
| C | `PG C — zwölf Positionen, versendet` | `0a97079f-…` | 12, versendet |

Alle Handgriffe mit Playwright gegen den laufenden Entwicklungsbetrieb,
jeder Punkt mindestens zweimal, Wirkung jeweils nach Neuladen **und** in der
Datenbank (`stellungnahme.dokument`, `dokument_stand`, `position.behandlung`,
`eintrag`) nachgesehen.

---

## Geprüft

**1 Laden.** A, B, C je viermal geöffnet — **kein einziger Konsolenfehler**,
kein `pageerror`. A 2,6 s, B 3,3–4,0 s, C 5,2–8,0 s bis zum fertigen Editor.

* A (0 Positionen) zeigt statt einer leeren Fläche den Kasten „Aus diesem
  Bericht wurde keine Position übernommen, die in eine Stellungnahme
  gehört." Positionsleiste und Randspalte bleiben ganz weg statt leer
  dazustehen — richtig.
* C (12 Positionen): alle zwölf Marken sind sichtbar und vollständig, die
  Leiste bricht um (`flex-wrap: wrap`) und läuft bei 380/800/1024/1280/1440 px
  **nie** über die Werkzeugleiste oder das Fenster hinaus (gemessen:
  `positionsleiste.right ≤ werkbank-leiste.right` bei jeder Breite).
* Klick auf Marke 8 → Schreibmarke landet in Abschnitt 8, Abschnitt wird
  hervorgehoben, Anmerkung 8 öffnet sich, Abschnitt ist im Bild. Ebenso
  Marke 1. Jede Marke trägt einen sprechenden `title`
  („Position 8 des Prüfberichts: … · −300.00 € — noch ohne Text").

**2 Kopfzeile.** Klappe „Empfänger" öffnet und schliesst auf Klick; sie
klappt beim Tippen **nicht** zu (10 Zeichen in `#empf` getippt, `open`
blieb `true`) — der zweimal beschriebene alte Fehler ist weg. `KlappenSchliesser`
schliesst sie beim Klick daneben zuverlässig. Datumsfeld ist ein echtes
`type=date`; Leeren setzt die Vorschau auf „Noch kein Datum …" und die Pille
auf „1 offen", Setzen auf `2026-08-03` und Umschalten auf „Mail" ändert die
Vorschau mit. Speichern → `empfaenger_*`, `einleitung_datum`,
`einleitung_medium` stehen in der Datenbank und sind nach Neuladen im
Formular. Betreff und Anrede stehen nicht mehr hier, sondern im Brief
(so auch im Dateikommentar beschrieben) — dort geprüft.

**3 Schreiben im Editor.** Tippen → `ungespeicherte Änderung` → nach der
Ruhe `gespeichert`; `dokument_stand` 1→2→3→5. Fett (Knopf), Kursiv (Strg+I),
Aufzählung, Absätze, Rückgängig/Wiederherstellen: alle im Baum und nach
Neuladen noch da (`"bold"`, `"italic"`, `"bulletList"` im gespeicherten JSON,
`<strong>` nach dem Neuladen). Es gibt **keinen** Speichern-Knopf und die
Oberfläche behauptet auch keinen — sie zeigt nur den Stand, das stimmt.
`beforeunload` warnt, solange etwas aussteht.

**4 Bausteine.** Vorschläge stehen an jeder Anmerkung mit Güte und
Trefferbegründung („Direkter Treffer trifft auf positio, verbring").
Einfügen per Knopf und per Ziehen (Vorschlagskopf **und** Ziehgriff am
Entwurf) landen im richtigen Abschnitt, mit Herkunftsmarke
(`title="PG.2 PG Entwurf mit Platzhaltern"`, `data-herkunft`), und sind nach
Neuladen da. Ziehen in den Betreff wird abgelehnt — mit der Meldung „Ein
Baustein gehört in einen Positionsabschnitt — nicht in Betreff, Ergebnis
oder Signatur." Der **zurückgezogene** Eintrag `PG.3` taucht weder in den
Vorschlägen noch in der Suche auf (`ne(status,'zurueckgezogen')` in
`src/stellungnahme/abfragen.ts:35` und `:87`) — die Zusage stimmt.
Platzhalter: `[Kennzeichen]` wird aus den Falldaten gesetzt (`OL-AB 1234`),
`[Bauteil]` bleibt stehen und erzeugt prompt den sperrenden R1-Befund.
Varianten des Eintrags setzen den Entwurfstext.

**5 Abschnitte / Rahmen.** Strg+A + Ausschneiden + Einfügen: Betreff, Anrede,
alle drei Abschnitte **mit ihrem Text**, das Merkmal „ausgelassen" und der
Ergebnisabsatz kommen zurück — auch nach Neuladen. Der bekannte Fehler ist
bis auf den Einleitungssatz weg (siehe *Fehler 2*). Ausschneiden **ohne**
Einfügen: der Rahmen legt die Abschnitte sofort leer zurück, der
Ergebnisabsatz ebenso; nach Neuladen unverändert. „Nicht bestreiten" lässt
den Abschnitt samt Text ausgegraut stehen (`data-ausgelassen`,
`behandlung='nicht_bestreiten'`), „Doch bestreiten" holt ihn zurück, der Text
ist noch da. „Position entfernen" fragt zurück, nennt die Alternative und
entfernt Abschnitt, Marke, Anmerkung und Datenbankzeile — 3 → 2, auch nach
Neuladen. „In die Bibliothek" legte `99.1` als **Entwurf** an und sagt das
auch so.

**6 Schnellauswahl.** Erscheint bei jeder Textmarkierung 8 px über der
Auswahl. Alle fünf Schaltflächen wirken, und der zweite Klick hebt wieder
auf (Fett, Kursiv, Aufzählung, Nummerierte Liste je an/aus geprüft; „✕" löst
nur Fett und Kursiv). Über mehrere Absätze hinweg zeichnet sie beide aus
(2 × `<strong>`). In Überschrift und Betreff bleibt sie korrekt weg. Klick
daneben schliesst sie. Esc: siehe *Ungünstig 3* (behoben).

**7 Bilder.** Upload über den Knopf, Einfügen aus der Bildbibliothek per
Klick und per Ziehen. Beschriftung ist gewöhnlicher Dokumenttext. **Ziehen
am Griff nach dem Klick in die Beschriftung funktioniert** — 68 % → 45,96 %,
während des Zugs stufenlos, ein einziger Rückgängig-Schritt danach; der
bekannte Fehler ist weg. Breite und Beschriftung stehen nach dem Neuladen
im Baum (`"breite":0.4596`) und auf dem Schirm. Zweiter Zug an derselben
Stelle ebenso. Pfeiltasten am Griff ändern in 1-%-Schritten (68 → 70 %).
Löschen: Schreibmarke am Bild + Entf entfernt den Knoten; Rückgängig holt
ihn zurück.

**8 Prüfung/Befunde.** A: „nichts zu beanstanden" (richtig, kein Text).
C: dito. B mit absichtlich fehlerhaftem Text („Sie haben Anspruch auf
Erstattung von 4.712,99 EUR. Der Betrag [Kennzeichen] könnte erforderlich
sein. Sehr häufige Position.") → **2 sperrend, 4 zu prüfen**: R1 Platzhalter,
R4 interne Notiz, R2 unbelegte Zahl, 2 × R3 RDG, R3 weiche Formulierung.
Alle Meldungen deutsch, sachlich und wahr. Klick auf jeden Befund markiert
**genau** die Fundstelle: „[Kennzeichen]", „4.712,99", „Sie haben Anspruch",
„Anspruch auf Erstattung". Die sperrenden sind wirklich sperrend — „Dokument
erzeugen" liefert nichts, meldet „2 Prüfungen sperren die Ausgabe: R1 bei
Position 1 …; R4 bei Position 1 …" in Fehlerfarbe und schlägt die erste
Stelle auf.

**9 Export.** B (zwei Abschnitte mit Text): DOCX **154 075 Bytes**, Signatur
`PK`, 34 Einträge im Archiv, `word/document.xml` enthält Geschäftspapier-Kopf,
Empfängeranschrift, Betreff, Anrede, Einleitungssatz, „1. …", „2. …",
Ergebnis und Signatur. **Keine** Kachel, keine Abschnittsmarke, kein
`data-position-id`, kein „Anmerkung öffnen", kein „nicht bestritten —",
kein `d-quelle` — weder im XML noch im Klartext. Dateinamen nach Hausstil
(`Stellungnahme_PG-07262011TG_2026-08-14.docx/.txt`). A und C werden mit
„Kein Abschnitt trägt Text — es gäbe nichts auszugeben." abgelehnt, klar
begründet. PDF gibt es nicht — die Oberfläche bietet auch keins an.

**11 Tastatur/Fokus/Breiten.** 380 / 1024 / 1440 px: **kein Querlauf**
(`body.scrollWidth ≤ innerWidth`), Randspalte rutscht unter den Brief,
alle Marken bleiben erreichbar. Tab-Reihenfolge läuft geradlinig
Navigation → Rückweg → Klappen → Löschen → Werkzeuge → Positionsmarken;
jedes Ziel hat `title` oder `aria-label`.

**12 Fehlerfälle.** Fremde/unbekannte UUID → deutsche „Seite nicht
gefunden"-Seite (404). Nicht angemeldet → Weiterleitung auf `/anmelden`.
`POST /api/stellungnahmen/<id>/ausgabe` und `…/bilder` ohne Anmeldung →
**401 „Nicht angemeldet."** (neue `src/app/api/wache.ts`). `/stellungnahmen/unfug`
siehe *Fehler 3* (behoben).

**14 Farbkonzept.** Rot nur, wo etwas endgültig verschwindet („🗑 Löschen",
„Position entfernen"). Grün an „Versendet", „Doch bestreiten", „In die
Bibliothek". Blau gefüllt an „Dokument erzeugen", „Speichern", „In den Brief
einfügen". Werkzeuge, Marken und Fokus grau. Einschränkung siehe
*Ungünstig 4*.

---

## Fehler

### 1. Datum und Übermittlungsweg im Kopfbereich wirken nicht auf den Brief — die Zeile behauptete das Gegenteil *(behoben)*

*Getan:* In `PG B` im Kasten „Empfänger" das Datum von `01.08.2026` auf
`03.08.2026` gesetzt, Übermittlungsweg auf „Mail", gespeichert, neu geladen.

*Erwartet:* Was die Vorschauzeile ankündigt — „Im Brief: „mit der Mail vom
03.08.2026 …"".

*Passiert:* Die Datenbank nimmt beides an, das Formular zeigt es nach dem
Neuladen. Im Brief steht unverändert **„mit dem Schreiben vom 01.08.2026
überließen Sie uns …"**, und genau dieser Satz geht in die Word-Ausgabe.

*Ursache:* `baueEinleitung` (`src/export/hausstil.ts:65`) wird nur an einer
einzigen Stelle benutzt: `src/dokument/erzeugen.ts:95`, also beim **Anlegen**
des Dokuments. Danach ist der Satz gewöhnlicher Fliesstext im Baum;
`dokumentNachAbsaetzen` (`src/dokument/nach-absaetzen.ts:193`) liest ihn von
dort. `src/stellungnahme/ausgabe.ts:125-126` reicht `einleitungDatum` und
`einleitungMedium` zwar an `baueDocx` weiter, aber `src/export/docx.ts:297-301`
liest aus `kopf` nur Ort, Datum, Empfänger und Betreff. Die beiden Felder sind
für ein bestehendes Schreiben **wirkungslos**.

*Behoben:* `kopf.tsx:122-140` — die Zeile sagt jetzt, was sie ist:
„Einleitungssatz beim Anlegen: „mit dem Schreiben vom 01.08.2026 …" — im
schon geschriebenen Brief steht der Satz im Text und wird dort geändert."
Ohne Datum: „Noch kein Datum — ein neu angelegtes Schreiben beginnt dann ohne
Einleitungssatz."

*Offen (ausserhalb meiner Dateien):* Wer den Satz wirklich mitziehen lassen
will, müsste ihn beim Speichern des Kopfes im Dokument ersetzen. Das ist
allerdings Fliesstext und damit nach dem Grundsatz „der Text dem Verfasser" —
mein Vorschlag ist deshalb die ehrliche Zeile, nicht das stille Umschreiben.

### 2. Strg+A → Ausschneiden → Einfügen bringt den Einleitungssatz nicht zurück

*Getan:* In `PG B` Text in zwei Abschnitte geschrieben, in den Brief geklickt,
Strg+A, Strg+X, Strg+V. Zweimal, dazu ein Durchgang mit Neuladen.

*Erwartet:* Der Brief steht wieder da wie vorher — so sagt es der Kommentar
über der Erweiterung: „Ausschneiden und Einfügen ist damit ein vollständiger
Hin- und Rückweg, auch über das ganze Schreiben."

*Passiert:* Betreff, Anrede, beide Abschnitte samt Text, das Merkmal
„ausgelassen" und der Ergebnisabsatz kommen zurück. Der **Einleitungssatz**
(„mit dem Schreiben vom 01.08.2026 überließen Sie uns u.a. den
Kürzungsbericht des Dienstleisters ControlExpert …") bleibt weg — der Absatz
steht leer da, und niemand sagt etwas. Nach dem Neuladen ist er endgültig
fort, weil er nirgends sonst gespeichert ist.

*Ursache:* `src/dokument/editor-schema.ts:589-593` — `handlePaste` des
Rahmens liest aus der Ablage ausdrücklich nur drei Merkmale zurück:
```ts
const rahmen: [string, string][] = [
  [KNOTEN.betreff, 'p[data-betreff]'],
  [KNOTEN.anrede,  'p[data-anrede]'],
  [KNOTEN.ergebnis,'p[data-ergebnis]'],
]
```
Der Einleitungsabsatz ist ein gewöhnlicher `paragraph` ohne Merkmal und fällt
durch. Er ist zugleich der einzige Absatz vor dem ersten Abschnitt, der beim
Export als `struktur.einleitung` ausgegeben wird
(`src/dokument/nach-absaetzen.ts:172-175`) — ohne ihn geht das Schreiben ohne
Einleitungssatz aus dem Haus. Und weil `s.betreff`/`s.anrede` in
`src/stellungnahme/ausgabe.ts:123-124` einen Rückfall haben, der Einleitungs-
satz aber keinen, ist ausgerechnet er der einzige, dessen Verlust nirgends
auffällt.

*Vorschlag (nicht geändert, fremde Datei):* Die freien Absätze zwischen
Anrede und erstem Abschnitt genauso zurücklesen wie Betreff und Anrede. In
`editor-schema.ts` nach der Rahmen-Schleife (Zeile 611) etwa: alle
`p:not([data-betreff]):not([data-anrede]):not([data-ergebnis])`, die im
eingefügten HTML **vor** dem ersten `section[data-position-id]` stehen,
sammeln und an `stelleVorDemSchluss`-Logik vorbei vor den ersten Abschnitt
setzen — analog zu dem, was `unbekannt` (Zeile 613-615) schon für fremde
Abschnitte tut.

### 3. `/stellungnahmen/unfug` antwortete mit HTTP 500 *(behoben)*

*Getan:* `/stellungnahmen/unfug` und `/stellungnahmen/UNFUG-123` aufgerufen,
angemeldet und nicht angemeldet.

*Erwartet:* Deutsche, freundliche „nicht gefunden"-Seite.

*Passiert:* **HTTP 500** mit der allgemeinen Fehlerseite „Da ist etwas
schiefgegangen — Der Vorgang ist unerwartet abgebrochen." Ein Tippfehler in
der Adresse wurde als Störfall behandelt.

*Ursache:* `page.tsx` gab die Adresse ungeprüft an `ladeStellungnahme(id)`
weiter; die Spalte ist `uuid`, Postgres bricht mit „invalid input syntax for
type uuid" ab, und Next macht daraus 500. Eine unbekannte, aber wohlgeformte
UUID lieferte dagegen schon immer sauber 404.

*Behoben:* `page.tsx:29-46` — die Kennung wird gegen das UUID-Muster geprüft;
was keins ist, geht mit `notFound()` auf die deutsche Seite. Nachgemessen:
`unfug` → 404, `UNFUG-123` → 404, unbekannte UUID → 404.

### 4. Die Bibliothekssuche in der Randspalte verschwieg, was der Vorschlag nebenan sagt *(behoben)*

*Getan:* In der Anmerkung unter „Gesamte Bibliothek" nach `PG Entwurf mit
Platzhaltern` (Status `entwurf`) gesucht, den Treffer geöffnet, in den Brief
eingefügt. Zum Vergleich denselben Eintrag über die Vorschlagsliste geöffnet.

*Erwartet:* Beide Wege führen in denselben Brief, also müssen sie dasselbe
sagen.

*Passiert:* Über die **Vorschläge** stand „Dieser Eintrag ist noch nicht
freigegeben." und bei offenen Platzhaltern „Noch offen: [Kennzeichen],
[Bauteil] — der Export bleibt gesperrt, solange sie stehen." Über die
**Suche** stand dort nichts — nur ein nacktes Textfeld. Der nicht
freigegebene Entwurf liess sich wortlos übernehmen; die beiden Platzhalter
tauchten erst nach dem Einfügen als sperrende R1-Befunde auf. Genau das
Muster, das im Auftrag als Beispiel genannt ist: dieselbe Sache, zwei Wege,
verschieden viel Wahrheit.

*Ursache:* `blase.tsx` — der Suchzweig (vormals Zeile 436-475) hatte weder
den Status-Hinweis noch den Platzhalter-Hinweis; `status` wurde von
`durchsucheBibliothek` zwar geliefert (`src/stellungnahme/abfragen.ts:80`),
aber im Zustandstyp der Trefferliste gar nicht erst geführt.

*Behoben:* `blase.tsx:150-171` (Typ um `status` erweitert, mit Begründung)
und `blase.tsx:465-489` (beide Hinweise wie im Vorschlagszweig).
Nachgemessen: Entwurf mit Platzhaltern → „Dieser Eintrag ist noch nicht
freigegeben." + „Noch offen: [Bauteil] — der Export bleibt gesperrt …";
freigegebener Eintrag ohne Platzhalter → kein Hinweis.

---

## Ungünstig

### 1. Ein versendetes Schreiben sieht aus wie jedes andere — und lässt sich vollständig ändern

*Getan:* `PG C` (versendet) geöffnet, in Abschnitt 1 getippt, gewartet, in der
Datenbank nachgesehen; „Nicht bestreiten" geklickt.

*Passiert:* `contenteditable="true"`, `dokument_stand` 1 → 2, der Text steht
in der Datenbank, `position.behandlung` wurde auf `nicht_bestreiten` gesetzt.
Nichts ist gesperrt. Die Oberfläche behauptet auch nirgends, es sei
unveränderlich — sie sagt aber **überhaupt nichts**: in der ganzen Kopfzeile
steht kein Wort und keine Pille „versendet". Das Einzige, was sich ändert,
ist dass zwei Knöpfe fehlen: „Versendet" und „🗑 Löschen" (`page.tsx:118-125`,
`schreiben.tsx:840-854`). Der Löschknopf verschwindet **wortlos**, obwohl
`loescheStellungnahme` (`src/stellungnahme/export-aktionen.ts:84-90`) einen
guten deutschen Grund parat hätte: „Dieses Schreiben ist als versendet
vermerkt und lässt sich nicht löschen. Nimm den Vermerk zurück, wenn es
wirklich weg soll."

*Ursache:* `speichereDokument` (`src/stellungnahme/editor-aktionen.ts:35`),
`setzeBehandlung` (:195) und `entfernePosition` (:217) prüfen `versendetAm`
nicht; `schreiben.tsx` reicht `versendet` nur an die Knopfsichtbarkeit weiter
und nicht an `useEditor({ editable })`.

*Vorschlag:* Entweder eine sichtbare Marke „versendet am TT.MM.JJJJ" in der
Kopfzeile plus einen ausgegrauten Löschknopf mit dem obigen Grund im `title`
(beides in meinen Dateien machbar) — oder eine echte Sperre, die dann aber in
`editor-aktionen.ts` verankert gehört, damit sie nicht nur die Oberfläche
betrifft. Ich habe nichts geändert, weil beide Wege eine Entscheidung
darüber sind, ob ein versendetes Schreiben nachbesserbar sein soll; das ist
keine Prüferfrage.

### 2. Klick auf die Marke einer nicht bestrittenen Position führt nirgendwohin

*Getan:* In `PG C` auf Marke 12 (nicht bestritten) geklickt.

*Passiert:* Die Anmerkung öffnet sich, der Abschnitt wird hervorgehoben —
aber der Brief scrollt nicht dorthin (`imBild: false`), die Schreibmarke
bleibt, wo sie war. Bei zwölf Positionen sitzt der ausgegraute Abschnitt weit
unten und wird nicht gefunden. Der `title` der Marke verspricht nichts
Falsches, das Verhalten ist aber für die eine Hälfte der Marken ein anderes
als für die andere.

*Ursache:* `schreiben.tsx:794` und `:928` — `if (editor && imBrief.has(p.id))
springeInAbschnitt(...)`. Ausgelassene Abschnitte stehen sehr wohl im
Dokument; nur `imBrief` ist für sie `false`.

*Nicht geändert:* Die Bedingung stammt aus der Zeit, als ein ausgelassener
Abschnitt gelöscht wurde; heute wäre `findeAbschnitt` der richtige Prüfstein.
Weil `springeInAbschnitt` ohnehin `false` liefert, wenn es den Abschnitt nicht
gibt, wäre die Bedingung schlicht entbehrlich — aber sie zu streichen ändert
das Verhalten für alle zwölf Marken auf einmal, und dafür fehlt mir die
Rückmeldung des Büros.

### 3. Esc schloss die Schnellauswahl nicht *(behoben)*

*Getan:* Text markiert, Esc gedrückt. Zweimal.

*Passiert:* Die schwebende Leiste blieb stehen. Sie verdeckt die Zeile über
der Markierung; wer nachlesen wollte, was er markiert hat, musste erst
danebenklicken — und damit die Markierung aufgeben.

*Behoben:* `schnellauswahl.tsx:22-31, 42-62` — die Leiste bekommt einen
eigenen `PluginKey` und einen Esc-Horcher, der ihr per
`tr.setMeta(SCHLUESSEL, 'hide')` sagt, dass sie sich wegnehmen soll. Die
Meldung geht mit `addToHistory: false` und rührt den Text nicht an; die
ProseMirror-DOM wird **nicht** von aussen angefasst. Nachgemessen: nach Esc
weg, **Markierung bleibt erhalten** (10 Zeichen), bei der nächsten
Markierungsänderung kommt sie von selbst zurück, `dokument_stand` unverändert,
Rückgängig macht keinen Esc-Schritt rückgängig.

### 4. Zwei blau gefüllte Knöpfe in einer offenen Anmerkung

Ist ein Vorschlag aufgeklappt, stehen in derselben Anmerkung zwei Knöpfe
„In den Brief einfügen" in Blau — einer im Entwurfskasten, einer unter
„Eigener Text" (nachgezählt: `haupt` × 2). Das Farbkonzept sagt „nur einer je
Fläche". Der zweite ist leer-und-damit-abgeschaltet, was es mildert; sauber
ist es nicht. Nicht geändert, weil jede Abhilfe (den zweiten grau machen,
„Eigener Text" einklappen) eine Gestaltungsentscheidung ist.

### 5. Die Zahlen an einer geschlossenen Anmerkung sagten nicht, was sie zählen *(behoben)*

An `PG C` stand an neun von zwölf geschlossenen Anmerkungen eine nackte „4".
Daneben stehen — in anderen Farben, aber gleicher Form — die Zahl der
sperrenden und die der zu prüfenden Befunde. Drei nackte Zahlen, kein
`title`, keine Vorlesehilfe: „4" liest sich als „vier Dinge zu tun", gemeint
waren vier bereitliegende Bausteine.

*Behoben:* `blase.tsx:198-238` — jede Zahl trägt jetzt einen `title`
(„4 Vorschläge aus der Bibliothek — Direkter Treffer", „2 sperrende Befunde —
sie halten die Ausgabe auf", „3 Befunde zu prüfen") und ein
`.nur-vorlesen`-Wort für die Vorlesehilfe. Die Klasse gibt es bereits
(`globals.css:1827`), an der CSS wurde nichts geändert.

### 6. Weitere kleine Beobachtungen

* **Meldungszeile bleibt stehen.** Nach der abgelehnten Ablage im Betreff
  („Ein Baustein gehört in einen Positionsabschnitt …") blieb die Meldung
  auch nach dem nächsten, erfolgreichen Einfügen stehen — `setzeMeldung(null)`
  passiert nur beim Erzeugen des Dokuments (`schreiben.tsx:565`).
* **Kachelzahl ≠ Nummer im Brief.** Die Marke im Papierrand trägt die Nummer
  des Prüfberichts (`editor-schema.ts:330`), der CSS-Zähler daneben die
  Nummer im Schreiben (`globals.css:1330-1331`, leere und ausgelassene
  Abschnitte zählen nicht mit). Bei `PG C` steht die Marke „4" also neben der
  Überschrift „3.". Beides ist einzeln begründet und im Code kommentiert;
  nebeneinander liest es sich wie ein Zählfehler.
* **Klick auf ein Bild zeigt keine Auswahl.** `bild-ansicht.tsx:81` setzt die
  Klasse `gewaehlt` aus `selected`, das nur bei einer `NodeSelection` wahr
  wird. Weil der Bildknoten Inhalt (die Beschriftung) hat, entsteht beim
  Klick keine — der Rahmen bleibt unmarkiert, obwohl Entf das Bild dann
  entfernt. Es wirkt, als könne man das Bild nicht anfassen.
* **Der Bildgriff misst in zwei Einheiten.** `aria-label` nennt Zentimeter,
  `aria-valuenow/min/max` Prozent (`bild-ansicht.tsx:93-96`). Für die
  Vorlesehilfe sind das zwei verschiedene Skalen am selben Regler.
* **Pflichtfelder lassen sich leer speichern.** Empfänger und Datum geleert,
  „Speichern": beides steht danach als `NULL` in der Datenbank, gemeldet wird
  „Gespeichert." Der Warnkasten davor ist ehrlich, hält aber nichts auf — und
  der Export läuft mit leerer Anschrift durch
  (`src/stellungnahme/ausgabe.ts:120`: `s.empfaengerName ?? ''`). Ein
  Geschäftsbrief ohne Empfänger sollte spätestens die Ausgabe aufhalten.
* **Esc schliesst den Empfänger-Kasten nicht.** Das ist das Verhalten von
  `<details>`; wo die Schnellauswahl es jetzt kann, fällt es auf.
* **„Aus diesem Bericht …"** — der Kasten bei `PG A` (`page.tsx:130-134`)
  spricht von einem Bericht; `PG A` hat gar keinen
  (`pruefbericht_dateiname` ist `NULL`).
* Auf der 404-Seite meldet die Konsole „Encountered a script tag while
  rendering React component" — ausserhalb meiner Dateien (`src/app/not-found.tsx`),
  hier nur der Vollständigkeit halber.

---

## Geändert

| Datei | Was | Warum |
|---|---|---|
| `src/app/(app)/stellungnahmen/[id]/page.tsx` (Z. 29-46) | UUID-Muster prüfen, sonst `notFound()` | `/stellungnahmen/unfug` antwortete mit HTTP 500 statt der deutschen „nicht gefunden"-Seite (*Fehler 3*) |
| `src/app/(app)/stellungnahmen/[id]/kopf.tsx` (Z. 122-140) | Vorschauzeile sagt „Einleitungssatz beim Anlegen …" statt „Im Brief: …" | Die alte Zeile versprach eine Wirkung auf den Brief, die es nicht gibt (*Fehler 1*) |
| `src/app/(app)/stellungnahmen/[id]/blase.tsx` (Z. 150-171, 465-489) | Trefferliste führt `status`; der Suchzweig zeigt „noch nicht freigegeben" und die offenen Platzhalter wie der Vorschlagszweig | Zwei Wege in denselben Brief sagten verschieden viel (*Fehler 4*) |
| `src/app/(app)/stellungnahmen/[id]/blase.tsx` (Z. 198-238) | `title` und `.nur-vorlesen` an den drei Zahlenpillen | Drei nackte Zahlen in drei Farben, ohne Erklärung (*Ungünstig 5*) |
| `src/app/(app)/stellungnahmen/[id]/schnellauswahl.tsx` (Z. 22-31, 42-62) | Eigener `PluginKey`, Esc nimmt die Leiste weg (Transaktion mit `addToHistory: false`, kein Eingriff in die ProseMirror-DOM) | Esc schloss die Leiste nicht (*Ungünstig 3*) |

`pnpm typecheck` läuft nach jeder Änderung sauber durch. Kein `build`, kein
`vitest`, kein `commit`, kein `push`. Alle Prüfskripte (`probe-pg-*.mts`)
sind gelöscht; die drei PG-Datensätze wurden am Ende mit
`pnpm exec tsx scripts/probedaten.ts PG` frisch angelegt und danach noch
einmal ohne Konsolenfehler geöffnet.

---

## Offen

1. **Der Einleitungssatz überlebt Ausschneiden und Einfügen nicht**
   (*Fehler 2*) — `src/dokument/editor-schema.ts:589-611`. Fremde Datei;
   Vorschlag oben.
2. **`einleitungDatum`/`einleitungMedium` sind für ein bestehendes Schreiben
   wirkungslos** (*Fehler 1*). Ich habe die Zeile ehrlich gemacht, nicht das
   Verhalten. Wer will, dass die Felder wirken, muss entweder den
   Einleitungsabsatz beim Speichern des Kopfes ersetzen
   (`src/stellungnahme/export-aktionen.ts:33`) oder die Felder ganz aus dem
   Kopfbereich nehmen und den Satz nur im Brief pflegen. Letzteres passt
   besser zum Grundsatz „der Text dem Verfasser".
3. **`reparatur.ts` heilt nur, was fehlt, nicht was leer ist.** Nach einem
   Ausschneiden ohne Einfügen kommen Abschnitte und Ergebnisabsatz zurück
   (der Rahmen im Editor tut das schon), Betreff, Anrede und Einleitung
   bleiben dauerhaft leer. Betreff und Anrede haben beim Export einen
   Rückfall auf die Datenbank (`src/stellungnahme/ausgabe.ts:123-124`) — der
   Einleitungssatz nicht. `src/dokument/reparatur.ts:56-101`.
4. **Ein versendetes Schreiben ist weder gekennzeichnet noch geschützt**
   (*Ungünstig 1*) — braucht eine Entscheidung, dann eine Sperre in
   `src/stellungnahme/editor-aktionen.ts` und eine Marke in der Kopfzeile.
5. **Der Export läuft ohne Empfänger durch** — `src/stellungnahme/ausgabe.ts:120`.
   Ein fünfter Wächter oder eine Prüfung an dieser Stelle wäre der Ort.
6. **Sprung zu ausgelassenen Abschnitten** (*Ungünstig 2*) —
   `schreiben.tsx:794` und `:928`; meine Datei, aber eine Verhaltensänderung
   für alle Marken, die ich nicht im Alleingang treffen wollte.
