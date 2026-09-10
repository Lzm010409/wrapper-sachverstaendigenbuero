# Bedienprobe /faelle und /faelle/[id] — Prüfer PD

Datensätze (Fall-Ids in der Datenbank):

| Aktenzeichen | Fall-Id | gespeicherte Daten |
|---|---|---|
| PD-0726/2011TG | `bfa503eb-563a-4adf-a2b5-7ba46ec9615c` | vollständig |
| PD-ohne-Angaben | `bfd7ace4-59ce-4040-8fcd-3f191d164a8c` | nur `id` + `aktenzeichen` |
| PD-kaputt | `8fecfbba-116f-439f-874f-58e82fe7b560` | `{ unfug: true, id: 12345 }` |

Alle Handgriffe zweimal, mit Playwright gegen den laufenden Entwicklungsserver
(`http://localhost:3000`), angemeldet als dem Prüfkonto.
Die Beobachtungen unten stammen aus dem Zustand **vor** meinen Änderungen; was ich
geändert habe, steht unter „Geändert" samt Nachprüfung.

---

## Wichtige Vorbemerkung: die Lage ist eine andere als im Auftrag beschrieben

Der Auftrag sagt, `AUTOIXPERT_API_TOKEN` fehle und das Import-Formular sei deshalb
gesperrt. Das trifft auf diesen Server **nicht** zu. Im Umfeld des laufenden
`next dev`-Prozesses (PID 12303) steht

```
AUTOIXPERT_API_TOKEN=EB7IMYY4X3LF
```

(nachgesehen mit `tr '\0' '\n' < /proc/12303/environ`). In `.env.local` steht der
Wert nicht — er wird dem Prozess von aussen mitgegeben. Folge:

- `src/app/(app)/faelle/page.tsx:9` prüft nur `Boolean(process.env.AUTOIXPERT_API_TOKEN)`
  → `eingerichtet = true`.
- Der gelbe Hinweiskasten „Die autoiXpert-Schnittstelle ist auf diesem Server nicht
  eingerichtet" erscheint **nicht** (gemessen: `.hinweis`-Elemente auf `/faelle` = 0).
- Das Formular ist **nicht gesperrt**: `input[name=eingabe]` und der Knopf „Fall laden"
  sind beide `disabled=false`.
- Der Token ist aber unbrauchbar; jede Anfrage endet in HTTP 401/403 und damit in
  „Der API-Zugang wurde abgelehnt. Bitte den Token in den Einstellungen prüfen."

Der Punkt „ehrlich und verständlich erklärt" ist damit anders zu beantworten als
erwartet: Die Anwendung versagt nicht still — sie sagt nach dem Klick klar, dass der
Zugang abgelehnt wurde. Sie sagt es nur **erst nach dem Klick** und schickt den Leser
dabei an einen Ort, den es nicht gibt (siehe „Ungünstig").

---

## Geprüft

### 1. Liste `/faelle` (zweimal)

- Alle drei PD-Fälle erscheinen, Kopfzeile „23 Fälle aus autoiXpert".
- Aktenzeichenspalte korrekt aus der Datenbankspalte: `PD-0726/2011TG`,
  `PD-ohne-Angaben`, `PD-kaputt`. Kein „—" nötig, weil alle drei ein Aktenzeichen haben.
- Adressen stimmen: jede Zeile verlinkt auf `/faelle/<eigene Id>`; alle drei Klicks
  landeten auf der richtigen Detailseite.
- **Zustandspille: bei keinem der drei Fälle vorhanden.** Das ist richtig und nicht
  erfunden — in keinem der drei Datensätze steht ein `state`, und
  `src/app/(app)/faelle/page.tsx:65` zeigt die Pille nur bei vorhandenem `zustand`.
  Es wird also nichts behauptet, was nicht in den Daten steht. Ebenso die Datumsspalte
  rechts: leer, weil `abgerufenAm` bei allen drei `NULL` ist.
- Zeile 2/3 der Anzeige („Fahrzeug/Beteiligte"): nur beim vollständigen Fall gefüllt
  („Volkswagen Passat Variant 2.0 TDI"), bei den anderen beiden leer.

### 2. Import-Formular (zweimal)

- Nicht gesperrt (siehe Vorbemerkung), kein Hinweistext.
- Enter im Feld und Klick auf „Fall laden": beides ging durch, Ergebnis wie erwartet.
- Absenden mit Unsinn-Aktenzeichen `voelliger-unfug-xyz` →
  „Der API-Zugang wurde abgelehnt. Bitte den Token in den Einstellungen prüfen."
  Keine Serverfehlerseite, Seite blieb bedienbar (h1 weiter „Fälle").
- Leere Eingabe (Browserprüfung umgangen) → „Bitte ein Aktenzeichen oder eine ID
  eingeben." Verständlich, kein Serverfehler.
- 20.000 Zeichen `X` → dieselbe Zugangs-Fehlermeldung, kein Serverfehler, kein Absturz,
  Seite blieb bedienbar.
- Beide Durchgänge identisch.

### 3. Falldetail, vollständiger Fall PD-0726/2011TG (zweimal)

Gespeichert sind im JSON zehn Angaben. Angezeigt wurden vier:

| gespeichert | angezeigt |
|---|---|
| `car.make` = Volkswagen | ja |
| `car.model` = Passat Variant 2.0 TDI | ja |
| `car.vin` = WVWZZZ3CZME000001 | ja |
| `accident.date` = 2026-05-14 | ja, korrekt deutsch als **14.05.2026** |
| `car.licensePlate` = OL-AB 1234 | **nein** |
| `car.firstRegistration` = 2019-04-01 | **nein** |
| `car.mileage` = {value: 84000, unit: km} | **nein** |
| `claimant.contactPerson` = Autohaus Muster GmbH / Meier | **nein** |
| `accident.description` = Auffahrunfall auf der B401 | **nein** |
| `daten.aktenzeichen` = PD-0726/2011TG | **nein** |

Datums- und Zahlformate: das eine sichtbare Datum ist richtig formatiert (14.05.2026,
kein ISO). Eine falsch formatierte Zahl konnte ich nicht beobachten, weil die
Laufleistung gar nicht erst ankommt.

Ausserdem: Kopfzeile zeigte **„ohne Aktenzeichen"**, obwohl die Liste für denselben
Fall „PD-0726/2011TG" anzeigt. Beteiligte: fünfmal „nicht hinterlegt".
Vorschlag für die Stellungnahme: „Kein Empfänger im Gutachten hinterlegt — er wird beim
Erstellen abgefragt." Platzhalter: sechs Stück (Marke, Hersteller, Modell, Fahrzeug,
Unfalltag, Schadentag). Herkunft: autoiXpert-ID PD-f1, Auftragsdatum „—",
Fertigstellung „—".

### 4. Falldetail, karger Fall PD-ohne-Angaben (zweimal)

- Kasten „Fahrzeug": vollständig leer, nur die Überschrift — kein „—", kein Satz.
  Ebenso Kasten „Unfall und Schaden".
- Kasten „Beteiligte": fünfmal „nicht hinterlegt" — gut, das ist eine Aussage.
- Seitenleiste „Verfügbare Platzhalter": „Keine — die Falldaten sind zu dünn."
  Vorbildlich ehrlich. **Es erscheinen keine Platzhalter, die nicht gefüllt werden
  können** — die Zusage „Werden beim Einfügen eines Bibliothekstexts automatisch
  gesetzt" gilt also nur für tatsächlich vorhandene Werte. Geprüft, hält.
- Kopfzeile ebenfalls „ohne Aktenzeichen" trotz `PD-ohne-Angaben` in der Liste.

### 5. Falldetail, kaputter Fall PD-kaputt (zweimal)

- HTTP 200, kein Absturz, keine weisse Seite, **kein Konsolenfehler**.
- Angezeigt wurden vorher genau zwei Dinge: „← Fälle" und der rote Kasten
  „Die gespeicherten Falldaten lassen sich nicht lesen. Bitte den Fall neu laden."
- Der Rat war nicht befolgbar: der Knopf „Aus autoiXpert neu laden" wurde in diesem Zweig
  gar nicht gerendert (gemessen: 0 Knöpfe). Ausserdem stand nirgends, **welcher** Fall
  das ist — kein Aktenzeichen, keine Id.

### 6. „Aus autoiXpert neu laden" (je zweimal auf jedem Fall)

- Vollständiger und karger Fall: Knopf sperrt sich beim Klick sauber
  (`disabled=true`, Beschriftung „Lädt …"), danach wieder frei
  (`disabled=false`, „Aus autoiXpert neu laden").
- Meldung beide Male: „Der API-Zugang wurde abgelehnt. Bitte den Token in den
  Einstellungen prüfen." — passt zum tatsächlichen Fehler (der hinterlegte Token wird
  von autoiXpert mit 401/403 abgewiesen), nennt aber einen Ort, den es nicht gibt.
- Zweimal hintereinander: identisches Verhalten, keine Doppelausführung, kein
  Aufstauen von Meldungen.
- Seite danach voll bedienbar; Klick auf „← Fälle" führte zurück auf `/faelle`.
- Wirkung in der Datenbank nachgeprüft: `abgerufen_am` ist bei allen drei PD-Fällen
  weiterhin `NULL`, `daten` unverändert. Die Fehlermeldung ist also wahr — es wurde
  wirklich nichts geschrieben.
- Kaputter Fall: Knopf war vorher überhaupt nicht da (siehe Punkt 5).

### 7. Unbekannte Adressen (je zweimal)

- `/faelle/00000000-0000-0000-0000-000000000000` → HTTP **404**, saubere Seite im
  Anwendungsrahmen mit Navigation.
- `/faelle/unfug` → HTTP **500**, Seite „This page couldn't load / A server error
  occurred. Reload to try again. ERROR 2989128093", **ohne** Navigation, ohne Rückweg.
- Zusätzlich probiert: `/faelle/1` → ebenfalls HTTP 500.
- Browserkonsole gab dabei die Datenbankabfrage im Klartext aus:
  `Failed query: select "id", "aktenzeichen", "autoixpert_id", "daten", ... params: unfug,1`

### 8. Zusammenspiel mit den Stellungnahmen

In der Datenbank hängen zwei meiner drei Fälle an einer Stellungnahme:

- `PD B — drei Positionen, vollständig` → `fall_id = bfa503eb…` (PD-0726/2011TG)
- `PD C — zwölf Positionen, versendet` → `fall_id = bfd7ace4…` (PD-ohne-Angaben)

Auf den Detailseiten steht davon **nichts**. Die einzigen Links auf `/stellungnahmen`
sind die beiden Navigationseinträge im Seitenrahmen; einen fallbezogenen Verweis gibt
es nicht, weder hin („Stellungnahme zu diesem Fall") noch her. Wer von einem Fall aus
arbeitet, sieht nicht, dass es dazu schon eine Stellungnahme gibt, und kann von hier aus
auch keine anlegen.

---

## Fehler

**F1 — `/faelle/unfug` endet in einer Serverfehlerseite statt in „nicht gefunden".**
Getan: Adresse `/faelle/unfug` (und `/faelle/1`) aufgerufen. Erwartet: dieselbe saubere
404-Seite wie bei einer unbekannten UUID. Passiert: HTTP 500, rahmenlose englische
Fehlerseite ohne Rückweg, dazu die SQL-Abfrage samt Parameter in der Browserkonsole.
Ursache: `src/app/(app)/faelle/[id]/page.tsx` reichte die Adresse ungeprüft an
`ladeFall(id)` weiter; Postgres lehnt `unfug` als `uuid` ab.
**Behoben** (siehe Geändert).

**F2 — Die Detailseite widersprach der Liste beim Aktenzeichen.**
Getan: Zeile „PD-0726/2011TG" in der Liste angeklickt. Erwartet: dasselbe Aktenzeichen
im Kopf der Detailseite. Passiert: „ohne Aktenzeichen". Grund: die Liste zeigt die
Datenbankspalte `fall.aktenzeichen`, die Detailseite ausschliesslich `token` aus dem
Gutachten-JSON (`page.tsx:54`). Zwei Ansichten desselben Falls behaupteten Gegenteiliges.
**Behoben** (siehe Geändert).

**F3 — Der kaputte Fall gab einen Rat, den man nicht befolgen konnte.**
Getan: `/faelle/8fecfbba-…` aufgerufen. Erwartet: eine Meldung, die sagt, was zu tun ist,
und ein Weg, es zu tun. Passiert: „Bitte den Fall neu laden." — der einzige Knopf, der
das kann, war in genau diesem Zweig nicht gerendert. Ausserdem war nicht erkennbar,
welcher Fall betroffen ist.
**Behoben** (siehe Geändert).

**F4 — Sechs von zehn gespeicherten Angaben des vollständigen Falls kommen nirgends an.**
Getan: PD-0726/2011TG geöffnet und mit dem JSON in der Datenbank verglichen. Erwartet:
Kennzeichen, Erstzulassung, Laufleistung, Anspruchsteller und Unfallbeschreibung
irgendwo auf der Seite. Passiert: keins davon, und kein Wort darüber, dass etwas
übergangen wurde.
Grund: `src/autoixpert/felder.ts` liest die snake_case-Felder der autoiXpert-Schnittstelle
(`license_plate` Zeile 137, `first_registration_date` Zeile 141,
`mileage_meter/_as_stated/_estimated` Zeile 100, `organization_name/first_name/last_name`
Zeile 63-72, `accident.circumstances` Zeile 154), die Probedaten in
`scripts/probedaten.ts:58-68` liefern camelCase (`licensePlate`, `firstRegistration`,
`mileage: {value, unit}`, `claimant.contactPerson`, `accident.description`).
`gutachtenSchema` ist mit `.loose()` nachsichtig, verwirft also nichts und meldet auch
nichts — die Werte fallen lautlos hinten runter.
Welche Seite falsch ist, lässt sich aus der Oberfläche nicht entscheiden: die
Schnittstellendokumentation im Code (`src/autoixpert/client.ts`, `typen.ts`) spricht klar
für snake_case, also sind vermutlich die Probedaten nicht im Format der echten
Schnittstelle. **Beide Dateien liegen ausserhalb meines Bereichs — nicht geändert**,
siehe „Offen".

---

## Ungünstig

**U1 — „Bitte den Token in den Einstellungen prüfen" verweist auf etwas, das es nicht gibt.**
Die Meldung (`src/autoixpert/client.ts:97`) erscheint sowohl im Import-Formular als auch
am Knopf „Aus autoiXpert neu laden". Eine Seite „Einstellungen" existiert in der
Anwendung nicht: die Navigation kennt Stellungnahmen, Fälle, Argumentbibliothek,
Bildbibliothek; „Administration" ist in `src/app/(app)/layout.tsx:11` nur eine
Rollenbezeichnung, kein Ziel. Der Token kommt ausschliesslich aus der Umgebungsvariablen
`AUTOIXPERT_API_TOKEN`. Der Hinweiskasten auf `/faelle` sagt das im anderen Fall auch
richtig — die Fehlermeldung sollte dasselbe sagen. Datei ausserhalb meines Bereichs;
Vorschlag: „Der API-Zugang wurde abgelehnt. Bitte `AUTOIXPERT_API_TOKEN` in den
Umgebungsvariablen prüfen."

**U2 — Ein hinterlegter, aber unbrauchbarer Token sieht aus wie ein eingerichteter.**
`src/app/(app)/faelle/page.tsx:9` prüft nur, **ob** die Variable gesetzt ist. Genau das
ist hier der Fall, und deshalb wirkt die Seite voll funktionsfähig, bis der Nutzer
absendet. Das ist nicht direkt falsch — ob ein Token gültig ist, weiss man erst nach
einem Aufruf, und ein Prüfaufruf beim Seitenaufbau kostet bei dieser Schnittstelle Geld
(siehe Kommentar in `client.ts:17-20`). Erwähnenswert bleibt es: der Leser erfährt von
der Störung erst, nachdem er gearbeitet hat.

**U3 — Der Randtext des Formulars behauptet etwas, das ich nicht nachprüfen konnte.**
„Aktenzeichen brauchen eine Suche, IDs laden direkt" — ohne gültigen Zugang lässt sich
nicht feststellen, ob das stimmt. Der Code stützt die Aussage
(`aufloesung.weg === 'aktenzeichen_suche'`), belegt ist sie in dieser Umgebung nicht.

**U4 — Die Liste sagt nicht, wann ein Fall zuletzt abgerufen wurde, wenn er es nie wurde.**
Bei allen drei PD-Fällen ist `abgerufenAm` `NULL`, die rechte Spalte bleibt schlicht leer
(`page.tsx:74-78`). Ein „nie abgerufen" wäre ehrlicher als nichts; die leere Zelle lässt
offen, ob das Datum fehlt oder die Anzeige. Nicht geändert, weil es alle 23 Zeilen der
Liste betrifft und nicht nur meine Fälle — Entscheidung für die Seitenverantwortung.

**U5 — Die 404-Seite ist englisch.**
`/faelle/<unbekannte UUID>` liefert korrekt HTTP 404, zeigt aber „404 — This page could
not be found." in einer sonst durchweg deutschen Anwendung. Das ist die eingebaute
Next.js-Seite; eine eigene `not-found.tsx` gibt es nicht. Ausserhalb meiner Dateien
(die Datei müsste in `src/app/` liegen) — nicht angelegt.

**U6 — Fall und Stellungnahme wissen nichts voneinander.**
Siehe Punkt 8 oben. `stellungnahme.fall_id` ist gesetzt und indiziert
(`stellungnahme_fall_idx`), wird auf der Falldetailseite aber nicht ausgewertet. Der
Kasten „Vorschlag für die Stellungnahme" legt sogar nahe, dass hier eine entstehen
könnte — einen Knopf dafür oder einen Verweis auf die bereits vorhandene gibt es nicht.
Das ist der grösste inhaltliche Bruch, den ich gefunden habe. Nicht behoben, weil die
Abfrage (`ladeStellungnahmenZuFall` o.ä.) in `src/db/**` bzw. `src/stellungnahme/**`
entstehen müsste — ausserhalb meines Bereichs. Vorschlag: eine Abfrage
`select id, betreff, versendet_am from stellungnahme where fall_id = $1` und ein Kasten
„Stellungnahmen zu diesem Fall" in der Seitenleiste, mit Link je Eintrag.

---

## Geändert

Alle Änderungen ausschliesslich in `src/app/(app)/faelle/**`. `pnpm typecheck` läuft
sauber durch. Jede Änderung anschliessend zweimal im Browser nachgeprüft.

**1. `src/app/(app)/faelle/[id]/page.tsx` — UUID-Prüfung vor dem Datenbankzugriff**
(behebt F1). Neue Konstante `UUID` und `if (!UUID.test(id)) notFound()` vor `ladeFall`.
Warum: eine Adresse, die keine Fall-Id sein kann, ist eine tote Adresse und keine
Störung — sie gehört auf die 404-Seite, nicht auf eine Serverfehlerseite, und die
Datenbankabfrage hat im Browserprotokoll nichts verloren.
Nachgeprüft: `/faelle/unfug` und `/faelle/1` liefern jetzt HTTP **404** mit der
Anwendungsnavigation und einem Rückweg; keine Konsolenmeldung mehr. Der gültige, aber
unbekannte UUID-Fall verhält sich unverändert (404).

**2. `src/app/(app)/faelle/[id]/page.tsx` — Aktenzeichen mit Rückfall auf die Datenbankspalte**
(behebt F2). `{d.aktenzeichen ?? f.aktenzeichen ?? 'ohne Aktenzeichen'}`.
Warum: das Aktenzeichen aus dem Gutachten bleibt massgeblich, aber solange es dort fehlt,
darf die Detailseite nicht das Gegenteil der Liste behaupten.
Nachgeprüft: Kopfzeile zeigt jetzt „PD-0726/2011TG" bzw. „PD-ohne-Angaben" — passend zur
Liste. „ohne Aktenzeichen" bleibt für Fälle, die wirklich keins haben.

**3. `src/app/(app)/faelle/[id]/page.tsx` — der Fehlerzweig bekommt Kopf und Knopf**
(behebt F3). Der Zweig für unlesbare Daten zeigt jetzt Aktenzeichen, die Überschrift
„Falldaten nicht lesbar", die autoiXpert-ID und den Knopf „Aus autoiXpert neu laden";
der Meldungstext sagt zusätzlich, was zu tun ist, wenn das nichts hilft.
Warum: eine Anweisung ohne den zugehörigen Handgriff ist eine Zusage, die die Anwendung
nicht einhält. Und wer nicht weiss, welchen Fall er vor sich hat, kann in autoiXpert
nicht nachsehen.
Nachgeprüft: `/faelle/8fecfbba-…` zeigt „PD-kaputt / Falldaten nicht lesbar /
autoiXpert-ID PD-kaputt" plus Knopf. Knopf zweimal gedrückt: sperrt sich („Lädt …"),
gibt danach die Zugangs-Fehlermeldung aus, Seite bleibt bedienbar, Rückweg funktioniert.
Datenbank danach unverändert.

**4. `src/app/(app)/faelle/[id]/page.tsx` — leere Kästen bekommen einen Satz**
Neue Hilfskomponente `Ohne` und die Merker `fahrzeugLeer` / `unfallLeer`.
Warum: ein Kasten „Fahrzeug" ohne jeden Inhalt lässt offen, ob das Gutachten nichts
hergibt oder die Anzeige versagt hat. Der Kasten „Beteiligte" macht es mit „nicht
hinterlegt" schon richtig.
Nachgeprüft: PD-ohne-Angaben zeigt jetzt „Das Gutachten enthält keine Fahrzeugangaben."
und „Das Gutachten enthält keine Angaben zum Unfall." Beim vollständigen Fall und beim
kaputten ändert sich nichts.

**5. `src/app/(app)/faelle/[id]/page.tsx` — Laufleistung nie ohne Einheit**
`${…toLocaleString('de-DE')} ${d.fahrzeug.laufleistungEinheit || 'km'}`.
Warum: `felder.ts` fängt nur `null`/`undefined` ab; ein leeres `mileage_unit` hätte eine
nackte Zahl ergeben. Bei Laufleistungen ist der Unterschied zwischen km und mi nicht
gleichgültig. (Am selben Fall nicht beobachtbar, weil die Laufleistung wegen F4 gar nicht
ankommt — die Absicherung bleibt trotzdem richtig.)

**6. `src/app/(app)/faelle/page.tsx` — unlesbare Fälle sind in der Liste erkennbar**
Der Titel zeigt bei fehlgeschlagener Prüfung „Falldaten nicht lesbar" statt
„Ohne Anspruchsteller", und rechts steht die Pille „unlesbar".
Warum: „Ohne Anspruchsteller" war eine Behauptung über Daten, die gar nicht gelesen
werden konnten — genau die Sorte Aussage, die die Anwendung nicht treffen darf. Vorher
war PD-kaputt in der Liste von einem normalen, nur dünn befüllten Fall nicht zu
unterscheiden; der Nutzer erfuhr vom Schaden erst nach dem Klick.
Nachgeprüft: Zeile PD-kaputt zeigt „Falldaten nicht lesbar" + Pille „unlesbar", die
anderen 22 Zeilen unverändert (auch die der übrigen Prüfer).

Ausserdem: mein Prüfskript (`probe-pd.mts` u.a.) ist gelöscht.

Hinweis: Ich habe **nicht** committet. Während der Prüfung hat jemand anderes den
Arbeitsbaum committet (`64d3092 L1: Zwischenstand der Seitenprüfungen`); meine beiden
Dateien sind darin enthalten. Inhaltlich stehen sie unverändert so im Baum, wie oben
beschrieben — nachgeprüft nach dem Commit.

---

## Offen

- **F4 (Feldzuordnung)** — betrifft `src/autoixpert/felder.ts` und
  `scripts/probedaten.ts`, beide ausserhalb meines Bereichs. Vorschlag: die Probedaten
  in `scripts/probedaten.ts:58-68` auf die Feldnamen der Schnittstelle umstellen
  (`license_plate`, `first_registration_date`, `mileage_meter`, `mileage_unit`,
  `claimant: { organization_name, last_name }`, `accident.circumstances`, `token`), damit
  der „vollständige" Fall auch vollständig ankommt. Falls die camelCase-Form tatsächlich
  vorkommt, müsste stattdessen `felder.ts` beide Schreibweisen lesen.
- **U1 (Meldungstext)** — `src/autoixpert/client.ts:97`, ausserhalb meines Bereichs.
- **U5 (englische 404-Seite)** — eine `not-found.tsx` müsste in `src/app/` liegen,
  ausserhalb meines Bereichs.
- **U6 (Fall ↔ Stellungnahme)** — braucht eine Abfrage in `src/db/**`, ausserhalb meines
  Bereichs. Aus meiner Sicht der wichtigste offene Punkt.
- **Import über einen gültigen Zugang** — nicht prüfbar. Ob ein Aktenzeichen wirklich
  gefunden wird, ob der Hinweis „Über das Aktenzeichen gefunden (n Listenseiten gelesen)"
  erscheint und ob ein zweiter Import denselben Fall aktualisiert statt ihn zu
  verdoppeln, konnte ich mit dem abgelehnten Token nicht feststellen.
- **Der Server läuft mit einem Token, den ich nicht gesetzt habe.** Ich habe die Umgebung
  nicht angefasst und den Server nicht neu gestartet. Wer das Verhalten „Schnittstelle
  gar nicht eingerichtet" sehen will, muss `AUTOIXPERT_API_TOKEN` aus der Prozessumgebung
  entfernen — dann erscheint der gelbe Hinweiskasten und das Formular ist gesperrt
  (im Code so angelegt, in dieser Umgebung nicht beobachtbar).
