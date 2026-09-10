# PF — Übersicht der Schreiben (`/stellungnahmen`)

Geprüfte Dateien (und die einzigen, die ich geändert habe):
`src/app/(app)/stellungnahmen/page.tsx`, `bericht-formular.tsx`,
`loeschknopf.tsx`.

Datensätze (`scripts/probedaten.ts PF`, zweimal neu angelegt — die Kennungen
unten stammen aus dem letzten Lauf):

| Kennung | Betreff | Positionen | Fall | Stand |
|---|---|---|---|---|
| `ee702160-…dcb7` | PF A — leer, ohne Positionen | 0 | — | Entwurf |
| `dde452d0-…b422b7` | PF B — drei Positionen, vollständig | 3 | `PF-0726/2011TG` | Entwurf |
| `19510b21-…b307e2` | PF C — zwölf Positionen, versendet | 12 | `PF-ohne-Angaben` | versendet |

Umgebungshinweis: auf diesem Rechner ist **kein `ANTHROPIC_API_KEY`**
gesetzt (nachgesehen in `/proc/<next-server>/environ`). Das Formular ist
deshalb gesperrt; die Auswertung selbst konnte ich nur bis zur Stelle
prüfen, an der sie den fehlenden Schlüssel meldet. Die Werkzeuge aus
`poppler-utils` sind vorhanden (`pdfinfo`, `pdftotext`, `pdftoppm`).

---

## Geprüft

**1. Liste gegen die Datenbank** (zweimal, vor und nach meinen Änderungen)

- Zeilenzahl: 27 Zeilen in der Oberfläche gegen 27 Zeilen aus
  `select … from stellungnahme order by erstellt_am desc limit 100` —
  gleich. Kopfzeile „27 Stellungnahmen" stimmt.
- Reihenfolge: `ladeStellungnahmen` verspricht `desc(stellungnahme.erstelltAm)`
  (`src/stellungnahme/abfragen.ts:123`). Zeile für Zeile gegen die
  Datenbank verglichen: identische Reihenfolge, 0 Abweichungen bei 27 bzw.
  31 Zeilen.
- Positionszahl je Zeile gegen `count(*) from position`: 0 Abweichungen
  (PF A 0, PF B 3, PF C 12; Singular/Plural richtig — bei „1 Position"
  geprüft an den Wegwerfschreiben der Bedienprobe).
- Statuspillen: in der Datenbank kommen nur zwei Zustände vor
  (`versendet_am` gesetzt / nicht gesetzt). Beide geprüft: „versendet"
  (grün, `m-freigegeben`) und „in Arbeit" (grau, `m-entwurf`).
- Aktenzeichen je Zeile gegen `fall.aktenzeichen`: 0 Abweichungen.
- Datum: siehe **Fehler 1** — war falsch formatiert, behoben.
- Leerzustand: nur im Code geprüft (`page.tsx:98–103`). Die Datenbank leeren
  war nicht möglich, ohne die Daten der anderen Prüfer wegzuräumen. Der
  Zweig existiert und der Text ist deutsch; zum Text siehe **Ungünstig 6**.

**2. Zeile öffnen** (jede der drei PF-Zeilen je zweimal, Maus und Tastatur)

- Klick auf die Zeile: führt bei A, B und C auf `/stellungnahmen/<id>` mit
  genau der Kennung aus der Datenbank.
- Tastatur: Tab erreicht jede Zeile (Tab-Reihenfolge: Zeilenverweis, dann
  der Löschknopf derselben Zeile, dann die nächste Zeile — sinnvoll);
  Enter öffnet. Für A, B und C je zweimal bestätigt.
- Zurück: der Pfeil „←" oben links (`[id]/page.tsx`) und der
  Browser-Zurück-Knopf führen beide wieder auf `/stellungnahmen`.

**3. Neues Schreiben anlegen**

Das Formular hat **kein Betrefffeld**. Es nimmt eine PDF und eine
Fallzuordnung; der Betreff entsteht serverseitig aus den Falldaten
(`schlageEmpfaengerVor`, `src/stellungnahme/auswertung.ts:219`). Die Punkte
des Testplans zum Betreff habe ich deshalb dort geprüft, wo Betreffe
tatsächlich in die Liste kommen — als Datensatz mit
Sonderzeichen/HTML/300 Zeichen/Leerzeichen (siehe unten).

- Auswahlfeld: alle drei PF-Fälle stehen drin. `PF-0726/2011TG` erscheint
  als „PF-0726/2011TG · Autohaus Muster GmbH · OL-AB 1234",
  `PF-ohne-Angaben` und `PF-kaputt` (unlesbares JSON) jeweils nur mit dem
  Aktenzeichen. Der kaputte Fall bringt die Seite **nicht** zum Absturz —
  `gutachtenSchema.safeParse` fängt ihn ab (`page.tsx:53`).
- Doppelklick auf „Prüfbericht auswerten": siehe **Fehler 3** — schickte
  zweimal ab, behoben.
- Betreff mit HTML (`<b>x</b> <script>alert(1)</script>`): wird als **Text**
  angezeigt, nicht gerendert. Im DOM steht `&lt;b&gt;…`. Kein Skript lief
  (Konsole leer). Zweimal geprüft.
- Betreff mit 300 Zeichen ohne Leerzeichen: siehe **Fehler 2**.
- Betreff nur aus Leerzeichen: siehe **Fehler 2**.

**4. Datei-Upload des Prüfberichts** (jede Probe zweimal, gegen
`/api/stellungnahmen/auswerten`)

| Probe | Antwort | Meldung | Wahr? |
|---|---|---|---|
| leere Datei | 400 | „Bitte einen Prüfbericht als PDF auswählen." | ja |
| gar keine Datei | 400 | dieselbe | ja |
| 26 MB | 413 | „Die Datei ist grösser als 25 MB." | ja (`MAX_BYTES = 25 · 1024 · 1024`) |
| PNG statt PDF | 200 + Fehlerereignis | (kam wegen des fehlenden Schlüssels nicht bis zum Einlesen) | siehe Ungünstig 3 |
| gültige PDF | 200 + Fehlerereignis „… braucht einen Zugang zum Sprachmodell" | ja |

- **Halbfertige Datensätze: keine.** Vor und nach allen sieben Proben
  standen 27 Stellungnahmen in der Datenbank. Das ist auch der Bauart nach
  richtig: `werteBerichtAus` legt die Zeile erst nach Einlesen, Auswertung
  und Prüfliste an (`src/stellungnahme/auswertung.ts:220` (`db.insert`)).
- Nicht angemeldet: `POST /api/stellungnahmen/auswerten` → **401**
  „Nicht angemeldet."

**5. Löschen** (jeder Punkt zweimal, mit eigens angelegten
`PF-Löschprobe…`-Schreiben; die drei Grunddatensätze blieben unangetastet)

- Rückfrage vorhanden und nennt den Betreff: „„PF Löschprobe 1 —
  Abbrechen" endgültig löschen? Der Brief und alle Positionen gehen mit."
- **Abbrechen**: Schreiben, 3 Positionen, 3 Bausteine, 1 Positionsbild und
  2 Bilder standen danach unverändert in der Datenbank; die Zeile war nach
  dem Neuladen noch da.
- **Bestätigen**: Zeile sofort weg, nach dem Neuladen weg, in der Datenbank
  weg. In der Datenbank nachgezählt:
  - `stellungnahme` 1 → 0, `position` 3 → 0
  - **Waisen: 0** — weder `position_baustein` noch `position_bild` ohne
    Elternposition (Prüfung per `not exists`).
  - Bilder: das Bild, das nur zum Schreiben gehörte, ist weg; das Bild mit
    `in_bibliothek = true` steht noch da, nur mit `stellungnahme_id = null`.
    Genau das verspricht der Kommentar in
    `src/stellungnahme/export-aktionen.ts:59–72` — **Zusage eingehalten.**
- **Doppelklick auf Löschen**: eine Rückfrage, ein Löschvorgang, keine
  Fehlermeldung. Der Knopf verschwindet mit der Zeile.
- **Versendetes Schreiben (PF C und eine eigene Kopie)**: in der Liste
  **kein** Löschknopf (`page.tsx:143`), auf der Detailseite ebenfalls keiner
  (`[id]/page.tsx:118`), in der Datenbank unverändert. Die Serveraktion
  lehnt es zusätzlich ab. Ob es das sollte: ja — siehe aber
  **Ungünstig 1** und **Offen 1**.
- **Zweiter Tab / bereits gelöschtes Schreiben**: HTTP **200**, kein 500;
  deutsche Meldung „Diese Stellungnahme gibt es nicht mehr." Die Geisterzeile
  blieb allerdings stehen — siehe **Fehler 4**, behoben.

**6. Fall-Verknüpfung** (zweimal)

- PF B zeigt `PF-0726/2011TG`, PF C zeigt `PF-ohne-Angaben` — beides stimmt
  mit `fall.aktenzeichen` überein.
- PF A (ohne Fall) zeigt „—". Der Strich sagt allein nichts; ich habe ihm
  einen Titel „Kein Fall zugeordnet" mitgegeben.
- Gegenprobe auf `/faelle/<id>` (neuer Kasten „Stellungnahmen (N)"): zeigt
  für jeden der drei PF-Fälle genau die Schreiben, die auch meine Liste
  zeigt — 1 / 0 / 1, mit denselben Kennungen und Positionszahlen. Zwei
  Abweichungen in der Darstellung siehe **Offen 4** und **Offen 5**.

**7. Wahrheit der Texte**

- „Gescannte Seiten werden mitgelesen" — stimmt: `leseBericht` entscheidet
  je Seite und rastert Bildseiten mit `pdftoppm`
  (`src/pruefbericht/einlesen.ts:144–158`).
- „Der Brief und alle Positionen gehen mit" — stimmt, und es geht sogar
  noch etwas mehr mit (Bilder); siehe **Ungünstig 2**.
- „Die Auswertung der Prüfberichte braucht einen Zugang zum Sprachmodell" —
  stimmt, nachgemessen: ohne Schlüssel bricht `werteBerichtAus` sofort mit
  genau dieser Begründung ab.
- „Zum Einlesen der Prüfberichte fehlen auf diesem Server: …" — erscheint
  hier nicht, weil alle drei Werkzeuge da sind. Zweig im Code geprüft.
- Der Kommentar in `loeschknopf.tsx` behauptete etwas Unwahres — siehe
  **Fehler 5**.
- Die versprochene Unveränderlichkeit versendeter Schreiben wird **nicht**
  eingehalten — siehe **Offen 1**.

**8. Breiten** (380 / 1024 / 1440 px, je zweimal, vermessen und
abfotografiert)

- Kein Querüberlauf: `document.scrollWidth` gleich `clientWidth` bei allen
  drei Breiten (380/380, 1024/1024, 1440/1440).
- Keine Überlappung von Löschknopf und Metazeile bzw. Statuspille (nach den
  Korrekturen; vorher gab es beides, siehe Fehler 2 und Offen 2).
- Löschknopf bei 1024 und 1440 px anklickbar (`elementFromPoint` in der
  Knopfmitte liefert den Knopf selbst, nichts liegt darüber).
- Bei 380 px bleibt ein Problem, das nicht in meinen Dateien liegt: siehe
  **Offen 3**.

**9. Fehlerfälle** (je zweimal)

| Adresse | Antwort | Was steht da |
|---|---|---|
| `/stellungnahmen/unfug` | **404** | deutsche „Seite nicht gefunden" mit Wegen zurück |
| `/stellungnahmen/<gültige, fremde UUID>` | **404** | dieselbe Seite |
| `/stellungnahmen/<PF-A-Kennung>X` | **404** | dieselbe Seite |
| `/stellungnahmen` ohne Anmeldung | 200 → Umleitung auf `/anmelden` | Anmeldeformular |
| `/stellungnahmen/<id>` ohne Anmeldung | 200 → Umleitung auf `/anmelden` | Anmeldeformular |
| `POST /api/…/auswerten` ohne Anmeldung | 401 | „Nicht angemeldet." |

Kein HTTP 500, kein englischer Next.js-Standardtext. Zu Beginn meines Laufs
war das noch anders — siehe **Fehler 6**.

**10. Farbkonzept** (gemessene Farbwerte)

| Element | Klasse | Farbe | Regel | Urteil |
|---|---|---|---|---|
| „Prüfbericht auswerten" | `haupt` | Fläche `rgb(0,127,255)`, Schrift weiss | blau gefüllt = der eine Weg nach vorn | richtig — es ist der einzige Weg, ein Schreiben zu beginnen |
| Löschknopf | `loeschknopf gefahr` | roter Umriss, unter dem Zeiger `rgb(193,68,28)` gefüllt | rot = etwas verschwindet endgültig | richtig — es verschwindet wirklich endgültig, siehe Punkt 5 |
| Pille „versendet" | `m-freigegeben` | grün auf hellgrün | — | Randbemerkung, siehe Offen 6 |
| Pille „in Arbeit" | `m-entwurf` | grau | — | richtig |

Kein grüner Knopf auf dieser Seite, und keiner, der rot wäre, ohne dass
etwas verschwindet.

---

## Fehler

**1. Das Datum stand in einer Schreibweise, die das Haus sonst nirgends
benutzt — und es war nicht gesagt, welches Datum gemeint war**

- Getan: Datum jeder Zeile gegen `stellungnahme.erstellt_am` verglichen.
- Erwartet: `14.08.2026`, wie `formatiereDatum`
  (`src/autoixpert/felder.ts:197`) es überall sonst schreibt und wie es in
  den erzeugten Briefen steht.
- Passiert: `14.8.2026` — **27 von 27 Zeilen**. `toLocaleDateString('de-DE')`
  ohne Optionen lässt die führende Null weg.
- Dazu: die Zahl stand **ohne Wort** in der Metazeile, direkt neben der
  Pille „versendet". So gelesen ist es das Versanddatum; gemeint war immer
  das Anlagedatum. Das Versanddatum kam in der Liste überhaupt nicht vor.
- Ursache: `page.tsx:81` im Stand vor meiner Änderung.
- **Behoben**: eigene Hilfsfunktion `tagesdatum` mit
  `{ day: '2-digit', month: '2-digit', year: 'numeric' }`; die Metazeile
  schreibt jetzt „angelegt 14.08.2026" und bei versendeten Schreiben
  zusätzlich „versendet 14.08.2026". Nachgemessen: 0 Abweichungen bei 31
  Zeilen.

**2. Ein Betreff aus Leerzeichen ergab eine Zeile ohne jede Beschriftung**

- Getan: vier Schreiben mit den Betreffen `"   "`, `null`, 300 × `L` und
  `<b>PF fett</b> <script>alert(1)</script>` angelegt und die Zeilen
  vermessen.
- Erwartet: jede Zeile trägt eine lesbare Beschriftung.
- Passiert:
  - `"   "` → `.zeile-titel` mit **Breite 0 und Höhe 0**. Die Zeile war nur
    an ihrer Stelle in der Liste zu erkennen. Die Zeile schrumpfte dabei
    auf 47 px, wodurch der absolut gesetzte Löschknopf **über die Pille
    „in Arbeit" rutschte**. Die Löschrückfrage lautete: „„   " endgültig
    löschen?"
  - 300 × `L` ohne Leerzeichen → der Titel lief über den rechten Rand der
    Zeile hinaus; sichtbar abgeschnitten wurde er nur, weil `.liste` ein
    `overflow: hidden` trägt.
- Ursache: `page.tsx:75` und `:91` im Stand vor meiner Änderung — `s.betreff ?? 'Ohne Betreff'`
  fängt nur `null`, nicht die leere und nicht die weisse Zeichenkette.
- **Behoben**: Hilfsfunktion `beschriftung()` mit `betreff?.trim() || …`,
  benutzt für den Titel **und** für die Rückfrage des Löschknopfs.
  Nachgemessen: alle vier Sonderbetreffe tragen jetzt eine sichtbare
  Beschriftung, keiner läuft über die Zeile hinaus, der Löschknopf liegt
  bei keinem mehr über der Pille. Das Überlaufen des langen Betreffs ist
  inzwischen zusätzlich in `globals.css` behoben (Commit `aa687d7`).

**3. Ein Doppelklick auf „Prüfbericht auswerten" schickte zweimal ab**

- Getan: Formular künstlich freigeschaltet (ohne Schlüssel ist es gesperrt),
  eine Datei eingelegt, doppelt geklickt, die POST-Anfragen gezählt.
- Erwartet: eine Anfrage.
- Passiert: **zwei POST** auf `/api/stellungnahmen/auswerten`, in beiden
  Durchgängen. Der Knopf war zum Zeitpunkt des zweiten Klicks noch nicht
  gesperrt.
- Ursache: `bericht-formular.tsx:29` im Stand vor meiner Änderung — die Sperre `laeuft` wird aus
  dem Zustand `stand` abgeleitet, und ein `useState` wirkt erst beim
  nächsten Rendern. Das wiegt schwer, weil die Stellungnahme erst **am
  Ende** des Vorgangs angelegt wird: zwei Läufe hätten zwei Schreiben aus
  einem Prüfbericht ergeben, dazu zwei Modellaufrufe.
- **Behoben**: eine `useRef`-Sperre, die synchron greift; nach einem
  Fehlschlag wird sie freigegeben (erneuter Versuch bleibt möglich), nach
  einem Erfolg nicht (der Wechsel in den Schreibtisch läuft dann noch).
  Nachgemessen mit künstlich verzögerter Antwort: **4 Submit-Ereignisse →
  1 POST**, zweimal bestätigt. Ohne Verzögerung schlüpft ein zweiter Klick
  nur dann durch, wenn der erste Versuch schon **fehlgeschlagen** ist
  (hier nach ~60 ms) — das ist gewollt, denn dann ist nichts angelegt
  worden.

**4. Nach dem Löschen im zweiten Tab blieb eine Geisterzeile stehen**

- Getan: dasselbe Schreiben in zwei Tabs geöffnet, in Tab 1 gelöscht, dann
  in Tab 2 auf denselben Löschknopf geklickt.
- Erwartet: eine ehrliche Meldung **und** eine Liste, die den neuen Stand
  zeigt.
- Passiert: die Meldung „Diese Stellungnahme gibt es nicht mehr." erschien
  (gut, kein 500), die Zeile blieb aber stehen und liess sich weiter
  anklicken — dann landete man auf der 404-Seite.
- Ursache: `loeschknopf.tsx:45–49` im Stand vor meiner Änderung — bei `e.fehler` wurde
  `return` gerufen, ohne `router.refresh()`.
- **Behoben**: auch der Fehlschlag frischt die Liste auf. Ein Fehlschlag ist
  eine Nachricht über den Stand der Dinge. Nachgemessen: Geisterzeile
  danach weg.

**5. Der Kommentar über dem Löschknopf behauptete etwas, das nicht
passiert**

- Er sagte: „Was die Aktion ablehnt — ein versendetes Schreiben —, steht
  danach als Meldung da und nicht als stilles Nichts."
- Tatsächlich zeigen Liste (`page.tsx:143`) und Detailseite
  (`[id]/page.tsx:118`) bei einem versendeten Schreiben **gar keinen
  Knopf**. Die Ablehnung der Serveraktion erreicht die Oberfläche nie; das
  stille Nichts ist genau das, was der Nutzer bekommt.
- **Behoben**: Kommentar richtiggestellt (`loeschknopf.tsx:8–20`). Der
  Sachverhalt selbst bleibt — siehe **Ungünstig 1**.

**6. `/stellungnahmen/unfug` antwortete mit HTTP 500**

- Getan: Adresse ohne UUID-Form aufgerufen, zweimal.
- Erwartet: 404 mit deutscher Seite.
- Passiert (zu Beginn meines Laufs): **HTTP 500**. Ursache:
  `ladeStellungnahme(id)` gab die Zeichenkette ungeprüft an eine
  `uuid`-Spalte, Postgres brach mit „invalid input syntax for type uuid" ab.
- **Inzwischen von anderer Stelle behoben** (Commit `7d5efc5`,
  `[id]/page.tsx` prüft die Kennung jetzt gegen ein UUID-Muster). Meine
  Nachmessung: **404** mit der deutschen „Seite nicht gefunden". Nicht meine
  Datei, deshalb nur gemeldet.

---

## Ungünstig

**1. Ein versendetes Schreiben lässt sich nicht löschen — gesagt wird es
nirgends.** Der Knopf fehlt einfach. Wer sich fragt, warum eine Zeile
keinen Löschknopf hat, findet keine Antwort auf der Seite. Die Serveraktion
hätte einen guten Satz dafür parat („Nimm den Vermerk zurück, wenn es
wirklich weg soll.", `export-aktionen.ts:88`), aber er wird nie gezeigt.
Vorschlag: an der versendeten Zeile einen gesperrten Löschknopf mit genau
diesem Satz als Titel — oder gar nichts, aber dann diesen Satz auf der
Detailseite. Ich habe es nicht geändert, weil es eine Gestaltungsfrage über
zwei Seiten hinweg ist (die Detailseite gehört einem anderen Prüfer).

**2. Die Löschrückfrage nennt die Bilder nicht.** Sie sagt „Der Brief und
alle Positionen gehen mit". Tatsächlich gehen auch die Bilder mit, die zu
dem Schreiben gehören und **nicht** in der Bildbibliothek stehen — in
meiner Probe eines von zweien. Das ist verschwiegen, nicht falsch, aber
Bilder sind Arbeit.

**3. Der Dateityp wird erst geprüft, nachdem alles hochgeladen ist.**
`accept="application/pdf,.pdf"` ist nur ein Vorschlag im Dateidialog; im
Dateidialog auf „Alle Dateien" umzustellen genügt. Der Endpunkt prüft
weder Endung noch die ersten Bytes (`auswerten/route.ts:19–28` (Grösse und Vorhandensein)) — er prüft
nur Grösse und Vorhandensein. Die Ablehnung kommt erst aus `pdfinfo`, und
zwar mit einem guten deutschen Satz („Die Datei liess sich nicht als PDF
lesen. Bitte prüfen, ob es sich wirklich um ein PDF handelt.",
`einlesen.ts:134–137`) — aber erst, nachdem bis zu 25 MB durch die Leitung
sind. Vorschlag: im Endpunkt die ersten fünf Bytes auf `%PDF-` prüfen und
sofort mit 415 ablehnen.

**4. Das Auswahlfeld der Fälle ist nicht sortiert.** Die Reihenfolge kam
hier als `PF-kaputt`, `PF-0726/2011TG`, `PF-ohne-Angaben`, `PA-…`, `PB-…`
heraus. Ursache: `ladeFaelle` sortiert nach `desc(fall.abgerufenAm)`
(`src/autoixpert/aktionen.ts:133`), und diese Spalte ist bei allen
Probefällen leer — dann ist die Reihenfolge beliebig. Bei 24 Einträgen in
einem einfachen `<select>` ohne Suche ist das mühsam. Vorschlag: zweites
Sortiermerkmal, etwa `asc(fall.aktenzeichen)`. Ausserdem holt `ladeFaelle`
höchstens 100 Fälle; ab dem 101. fehlt der gesuchte Fall im Auswahlfeld,
ohne dass es jemand sagt.

**5. Der Löschknopf steht bei 40 % Deckkraft, bis die Zeile angesteuert
wird.** Der Kommentar in `globals.css:645–650` begründet das ausdrücklich
(„nie ganz unsichtbar"). Ich halte 40 % für vertretbar, notiere es aber:
auf einem hellen Bildschirm ist der Knopf sehr blass.

**6. Der Leerzustandstext fordert zu etwas auf, was gerade nicht geht.**
Er sagt „Lade einen Prüfbericht hoch — die Kürzungspositionen werden daraus
ausgelesen." Fehlt der Modellzugang oder ein Werkzeug, ist das Formular
gesperrt und die Aufforderung ins Leere gesprochen. Der Warnkasten steht
zwar darüber, aber er erklärt nicht, dass er den Knopf gesperrt hat.
Vorschlag: den gesperrten Knopf mit einem Titel versehen, der die Ursache
nennt. Nicht geändert, weil ich den Leerzustand mangels leerer Datenbank
nicht am lebenden Objekt prüfen konnte und ungeprüft nichts ändern wollte.

**7. Die Fehlermeldung des Löschknopfs verschwindet jetzt zusammen mit der
Geisterzeile.** Folge meiner Korrektur zu Fehler 4: Wenn das Schreiben
schon weg war, verschwindet die Zeile — und die Meldung, die an ihr hing,
mit ihr. Der Nutzer sieht das richtige Ergebnis (die Zeile ist weg), aber
nur kurz die Begründung. Bei einem Fehlschlag, der die Zeile stehen lässt
(zum Beispiel „ist als versendet vermerkt"), bleibt die Meldung sichtbar.
Ich halte das für den besseren der beiden Zustände, nenne es aber, weil es
eine bewusste Abwägung war.

**8. Der Dateiauswahl-Knopf ist englisch** („Choose File / No file
chosen"). Das kommt vom Browser, nicht von der Anwendung; in einer sonst
durchweg deutschen Oberfläche fällt es trotzdem auf. Abhilfe nur über einen
eigenen Knopf mit verstecktem `input`.

---

## Geändert

Alle Änderungen in meinen drei Dateien; `pnpm typecheck` lief nach jeder
sauber durch. Kein `build`, kein `vitest`, kein `commit`, kein `push`
meinerseits (die Zwischenstände wurden von der Koordination als `L5`
festgehalten).

**`src/app/(app)/stellungnahmen/page.tsx`**

1. Neue Hilfsfunktion `beschriftung()` — fängt Betreffe, die leer sind oder
   nur aus Leerzeichen bestehen, und zwar für den Zeilentitel **und** für
   die Rückfrage des Löschknopfs. *Warum:* Fehler 2.
2. Neue Hilfsfunktion `tagesdatum()` — `TT.MM.JJJJ` mit führenden Nullen.
   *Warum:* Fehler 1.
3. Metazeile schreibt „angelegt <Datum>" und bei versendeten Schreiben
   zusätzlich „versendet <Datum>". *Warum:* eine nackte Zahl neben der Pille
   „versendet" liest sich als Versanddatum; das Versanddatum fehlte ganz.
4. Die Aktenzeichenspalte bekommt einen Titel — bei fehlendem Fall „Kein
   Fall zugeordnet" statt eines Striches ohne Erklärung.
5. Kopfzeile sagt „Die 100 neuesten Stellungnahmen", sobald die Liste an der
   Obergrenze der Abfrage steht. *Warum:* `ladeStellungnahmen` hat
   `limit(100)`; ab der 101. Stellungnahme wäre „100 Stellungnahmen" eine
   falsche Gesamtzahl.
6. Fällt bei einem Fall sowohl das Aktenzeichen als auch die Auswertung der
   Falldaten aus, heisst die Option im Auswahlfeld jetzt „Fall ohne
   Aktenzeichen" statt einer leeren Zeile. *Warum:* vorbeugend — unter
   meinen Probedaten trat der Fall nicht auf, aber `fall.aktenzeichen` ist
   in `src/db/schema.ts:320` nullbar, und `PF-kaputt` zeigt, dass die
   Falldaten unlesbar sein können.

**`src/app/(app)/stellungnahmen/bericht-formular.tsx`**

7. `useRef`-Sperre gegen den zweiten Klick; `fuehreAus` meldet
   zurück, ob eine Stellungnahme entstanden ist, damit die Sperre nach
   einem Erfolg bestehen bleibt und nach einem Fehlschlag fällt.
   *Warum:* Fehler 3.

**`src/app/(app)/stellungnahmen/loeschknopf.tsx`**

8. `router.refresh()` auch im Fehlerfall. *Warum:* Fehler 4.
9. Kommentar richtiggestellt. *Warum:* Fehler 5.

**Nicht geändert, obwohl ich es zwischenzeitlich versucht hatte:** Ich hatte
`overflow-wrap: anywhere` als Inline-Stil an Aktenzeichen und Titel gesetzt,
um das Überlaufen zu stoppen. Während meines Laufs kam Commit `aa687d7`
herein, der genau das in `globals.css` löst — dort gehört es hin. Meine
Inline-Stile habe ich wieder entfernt und nach dem Entfernen nachgemessen:
kein Überlauf, keine Kollision bei 380, 1024 und 1440 px.

---

## Offen

**1. Ein versendetes Schreiben lässt sich nach wie vor beliebig ändern.**
Das ist der schwerste offene Punkt, und er widerspricht der Zusage des
Hauses. `src/stellungnahme/export-aktionen.ts:70` begründet das
Löschverbot mit „Was aus dem Haus ist, bleibt nachvollziehbar". Der
Schreibweg hält sich nicht daran: `speichereDokument`
(`src/stellungnahme/editor-aktionen.ts:35`) prüft `versendetAm` **nicht**.

Nachgemessen an PF C: Detailseite geöffnet, in den Brief getippt, vier
Sekunden gewartet. `dokument_stand` ging von 1 auf 2, und der getippte Text
stand danach in der Spalte `dokument`. Keine Meldung, keine Rückfrage. Die
Liste zeigt dabei die grüne Pille „versendet" und verbirgt den Löschknopf —
beides suggeriert ein abgeschlossenes, unveränderliches Schreiben.

Vorschlag: in `speichereDokument` vor `schreibeDokument` prüfen, ob
`versendetAm` gesetzt ist, und dann mit derselben Begründung ablehnen wie
`loescheStellungnahme` („… lässt sich nicht ändern. Nimm den Vermerk
zurück, wenn du weiterarbeiten willst."). Zusätzlich müsste die Detailseite
den Editor dann auf `readonly` stellen, damit die Ablehnung nicht erst nach
dem Tippen kommt. Nicht meine Datei — `src/stellungnahme/**` und
`stellungnahmen/[id]/**` sind für mich gesperrt. (Die Daten von PF C habe
ich nach dem Versuch mit `scripts/probedaten.ts PF` wiederhergestellt.)

**2. Erledigt während meines Laufs, hier nur zur Nachvollziehbarkeit.** Zu
Beginn lief das Aktenzeichen aus seiner 58 px breiten Spalte heraus und
legte sich über die Metazeile daneben: statt „3 Positionen" stand dort
„PF-0726/2011TG Positionen", auf allen drei Breiten. Commit `aa687d7`
(`globals.css`) hat das behoben; nachgemessen, die Kollision ist weg.

**3. Bei 380 px frisst die Aktenzeichenspalte ein Drittel der Zeile.**
Gemessen an PF B: die Zeile ist 296 px breit, davon nimmt `.zeile-nummer`
**101 px** und die Titelspalte behält **61 px**. Der Titel „PF B — drei
Positionen, vollständig" bricht über **sieben** Zeilen um, die Zeile wird
280 px hoch. Bei 1024 und 1440 px ist alles in Ordnung (Titelspalte 455
bzw. 871 px).

Ursache: `globals.css:672`, `grid-template-columns: minmax(58px, auto)
minmax(0, 1fr) auto`. Der Kommentar darüber sagt, die Spalte „schrumpft im
Notfall wieder auf 58px" — das tut sie nicht: die Titelspalte hat
`minmax(0, 1fr)` und gibt zuerst nach, bis die `auto`-Spalte ihre volle
Inhaltsbreite hat. Vorschlag: die erste Spalte deckeln, etwa
`minmax(58px, min(38%, max-content))`, oder in einer
`@media (max-width: 560px)`-Regel auf feste `58px` zurücksetzen (dort greift
das bereits vorhandene `overflow-wrap: anywhere`). Betrifft alle vier
Listenseiten, nicht nur meine. Nicht meine Datei.

**4. Auf der Fallseite steht das Datum wieder in der alten Schreibweise.**
`/faelle/<id>` zeigt im Kasten „Stellungnahmen (N)" „angelegt 14.8.2026"
und „versendet 14.8.2026" — meine Liste schreibt jetzt „14.08.2026".
Dieselbe Ursache wie Fehler 1, andere Datei:
`src/app/(app)/faelle/[id]/page.tsx:337` und `:341`, dazu
`src/app/(app)/faelle/page.tsx:82`. Solange beides nebeneinander steht,
sieht es aus, als kämen die Zahlen aus zwei Programmen. Vorschlag: eine
gemeinsame Hilfsfunktion neben `formatiereDatum` in
`src/autoixpert/felder.ts`, die ein `Date` nimmt. Nicht meine Datei.

**5. Zwei Wörter für denselben Zustand.** Meine Liste nennt ein nicht
versendetes Schreiben „in Arbeit", der Kasten auf der Fallseite nennt es
„Entwurf" (`faelle/[id]/page.tsx:344`). Beide Ansichten zeigen dasselbe
Schreiben. Ich habe meine Seite nicht angepasst, weil ich nicht weiss,
welches der beiden Wörter das gewollte ist, und die Fallseite einem anderen
Prüfer gehört. Bitte einmal entscheiden.

**6. Randbemerkung zum Farbkonzept.** Die Pille „versendet" trägt die
Klasse `m-freigegeben` und damit das Grün, das laut Konzept „freigeben /
bestätigen" bedeutet. Versenden ist kein Freigeben. Die Regel im Auftrag
spricht von Knöpfen, und die Knöpfe dieser Seite halten sie ein; für die
Marker gibt es keine eigene Regel. Ich habe es deshalb nur notiert.

**7. Leerzustand nur im Code geprüft.** Die Liste leer zu bekommen hätte
bedeutet, die Datensätze der anderen sechs Prüfer wegzuräumen. Der Zweig
(`page.tsx:98–103`) und der Text sind gelesen, aber nicht am lebenden Objekt
gesehen.

**8. Die eigentliche Auswertung eines Prüfberichts konnte ich nicht
prüfen.** Ohne `ANTHROPIC_API_KEY` kommt der Vorgang nie über die erste
Prüfung hinaus. Ungeprüft blieben damit: die Fortschrittsanzeige während
eines echten Laufs, der vorbelegte Betreff aus den Falldaten, das Verhalten
bei einem Fall mit unlesbarem JSON **im Auswertungsweg** (`werteBerichtAus`
liest `fall.daten` in `auswertung.ts:194`; `safeParse` fängt dort ab, das
sieht richtig aus, ist aber nicht gemessen) und die Frage, ob eine
unsinnige `fallId` aus einem veralteten Formular einen 500 auslöst — sie
geht in `auswertung.ts:223` ungeprüft an eine `uuid`-Spalte, was denselben
Postgres-Fehler auslösen dürfte wie der inzwischen behobene Fall aus
Fehler 6. Bitte mit gesetztem Schlüssel nachholen.
