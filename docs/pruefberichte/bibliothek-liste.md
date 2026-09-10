# Bibliothek — Liste, Suche, Filter (Prüfer PB)

Seite: `/bibliothek`. Geprüft am 14.08.2026 gegen `http://localhost:3000` mit
Playwright (Chromium, angemeldet als `lgollenstede@…`). Jeder Punkt wurde
mindestens zweimal ausgeführt; die Prüfskripte (`probe-pb*.mts`) sind nach dem
Lauf wieder gelöscht.

Datenbestand während der Prüfung: 89 Einträge (67 Entwurf, 7 freigegeben,
15 zurückgezogen, 0 in Prüfung). Die Zahlen schwanken zwischen den Läufen um
±1, weil parallel andere Prüfer an ihren eigenen Datensätzen arbeiten; die
Aussagen unten hängen nicht an den absoluten Zahlen.

Eigene Datensätze:

| | Titel | Bereich / Abschnitt | Status | Besonderheit |
|---|---|---|---|---|
| PB.1 | PB Freigegeben mit Varianten und Fundstellen | Kalkulation / 1. Ersatzteile-Erforderlichkeit | freigegeben | 2 Varianten, 2 unbestätigte Fundstellen |
| PB.2 | PB Entwurf mit Platzhaltern | Kalkulation / 2. Lackierung und Beilackierung | entwurf | Text enthält `[Kennzeichen]`, `[Bauteil]` |
| PB.3 | PB Zurückgezogen ohne Gegenargument | Wertminderung / 5. Wertminderung | zurueckgezogen | Gegenargument leer, nur „Vorgehen", 1 Fundstelle |

---

## Geprüft

### 1. Suche (je zweimal; nach jedem Begriff zusätzlich Neuladen der Adresse)

Bei **jedem** Begriff geprüft: Zahl in `.treffer-zahl` gegen die Zahl der
`.zeile`, `q=` in der Adresse, Feldinhalt, und ob das Neuladen dasselbe
Ergebnis zeigt. In allen Fällen stimmten Zahl und Zeilen überein, stand `q=`
in der Adresse, und das Neuladen lieferte dieselben Treffer und denselben
Feldinhalt.

| Begriff | Herkunft | Treffer | Bemerkung |
|---|---|---|---|
| `PB` | Präfix | 3 → PB.1, PB.2, PB.3 | alle drei gefunden |
| `PB Freigegeben mit Varianten und Fundstellen` | voller Titel PB.1 | 1 → PB.1 | |
| `nicht nachvollziehbar` | Gegenargument PB.1 | 20 | Volltext im Gegenargument greift |
| `Beilackierung sei nicht erforderlich` | typische Begründung PB.2 | 7 (PA.2 … PG.2) | greift |
| `pB entWURF` | Gross/Klein gemischt | 1 → PB.2 | Gross-/Kleinschreibung egal |
| `begründen` | Umlaut, Vorgehen PB.3 | 9, darunter PB.3 | Umlaut greift |
| `Zurückgezogen ohne` | Umlaut im Titel | 7, darunter PB.3 | |
| `Kurzfassung für Mail` | Variantenbezeichnung PB.1 | 7, darunter PB.1 | Varianten werden mitdurchsucht |
| `Ausführlich mit Rechtsprechung` | Variantenbezeichnung PB.1 | 7, darunter PB.1 | |
| `xyzquark` | ohne Treffer | 0 | Leerzustand „Kein Eintrag passt zu dieser Suche." |
| `e` | einzelner Buchstabe | 89 (alle) | |
| `PB.` | Punkt in der Nummer | 3 | |
| 175 Zeichen Unsinn (`Ünsinn nsinn … xx&#?=`) | Lasttest | 0 | Leerzustand, Adresse korrekt kodiert, kein Fehler |

Zweiter Durchgang für `PB`, `pB entWURF`, `xyzquark`: identische Trefferzahlen.

### 2. Filter

* **Bereich** einzeln (Kalkulation → 69): jede gezeigte Zeile trug in der
  Metazeile „Kalkulation"; keine fremden Bereiche. Zweimal geprüft.
* **Status** einzeln, alle vier Werte, je zweimal — für jede gezeigte Zeile
  wurde die Statuspille gegen den Filter geprüft:
  Entwurf 67 (alle Pillen „Entwurf"), Zurückgezogen 15 (alle „Zurückgezogen"),
  Freigegeben 7 (alle „Freigegeben"), In Prüfung 0 (Leerzustand).
  Für „In Prüfung" habe ich PB.2 kurzzeitig auf `pruefung` gesetzt: der Filter
  fand ihn, die Pille zeigte „In Prüfung"; danach wieder auf `entwurf`
  zurückgesetzt (in der Datenbank nachgeprüft).
* **Abschnitt** einzeln: „2. Lackierung und Beilackierung" → 18 Treffer, alle
  aus diesem Abschnitt; die Option verspricht „(18)" — passt ohne weitere
  Filter.
* **Kombiniert** Bereich=Kalkulation + Status=Entwurf → 54; jede Zeile trug
  Pille „Entwurf" *und* Bereich „Kalkulation". Dazu Abschnitt → 16 Treffer,
  alle passend. Adresse: `?bereich=kalkulation&status=entwurf&abschnitt=…`.
  Zweimal durchlaufen.
* **Zählungen in den Abschnitts-Optionen**: ohne weitere Filter richtig; mit
  gesetztem Status falsch → siehe *Ungünstig 1*.
* **Bereichswechsel bei gesetztem Abschnitt** → siehe *Fehler 3* (behoben).

### 3. Suche + Filter zusammen (je zweimal, beide Reihenfolgen)

* Erst „PB" tippen, dann Status=Entwurf: Adresse trägt `q=PB&status=entwurf`,
  das Suchfeld behält „PB", Treffer 1 → PB.2.
* Erst Bereich=Kalkulation, dann „PB" tippen: Adresse behält
  `bereich=kalkulation`, Treffer 2 → PB.1, PB.2.
* Neuladen mit beidem in der Adresse: gleiche Trefferzahl, Suchfeld gefüllt.
* Stichproben über die Adresse: `?q=PB&status=zurueckgezogen` → nur PB.3;
  `?q=PB&bereich=kalkulation&status=freigegeben` → nur PB.1;
  `?q=PB&abschnitt=2.%20Lackierung…` → nur PB.2.

### 4. Zurücksetzen (zweimal)

Ohne Filter ist der Knopf nicht da. Mit q + Status + Bereich erscheint er; ein
Klick führt auf `/bibliothek` ohne jeden Parameter, leert das Suchfeld, zeigt
wieder alle 89 Einträge und blendet sich selbst aus. Auch 0,8 s später kehrte
kein `q=` zurück (die Entprellung feuert nicht nach).

### 5. Zeilen

Jede Zeile zeigt Nummer, Titel, Bereich + Abschnitt (per Flexbox mit 14 px
Abstand getrennt — die Metazeile ist trotz fehlendem Trennzeichen im Markup
lesbar), Auszug, Statuspille und Marken. Stand nach den Korrekturen:

* **PB.1** — Pille „Freigegeben", Marke „2 Belege", Auszug aus dem
  Gegenargument. Stimmt: 2 Fundstellen, beide unbestätigt.
* **PB.2** — Pille „Entwurf", **keine** Marke, Auszug aus dem Gegenargument
  (mit den sichtbaren `[Kennzeichen]`/`[Bauteil]`). Die fehlende
  „2 Platzh."-Marke ist der Befund *Offen 1*.
* **PB.3** — Pille „Zurückgezogen", Marken „Vorgehen" und „1 Beleg", Auszug
  „Marktrelevanz im Einzelfall prüfen und begründen." (vorher leer, siehe
  *Fehler 1*).

Klick auf die Zeile: PB.1, PB.2 und PB.3 führen je auf
`/bibliothek/<id>` mit genau der Id aus dem `href`; die Detailseite zeigt den
richtigen Titel in der Überschrift. Auch mit der Tastatur (Fokus + Enter).
Zurück vom Detail führt auf `/bibliothek?q=PB`, das Suchfeld steht wieder auf
„PB", die drei Zeilen sind da.

### 6. Unterzeile

„67 Einträge warten auf Freigabe" gegen Status=Entwurf (67) geprüft; mit einem
Eintrag in Prüfung gegengeprüft (siehe *Fehler 2*). Bei 0 offenen Einträgen
liesse sich „Alle Einträge sind gesichtet" nicht auslösen, ohne fremde Daten
anzufassen — ungeprüft geblieben.

### 7. Verhalten unter Last

„PB Entwurf" Zeichen für Zeichen ohne Pause getippt (zweimal): am Ende steht
`q=PB Entwurf` in der Adresse, das Feld zeigt denselben Text, `.treffer-zahl`
sagt „1 Eintrag" und genau eine Zeile (PB.2) steht da — der letzte Suchbegriff
gewinnt, keine widersprüchliche Liste. Anschliessend zehnmal Rücktaste: Feld
leer, `q` aus der Adresse verschwunden, wieder alle 89 Einträge.

### 8. Zusätzlich

Zurück-Knopf des Browsers nach einer Suche: die Suche wird nicht wieder
aufgezwungen (die Leiste arbeitet mit `router.replace`, legt also keine
History-Einträge an). Keine Meldungen in der Browser-Konsole, keine
Seitenfehler in allen Läufen.

---

## Fehler

### 1. Zeile ohne Auszug, sobald das Gegenargument leer statt NULL ist — behoben

**Was getan**: `/bibliothek?q=PB` geöffnet und PB.3 angesehen.
**Erwartet**: Wie bei PB.1/PB.2 ein Auszug; PB.3 hat mit „Marktrelevanz im
Einzelfall prüfen und begründen." einen Text, und die Zeile zeigte ja auch die
Marke „Vorgehen".
**Passiert**: `.zeile-auszug` war leer — die Zeile bestand nur aus Nummer,
Titel und Metazeile.
**Ursache**: `src/app/(app)/bibliothek/page.tsx` (alte Zeile 83)
`const text = e.gegenargument ?? e.vorgehen`. `??` weicht nur bei `null` aus;
PB.3 trägt in `gegenargument` die leere Zeichenkette, also blieb `text = ''`.
Das trifft jeden Eintrag, der über die Oberfläche oder ein Skript ohne
Gegenargument angelegt wurde — genau die Fälle, in denen der Auszug am
nötigsten ist, weil das Vorgehen der einzige Inhalt ist.
**Behoben**: `||` statt `??`. Nachgeprüft, zweimal: PB.3 zeigt den
Vorgehenstext.

### 2. „N Einträge warten auf Freigabe" unterschlägt alles, was in Prüfung liegt — behoben

**Was getan**: PB.2 in der Datenbank auf `pruefung` gesetzt und die Seite neu
geladen.
**Erwartet**: Die Zahl bleibt gleich — ein Eintrag, der von „Entwurf" nach
„In Prüfung" wandert, wartet weiterhin auf die Freigabe.
**Passiert**: Die Unterzeile fiel von „67" auf „66", obwohl Entwurf (66) und
In Prüfung (1) zusammen weiterhin 67 ergaben. Wer einen Eintrag zur Prüfung
weiterreicht, sieht ihn aus der Warteschlange verschwinden.
**Ursache**: `src/app/(app)/bibliothek/page.tsx`, `const offen =
nachStatus.entwurf ?? 0` — der Status `pruefung` wurde nicht mitgezählt.
**Behoben**: `offen = (nachStatus.entwurf ?? 0) + (nachStatus.pruefung ?? 0)`.
Nachgeprüft: mit PB.2 in Prüfung nennt die Unterzeile weiterhin 67.
*Anmerkung*: Zurückgezogene (15) bleiben bewusst draussen — sie warten nicht
auf Freigabe, sie sind abgelegt. „Nicht freigegeben" (82) ist also absichtlich
nicht die Zahl in der Unterzeile.

### 3. Bereichswechsel liess einen unsichtbaren Abschnittsfilter stehen — behoben

**Was getan**: Bereich = Wertminderung, Abschnitt = „5. Wertminderung"
(7 Treffer), dann Bereich auf Kalkulation umgestellt.
**Erwartet**: Die Kalkulationseinträge.
**Passiert**: „0 Einträge", Leerzustand „Kein Eintrag passt zu dieser Suche."
In der Adresse stand weiterhin `abschnitt=5.+Wertminderung`, das Auswahlfeld
„Abschnitt" zeigte aber „Alle Abschnitte" — der Filter, der die Liste leer
räumte, war nirgends zu sehen. Ohne Blick in die Adresszeile bleibt nur
„Zurücksetzen" oder Ratlosigkeit. Zweimal reproduziert.
**Ursache**: `src/app/(app)/bibliothek/suchleiste.tsx`, `setze()` schrieb nur
den geänderten Schlüssel und liess `abschnitt` stehen; da ein Abschnitt immer
zu genau einem Bereich gehört, ist er nach dem Wechsel ungültig.
**Behoben**: Beim Wechsel des Bereichs wird `abschnitt` mit entfernt.
Zusätzlich zeigt das Auswahlfeld einen Abschnitt, der nicht in der Optionsliste
steht (etwa aus einem Lesezeichen), jetzt als eigene Option „… (0)" an, damit
ein wirksamer Filter nie unsichtbar ist. Beides zweimal nachgeprüft:
Bereichswechsel → 69 Treffer; handgeschriebene Adresse
`?bereich=kalkulation&abschnitt=5.%20Wertminderung` → 0 Treffer, aber das Feld
zeigt „5. Wertminderung (0)".

### 4. Marke behauptete, unbestätigte Fundstellen sperrten den Export — behoben

**Was getan**: Marke „2 Beleg" bei PB.1 (Titel-Text) gelesen: „Fundstellen
noch nicht bestätigt — sperrt den Export".
**Erwartet**: Ein Export von PB.1 scheitert.
**Passiert**: Nirgends im Exportpfad wird `beleg.verifiziertAm` geprüft
(`src/export/**`, `src/bibliothek/markdown-export.ts`,
`scripts/bibliothek-export.ts` — kein einziger Bezug). Gesperrt wird die
**Freigabe**: `src/bibliothek/aktionen.ts:43` bricht mit „N Fundstellen noch
nicht bestätigt. Bitte zuerst prüfen." ab. Nebenbei zeigt PB.1, dass die
Kopplung nur an dieser Stelle sitzt: der Eintrag ist freigegeben *und* hat
zwei unbestätigte Fundstellen, weil er nicht über die Freigabe-Aktion
entstanden ist.
**Behoben**: Titel-Text lautet jetzt „… sperrt die Freigabe". Nachgeprüft.

---

## Ungünstig

### 1. Zählungen in den Abschnitts-Optionen ignorieren Suche und Status

**Was getan**: Bereich = Kalkulation + Status = Entwurf gesetzt; das
Auswahlfeld „Abschnitt" bot „2. Lackierung und Beilackierung **(18)**" an.
Diese Option gewählt.
**Erwartet**: 18 Treffer, so steht es in der Option.
**Passiert**: 16. Die Zahl in Klammern zählt nur über den Bereichsfilter
(`ladeAbschnitte(filter.bereich)`), nicht über `q` und `status`. Mit einer
Suche wird die Abweichung beliebig gross: bei `q=PB` verspricht die Option
weiterhin (18), tatsächlich bleibt 1 Eintrag übrig. In beiden Durchgängen
gleich.
**Vorschlag**: `ladeAbschnitte` in `src/bibliothek/abfragen.ts:115` den ganzen
Filter (ohne `abschnitt`) übergeben und dieselben Bedingungen wie in
`sucheEintraege` anlegen; dann zeigen die Klammern, was die Wahl der Option
tatsächlich bringt — und Abschnitte mit (0) verschwinden von selbst. Die Datei
liegt ausserhalb meines Bereichs, deshalb nur beschrieben.

### 2. Suchmuster übernimmt die Jokerzeichen von ILIKE ungeprüft

**Was getan**: Nach `%` gesucht. Und nach `Halterung_ist`.
**Erwartet**: `%` findet nichts (kein Eintrag enthält ein Prozentzeichen);
`Halterung_ist` findet nichts (der Text lautet „Halterung ist").
**Passiert**: `%` liefert alle 89 Einträge, `Halterung_ist` liefert 7 Treffer —
`%` und `_` wirken als Jokerzeichen. Harmlos, solange niemand nach einem
Prozentsatz sucht; „30 %" oder „Aufschlag_neu" führen aber zu unerklärlichen
Ergebnissen.
**Vorschlag**: In `src/bibliothek/abfragen.ts:51` das Muster maskieren, etwa
`` const muster = `%${suche.replace(/([\\%_])/g, '\\$1')}%` `` (mit
`escape '\'` bzw. Drizzles `ilike` auf das maskierte Muster). Ausserhalb
meines Bereichs.

### 3. Die Suche greift nicht in „Hinweise" und nicht in die Fundstellen

**Was getan**: Nach `Farbmessprotokoll` (Hinweise PB.2), `Sehr häufige
Position` (Hinweise PB.1) und `LG Musterstadt` (Fundstelle von PB.1 und PB.3)
gesucht.
**Erwartet**: mindestens die eigenen Einträge — das Feld verspricht
„Bauteil, Kürzungsgrund, Textstelle …", und der Kommentar über
`sucheEintraege` nennt es „Volltextsuche über die Bibliothek".
**Passiert**: je 0 Treffer. Durchsucht werden nur Titel, Nummer,
Gegenargument, typische Begründung, Vorgehen, Abschnitt und die Varianten.
Wer sich an ein Urteil oder an einen Hinweis erinnert, findet den Eintrag
nicht.
**Vorschlag**: `hinweise` und – wenn gewollt – `beleg.fundstelle` /
`beleg.kernaussage` in die `or`-Kette in `src/bibliothek/abfragen.ts:52-66`
aufnehmen (die Fundstellen analog zur bestehenden `exists`-Unterabfrage für
Varianten). Ausserhalb meines Bereichs.

### 4. Kleinigkeiten am Rande

* Die Metazeile setzt Bereich und Abschnitt ohne Trennzeichen nebeneinander
  (`<span>Kalkulation</span><span>1. Ersatzteile…</span>`); lesbar ist das nur
  über `gap: 4px 14px` in `.zeile-meta`. Beim Kopieren des Textes oder mit
  einem Screenreader klebt es zusammen („Kalkulation1. Ersatzteile…"). Nicht
  geändert, weil die sichtbare Darstellung stimmt und ein `·` die Optik der
  Zeile ändert — ich wollte nichts anfassen, was nicht falsch ist.
* Alle Filterwechsel laufen über `router.replace`. Das hält die History sauber,
  heisst aber auch: der Zurück-Knopf führt nicht Schritt für Schritt durch die
  gesetzten Filter, sondern zum vorherigen richtigen Seitenaufruf. Das ist eine
  vertretbare Entscheidung; nach dem Öffnen eines Eintrags führt „zurück"
  korrekt in die gefilterte Liste samt gefülltem Suchfeld (nachgeprüft).

---

## Geändert

Alle Änderungen in meinen drei Dateien; `pnpm typecheck` läuft sauber durch
(vor und nach jeder Änderung geprüft). Kein `build`, kein `vitest`, kein
`commit` durch mich — die Änderungen sind allerdings von einem parallel
laufenden Sammel-Commit (`64d3092 „L1: Zwischenstand der Seitenprüfungen"`)
mit aufgenommen worden.

1. **`src/app/(app)/bibliothek/page.tsx`** — `const offen = (nachStatus.entwurf ?? 0) + (nachStatus.pruefung ?? 0)`
   statt nur `entwurf`. *Warum*: Einträge in Prüfung warten weiterhin auf die
   Freigabe; vorher fielen sie aus der Zahl (Fehler 2).
2. **`src/app/(app)/bibliothek/page.tsx`** — `const text = e.gegenargument || e.vorgehen`
   statt `??`. *Warum*: Bei leerer statt fehlender Zeichenkette blieb die Zeile
   ohne Auszug (Fehler 1).
3. **`src/app/(app)/bibliothek/page.tsx`** — Marken-Titel „… sperrt die
   Freigabe" statt „… sperrt den Export"; ausserdem „N Belege" im Plural.
   *Warum*: Der Export prüft `verifiziertAm` nicht, die Freigabe schon
   (Fehler 4).
4. **`src/app/(app)/bibliothek/suchleiste.tsx`** — `setze()` entfernt beim
   Wechsel des Bereichs zugleich `abschnitt`. *Warum*: sonst blieb ein
   Abschnitt aus dem alten Bereich als unsichtbarer Filter stehen (Fehler 3).
5. **`src/app/(app)/bibliothek/suchleiste.tsx`** — ein Abschnitt aus der
   Adresse, den die Optionsliste nicht kennt, wird als eigene Option „… (0)"
   angezeigt. *Warum*: damit ein wirksamer Filter nie als „Alle Abschnitte"
   erscheint, auch nicht bei einer von Hand gebauten Adresse.

`src/app/(app)/bibliothek/status-pille.tsx` blieb unverändert — die vier
Status werden vollständig und richtig übersetzt, jede gezeigte Pille passte zum
gesetzten Filter.

---

## Offen

### 1. PB.2 zeigt keine „Platzh."-Marke, obwohl `[Kennzeichen]` und `[Bauteil]` im Text stehen

Die Marke speist sich aus der Tabelle `eintrag_platzhalter`
(`src/bibliothek/abfragen.ts:84`), und die füllt allein der Markdown-Import
(`findePlatzhalter` in `src/bibliothek/parser.ts`). Für PB.2 stehen dort null
Zeilen (in der Datenbank nachgezählt), also schweigt die Liste, obwohl die
eckigen Klammern im Auszug direkt daneben zu sehen sind. Das trifft jeden
Eintrag, der nicht über den Import entstanden ist.

Zwei mögliche Wege, beide ausserhalb meines Bereichs:

* `scripts/probedaten.ts` (Schleife ab Zeile 140) beim Anlegen zusätzlich
  `findePlatzhalter(e.gegenargument)` auswerten und die Treffer in
  `eintragPlatzhalter` schreiben — dann bildet die Probe den Normalfall ab.
* Belastbarer: die Zählung in `sucheEintraege` nicht nur aus der Tabelle
  nehmen, sondern die Platzhalter aus dem Text ableiten (bzw. sie beim
  Speichern eines Eintrags immer mitschreiben, wie es der Import tut). Sonst
  bleibt die Marke eine Aussage über die Importdaten, nicht über den Text.

### 2. „Alle Einträge sind gesichtet" ungeprüft

Der zweite Zweig der Unterzeile erscheint erst, wenn kein Eintrag mehr in
Entwurf oder Prüfung steht. Dazu hätte ich 67 fremde Einträge umstellen
müssen — nicht angefasst.

### 3. Bereiche „Wiederbeschaffungswert" und „Restwert" ohne Daten

Beide stehen im Auswahlfeld „Bereich", in der Datenbank gibt es dazu keinen
Eintrag; der Filter liefert korrekt den Leerzustand. Ob die Bereiche
absichtlich leer sind oder Daten fehlen, konnte ich von dieser Seite aus nicht
entscheiden.
