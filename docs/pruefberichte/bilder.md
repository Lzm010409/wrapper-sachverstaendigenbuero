# Bildbibliothek `/bilder` — Prüfer PE

Stand: 2026-08-14. Geprüft gegen den Stand nach `27474ee L2: Was mehreren Seiten gemeinsam war`
(also einschliesslich `src/app/api/wache.ts`, `src/app/not-found.tsx`, `src/app/error.tsx`).

Meine Datensätze: `PE-in-bibliothek.png` (Titel „PE Kalkulationsauszug", Themen
Kalkulation/E-Position), `PE-aus-schreiben.png` (aus „PE B — drei Positionen, vollständig",
nicht in der Bibliothek), `PE-ohne-themen.png` (Titel „PE Ohne Themen", keine Themen,
keine Beschreibung).

Jeder Punkt wurde **zweimal** durchlaufen (zwei vollständige Durchgänge je Prüfskript);
beide Durchgänge lieferten dieselben Ergebnisse. Wirkungen wurden jeweils **nach Neuladen**
und **gegen die Datenbank** geprüft.

---

## Geprüft

### 1. Liste
- Karten im oberen Gitter gegen die Datenbank: Seite 28, DB `in_bibliothek = true` 28 — stimmt.
- Unteres Gitter „Aus Schreiben — noch nicht übernommen": Seite 28, DB
  `in_bibliothek = false and stellungnahme_id is not null` 28 — stimmt.
- Reihenfolge: absteigend nach `erstelltAm`; Seite und DB-Abfrage lieferten dieselbe
  Folge (`PG Ohne Themen`, `PG Kalkulationsauszug`, `PF Ohne Themen`, …).
- Leerzustand: `?q=zzz-gibt-es-nicht` → Kasten „Kein Bild passt zu dieser Suche." erscheint.
  (Was darunter steht: siehe **Fehler F2**.)
- Ladeverhalten: Serverseitig gerendert, keine Zwischenzustände; beim Tippen erscheint
  „sucht …" in der Werkzeugleiste.
- Anzeigegrenze mit 45 zusätzlich eingefügten `PE-fuell-*` geprüft (danach restlos gelöscht):
  DB 73 Bibliotheksbilder, Seite zeigt 60 Karten (siehe **Fehler F3**).

### 2. Suche
Je Begriff über die Adresse **und** über das Eingabefeld, jeweils zweimal:

| Begriff | Erwartet | Ergebnis |
|---|---|---|
| `PE Kalkulationsauszug` (Titel) | 1 | 1 ✔ |
| `pe kalkulation` (klein) | 1 | 1 ✔ (Gross/Klein egal) |
| `Auszug aus dem Kalkulationsprogramm` (Beschreibung) | 7 | 7 ✔ |
| `E-Position` (Thema) | 7 | 7 ✔ |
| `PE-ohne-themen.png` (Dateiname) | 1 | 1 ✔ |
| `PE-OHNE-THEMEN` (Dateiname gross) | 1 | 1 ✔ |
| `Öl-Prüfung` / `öl-prüfung` (Umlaut, nach Testbeschriftung) | 1 | 1 ✔ |
| `ÜMLAUT` / `ümlaut` (Umlaut in der Beschreibung) | 1 | 1 ✔ |
| leer | alle 28 | 28 ✔ |
| 500 × `x` | 0 | 0 ✔, kein Fehler |
| `%` | 0 | **28** ✘ (F1) |
| `_` | 0 | **28** ✘ (F1) |
| `P_-ohne-themen` | 0 | **7** ✘ (F1) |
| `<script>alert(1)</script>` | 0 | 0 ✔, kein Skript ausgeführt |
| `' or 1=1--` | 0 | 0 ✔, keine Einschleusung |

- `q=` steht in der Adresse (`/bilder?q=PE+Ohne`), Neuladen zeigt dasselbe, das Suchfeld
  ist danach wieder gefüllt ✔.
- Entprellung 250 ms: kein Anfragensturm je Tastendruck ✔.

### 3. Filter (Thema)
- Optionen mit Zählung: `E-Position (7)`, `Kalkulation (7)`, `Beilackierung (1)`,
  `Lackierung (1)`, `Vergleichsfoto (1)`. Gegen die DB (`? = any(themen) and in_bibliothek`)
  je 7/7/1/1/1 — **stimmt** ✔.
- `?thema=Kalkulation` → 7 Karten, DB 7 ✔. Dasselbe für `E-Position`.
- Kombination `?q=PE&thema=Kalkulation` → genau `PE Kalkulationsauszug` ✔.
- `?thema=GibtsNicht` → 0 Treffer, Leerkasten, kein Fehler ✔.
- „Filter zurücksetzen" erscheint nur bei aktivem Filter, führt auf `/bilder` zurück und
  stellt alle 28 wieder her ✔ (die Selbst-Rücksetzung durch die Entprellung, die der
  Kommentar in `suchleiste.tsx:68` beschreibt, tritt nicht mehr auf).
- Die Zählungen aktualisieren sich **nicht**, wenn zusätzlich gesucht wird (siehe **U3**).

### 4. Bildkarte
- Vorschaubilder: für alle 40 sichtbaren `<img>` den `src` per `fetch` nachgeladen —
  **40 × HTTP 200**, `naturalWidth > 0`, kein einziges kaputt ✔ (also nicht nur das Tag
  vorhanden, sondern das Bild kommt wirklich).
- `PE-in-bibliothek.png`: Titel, Beschreibung und beide Themenpillen erscheinen ✔.
- `PE-ohne-themen.png` (keine Themen, keine Beschreibung): Kopf „PE Ohne Themen",
  **kein** leerer Beschreibungsabsatz, **keine** leere Themenzeile — die Karte fällt
  sauber zusammen, kein Platzhalterrahmen ✔. `alt` = „PE Ohne Themen" ✔.
- `PE-aus-schreiben.png` (ohne Titel): Kopf zeigt ersatzweise den Dateinamen ✔,
  gestrichelter Rand (`offen-uebernahme`) ✔, Fuss nennt die Herkunft
  „aus PE B — drei Positionen, vollständig" ✔ und den Knopf „In die Bibliothek".
- Grössenangabe „1×1 · 0 KB" — siehe **U1**.

### 5. Bearbeiten (je zweimal, jeweils Neuladen + DB-Abgleich)
- Titel + Beschreibung + Themen ändern → „Gespeichert.", DB
  `{"titel":"PE Öl-Prüfung 1","beschreibung":"PE Beschreibung mit Ümlaut, Durchgang 1.",
  "themen":["PE-Thema","PE-Zweitthema"]}`, nach Neuladen unverändert da ✔.
- Leerer Titel (`"   "`) → wird zu `null`, die Karte zeigt danach den Dateinamen
  `PE-ohne-themen.png` ✔ — sinnvoll und ohne Fehlermeldung.
- Doppeltes Thema: Eingabe `PE-Thema, pe-thema, PE-Thema , PE-Drittes` →
  DB `["PE-Thema","PE-Drittes"]` — Dubletten werden auch bei anderer Gross-/Kleinschreibung
  zusammengefasst ✔ (`src/bilder/themen.ts:26`).
- Thema entfernen → DB `["PE-Thema"]`, alle entfernen → `[]` ✔, nach Neuladen weg ✔.
- Sehr langer Titel (300 × `L`) → wird **ungekürzt** gespeichert (DB-Länge 300).
  Die Darstellung bleibt heil: Karte 266 px breit, Titelkasten `overflow: hidden`,
  Seitenbreite unverändert 1440 px, kein waagerechter Überlauf ✔ — der Titel wird
  allerdings ohne Auslassungszeichen hart abgeschnitten (**U2**).
- Fremde Änderung in der DB + Neuladen → die Karte zeigt den neuen Wert ✔.
- „Abbrechen": **gibt es nicht** (siehe **F4**).

### 6. Hochladen
Alle Dateien selbst erzeugt (echtes PNG mit korrektem IHDR/IDAT/CRC), Ergebnis gegen DB:

| Datei | HTTP | Meldung | DB |
|---|---|---|---|
| gültiges PNG 120×80 (28 KB) | 200 | „1 Bild(er) aufgenommen — jetzt beschriften." | +1 ✔, Karte sofort in der Liste ✔ |
| Text mit `.png`-Endung | 415 | „Nur PNG und JPEG lassen sich verlässlich … weder das eine noch das andere." | ±0 ✔ |
| echtes PDF | 415 | dieselbe Meldung | ±0 ✔ |
| PNG 1800×1800, 9,7 MB | 415 | „Das Bild ist grösser als 8 MB." | ±0 ✔ |
| leere Datei (0 Bytes) | 400 | „Keine Bilddatei erhalten." | ±0 — Meldung irreführend (**U4**) |
| gut + kaputt gemeinsam | 415 | nur die Typfehlermeldung | **+1** — Teilerfolg verschwiegen (**F5**) |

- `accept="image/png,image/jpeg"`, Hinweistext „PNG und JPEG, bis 8 MB" — deckt sich mit
  `MAX_BILD_BYTES` (`src/bilder/lesen.ts:118`) und `leseBildmasse` ✔, die Zusage stimmt.
- Neue Bilder erscheinen ohne Neuladen (`router.refresh()`), Kartenzahl 28 → 29 ✔,
  und stehen nach Neuladen auch in der DB ✔.

### 7. Löschen / aus der Bibliothek nehmen
- Rückfrage vor dem Löschen: `confirm("Dieses Bild endgültig löschen?")` ✔.
- Löschen eines **nicht** verwendeten Bildes → Zeile weg (DB 0), nach Neuladen fort ✔.
- Löschen eines **verwendeten** Bildes (Bildknoten mit `bildId` in „PE B" eingebaut):
  wird verweigert, Meldung „Dieses Bild steht in 1 Schreiben — es lässt sich nicht löschen.
  Nimm es dort zuerst heraus.", Klasse `hinweis fehler`, Zeile bleibt ✔ — Zusage gehalten.
- **Aber**: derselbe Schutz fehlt bei „Aus der Bibliothek nehmen" (siehe **F6** — der
  wichtigste Fund).
- Übernahme `PE-aus-schreiben.png` → `in_bibliothek = true`, wandert ins obere Gitter ✔;
  zurücknehmen → wieder unten sichtbar, weil `stellungnahme_id` gesetzt ist ✔.
  (Bei einem direkt hochgeladenen Bild gilt das nicht — F6.)

### 8. Tastatur & Fokus
- Die Bildfläche ist ein echter `<button>`, per Tab erreichbar, `Enter` klappt die
  Beschriftung auf, `aria-expanded` wechselt korrekt auf `true` ✔.
- `Esc` schliesst das aufgeklappte Formular **nicht** (**F7**).
- Es gibt keine Dialoge im Sinne von `<dialog>`; die Beschriftung steht inline, eine
  Fokusfalle gibt es folglich nicht ✔. Die Löschrückfrage ist der Browser-`confirm`,
  der mit `Esc` abbrechbar ist ✔.

### 9. Breiten (380 / 1024 / 1440 px, Karte jeweils aufgeklappt)
- Kein waagerechter Überlauf: `document.scrollWidth == window.innerWidth` bei allen drei
  Breiten ✔. Automatische Prüfung aller Elemente auf `scrollWidth > clientWidth` bei
  `overflow-x: visible`: **keine Treffer** ✔.
- Alle drei Knöpfe („Speichern", „Aus der Bibliothek nehmen", „Löschen") liegen bei allen
  Breiten vollständig im Fenster, bei 380 px umgebrochen auf zwei Zeilen ✔.
- Werkzeugleiste bei 380 px 95 px hoch (umgebrochen), Dateifeld 264 px — passt ✔.

### 10. Wahrheit der Texte
Geprüft: Kopfzeile, Leertexte, Abschnittstext „Aus Schreiben", Uploadhinweis,
`title` beider Knöpfe, Meldungen.
- „PNG und JPEG, bis 8 MB" — stimmt ✔.
- „Dieses Bild steht in N Schreiben — es lässt sich nicht löschen." — stimmt ✔.
- „In die Bildbibliothek übernommen — jetzt noch beschriften." — stimmt ✔.
- „N Bilder in der Bibliothek" — **stimmt ab 61 Bildern nicht** (F3).
- „Kein Bild passt zu dieser Suche." — **irreführend**, darunter stehen weiter Karten (F2).
- `title="Bleibt erhalten, erscheint aber nicht mehr in der Suche"` — **unwahr** (F6).
- „Gespeichert." — **bleibt stehen, auch wenn danach weitergetippt wird** (F8).

### 11. Fehlerfälle
- `/bilder` ohne Anmeldung → Weiterleitung auf `/anmelden` ✔.
- `/api/bilder/<id>` ohne Anmeldung → **401** „Nicht angemeldet." ✔ (neue `wache.ts`;
  der frühere 500er ist behoben).
- `POST /api/bilder` ohne Anmeldung → **401** ✔.
- `/api/bilder/<unbekannte UUID>` → 404 „Nicht gefunden" ✔.
- `/bilder/gibtsnicht` → 404 mit der deutschen Seite „Seite nicht gefunden" ✔.
- `/bilder?q=`, `?thema=`, `?q=%E0%A4%A` (kaputte Prozentkodierung), 3000 Zeichen,
  `?thema=GibtsNicht` → alle HTTP 200, saubere Anzeige ✔.
- `/bilder?q=a&q=b` und `/bilder?thema=a&thema=b` → **HTTP 500** (F9).
- `/api/bilder/keine-uuid` → **HTTP 500** (siehe **O2**).
- Bilddatensatz ohne Bytes (`daten = ''`, testweise angelegt und wieder gelöscht):
  HTTP 200, `Content-Length: 0`, leerer Rahmen, Karte behauptet weiter „640×480 · 80 KB"
  (siehe **O3**).

---

## Fehler

### F1 — `%` und `_` in der Suche wirken als Platzhalter *(Ursache ausserhalb meiner Dateien)*
- **Getan**: `/bilder?q=%` und `/bilder?q=_` aufgerufen, zweimal.
- **Erwartet**: 0 Treffer — kein Titel, keine Beschreibung, kein Dateiname und kein Thema
  enthält diese Zeichen.
- **Passiert**: **alle 28** Bibliotheksbilder erscheinen. `?q=P_-ohne-themen` liefert 7
  Treffer (`PA-` bis `PG-ohne-themen.png`), obwohl der Benutzer einen Unterstrich getippt hat.
- **Ursache**: `src/bilder/bibliothek.ts:66` baut `const muster = \`%${gesucht}%\`` und
  setzt das ungeschützt in vier `ilike`-Vergleiche (Zeilen 72–75). `%` und `_` sind in
  `LIKE`/`ILIKE` Platzhalter.
- **Vorschlag** (nicht meine Datei): vor dem Einsetzen maskieren, Postgres nimmt `\` von
  Haus aus als Fluchtzeichen:
  `const muster = '%' + gesucht.replace(/[\\%_]/g, '\\$&') + '%'`.
- **Bewusst nicht in `page.tsx` umgangen**: die Maskierung gehört an die Stelle, die das
  Muster baut, sonst doppelt sie sich, sobald `sucheBilder` richtiggestellt wird.
- **Status: offen** (Regel: Fund ausserhalb der eigenen Dateien nur beschreiben).

### F2 — „Kein Bild passt zu dieser Suche", und darunter stehen 28 Bilder — behoben
- **Getan**: `/bilder?q=zzz-gibt-es-nicht`, zweimal.
- **Erwartet**: eine leere Seite, oder ein klares Wort darüber, warum unten trotzdem
  Bilder stehen.
- **Passiert**: der Leerkasten erscheint, unmittelbar darunter aber die Überschrift
  „Aus Schreiben — noch nicht übernommen" mit **28 Bildkarten** — die Suche wirkt auf
  diesen Abschnitt nicht.
- **Ursache**: `src/app/(app)/bilder/page.tsx:24` ruft `nochNichtUebernommen()` ohne
  Suchbegriff auf; der Abschnitt (Zeile 60–74) wird unabhängig von `q`/`thema` gezeigt.
- **Behoben** in `page.tsx`: der Abschnitt sagt jetzt ausdrücklich, dass die Suche ihn
  nicht erfasst, und der Leertext verweist darauf.

### F3 — „N Bilder in der Bibliothek" zählt falsch, sobald es mehr als 60 sind — behoben
- **Getan**: 45 zusätzliche Bibliotheksbilder `PE-fuell-*` und 45 offene eingefügt
  (danach restlos gelöscht), `/bilder` aufgerufen, zweimal.
- **Erwartet**: entweder alle Bilder oder eine Angabe, dass die Liste gekappt ist.
- **Passiert**: DB 73 Bibliotheksbilder und 73 offene; die Kopfzeile behauptet
  „**60 Bilder in der Bibliothek · 40 aus Schreiben noch nicht übernommen**". 13 bzw. 33
  Bilder fehlen wortlos — wer sein Bild sucht und die Zahl liest, hält die Bibliothek für
  vollständig angezeigt.
- **Ursache**: `sucheBilder(…, hoechstens = 60)` und `nochNichtUebernommen(hoechstens = 40)`
  in `src/bilder/bibliothek.ts:63` bzw. `:99`; `page.tsx:33` gibt aber schlicht
  `bilder.length` als Gesamtzahl aus.
- **Behoben** in `page.tsx`: wird die Grenze erreicht, steht dort „mindestens 60 Bilder …
  (die Liste endet bei 60 — grenze die Suche ein)" statt einer falschen Gesamtzahl.
  Die Grenze selbst liegt in `bibliothek.ts` und blieb unberührt.

### F4 — Ungespeicherte Eingaben überleben das Zuklappen unbemerkt; kein Abbrechen — behoben
- **Getan**: Karte aufgeklappt, Titel auf „PE NICHT GESPEICHERT" geändert, **nicht**
  gespeichert, Karte über das Bild zugeklappt und wieder aufgeklappt. Zweimal.
- **Erwartet**: entweder ein „Abbrechen", das verwirft, oder wenigstens ein Hinweis,
  dass etwas ungespeichert ist.
- **Passiert**: der Kartenkopf zeigt weiter den **gespeicherten** Titel, das Feld nach dem
  Wiederaufklappen den **getippten** — beides ohne Unterschied erkennbar. Die DB blieb
  richtigerweise unverändert. Einen „Abbrechen"-Knopf gibt es nicht (0 Treffer).
- **Ursache**: `bildkarte.tsx:26` setzt `werte` nur beim ersten Rendern aus den Daten;
  das Zuklappen (Zeile 44) ändert nur `offen`, nie `werte`.
- **Behoben**: „Verwerfen"-Knopf ergänzt, der die Felder auf den gespeicherten Stand
  zurücksetzt und zuklappt; zusätzlich weist die Karte auf ungespeicherte Änderungen hin.

### F5 — Beim Sammelupload wird der Teilerfolg verschwiegen — behoben
- **Getan**: gültiges PNG und Textdatei mit `.png`-Endung **gemeinsam** ausgewählt, zweimal.
- **Erwartet**: „1 Bild aufgenommen, 1 abgelehnt (…)".
- **Passiert**: nur „Nur PNG und JPEG lassen sich verlässlich …". In der DB stand danach
  trotzdem **ein zusätzliches Bild** (Zähler 1 → 2). Wer die Meldung liest, lädt die Datei
  ein zweites Mal hoch und hat sie doppelt.
- **Ursache**: `src/app/api/bilder/route.ts:36` gibt `{ fehler, angelegt }` zurück,
  `bildkarte.tsx:181` wertet aber nur `ergebnis.fehler` aus und wirft `angelegt` weg.
- **Behoben** in `bildkarte.tsx`: die Meldung nennt beides.

### F6 — „Aus der Bibliothek nehmen" lässt ein verwendetes Bild still aus dem Schreiben fallen
*(Ursache ausserhalb meiner Dateien; die Karte habe ich abgesichert)*
- **Getan**: Prüfbild `PE-probe-verwendet.png` in die Bibliothek gelegt, als Bildknoten in
  das Schreiben „PE B — drei Positionen, vollständig" eingebaut, dann auf der Karte
  „Aus der Bibliothek nehmen" gedrückt. Zweimal, gleiches Ergebnis.
- **Erwartet**: dieselbe Rückfrage bzw. Sperre wie beim Löschen — dort heisst es
  ausdrücklich „Dieses Bild steht in 1 Schreiben — es lässt sich nicht löschen."
- **Passiert**:
  - Der Vorgang läuft **ohne jede Warnung** durch: DB `in_bibliothek = false`,
    `stellungnahme_id = null`.
  - Die Karte verschwindet sofort, die Meldung „Aus der Bibliothek genommen. Das Bild
    selbst bleibt erhalten." ist **nie zu sehen** — die Karte, in der sie stünde, ist weg.
  - Das Bild ist danach auf `/bilder` **nirgends mehr auffindbar** (weder oben noch unten,
    auch nicht über die Suche): der untere Abschnitt verlangt `stellungnahme_id is not null`
    (`bibliothek.ts:104`). Es gibt **keinen Weg zurück** über die Oberfläche.
  - Die Bildkennung steht weiter im Dokument, aber die Bedingung von `ladeBilder`
    (`src/bilder/ablage.ts:104`: eigene Stellungnahme **oder** `inBibliothek`) ist nicht
    mehr erfüllt → geprüft: **false**. Das Bild fällt damit still aus dem Word-Dokument,
    genau der Schaden, den `loescheBild` laut Kommentar (`aktionen.ts:60-64`) verhindern soll.
- **Ursache**: `src/bilder/aktionen.ts:53-58` (`ausBibliothekNehmen`) prüft `wirdVerwendet`
  nicht, anders als `loescheBild` (`:66-81`).
- **Vorschlag** (nicht meine Datei): in `ausBibliothekNehmen` dieselbe Prüfung wie in
  `loescheBild` vorschalten, oder `nochNichtUebernommen` so weiten, dass Bilder ohne
  `stellungnahmeId` nicht unsichtbar werden.
- **In meiner Datei abgesichert**: der Knopf fragt jetzt vorher zurück und nennt die Folge
  beim Namen; der unwahre `title` ist berichtigt. Die Datenlücke selbst bleibt **offen**.

### F7 — `Esc` schliesst die aufgeklappte Beschriftung nicht — behoben
- **Getan**: Karte mit `Enter` aufgeklappt, `Esc` gedrückt. Zweimal.
- **Erwartet**: die Beschriftung schliesst, wie bei jedem aufgeklappten Bereich üblich.
- **Passiert**: nichts, das Formular blieb offen (`.bildkarte-formular` weiterhin 1).
- **Ursache**: `bildkarte.tsx` hatte keinen Tastaturbehandler.
- **Behoben**: `Esc` schliesst die Beschriftung und setzt den Fokus zurück auf den Bildknopf.

### F8 — „Gespeichert." bleibt stehen, während schon wieder getippt wird — behoben
- **Getan**: gespeichert (Meldung „Gespeichert."), danach den Titel im Feld auf
  „PE etwas ganz anderes, NICHT gespeichert" geändert und 600 ms gewartet. Zweimal.
- **Erwartet**: die Erfolgsmeldung verschwindet, sobald sie nicht mehr gilt.
- **Passiert**: „Gespeichert." steht weiter unter den Feldern, obwohl in der DB noch
  „PE Ohne Themen" steht. Eine Zusage, die die Anwendung nicht einhält.
- **Ursache**: `bildkarte.tsx:35` setzt `meldung`, nichts löscht sie wieder.
- **Behoben**: jede Eingabe löscht die Meldung.

### F9 — `/bilder?q=a&q=b` endet mit HTTP 500 — behoben
- **Getan**: `/bilder?q=a&q=b` und `/bilder?thema=a&thema=b` aufgerufen, zweimal.
- **Erwartet**: eine Trefferliste (irgendein sinnvoller Umgang mit dem doppelten Parameter).
- **Passiert**: HTTP 500, Fehlerseite „Da ist etwas schiefgegangen".
  Serverprotokoll: `TypeError: begriff.trim is not a function` bzw.
  `TypeError: thema.trim is not a function`.
- **Ursache**: `page.tsx:17` deklariert `searchParams` als `{ q?: string; thema?: string }`.
  Bei doppeltem Parameter liefert Next.js aber ein `string[]` — die Typangabe war eine
  Behauptung, keine Prüfung; `sucheBilder` bekommt ein Array und `begriff.trim()` bricht.
- **Behoben** in `page.tsx`: die Parameter werden als `string | string[]` entgegengenommen
  und auf den ersten Wert verengt.

---

## Ungünstig

### U1 — „0 KB" für kleine Bilder — behoben
`bildkarte.tsx:55` rechnet `Math.round(bytes / 1024)`. Die Probebilder (68 Bytes) werden
dadurch als „**0 KB**" ausgewiesen — als hätten sie keinen Inhalt. Jetzt steht bei allem
unter 1 KB die Byte-Zahl (`68 B`).

### U2 — sehr langer Titel wird ohne Zeichen für „hier geht es weiter" abgeschnitten
Ein 300-Zeichen-Titel wird gespeichert (kein Längenlimit in `beschrifteBild`,
`src/bilder/aktionen.ts:26`, und keines im Schema) und in der Karte auf zwei Zeilen
geklemmt (`globals.css:2138`, `-webkit-line-clamp: 2`), gemessen 164 px sichtbar von
2581 px Inhalt. Die Darstellung bleibt heil, aber ohne Auslassungszeichen sieht man dem
Titel nicht an, dass er weitergeht. **Offen** — die Klammerung steht in `globals.css`,
eine Längenbegrenzung gehörte in `aktionen.ts`; beides nicht meine Dateien.

### U3 — die Zahlen im Themenfilter gelten nicht für die laufende Suche
Bei `/bilder?q=PE` steht in der Auswahlliste weiter „Kalkulation (7)", die Suche liefert
aber genau **1** Treffer. `alleThemen()` (`src/bilder/bibliothek.ts:110-120`) zählt immer
über die ganze Bibliothek, ohne `q`. Wer die Zahl als Vorschau auf die Treffermenge liest,
wird in die Irre geführt. **Offen** (fremde Datei). Vorschlag: `alleThemen(begriff)` um
dieselbe `or(...)`-Bedingung erweitern wie `sucheBilder`.

### U4 — „Keine Bilddatei erhalten." bei einer leeren Datei
Eine 0-Byte-Datei wird in `src/app/api/bilder/route.ts:16` von `d.size > 0` weggefiltert;
die Antwort behauptet dann, es sei gar keine Datei angekommen. Der zutreffende Text
„Die Datei ist leer." existiert in `src/bilder/ablage.ts:33`, wird auf diesem Weg aber nie
erreicht. **Offen** (fremde Datei). Vorschlag: leere Dateien nicht wegfiltern, sondern
`speichereBild` entscheiden lassen.

### U5 — der Mauszeiger verspricht Vergrössern, der Klick beschriftet
`globals.css:2118` setzt `.bildkarte-bild { cursor: zoom-in }`. Ein Klick öffnet aber die
Beschriftung; eine Vergrösserung gibt es auf der Seite nicht. Der `title` sagt es richtig
(„Beschriften"), der Zeiger sagt etwas anderes. **Offen** (fremde Datei).
Vorschlag: `cursor: pointer`.

### U6 — die Suche legt keinen Verlaufseintrag an
`suchleiste.tsx` benutzt durchgehend `router.replace`. Die Zurück-Taste führt darum nicht
zur vorherigen Suche, sondern aus der Seite heraus (geprüft: von `?q=PE+Kalk` zurück
landete ich auf `?q=PE-ohne-themen`, dem Aufruf davor). Das ist eine vertretbare
Entscheidung — bei 250-ms-Entprellung entstünde sonst je Tastendruck ein Eintrag —,
sie ist nur nirgends erklärt. Nicht geändert.

### U7 — 10 Bilder liegen in einem Zustand, in dem sie nirgends erscheinen
`select count(*) from bild where in_bibliothek = false and stellungnahme_id is null` → **10**
(aus früheren Prüfläufen anderer Prüfer). Diese Zeilen sind über die Oberfläche weder
sicht- noch löschbar: das obere Gitter verlangt `inBibliothek`, das untere
`stellungnahme_id is not null` (`bibliothek.ts:104`). Genau in diesen Zustand befördert F6
jedes direkt hochgeladene Bild. **Offen** (fremde Datei).

---

## Geändert

Alle Änderungen ausschliesslich in meinen drei Dateien; `pnpm typecheck` nach jeder
Änderung sauber. **Jede Änderung wurde anschliessend zweimal nachgeprüft**, die Belege
stehen unten unter „Nachprüfung".

### `src/app/(app)/bilder/page.tsx`
1. **Doppelte Suchparameter fangen** (F9): `searchParams` nimmt jetzt
   `string | string[] | undefined` entgegen und verengt auf den ersten Wert. Vorher HTTP 500.
2. **Ehrliche Zahl an der Anzeigegrenze** (F3): erreicht die Liste die Grenze von 60 (bzw.
   40 unten), steht „mindestens 60" mit dem Zusatz, dass die Liste dort endet, statt einer
   falschen Gesamtzahl.
3. **Der Abschnitt „Aus Schreiben" sagt, dass die Suche ihn nicht erfasst** (F2), und der
   Leertext verweist darauf, statt den Leser vor 28 Karten „kein Bild" lesen zu lassen.

### `src/app/(app)/bilder/bildkarte.tsx`
4. **`Esc` schliesst die Beschriftung** (F7) und gibt den Fokus an den Bildknopf zurück.
5. **„Verwerfen"-Knopf** (F4): setzt die Felder auf den gespeicherten Stand zurück und
   klappt zu. Zusätzlich zeigt die Karte „ungespeichert", solange die Felder vom
   gespeicherten Stand abweichen — vorher war das von aussen nicht zu sehen.
6. **Meldung verfällt bei der nächsten Eingabe** (F8): „Gespeichert." bleibt nicht mehr
   über einer bereits wieder geänderten Eingabe stehen.
7. **Rückfrage vor „Aus der Bibliothek nehmen"** (F6) und wahrheitsgemässer `title`:
   der alte Text „Bleibt erhalten, erscheint aber nicht mehr in der Suche" verschwieg,
   dass ein direkt hochgeladenes Bild danach über die Oberfläche **überhaupt nicht mehr
   erreichbar** ist. Die Rückfrage nennt das jetzt und lässt sich abbrechen.
8. **Teilerfolg beim Upload benennen** (F5): `angelegt` wird zusammen mit `fehler` ausgewertet.
9. **Ehrliche Antwortbehandlung beim Upload**: Vorher wurde jede Antwort blind als JSON
   gelesen; eine HTML-Fehlerseite (z. B. 502 vom Vorschaltserver) führte in den `catch` und
   damit zur unwahren Meldung „Die Verbindung ist abgerissen." Jetzt wird der Status
   ausgewertet und der Fall benannt.
10. **Grössenangabe unter 1 KB in Bytes** (U1) statt „0 KB".
11. **Fehlermeldungen werden am Ergebnis erkannt, nicht am Wortlaut**: vorher entschied
    `meldung.match(/nicht löschen/)` (`bildkarte.tsx:154`) über die rote Einfärbung — eine
    Umformulierung der Meldung in `aktionen.ts` hätte die Färbung stillschweigend
    verloren. Jetzt merkt sich die Karte, ob das Ergebnis ein `fehler` war.

### `src/app/(app)/bilder/suchleiste.tsx`
12. **Suchfeld folgt der Adresse**: wird `q` von aussen geändert (Zurück-Taste,
    „Filter zurücksetzen", Verweis mit `?q=`), übernimmt das Feld den neuen Wert.
    Vorher konnte das Feld dauerhaft etwas anderes zeigen als die Liste. Die eigene
    Adressänderung aus der 250-ms-Entprellung ist ausgenommen, sonst würde schnelles
    Tippen auf die zuletzt gesendete Fassung zurückgesetzt (eigens geprüft, s. u.).

### Nachprüfung (zwei vollständige Durchgänge, beide identisch)

| Punkt | Vorher | Nachher |
|---|---|---|
| F9 `/bilder?q=a&q=b` | HTTP 500 | HTTP 200, „14 Bilder gefunden" |
| F9 `/bilder?thema=a&thema=b` | HTTP 500 | HTTP 200, „0 Bilder gefunden" |
| F2 Leertext | „Kein Bild passt zu dieser Suche." über 28 Karten | „Kein Bild in der Bibliothek passt zu dieser Suche. Unten stehen weiterhin die Bilder aus Schreiben — die Suche erfasst sie nicht."; der Abschnitt selbst sagt „Suche und Themenfilter oben wirken auf diesen Abschnitt nicht" — und ohne aktive Suche steht der Zusatz **nicht** da |
| F3 bei 73 Bibliotheksbildern | „60 Bilder in der Bibliothek" | „mindestens 60 Bilder in der Bibliothek · mindestens 40 aus Schreiben … — die Liste endet hier; grenze die Suche ein, um den Rest zu sehen"; bei 28 Bildern wieder schlicht „28 Bilder in der Bibliothek" |
| U1 Grössenangabe | „1×1 · 0 KB" | „1×1 · 68 B" |
| F8 Meldung nach erneutem Tippen | „Gespeichert." bleibt | Meldung verschwindet |
| F4 ungespeicherte Änderung | unsichtbar | Hinweiszeile erscheint, Knopf heisst „Verwerfen" (sonst „Schliessen") |
| F4 Verwerfen | gab es nicht | Feld springt auf „PE Ohne Themen" zurück, DB unverändert |
| F7 `Esc` | Formular blieb offen | Formular zu, Fokus zurück auf `.bildkarte-bild` |
| F6 „Aus der Bibliothek nehmen" | wortlos, Bild unauffindbar | Rückfrage; abgebrochen → `in_bibliothek` bleibt `true`; bestätigt → `false`. `title`: „Das Bild bleibt in der Datenbank, ist danach aber über diese Seite nicht mehr erreichbar." |
| F5 gut + kaputt gemeinsam | nur Typfehler, 1 Bild heimlich angelegt | „1 Bild(er) aufgenommen, der Rest nicht: Nur PNG und JPEG …", DB-Zählung 1 — Meldung und Datenbank stimmen überein |
| Suchfeld nach Zurück-Taste | blieb stehen | folgt der Adresse (`?q=PE+Kalk` → Feld „PE Kalk", 1 Treffer) |
| schnelles Tippen (14 Zeichen à 90 ms) | — | Feld „PE Kalkulation", Adresse `?q=PE+Kalkulation` — nichts zurückgesetzt |

Unverändert richtig geblieben (Rückfallprüfung nach den Änderungen): Themenfilter
`thema=Kalkulation` Seite 7 / DB 7; 30 Vorschaubilder alle HTTP 200; „Filter zurücksetzen"
führt auf `/bilder` mit 28 Karten; kein waagerechter Überlauf und alle vier Knöpfe
vollständig im Fenster bei 380/1024/1440 px.

### Aufgeräumt
`PE-in-bibliothek.png`, `PE-aus-schreiben.png` und `PE-ohne-themen.png` stehen wieder
genau auf ihrem Ausgangsstand. Alle Prüfzeilen (`PE-upload-*`, `PE-fuell-*`,
`PE-probe-*`, `PE-kaputt.png`, `off-PE-*`) sind gelöscht — Nachzählung 0. Das Schreiben
„PE B" ist wieder zeichengleich mit den B-Schreiben der anderen Präfixe (1632 Zeichen,
kein `bildId` mehr; zwei Bildknoten aus abgebrochenen Prüfläufen habe ich entfernt).
Meine Prüfskripte (`probe-pe*.mts`) sind gelöscht.

---

## Offen

- **O1 — F1**: `%`/`_` als Platzhalter in der Suche. Fix gehört in
  `src/bilder/bibliothek.ts:66`. Nicht meine Datei.
- **O2 — `/api/bilder/keine-uuid` → HTTP 500.** Getan: die Adresse aufgerufen (zweimal).
  Erwartet: 404 wie bei einer unbekannten UUID. Passiert: 500 mit leerem Rumpf, weil
  Postgres den Wert nicht als `uuid` deuten kann. Ursache: `ladeBild`
  (`src/bilder/ablage.ts:70`) reicht die Zeichenkette ungeprüft in `eq(bild.id, id)`.
  Vorschlag: in der Route (`src/app/api/bilder/[id]/route.ts`) vor dem Laden auf UUID-Form
  prüfen und sonst 404 liefern. Nicht meine Datei.
- **O3 — Bilddatensatz ohne Bytes wird als heiles Bild dargestellt.** Getan: testweise eine
  Zeile mit `daten = ''` angelegt (und wieder gelöscht). Passiert: `/api/bilder/<id>`
  antwortet **200** mit `Content-Length: 0`; die Karte zeigt einen leeren Rahmen und
  behauptet daneben weiter „640×480 · 80 KB". Ursache: `ladeBild`
  (`src/bilder/ablage.ts:69-81`) gibt einen leeren Puffer als gültiges Bild zurück.
  Vorschlag: leere Daten wie „nicht gefunden" behandeln (404) — dann greift wenigstens
  das `alt`-Wort. Nicht meine Datei.
- **O4 — F6**: die eigentliche Datenlücke (`ausBibliothekNehmen` ohne Verwendungsprüfung,
  `src/bilder/aktionen.ts:53`) bleibt bestehen; ich konnte nur die Rückfrage auf der Karte
  vorschalten.
- **O5 — U3**: Themenzählungen ohne Rücksicht auf die Suche (`bibliothek.ts:110`).
- **O6 — U4**: irreführende Meldung bei leerer Datei (`api/bilder/route.ts:16`).
- **O7 — U5**: `cursor: zoom-in` ohne Vergrösserung (`globals.css:2118`).
- **O8 — U7**: 10 unsichtbare Bildzeilen; Ursache derselbe Zustandsraum wie F6.
- **O9 — U2**: keine Längenbegrenzung für Titel/Beschreibung (`aktionen.ts:26`), und der
  geklemmte Titel bekommt kein Auslassungszeichen (`globals.css:2138`).
- **Nicht ausgeführt** (nach Vorgabe): `pnpm build`, `pnpm vitest`, `git commit`, `git push`.
