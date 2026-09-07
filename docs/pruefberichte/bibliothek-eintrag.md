# /bibliothek/[id] — Detailansicht eines Bibliothekseintrags (Präfix PC)

Geprüft am 14.08.2026 gegen den laufenden Entwicklungsbetrieb auf
http://localhost:3000, angemeldet als Administrator
(dem Prüfkonto), Bedienung über Playwright/Chromium.

Datensätze:

| Kennung | Titel | Ausgangsstatus | Besonderheit |
|---|---|---|---|
| PC.1 | PC Freigegeben mit Varianten und Fundstellen | freigegeben | 2 Varianten, 2 unbestätigte Fundstellen |
| PC.2 | PC Entwurf mit Platzhaltern | entwurf | `[Kennzeichen]`, `[Bauteil]`, interne Hinweise, keine Fundstelle |
| PC.3 | PC Zurückgezogen ohne Gegenargument | zurueckgezogen | leeres Gegenargument, „Vorgehen", 1 Fundstelle |

Alle drei Datensätze stehen am Ende wieder auf ihrem Ausgangsstand
(Status, Fundstellen, Bestätigungen); die Prüfskripte sind gelöscht.
`pnpm typecheck` läuft sauber.

---

## Geprüft

### PC.1 (freigegeben, 2 Varianten, 2 offene Fundstellen)
- Anzeige: Nummer, Titel, „Kalkulation · 1. Ersatzteile-Erforderlichkeit /
  E-Positionen", Statuspille „Freigegeben", typische Begründung, Gegenargument,
  Varianten (2) mit Bezeichnung und Text, interne Hinweise mit Marke „nie im
  Schreiben" — alles am richtigen Platz.
- Freigabeleiste: Knöpfe „Freigabe zurücknehmen" und „Zurückziehen".
- Kette: Freigabe zurücknehmen → Entwurf (Pille wandert mit, sofort und nach
  Neuladen; „Freigeben" ist danach gesperrt) → 1. Fundstelle bestätigt →
  Sperrhinweis zählt auf „1 Fundstelle" herunter → 2. Fundstelle bestätigt →
  Sperre fällt sofort, ohne Neuladen, und bleibt auch nach Neuladen gefallen →
  Freigeben → „Eintrag freigegeben.", Pille „Freigegeben", Knöpfe wechseln.
- Fundstellen-Links geprüft (nicht aufgerufen): je Fundstelle
  `https://dejure.org/dienste/lexsuche?Suchbegriff=LG%20Musterstadt%201%20O%20100%2F24`
  und `https://www.google.com/search?q=LG%20Musterstadt%201%20O%20100%2F24` —
  Gericht und Aktenzeichen sind enthalten und korrekt kodiert, beide mit
  `target="_blank" rel="noreferrer noopener"`, öffnen also in einem neuen
  Reiter ohne Rückkanal.

### PC.2 (Entwurf, Platzhalter, keine Fundstellen)
- Anzeige: typische Begründung, Gegenargument mit den beiden Klammern im
  Fliesstext, interne Hinweise. Kein Vorgehen, keine Varianten, keine
  Ergänzungen, keine Fundstellenkarte — jeweils richtig weggelassen.
- Volle Kette gefahren, jeder Schritt sofort **und** nach `Neuladen` geprüft:
  Entwurf → Zur Prüfung (Pille „In Prüfung") → Freigeben („Eintrag
  freigegeben.") → Freigabe zurücknehmen (Entwurf) → Zurückziehen
  (Zurückgezogen) → Zurück auf Entwurf → Zur Prüfung → Zurück auf Entwurf.
  Der Status stand nach jedem Neuladen so, wie die Rückmeldung es behauptet
  hatte; die Statuspille oben wanderte in allen Fällen mit; die Knöpfe des
  neuen Zustands erschienen jeweils sofort.

### PC.3 (zurückgezogen, leeres Gegenargument, 1 offene Fundstelle)
- Anzeige: typische Begründung, „Vorgehen" mit Marke „kein fertiger Text",
  Fundstellenkarte (1), keine Varianten/Ergänzungen/Hinweise.
- „Freigeben" war gesperrt, Titeltext des Knopfes „Erst die Fundstellen
  bestätigen.", dazu der Hinweiskasten mit Grund und Zahl.
- „Entfernen" der Fundstelle: Karte verschwindet vollständig, auch nach
  Neuladen — die Zeile ist wirklich aus der Datenbank weg. Danach war
  „Freigeben" frei und führte (trotz leeren Gegenarguments, weil ein Vorgehen
  vorhanden ist) auf „Freigegeben".
- Rückweg auf den Ausgangsstand gefahren.

### Seitenübergreifend
- Rolle: Der angemeldete Benutzer ist Administrator, `darfFreigeben` ist wahr —
  der Rollenhinweis wurde bei keinem der drei Einträge und in keinem Zustand
  angezeigt. Er erscheint also nur, wenn er zutrifft.
- Rückweg: „← Argumentbibliothek" führt nach `/bibliothek`; der Zurück-Knopf
  des Browsers landet wieder auf der Detailseite mit vollständigem Inhalt
  (Titel korrekt), keine Fehlermeldung, kein leerer Zustand.
- Unbekannte Adressen: `/bibliothek/00000000-0000-0000-0000-000000000000` und
  `/bibliothek/unfug`.
- Keine JavaScript-Fehler in der Konsole auf den drei Detailseiten.

---

## Fehler

### F1 — `/bibliothek/unfug` warf einen Serverfehler (HTTP 500) statt „nicht gefunden" — behoben
**Getan**: Adresse `/bibliothek/unfug` aufgerufen.
**Erwartet**: saubere „nicht gefunden"-Seite.
**Passiert**: HTTP **500**, Seite „This page couldn't load — A server error
occurred." Im Serverprotokoll:

```
pageerror: Failed query: select "id", "nummer", ... from "eintrag"
where "eintrag"."id" = $1 limit $2
params: unfug,1
```

Die Kennung ging ungeprüft als UUID-Vergleich an Postgres; der Typfehler kam
als Ausnahme zurück. Eine vertippte Adresse ist aber kein Fehler der Anwendung.
Behoben in `src/app/(app)/bibliothek/[id]/page.tsx`: Kennung wird gegen ein
UUID-Muster geprüft, sonst `notFound()`. Nachgemessen: jetzt **404**.

### F2 — „Nur freigegebene …"-Fehler in der Nachbarschaft: die neue Zusage stimmt für zurückgezogene Einträge nicht — behoben
**Getan**: PC.3 (Status *zurückgezogen*) geöffnet.
**Erwartet**: eine Aussage, die die Anwendung einhält.
**Passiert**: die Freigabekarte sagte

> „Noch nicht freigegeben. Übernehmen lässt sich der Eintrag trotzdem — die
> Anmerkung am Rand weist beim Einfügen darauf hin."

Das ist für einen zurückgezogenen Eintrag falsch. Beide Wege, über die ein
Eintrag in eine Stellungnahme kommt, schliessen ihn ausdrücklich aus:
`ladeVerwendbareEintraege` (`src/stellungnahme/abfragen.ts:35`) und
`sucheInBibliothek` (ebd. Zeile 87) filtern beide mit
`ne(eintrag.status, 'zurueckgezogen')`. Der Eintrag wird also weder
vorgeschlagen noch von der Suche in der Randspalte gefunden — er ist der
einzige, der wirklich nicht übernehmbar ist. Der gerade behobene Fehler war
also in sein Gegenteil überkorrigiert worden.
Behoben in `freigabeleiste.tsx`: eigener Text für *zurückgezogen*.

### F3 — Sackgasse: aus „Zurückgezogen" (und aus „In Prüfung") führte kein Weg zurück — behoben
**Getan**: PC.2 auf *zurückgezogen* gesetzt und alle sichtbaren Knöpfe gedrückt.
**Erwartet**: ein Weg zurück auf den Anfangsstand.
**Passiert**: im Zustand *zurückgezogen* stand **ein einziger** Knopf da,
„Freigeben". „Zur Prüfung" und „Zurückziehen" waren weg. Der einzige Ausgang
war damit der Sprung direkt auf *freigegeben* — an der Prüfung vorbei.
Bei PC.3 war auch dieser Ausgang zu: „Freigeben" war wegen der offenen
Fundstelle gesperrt, die Karte zeigte nur `["Freigeben [gesperrt]"]`. Aus
diesem Zustand kam man nur noch heraus, indem man die Fundstelle bestätigte
oder löschte — beides ausserhalb der Freigabekarte.

Die Sackgasse ist verschlossen, sobald einer dieser Punkte zutrifft:
- Der Benutzer hat die Rolle `ersteller`: „Freigeben" ist dauerhaft gesperrt
  (`darfFreigeben` falsch), und ein anderer Knopf existiert nicht — der Eintrag
  ist für ihn endgültig eingefroren.
- Der Eintrag hat weder Gegenargument noch Vorgehen: `gebeFrei`
  (`src/bibliothek/aktionen.ts:28`) weist ihn ab — auch ein Administrator
  kommt nicht mehr heraus.

Zusätzlich war *In Prüfung* eine halbe Sackgasse: dort gab es nur „Freigeben"
und „Zurückziehen", keinen Rückweg auf *Entwurf*.
Behoben in `freigabeleiste.tsx`: Knopf „Zurück auf Entwurf" in beiden
Zuständen; er benutzt die vorhandene Aktion `setzeStatus(id, 'entwurf')`.
Nachgemessen: die volle Kette Entwurf → Prüfung → Freigabe → Rücknahme →
Zurückziehen → Entwurf läuft jetzt in beide Richtungen, sofort und nach Neuladen.

### F4 — „Die Freigabe bleibt bis dahin gesperrt" stand unter einem freigegebenen Eintrag — behoben
**Getan**: PC.1 geöffnet (freigegeben, 2 unbestätigte Fundstellen).
**Erwartet**: keine widersprüchlichen Sätze.
**Passiert**: die Freigabekarte zeigte direkt untereinander

> „Dieser Eintrag ist gesichtet und freigegeben."
> „2 Fundstellen noch nicht bestätigt. Die Freigabe bleibt bis dahin gesperrt."

Der zweite Satz ist falsch: gesperrt ist nichts, der Eintrag *ist* freigegeben.
Der Zustand ist im Betrieb erreichbar — `gebeFrei` prüft die Fundstellen nur im
Augenblick der Freigabe; eine später ergänzte Fundstelle erzeugt genau diese
Lage.
Behoben in `freigabeleiste.tsx`: bei einem freigegebenen Eintrag sagt der
Kasten jetzt, was wirklich gilt („Die Freigabe steht trotzdem — sie stammt von
vorher. Einmal zurückgenommen, wäre sie bis zur Prüfung gesperrt.").

### F5 — „Keine — der Text ist ohne Anpassung verwendbar", obwohl zwei Platzhalter im Text stehen — behoben
**Getan**: PC.2 geöffnet. Im Gegenargument steht sichtbar
„Am Fahrzeug **[Kennzeichen]** ist die Beilackierung von **[Bauteil]** …".
**Erwartet**: beide Platzhalter in der Randspalte „Einzusetzende Werte".
**Passiert**: die Karte meldete

> „Keine — der Text ist ohne Anpassung verwendbar."

Die Karte las ausschliesslich die Tabelle `eintrag_platzhalter`; für diesen
Eintrag steht dort nichts (nachgezählt: 0 Zeilen für alle drei PC-Einträge).
Der Satz ist damit eine Zusage, die die Anwendung nicht hält: der Export
sperrt genau an diesen Klammern (`src/export/waechter.ts:78`, Schwere
`sperrt`), und die Randspalte beim Einfügen meldet sie ebenfalls als offen.
Behoben in `page.tsx`: die sichtbaren Texte (typische Begründung,
Gegenargument, Vorgehen, Varianten, Ergänzungen) werden zusätzlich selbst nach
`[…]` abgesucht — mit der bereits vorhandenen, unveränderten Funktion
`setzeWerteEin` aus `src/dokument/platzhalter.ts`. Nachgemessen: PC.2 zeigt
jetzt `[Kennzeichen] [Bauteil]` samt Folgehinweis; PC.1 und PC.3 melden
weiterhin korrekt „Keine".

### F6 — Fundstellenkarte behauptete „noch nicht bestätigt", auch wenn alle bestätigt waren — behoben
**Getan**: bei PC.1 beide Fundstellen bestätigt.
**Erwartet**: der Einleitungssatz passt sich an.
**Passiert**: unter der Überschrift „Fundstellen (2)" stand weiterhin

> „Aus dem Text erkannt und noch nicht bestätigt. Unbestätigte Fundstellen
> sperren die Freigabe."

— während beide Zeilen darunter die Marke „bestätigt" trugen und die Sperre
gefallen war. Der Satz widersprach der Liste unter ihm.
Behoben in `beleg-pruefung.tsx`: der Satz zählt jetzt („1 von 2 noch nicht
bestätigt …") beziehungsweise meldet „Alle bestätigt".

### F7 — Leeres Gegenargument (PC.3) erschien als gar nichts — behoben
**Getan**: PC.3 geöffnet.
**Erwartet**: erkennbar, ob ein Gegenargument fehlt oder nur nicht angezeigt wird.
**Passiert**: **gar nichts** — kein Kasten, keine Überschrift, kein Hinweis.
Die Seite sprang von der typischen Begründung direkt zum Vorgehen. Für den
Leser ist nicht unterscheidbar, ob dieser Eintrag kein Gegenargument hat oder
ob die Seite eines verschluckt. Zudem verdeckt das den entscheidenden Umstand,
dass dieser Eintrag keinen übernehmbaren Text liefert.
Behoben in `page.tsx`: der Block bleibt stehen und sagt „Kein ausformulierter
Text hinterlegt." — mit Verweis auf das Vorgehen, wenn eines da ist, sonst mit
dem Satz, dass sich hier nichts übernehmen lässt.

### F8 — Rohe Datenbankwerte in der Herkunftskarte — behoben
**Getan**: Herkunftskarte aller drei Einträge gelesen.
**Erwartet**: lesbaren Text.
**Passiert**: „Angelegt: manuell". Übersetzt war nur `migration`; die übrigen
Werte des Enums (`src/db/schema.ts:42`) fielen roh durch — bei einem
KI-Vorschlag hätte dort „ki_vorschlag" gestanden, bei Übernahme aus einem
Schreiben „aus_stellungnahme". Ausserdem liest sich die Beschriftung
„Angelegt" wie ein Datum, meint aber die Herkunft.
Behoben in `page.tsx`: vollständige Übersetzungstabelle, Beschriftung
„Angelegt durch".

### F9 — Nicht-gefunden-Seite war englisch und ohne Rückweg — behoben
**Getan**: `/bibliothek/00000000-0000-0000-0000-000000000000` aufgerufen.
**Erwartet**: deutsche „nicht gefunden"-Seite.
**Passiert**: HTTP 404 — richtig —, aber im Inhaltsbereich stand die
Vorgabeseite von Next.js: „404 This page could not be found." Mitten in einer
durchgehend deutschen Anwendung, ohne einen Weg zurück zur Bibliothek.
Behoben: neue Datei `src/app/(app)/bibliothek/[id]/not-found.tsx` mit
deutscher Meldung und zwei Rückwegen. Greift jetzt für beide Fälle (unbekannte
UUID und unsinnige Kennung).

---

## Ungünstig

### U1 — „Entfernen" löscht sofort, endgültig und öffnet damit die Freigabe
Bei PC.3 hob ein einziger Klick auf „Entfernen" die einzige unbestätigte
Fundstelle auf — ohne Rückfrage, ohne Rückmeldung, ohne Rückgängig
(`verwerfeBeleg`, `src/bibliothek/aktionen.ts:89`, ist ein hartes `delete`).
Unmittelbare Nebenwirkung: die Freigabesperre fiel. Löschen ist damit der
schnellere Weg an der Prüfung vorbei als Prüfen. Die Karte sagt das nirgends.
Nicht geändert, weil eine Rückfrage die Bedienung spürbar verändert und das
Löschen selbst ausserhalb meiner Dateien liegt — Vorschlag: Rückfrage vor dem
Löschen, oder statt Löschen ein Verwerfen mit sichtbarer, umkehrbarer Marke.

### U2 — Die Fundstellenkarte verbirgt genau das, was man zum Prüfen braucht
Angezeigt werden nur Gericht und Aktenzeichen. In der Datenbank stehen zu
jeder Fundstelle zusätzlich `datum`, `fundstelle` (die vollständige
Zitierform, hier „LG Musterstadt, Urteil vom 01.03.2025 – 1 O 100/24") und
`kernaussage` („Der Abzug war nicht gerechtfertigt.") — sie werden mit
`ladeEintrag` geladen, aber nirgends gezeigt. Wer bestätigen soll, sieht nicht,
*was* er bestätigt. Der Kommentar über der Komponente nennt genau dieses Ziel
(„eine Fundstelle zu bestätigen soll Sekunden dauern"). Nicht geändert, weil es
eine Erweiterung und keine Fehlerbehebung ist; die Daten lägen bereits vor.

### U3 — Eine Bestätigung lässt sich nicht zurücknehmen
Nach „Bestätigen" verschwinden Knöpfe **und** Suchlinks der Zeile; es bleibt nur
die Marke „bestätigt". Wer sich vertippt hat, kann die Bestätigung nicht mehr
lösen — der einzige Ausweg ist „Entfernen", also Löschen. Eine falsch
bestätigte Fundstelle geht so still in den Export.

### U4 — „dejure" zeigt auf die Normensuche, nicht auf die Rechtsprechung
Der Link lautet
`https://dejure.org/dienste/lexsuche?Suchbegriff=LG+Musterstadt+1+O+100/24`.
`lexsuche` ist bei dejure.org die Suche nach Gesetzestexten/Normen; ein Gericht
mit Aktenzeichen ist dort das falsche Suchgut. Für Entscheidungen ist der
Rechtsprechungsdienst der passende Einstieg. Nicht geändert, weil ich die
Adresse gemäss Auftrag nicht aufrufen und damit nicht belegen konnte — bitte
einmal von Hand gegenprüfen.

### U5 — Wer freigegeben hat, steht nirgends
Die Karte sagt „Dieser Eintrag ist gesichtet und freigegeben", nennt aber weder
Person noch Datum. Beides steht in der Datenbank (`freigegebenVon`,
`freigegebenAm`) und wird von `ladeEintrag` mitgeladen. Für ein Gütesiegel, an
dem die Exportfreigabe hängt, ist das dünn. Nicht geändert: die Karte hätte nur
die Benutzer-Kennung, nicht den Namen — dafür müsste `ladeEintrag`
(`src/bibliothek/abfragen.ts:137`) einen Verbund auf `benutzer` mitnehmen, und
diese Datei darf ich nicht ändern.

### U6 — Die Rückmeldung bleibt stehen, auch wenn sie nicht mehr gilt
Nach „Zur Prüfung" steht „Status geändert." unter den Knöpfen. Drückt man
danach „Freigeben", bleibt die alte Meldung sichtbar, bis die neue kommt. Beim
Neuladen ist sie weg. Harmlos, aber für einen Augenblick zeigt die Karte einen
Satz, der sich auf einen anderen Vorgang bezieht.

---

## Geändert

Alle Änderungen liegen in `src/app/(app)/bibliothek/[id]/`.
`pnpm typecheck` läuft sauber. Kein `build`, kein `vitest`, kein `commit`.

| Datei | Was | Warum |
|---|---|---|
| `page.tsx` | UUID-Muster geprüft, sonst `notFound()` | F1: `/bibliothek/unfug` erzeugte HTTP 500 |
| `page.tsx` | Platzhalter zusätzlich aus dem sichtbaren Text gelesen (`setzeWerteEin(text, {})`), Karte listet sie und nennt die Folge | F5: Karte behauptete „ohne Anpassung verwendbar", obwohl `[Kennzeichen]`/`[Bauteil]` im Text stehen und den Export sperren |
| `page.tsx` | Leeres Gegenargument bekommt einen benannten Hinweis statt zu verschwinden | F7 |
| `page.tsx` | Herkunftswerte vollständig übersetzt, Beschriftung „Angelegt durch" | F8 |
| `freigabeleiste.tsx` | Eigener, zutreffender Text für *zurückgezogen* | F2: zurückgezogene Einträge sind als einzige wirklich nicht übernehmbar |
| `freigabeleiste.tsx` | Sperrhinweis unterscheidet freigegeben / nicht freigegeben | F4: „bleibt gesperrt" unter einem freigegebenen Eintrag |
| `freigabeleiste.tsx` | Knopf „Zurück auf Entwurf" bei *In Prüfung* und *Zurückgezogen* (nutzt die vorhandene Aktion `setzeStatus`) | F3: Sackgasse |
| `freigabeleiste.tsx` | Rollentext und Knopf-Titel nennen „Freigeber" **oder** „Administrator" und sagen, dass die übrigen Schritte jedem offenstehen | Der alte Text war unvollständig: `verlangeFreigeber` lässt beide Rollen zu |
| `beleg-pruefung.tsx` | Einleitungssatz zählt die tatsächlich offenen Fundstellen | F6 |
| `not-found.tsx` *(neu)* | Deutsche „nicht gefunden"-Seite mit Rückweg | F9 |

---

## Offen

Alles Folgende liegt ausserhalb von `src/app/(app)/bibliothek/[id]/**` und
wurde deshalb **nicht** geändert.

### O1 — Statuswechsel prüfen keine Rolle: `src/bibliothek/aktionen.ts:64–76`
`setzeStatus` ruft nur `verlangeBenutzer()`. Damit kann jeder angemeldete
Benutzer — auch die Rolle `ersteller` — eine Freigabe zurücknehmen
(„Freigabe zurücknehmen" setzt auf `entwurf`) oder einen freigegebenen Eintrag
zurückziehen. Die Freigabe selbst ist über `verlangeFreigeber` geschützt und im
Kommentar über `gebeFrei` ausdrücklich als rollenpflichtig beschrieben (Konzept
E5); ihre Rücknahme ist es nicht. Da die Oberfläche „Freigabe zurücknehmen" und
„Zurückziehen" jedem zeigt, ist das über die Seite auch erreichbar.
**Vorschlag**: `setzeStatus` gegen `verlangeFreigeber()` absichern, zumindest
für den Übergang *aus* `freigegeben` heraus — und den Knopf entsprechend
sperren.

### O2 — Freigabe-Rücknahme löscht die Historie: `src/bibliothek/aktionen.ts:71`
`setzeStatus` setzt bei **jedem** Wechsel `freigegebenVon: null,
freigegebenAm: null`. Auch beim harmlosen Weg Entwurf → „Zur Prüfung" ist die
Angabe, wer den Eintrag einmal freigegeben hatte, danach unwiederbringlich weg.
**Vorschlag**: die Felder nur beim Übergang aus `freigegeben` heraus leeren,
oder besser gar nicht und stattdessen den Status als alleinige Wahrheit führen.

### O3 — `gebeFrei` liest die Fundstellen zweimal: `src/bibliothek/aktionen.ts:32–41`
Die erste Abfrage holt nur die Kennungen, um dann bei einem Treffer dieselbe
Tabelle **noch einmal** vollständig zu lesen und im Speicher zu filtern. Eine
Abfrage mit `and(eq(beleg.eintragId, id), isNull(beleg.verifiziertAm))` und
`count()` täte dasselbe. Kein Fehler, nur unnötig.

### O4 — Fundstellen und Platzhalter der Probedaten
`scripts/probedaten.ts` legt zu PC.2 keine Zeilen in `eintrag_platzhalter` an,
obwohl der Text zwei Platzhalter enthält. Das hat F5 sichtbar gemacht und ist
insofern nützlich; für die Probe selbst wäre es aber genauer, wenn das Skript
die Platzhalter mitschriebe — dann liesse sich zusätzlich prüfen, ob Tabelle
und Text auseinanderlaufen. Ausserdem steht PC.1 auf `freigegeben`, obwohl
beide Fundstellen unbestätigt sind; ein Zustand, den `gebeFrei` nie erzeugen
würde. Er ist im Betrieb zwar erreichbar (Fundstelle nach der Freigabe
ergänzt) — dass die Probedaten ihn direkt herstellen, sollte man wissen.

### O5 — Keine allgemeine Fehler- oder Nichtgefunden-Seite
`src/app/` enthält weder `not-found.tsx` noch `error.tsx` auf einer höheren
Ebene. Ich habe die Seite für `/bibliothek/[id]` angelegt; alle übrigen
Adressen (etwa `/bibliothek/<id>/unterseite`, geprüft) zeigen weiterhin
„404 This page could not be found" auf Englisch. **Vorschlag**: je eine
`not-found.tsx` und `error.tsx` in `src/app/(app)/`.
