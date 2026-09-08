# Architektur und Entscheidungen

Festgehalten, damit spätere Änderungen nicht gegen Gründe laufen, die niemand mehr kennt.
Stand: 07.09.2026.

## Systemgrenzen

| System | Rolle | Zugriff des Wrappers |
| --- | --- | --- |
| autoiXpert | führend für Falldaten **und** Rechnungen | lesend und schreibend (`GET`, `PATCH`, Upload) |
| Pipedrive | führend für den Prozessstatus (Phase, Labels) | nur lesend |
| sevDesk | Buchhaltung, nachgelagert | noch nicht angebunden |
| n8n | Automatisierungsschicht, bleibt Backend | Aufruf vorhandener Webhooks |
| OneDrive | Ablage der Gutachtenordner | über n8n |
| Kleinanzeigen | Vergleichsfahrzeuge für den Wiederbeschaffungswert | lesend, direkt aus dem Cockpit |

**n8n wird nicht ersetzt.** Die 76 vorhandenen Workflows (Sync, Kürzungssync,
Rechnungsworkflow, Postfachwächter, Deal-Index, Kalk-Lernkreislauf) bleiben die
Automatisierung; der Wrapper ist die Oberfläche darüber. Alles andere hieße zwei
Wahrheiten über denselben Fall.

## Der Fall ist der Anker

Alles, was zu einem Vorgang gehört, liegt in den **Reitern des Falls** — so wie in
autoiXpert, wo ein Gutachten seine Reiter trägt und man den Fall nicht verlässt, um
an ihm zu arbeiten.

| Reiter | Inhalt |
| --- | --- |
| Unfall & Beteiligte | Unfalldaten, Schadenhergang, alle Beteiligten |
| Fahrzeug | Basisdaten, Vorschäden |
| Wiederbeschaffungswert | Suchparameter und `params.json` des WBW-Plugins |
| Stellungnahmen | Prüfbericht auswerten, die Schreiben zu diesem Fall |
| Vorgang | Pipedrive-Phase, sevDesk-Verweis, Herkunft, Platzhalter |

Vorher standen Fälle und Stellungnahmen als zwei **gleichrangige Listen** nebeneinander,
und die Verbindung war eine Karte in der Seitenleiste. Wer einen Vorgang bearbeitete,
sprang zwischen zwei Bereichen und legte im Zweifel ein zweites Schreiben zum selben
Fall an.

Was daraus folgt:

- Die **Startseite nach dem Anmelden** ist `/faelle`, nicht mehr `/stellungnahmen`.
- Im Menü steht **Fälle oben**; Argumentbibliothek und Bildbibliothek sind
  fallübergreifende Nachschlagewerke und stehen darunter.
- Der **Rückweg aus einem Schreiben** führt in seinen Fall, nicht in die Liste. Nur ein
  Schreiben ohne Fallzuordnung kehrt in die Übersicht zurück.
- Wird ein Prüfbericht **aus einem Fall heraus** hochgeladen, steht der Fall fest. Das
  Auswahlfeld „Ohne Fallzuordnung" gibt es dort nicht mehr — wer es übersah, legte ein
  Schreiben ohne Fall an.
- `/stellungnahmen` **bleibt** als Übersicht über alle Schreiben: Schreiben ohne Fall
  gibt es weiterhin, und „welche Briefe sind offen" ist eine fallübergreifende Frage.

Der aktive Reiter steht in der Adresse (`?reiter=…`), nicht im Browser: er ist damit
verlinkbar, und der Zurück-Knopf tut, was er soll. Eine unbekannte Angabe fällt auf den
ersten Reiter zurück, statt eine leere Seite zu zeigen.

## Was die autoiXpert-API nicht kann

Aus der abgelegten Dokumentation (`Autoixpert API/`), nachgelesen statt vermutet:

1. **Keine Kalkulationsergebnisse im Gutachten-Objekt.** Reparaturkosten,
   Wiederbeschaffungswert, Restwert und Wertminderung stehen nicht in `GET /reports`;
   die Doku führt sie unter „Zukünftige Erweiterungen". Verfügbar sind stattdessen
   `GET /reports/{id}/vxs` (DAT-XML) und das gerenderte Gutachten-Dokument.
   → **Entscheidung:** Die Zahlen kommen aus dem gerenderten Dokument, nicht aus einer
   eigenen Erfassung. Ergebnisse werden zwischengespeichert, weil die Extraktion
   Sekunden dauert und Geld kostet.

2. **Kosten pro Gutachten.** Lese- und Schreibzugriff werden je Gutachten einmalig
   freigeschaltet und berechnet.
   → **Entscheidung:** Kein Seitenaufruf zieht ungefiltert alle Gutachten. Der Abgleich
   läuft webhookgetrieben; die Liste arbeitet mit engen Filtern und Cursor-Pagination.

3. **Rechnungen sind rein lesend** und laut Doku ist Schreiben nicht geplant.
   → **Entscheidung:** autoiXpert bleibt die führende Rechnungsquelle, sevDesk ist
   Buchhaltung. Der Wrapper legt keine Rechnungen an.

4. **Webhooks liefern nur IDs, ohne Signatur.** Absicherung geht ausschließlich über
   benutzerdefinierte Header.
   → **Entscheidung:** Der Webhook-Endpunkt prüft ein gemeinsames Geheimnis im Header
   und holt das Objekt anschließend aktiv über die API.

5. **`external_id` darf in der URL anstelle der Gutachten-ID stehen.**
   → **Entscheidung:** Das Aktenzeichen (`MMJJ/NNNNKK`, z. B. `0926/2081TG`) ist der
   Generalschlüssel über autoiXpert, Pipedrive (`Autoixpert ID`) und die Ablage.
   Für Altfälle ohne nachgezogene `external_id` bleibt das Feld `token` als Rückfall.

## Abrufregel (Stand: enge Fassung)

Solange der Ausbau läuft, gilt eine bewusst enge Sperre gegen die
autoiXpert-Schnittstelle. Sie steht in `src/lib/autoixpert/abrufregel.ts` und
wirkt im Client, nicht im Aufrufer — eine Regel, an die man sich erinnern muss,
ist keine.

| Regel | Voreinstellung | Lösen über |
| --- | --- | --- |
| nur offene Gutachten | an | `AUTOIXPERT_NUR_OFFENE=false` |
| frühestens angelegt am | `2026-05-01` | `AUTOIXPERT_FRUEHESTENS` |
| schreibende Zugriffe | gesperrt | `AUTOIXPERT_SCHREIBEN=erlaubt` |

Die Listenabfrage setzt die Filter **hinter** den übergebenen Filter, sie sind
also nicht überschreibbar. Der Einzelabruf `/reports/{id}` kennt keine
Filterparameter — dort prüft der Client die Antwort im Nachgang.

## Aktenzeichen: zwei Schreibweisen, zwei Aufgaben

| Feld | Schreibweise | Aufgabe |
| --- | --- | --- |
| `token` | `0926/2081TG` | Anzeige — so steht es im Gutachten |
| `external_id` | `0926_2081TG` | Pfad — der Schrägstrich wäre ein Trennzeichen |

Ältere Fälle haben **keine** `external_id` (belegt an `0826/2069TG`). Für sie
leitet `fallKennungen` den Pfad aus dem `token` ab; findet der direkte Abruf
nichts, sucht `sucheUeberAktenzeichen` in der ohnehin eingeengten Liste.

## Technische Wahl

- **Next.js (App Router) + Tailwind v4.** Serverseitiges Rendern hält die API-Schlüssel
  im Server; die Fallakte ist damit ohne Client-State auskunftsfähig.
- **Betrieb auf Coolify**, eigene Infrastruktur — dieselbe Umgebung wie n8n und der
  Kleinanzeigen-Dienst. Falldaten verlassen das Haus nicht, und lange WBW-Läufe
  laufen nicht in ein Funktionszeitlimit.
- **Anmeldung über Microsoft 365** (offen). Ein Mitarbeiteraustritt sperrt damit
  zugleich den Wrapper; 2FA kommt von Microsoft.
- **PostgreSQL** (offen) — bewusst schmal: Jobs der WBW-Recherche, Zwischenspeicher der
  aus dem Dokument extrahierten Zahlen, Sitzungen, Änderungsprotokoll. **Keine zweite
  Wahrheit über den Fall.**

## Schreibende Zugriffe

Der Wrapper darf in autoiXpert schreiben. Weil ein `PATCH` echte Gutachtendaten
verändert, gilt:

- Immer `PATCH` auf einzelne Felder, nie `PUT` (die Doku rät ausdrücklich davon ab).
- Jede schreibende Aktion bestätigt der Anwender ausdrücklich.
- Jede schreibende Aktion landet im Änderungsprotokoll mit Benutzer, Zeitpunkt,
  Feld, altem und neuem Wert.

## Optik

Nachgebaut aus Screenshots der autoiXpert-Oberfläche vom 07.09.2026 (Gutachtenliste,
Unfall & Beteiligte, Fahrzeugauswahl, Fotos, Kalkulation). Kennzeichnend:

- schmale Icon-Leiste links (56 px), flache helle Kopfzeile (56 px)
- weiße Karten auf hellem Grund, **Schatten statt Rändern**
- Kartenüberschriften zentriert und gesperrt in Großbuchstaben
- Formularfelder **ohne Rahmen, nur Unterstrich**, kleines graues Label darüber
- Blau als einzige Signalfarbe, Beträge grün mit grauem Sekundärwert
- Status als helle Pille mit farbigem Punkt — die Farbe trägt der Punkt, nicht die Fläche

Alles hängt an den Variablen in `src/app/globals.css`. Umgestellt wurde das Aussehen,
nicht das Gerüst: die Variablennamen der Werkbank sind geblieben.

**Was dabei entfallen ist:** die dunkle Zierschiene (30 px) und das Menü daneben
(250 px) sind zu einer 56 px breiten Leiste zusammengefallen; die gewonnenen 224 px
gehören dem Inhalt. Damit entfielen auch der Menüschalter, sein gemerkter Stand, die
Grenze bei 900 px und die Deckfläche für den Klick daneben — eine 56-px-Leiste muss
man nicht wegklappen.

**Ausnahme:** Der Brief bleibt in Serifenschrift. Er soll wie ein Schreiben aussehen
und nicht wie eine Bildschirmmaske. autoiXpert hat dafür kein Gegenstück, also gibt
es auch nichts nachzuahmen.

## Vorgefundene Befunde (nicht durch die Überführung entstanden)

| Befund | Stand |
| --- | --- |
| `pnpm lint` zeigte auf keine Konfiguration und prüfte nie eine Datei | behoben, Flat-Config ergänzt |
| 8 React-Compiler-Befunde (Refs während des Renderns, `setState` im Effekt) im Brief-Editor, der Bildsuchleiste und dem Erscheinungsschalter | auf Warnung gesetzt, **offen** |
| 5 unmaskierte Anführungszeichen im JSX | auf Warnung gesetzt, **offen** |
| `.env.example` nannte die autoiXpert-Basis-URL ohne `/v1` | behoben |
| `loeseAuf` versuchte das Aktenzeichen nie als externe ID und lief in die teure Listensuche | behoben |

Die React-Befunde sind bewusst nicht beiläufig repariert: sie sitzen in verwickeltem,
laufendem Code. Sie gehören in einen eigenen Schritt.

## Kleinanzeigen: ein Dienst weniger

Die Beschaffung der Vergleichsfahrzeuge lief über eine zweite Anwendung auf
Coolify — der Upstream `DanielWTE/ebay-kleinanzeigen-api` hinter einem
Basic-Auth-Vorschalter, mit eigener Domain und eigenem Passwort. Sie ist
aufgelöst; das Cockpit beantwortet dieselben Aufrufe unter
`/api/kleinanzeigen` selbst.

**Die Entscheidung hing an einer Messung, nicht an einer Vorliebe.** Der
ausgelagerte Dienst fährt für jede Seite ein Chromium hoch. Die Begründung
dafür stand in `providers.json`: der direkte Zugriff werde IP-gesperrt. Am
07.09.2026 nachgemessen stimmt das so nicht — ein gewöhnlicher HTTP-Aufruf
ohne Browser, ohne JavaScript und ohne Cookies bekommt dieselben Treffer und
dieselben Merkmalzeilen. Was es wirklich gibt, ist eine Frequenzbremse: HTTP
403 „IP-Bereich vorübergehend gesperrt", die nach einer Pause wieder
durchlässt. Sechs Aufrufe ohne Pause ergaben `403 200 200 403 403 200`,
dieselbe Adresse mit vier Sekunden Abstand dreimal `200`.

Dagegen hilft kein Browser, sondern Zurückhaltung: ein Abruf zur Zeit, ein
Mindestabstand, Wiederholung mit wachsender Wartezeit. Das ist zugleich der
rücksichtsvollere Umgang mit einem fremden Server als der bisherige.

**Die Schnittform bleibt.** Das Plugin spricht weiter gegen `KA_API_BASE`;
diese Adresse zeigt nur woandershin. Wer den ausgelagerten Dienst zurück
will, setzt eine Variable — nachprüfbar, weil der unveränderte Adapter des
Plugins gegen beide Seiten läuft.

**Was hier gelesen wird und was nicht.** Die Detailseite steht noch im alten
Aufbau (`#viewad-details`), die Trefferliste ist auf ein neues Frontend
umgestellt und trägt Klassennamen wie `text-title3 font-strong text-secondary`
— Namen, die sich wieder ändern. Deshalb liest die Auswertung der Liste an der
**Form der Werte** (`210.000 km`, `EZ 03/2009`, `10.999 €`, fünf Ziffern plus
Ortsname) und nicht an CSS-Klassen. Die Selektoren des ausgelagerten Dienstes
greifen dort bereits ins Leere.

## Die DAT-Kalkulation trägt die halbe Vergleichsfahrzeugsuche

Das Gutachten-Objekt der Schnittstelle ist für eine Vergleichsfahrzeugsuche
zu dünn. Am echten Fall 0926/2081TG nebeneinandergelegt:

| Angabe | Gutachten-Objekt | DAT-Kalkulation |
| --- | --- | --- |
| Modell | `E Limousine (BM 213)` | **`E 53 AMG 4Matic+`** |
| Leistung | 320 kW | 320 kW |
| Laufleistung | 147.441 km | 147.441 km |
| Erstzulassung | 2018-10-12 | 2018-10-12 |
| Getriebe | — | **Automatik, 9 Stufen** |
| Türen | — | **4** |
| Ausstattungslinie | — | **AMG-Line** |
| Ausstattung | **kein Feld** | **66 Sonder-, 50 Serienpositionen** |
| Farbe | — | SELENITGRAU |

Die fett gesetzten Zeilen sind der Grund, warum die VXS nicht nur die
Kalkulationszahlen liefert. Das Modell entscheidet über die Brauchbarkeit der
Suche — eine Suche nach der Baureihe mischt 143-kW-Diesel mit einem
320-kW-AMG. Die Ausstattung filtert den Korb hart und musste bis hierher von
Hand eingetippt werden; DAT leitet sie aus der Fahrgestellnummer ab.

**Übersetzt, nicht durchgereicht.** DAT schreibt `Audio-Navigationssystem:
COMAND Online`, das Plugin kennt `navigationssystem`; DAT schreibt `Multibeam
LED`, das Plugin `led_scheinwerfer`. `src/wbw/ausstattung.ts` bildet das auf
den Wortschatz des Plugins ab (`ausstattung-matcher.js`, Objekt `ALIASE`).
Aus 66 Sonderpositionen werden zwölf Merkmale — die übrigen tragen zum
Vergleich nichts bei („Einstiegsleisten beleuchtet", „Kältemittel R 1234 YF")
und fallen weg. Was sich nicht sicher zuordnen lässt, wird nicht behauptet:
`Armaturentafel Oberteil Leder Nappa` ist keine Lederausstattung, eine
`Vorrüstung Entertainment-System` keine Ausstattung.

**Vorrang und Abweichung.** Wo beide Quellen etwas sagen, gilt das Gutachten
— dort steht, was der Sachverständige aufgenommen hat, und die Kalkulation
kann älter sein als die Besichtigung. Sind die Werte verschieden, steht das
als Abweichung in der Oberfläche, statt sich stillschweigend für einen zu
entscheiden.

**Sonder- gegen Serienausstattung.** Vorbelegt wird die Sonderausstattung:
was in der Baureihe Serie ist, hat jedes Vergleichsfahrzeug ohnehin. Die
Serienmerkmale stehen daneben und lassen sich zuschalten — bei Kleinanzeigen,
wo über die ganze Baureihe gesucht wird, unterscheidet Allrad einen E 53 AMG
sehr wohl von einem E 220 d.

## Meldewesen: eine Art, drei Orte

Vorgefunden waren **neun Muster für dieselbe Sache**: ein rohes
`<div class="hinweis fehler">` hier, ein `role="status"` an einer
Fehlermeldung dort, ein Erfolg in Blau (die Farbe `--good` gab es von Anfang
an, eine Meldungsklasse dazu nicht), zwei Tokens in `wbw-lauf.tsx`, die es
nicht gibt — und an einer Stelle wurde die Art **am Text erraten**:

    className={`hinweis ${meldung.match(/sperr|gescheitert|nicht |Konflikt/i) ? 'fehler' : ''}`}

Das ging meistens gut. „Das Bild liess sich **nicht** hochladen" wurde als
Fehler erkannt, „Diese Stelle steht so **nicht** mehr im Brief" auch — und
das war schon Glück. Wer eine Meldung umformuliert, hätte ihre Farbe
geändert.

**Die Regel jetzt:** die Art steht an der Meldung (`src/melden/typen.ts`),
nicht in ihrem Wortlaut. Sie entscheidet über Farbe, über die Rolle für
Hilfsmittel (`alert` bei Fehler und Warnung, sonst `status`) und darüber, ob
eine Einblendung von selbst verschwindet.

**Drei Orte, nach einer Frage sortiert: kann der Benutzer weggesehen haben?**

| Fall | Wo | Warum |
| --- | --- | --- |
| Eingabefehler im Formular | am Feld | Der Fehler gehört dorthin, wo er entstand |
| Ergebnis eines Klicks | dort, wo geklickt wurde | Man sieht ja hin |
| Etwas aus dem Hintergrund | Einblendung oben rechts | Der Blick ist woanders |
| Etwas, das lief, während man weg war | Verlauf hinter der Glocke | Der Blick war ganz woanders |

Fehler und Warnungen bleiben stehen, bis sie weggeklickt werden. Erfolg und
Auskunft verschwinden nach sechs Sekunden — sie sind eine Bestätigung, keine
Aufgabe.

**Warum eine Tabelle für den Hintergrund.** Ein WBW-Lauf braucht Minuten. Wer
ihn angestossen hat, ist längst in einem anderen Reiter oder hat den Rechner
zugeklappt; bis hierher endete so ein Lauf lautlos. `meldung` hält fest, was
fertig oder gescheitert ist, gebunden an den Benutzer, der es angestossen
hat. Die Oberfläche fragt alle zwanzig Sekunden danach — aber nur, solange
der Reiter sichtbar ist.

## Ladeanzeigen: drei Stufen nach Wartegrund

Vorgefunden: **keine einzige `loading.tsx`, kein einziges `<Suspense>`.** Der
Reiter „Vorgang" wartete auf Pipedrive, der Reiter „Kalkulation" auf
autoiXpert — und zwar die **ganze Seite**, Kopf und Reiterleiste
eingeschlossen. Der Klick sah aus, als wäre er ins Leere gegangen.

| Wartezeit auf … | Anzeige | Wo |
| --- | --- | --- |
| eine andere Seite | Platzhalter in der Form der Seite | `loading.tsx` je Bereich |
| einen langsamen Teil der Seite | Platzhalter des Teils | `<Suspense>` um den Teil |
| das Ergebnis eines Klicks | Kreisel im Knopf | `Kreisel` aus `anzeigen.tsx` |

Ein Kreisel sagt „es passiert etwas". Ein Platzhalter sagt zusätzlich „und
zwar hier, und es wird ungefähr so aussehen". Beim Klick auf einen Knopf
reicht das erste — man sieht, wo man geklickt hat. Beim Seiten- oder
Reiterwechsel zählt das zweite.

Die Platzhalter bilden die endgültige Form nach (Kopf, Reiterleiste,
zweispaltiger Reiter; Kacheln mit festem Seitenverhältnis), damit beim
Erscheinen des Inhalts nichts springt.

## Fotos: Vorschaubilder, Lazy Loading, Durchreichen

Am echten Fall 0926/2081TG gemessen (08.09.2026): **67 Fotos**, das Original
je 3,0 MB bei 3000 × 2250, das Vorschaubild 50 KB bei 400 × 300. Alle
Originale wären **200 MB** — für ein Raster, in dem jedes Bild 220 Pixel
breit ist.

Drei Regeln, jede mit einer gemessenen Wirkung:

1. **Im Raster nur Vorschaubilder.** 3,4 MB statt 200 MB.
2. **`loading="lazy"` mit fester Kachelhöhe.** Beim Öffnen wurden **36 von
   67** geholt, 1,5 MB — der Rest erst beim Scrollen. Die feste Höhe
   verhindert, dass das Raster bei jedem eintreffenden Bild springt.
3. **Das Original erst in der Grossansicht**, eines zur Zeit, mit genau einem
   vorgeladenen Nachbarn.

**Speicherbedarf des Servers:** Die Route reicht den Antwortkörper durch,
statt ihn zu puffern. `await antwort.arrayBuffer()` hielte ein 3-MB-Original
vollständig im Arbeitsspeicher; bei zehn gleichzeitigen Abrufen wären das
30 MB, die nur durchlaufen.

**Zwischenspeicher auf der Platte, sieben Tage.** autoiXpert schickt keine
brauchbaren Cache-Angaben (`etag: original` steht an **jedem** Bild, ist also
wertlos; `cache-control` fehlt ganz). Beim zweiten Öffnen des Reiters kamen
alle 36 Vorschaubilder aus dem Speicher und **kein einziger** Abruf ging an
autoiXpert. Abgelegt werden nur Vorschaubilder — Originale füllen jede
Platte, und man sieht sie einzeln an.

**Die Route nimmt die Fall-ID, nicht die autoiXpert-ID.** Sonst wäre sie ein
Fenster zu jedem Gutachten des Büros für jeden Angemeldeten.

## Protokoll: eine Kennung, die den Weg zurückfindet

Vorher: siebzehn `console.error` mit einem handgeschriebenen deutschen Satz.
Keine Stufen, kein Format, keine Kennung — und keine Möglichkeit, aus „bei mir
kam gerade ein Fehler" die passende Zeile zu finden.

**Die Kennung ist der Kern.** Jeder Fehler bekommt eine (`FX6M-KN4X`, acht
Zeichen aus einem Alphabet ohne I/L/O/U/0/1, weil sie am Telefon durchgegeben
wird). Sie steht in der Meldung an den Benutzer und in der Zeile im
Protokoll.

**Zwei Ausgänge, verschiedene Aufgaben.** Der Strom nach stdout ist für den
Betrieb: vollständig, sofort, flüchtig. Die Tabelle `ereignis` ist für die
Nacharbeit: durchsuchbar, sie steht morgen noch da. In sie gehen nur Fehler
und Warnungen — Auskünfte wären das Rauschen, in dem die zwei wichtigen
Zeilen untergehen.

**Geschwärzt wird am Ausgang, nicht an der Aufrufstelle** (`schwaerzen.ts`),
weil man es dort vergisst. Kennzeichen, Fahrgestellnummern, E-Mail-Adressen,
IBANs, Token, lange Hexketten und der Parameterblock einer gescheiterten
Datenbankabfrage gehen nicht hinaus. Was bleibt, ist die Fall-ID: wer den
Fall sehen darf, sieht ihn in der Anwendung.

Drei Dinge, die erst der Betrieb am 08.09.2026 gezeigt hat:

1. **Was niemand abfängt, stand nirgends.** Im Protokoll landete nur, was
   eine Aufrufstelle ausdrücklich meldete — also nie die Fehler, von denen
   niemand wusste, dass sie auftreten können. `onRequestError` in
   `instrumentation.ts` fängt sie jetzt alle ab. Die Brücke zur Fehlerseite
   ist Nexts `digest`: der Benutzer liest ihn ab, die Suche im Protokoll
   findet ihn.
2. **Drizzle hängt die Parameter an jede gescheiterte Abfrage.** Beim
   Ausfall der Datenbank stand deshalb der Hash eines Sitzungstokens im
   Protokoll. Der Parameterblock wird jetzt geschwärzt, die Abfrage selbst
   bleibt stehen — sie sagt, was schiefging, ihre Werte sagen es nicht.
3. **Die Ausgangsliste gehört an `globalThis`, nicht ans Modul.** Next
   bündelt `instrumentation.ts` getrennt vom Anwendungscode; beide bekommen
   eine eigene Instanz. Mit einem modul-lokalen Array meldete der Start die
   Fehlerliste in der einen Instanz an, während jede Meldung aus einer Seite
   durch die andere lief und die Datenbank nie erreichte.

**Die Fehlerseiten stehen gestaffelt.** `src/app/(app)/error.tsx` fängt einen
Fehler *innerhalb* des angemeldeten Bereichs: Schiene, Kopfleiste und Menü
bleiben stehen, ersetzt wird nur der Inhalt. Erst was darüber stolpert,
erreicht die nackte Wurzelseite. Damit das Layout nicht selbst zum
Auslöser wird, ist seine einzige Rechteabfrage — die für den Menüpunkt
„Verwaltung" — gegen Fehler abgesichert: fehlt sie, fehlt der Punkt, nicht
die Anwendung.

## Rechte: die Rolle ist die Voreinstellung, nicht das letzte Wort

Drei Rollen (`ersteller`, `freigeber`, `admin`) und acht Einzelrechte. Die
Rolle bringt einen Satz Rechte mit; eine ausdrückliche Entscheidung je Recht
und Zugang schlägt sie — **in beide Richtungen**. Der dritte Zustand ist der
eigentliche Grund für diesen Aufbau: der Freigeber, dem man das Löschen
abgenommen hat, ohne ihn zum Ersteller zu machen. Ein blosses Häkchen könnte
das nicht.

Welche acht Rechte es sind, entscheidet ein Kriterium: **was ist nicht
rückholbar, kostet Geld oder wirkt nach draussen.**

| Recht | Warum es eines ist |
|---|---|
| `stellungnahme.loeschen`, `bild.loeschen` | Es gibt keinen Papierkorb. |
| `bibliothek.freigeben` | „Freigegeben" ist die Zusage, dass ein Text so hinausgeht. |
| `autoixpert.schreiben` | Wirkt im führenden System, nicht nur hier. |
| `wbw.kostenpflichtig` | Der Recherchelauf greift auf einen kostenpflichtigen Dienst zu. |
| `versand.vermerken` | Eine Aussage über die Aussenwelt und Grundlage für Fristen. |
| `benutzer.verwalten`, `protokoll.lesen` | Die Verwaltung ihrer selbst. |

Alles Übrige ist tägliche Arbeit und braucht kein Recht — ein Rechtekatalog,
der jede Schaltfläche abbildet, wird nicht gepflegt und dann umgangen.

**Ausblenden ist Höflichkeit, Prüfen ist der Schutz.** Ein Knopf, den man
nicht sehen kann, ist keine Sperre: jede Serveraktion ruft `verlangeRecht`
selbst, und jede Ablehnung geht ins Protokoll. Die Verwaltung schützt sich
zusätzlich gegen den Griff ins eigene Knie — der letzte Administrator kann
sich weder herabstufen noch sperren.

## Die WBW-Suche läuft in Stufen, die KI liest den Fliesstext

Eine eng gefasste Suche hat zwei Ausgänge: sie trifft, oder der Lauf war
umsonst. Am 07.09.2026 war es der zweite — `e_53_amg` brachte bei
Kleinanzeigen null E-Klassen, weil das Portal keine Motorvarianten führt.

**Drei Stufen, zwei Dinge getrennt geweitet.**

| Zyklus | Modellname | Toleranzen und Radius |
|---|---|---|
| 1 · eng | genau (`E 53 AMG`) | wie eingestellt |
| 2 · geweitet | Haupttyp (`E 53`) | × 1,5 |
| 3 · weit | Baureihe (`E-Klasse`) | × 2 |

Getrennt, weil ein gröberer Name andere Fahrzeuge hereinholt als eine
weitere Kilometerspanne — im Report soll erkennbar bleiben, was von beidem
gewirkt hat. Aufgehört wird, sobald genug **brauchbare** Fahrzeuge beisammen
sind (Vorgabe acht), nicht nach fester Stufenzahl.

**Der gröbere Name wird nie erfunden.** `stufenFuer` wählt ihn aus der
Modellliste, die das Portal selbst führt. Kennt AutoScout24 kein `E 53`,
läuft Stufe 2 noch einmal mit `E 53 AMG` — zweimal dieselbe Suche ist besser
als eine Suche auf einen Namen, den das Portal stillschweigend fallenlässt
und dafür die ganze Marke liefert. Die Baureihe unterscheidet sich von der
Variante durch die **fehlende Typnummer**, nicht durch die Zeichenlänge:
`GLC 300` ist kürzer als `GLC-Klasse` und trotzdem die engere Suche.

**Die Ausstattung fällt aus der Suchanfrage.** Die Portale führen sie
unvollständig — bei Kleinanzeigen stand sie am 07.09.2026 bei keinem
einzigen Inserat in der Ausstattungsliste, sondern im Beschreibungstext. Wer
danach filtert, wirft die halbe Trefferliste weg und behält die Händler, die
ihre Häkchen pflegen. Gelesen wird sie jetzt von der KI-Prüfung.

**Die Prüfung entscheidet nicht, sie schlägt vor.** Je Inserat: erkannte
Ausstattung, eine Vergleichbarkeit mit einem Satz Begründung,
Auffälligkeiten (Export, Bastler, Unfall, Preisausreisser, Tacho, ohne
Bilder, Händler, Dublette, falsches Modell) und eine Empfehlung. Der Haken
in der Tabelle setzt der Sachverständige — ein Gutachten, dessen
Vergleichskorb ein Modell zusammengestellt hat, wäre im Streitfall nicht zu
vertreten.

Zwei Regeln stehen als Test fest:

1. **Nichts verschwindet.** Scheitert ein Paket oder passt die Antwort nicht
   zum Schema, bekommen seine Inserate `pruefen` ohne Begründung und stehen
   weiter in der Liste. Im Zweifel wegwerfen hiesse, dass ein Netzfehler
   still den Korb ändert.
2. **Zugeordnet wird über die id, nicht über die Reihenfolge.** Ein
   verrutschtes Urteil wäre schlimmer als ein fehlendes: es sieht plausibel
   aus und hängt am falschen Fahrzeug.

**Reports:** je Zyklus und Portal einer als Nachweis der Suchtiefe, dazu der
Gesamtkorb mit den Toleranzen des letzten gelaufenen Zyklus. Für die
Gutachtenanlage aus der Auswahl stehen die Toleranzen **weit offen** — die
Auswahl von Hand *ist* der Filter, und mit den Toleranzen des ersten Zyklus
würfe die Auswertung genau die Fahrzeuge wieder heraus, für die geweitet
wurde. Weicht die Zahl in der Anlage trotzdem von der Auswahl ab, sagt es
die Meldung: eine Gutachtenanlage, die still weniger zeigt als ausgewählt
wurde, ist schlimmer als eine, die gar nicht entsteht.

## Suchen und Filtern: in der Abfrage, in der Adresse

**Gefiltert wird in der Datenbank.** Die Listen schneiden bei hundert Zeilen
ab; ein Filter, der erst im Browser greift, filtert genau diese hundert. Die
Trefferzahl kommt aus einer eigenen Zählung — die Länge der Liste wäre bei
hunderteins schon falsch.

**Der Filterstand steht in der Adresse.** Ein gefilterter Listenstand ist
etwas, das man weiterschickt, als Lesezeichen ablegt und zu dem der
Zurück-Knopf zurückführen muss. Leere Felder werden vor dem Absenden
entfernt: ein GET-Formular schickt jedes Feld mit, und
`?suche=&zustand=&marke=BMW&modell=&baujahr=&von=&bis=` ist als Lesezeichen
unbrauchbar.

**Eine Leiste, drei Listen.** `Filterleiste` trägt Fälle und Stellungnahmen;
die Bibliothek hatte ihre eigene, ältere und bleibt dabei. Vorn stehen zwei
Felder, der Rest liegt hinter „Weitere Filter" — eine Leiste mit acht
Feldern nebeneinander wird nicht gelesen, sondern übersprungen.

**Der Vergleichskorb filtert im Browser** und ist damit die Ausnahme: seine
Zeilen sind vollständig geladen, ein Serverabruf je Klick auf eine
Spaltenüberschrift wäre Wartezeit für eine Sortierung, die schon dasteht.
Der Filter ändert dort die Auswahl nicht — wer nach „nur mit
Auffälligkeit" filtert, sieht weniger Zeilen, die Haken der ausgeblendeten
bleiben gesetzt.

**Das Kennzeichen wird ohne Trennzeichen getippt.** `OLAB4711` findet
`OL-AB 4711`; verglichen wird auf beiden Seiten ohne Trennzeichen.

**Die Suche in der Kopfleiste** trifft Bezeichner und Falldaten über alle
vier Bereiche, je Art höchstens fünf Treffer — ein Begriff, der in fünfzig
Fällen vorkommt, darf die Bibliothekstreffer nicht verdrängen. 250 ms Ruhe
vor der Abfrage, und eine Zählung verwirft späte Antworten auf ältere
Eingaben: sonst überschreibt die langsame Abfrage zu „Kri" die schnelle zu
„Krilavicius".

**Ein Wert aus einem `server-only`-Modul zieht den Postgres-Treiber ins
Browserpaket.** Zweimal an einem Tag gemessen (`wbw/urteil.ts`,
`suche/typen.ts`). Typen allein verschwinden beim Übersetzen, ein Wert nicht
— sobald eine Client-Komponente einen *Wert* braucht, gehört er in eine
Datei ohne Serverabhängigkeiten.

## Belege: was in den Gutachtenordner geht

Der Korb im Cockpit ist eine Arbeitsfläche. Was die Akte braucht, sind
Dokumente — und zwar zwei Arten, die verschiedene Fragen beantworten:

| Art | Wann | Was drinsteht |
|---|---|---|
| **Einzelbeleg** je Fahrzeug | WBW-Vorschlag unter 10.000 € | Das Inserat als Ausdruck: Titel, Preis, km, EZ, Leistung, Getriebe, Kraftstoff, Standort, Ausstattung, Beschreibung, Bilder, Fundstelle, Abrufzeitpunkt |
| **Portalpaket** je Quelle | immer | Dieselben Ausdrucke, nach Portal gebündelt, je Fahrzeug eine Seite |

In beiden stehen **nur die angehakten Fahrzeuge**. Was der Sachverständige
verworfen hat, müsste im Gutachtenordner erklärt werden, und die Erklärung
wäre „das habe ich ausgeschlossen".

**Der Beleg ist ein Beleg, keine Bewertung.** Vergleichbarkeit, Abstand zum
Subjektfahrzeug und das Urteil der Prüfung stehen im Report — ein
Inseratsausdruck, der schon eine Wertung enthält, ist als Beleg weniger
wert. Der Fusszeilensatz („Inseratspreise sind Angebots-, keine
Transaktionspreise") gehört dazu: ohne ihn liest sich das Dokument wie ein
Nachweis über einen erzielten Preis.

**Die Dateinamen werden gelesen, nicht angeklickt.**

    WBW-konkret-130tkm-ez19-panoramadach.pdf
    WBW-autoscout24.pdf

`WBW-konkret` steht wörtlich davor. Danach die drei Angaben, die ein
Fahrzeug im Korb unterscheiden. **Was fehlt, fällt weg** statt durch einen
Platzhalter ersetzt zu werden: `WBW-konkret-ez19.pdf` ist ehrlicher als
`WBW-konkret-0tkm-ez19.pdf`, denn null Kilometer stünden da als Angabe. Zwei
gleiche Namen bekommen `-2`, `-3` — sonst überschriebe der zweite Beleg den
ersten, und im Ordner läge einer weniger als im Korb.

**Gedruckt wird mit Chromium**, nicht mit einer PDF-Bibliothek: der Beleg
soll aussehen wie das, was am Bildschirm steht. Bis zum 08.09.2026 lag im
Abbild gar kein Browser — die PDF-Stufe des Plugins suchte `chrome`,
`chromium` und `msedge`, fand nichts und gab still auf. Zwei Fallen dabei:

1. **Chromium druckt auch, was es nicht findet.** Für eine fehlende Datei
   rendert es seine eigene Fehlerseite, und die ergibt rund 20 KB PDF —
   gross genug, um jede Grössenprüfung zu bestehen. Der Drucker prüft
   deshalb die Vorlage, bevor er startet.
2. **Ein leeres PDF ist keins.** Bricht Chromium den Druck ab, bleibt
   trotzdem eine Datei liegen. Unter 8 KB gilt sie als misslungen.

**Der Weg in den Ordner führt über n8n.** Die Ordnerstruktur — Jahr, Monat,
Aktenzeichen — kennt bereits ein Workflow, den mehrere Anwendungen benutzen
(`Search_Gutachtenordner_OneDrive`). Sie im Cockpit nachzubilden hiesse, sie
an zwei Stellen zu pflegen, und die OneDrive-Zugangsdaten lägen dann auch
hier. Der neue Workflow `WBW_Belege_Upload_OneDrive` nimmt Aktenzeichen und
Dateien, sucht den Ordner und legt sie ab.

Drei Riegel im Workflow, jeder gegen einen Fehler, den man erst hinterher
bemerkt:

- **Findet sich kein Ordner, kommt eine 404 mit Begründung** statt einer
  Zeitüberschreitung. Ohne den eigenen Zweig lieferte der Unterworkflow null
  Elemente, und der Webhook antwortete nie.
- **Jede Datei muss mit `%PDF-` beginnen.** Was das nicht tut, ist kein
  Beleg und soll nicht als einer im Ordner landen.
- **4 MB je Datei** — mehr nimmt OneDrive über diesen Weg nicht, und die
  Meldung des Fehlschlags sagt nichts über die Ursache. Geprüft wird
  deshalb dort, wo der Dateiname noch bekannt ist.

**Hochgeladen wird auf Knopfdruck, nicht beim Übernehmen.** Der Upload wirkt
nach draussen und in ein System, aus dem das Cockpit nichts zurücknehmen
kann; jede Korrektur an der Auswahl würde sonst erneut hochladen, und im
Ordner sammelten sich Zwischenstände. Er verlangt `versand.vermerken` —
dasselbe Recht wie jede andere Handlung, die das Haus verlässt.

## Offene Punkte

- Recherchelauf des WBW-Plugins anschließen (Job-Dienst mit Fortschritt,
  Rückschreiben des Reports als Gutachten-Dokument)
- Alte Kleinanzeigen-Anwendung abschalten, sobald ein vollständiger Lauf über
  den neuen Weg im Alltag durchgelaufen ist
- Kürzungscockpit aus dem vorhandenen Projekt integrieren
- Extraktion der Kalkulationszahlen aus dem gerenderten Gutachten-Dokument
- Anmeldung, Datenbank, Änderungsprotokoll
- Dokumenten- und Versandcockpit
- Die rund vierzig verbliebenen rohen `<div class="hinweis">` auf die
  gemeinsame `Meldung`-Komponente umstellen — sie funktionieren unverändert
  weiter, tragen aber ihre Rolle noch von Hand
- Fotos hochladen (zweistufig über S3-URLs); bisher nur ansehen und
  beschriften
