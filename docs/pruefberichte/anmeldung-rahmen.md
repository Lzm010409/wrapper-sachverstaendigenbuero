# Bericht: /anmelden und Rahmen (Menü, Kopfleiste, Erscheinungsschalter, Zugriffsschutz)

Prüfer-Präfix **PA**. Anwendung: http://localhost:3000 (laufender Entwicklungsbetrieb).
Browser: Playwright/Chromium. Jeder Punkt mindestens zweimal, datenbezogene Punkte
mit allen drei PA-Datensätzen je Bereich.

Verwendete PA-Datensätze:

| Bereich | Id | Bezeichnung |
|---|---|---|
| Stellungnahme | `8c74e73d-b67d-4fcb-8239-52dc4fd3bba1` | PA B — drei Positionen, vollständig |
| Stellungnahme | `e163a0ae-505e-4283-bc03-6ea4b3a00776` | PA C — zwölf Positionen, versendet |
| Stellungnahme | `116ff111-e277-4c24-96d7-a3a1b6559018` | PA A — leer, ohne Positionen |
| Fall | `14990b3e-debb-4d47-9399-f7f9705eecdd` | PA-0726/2011TG |
| Fall | `fd061460-e9c2-4c17-9d68-4e2265562e56` | PA-ohne-Angaben |
| Fall | `ecb530f3-bd6f-4e63-a55f-47e10c84cc32` | PA-kaputt |
| Eintrag | `9a664f16-7202-47b6-b467-387c793d704c` | PA Freigegeben mit Varianten |
| Eintrag | `016d047b-b99c-4043-a4b8-de6259f8f5be` | PA Entwurf mit Platzhaltern |
| Eintrag | `6bf896e7-09cd-43b6-bf8d-691bd3d23731` | PA Zurückgezogen ohne Gegenargument |
| Bild | `9b88583d-202f-4506-a59a-a3877e780a0a` | PA-in-bibliothek.png |
| Bild | `dfb6c9be-0fc2-472a-983d-46d08c7a9c82` | PA-aus-schreiben.png |
| Bild | `6a4c29fd-a3c8-4d02-8198-153646582f16` | PA-ohne-themen.png |

Bildschirmfotos liegen unter
`/tmp/claude-0/-home-user-Stellungnahme-webapp/3e1f4126-cac6-554e-9e18-41bfc8888b4d/scratchpad/schuesse/`.

---

## Geprüft

### 1. Anmeldung (je zwei Runden, jede Runde in frischem Browserkontext)

| Eingabe | Erwartet | Beobachtet |
|---|---|---|
| richtiges Passwort | Anmeldung, Weiterleitung | → `/bibliothek`, Sitzungskeks gesetzt (`httpOnly=true`, `sameSite=Lax`, `secure=false` — auf `http://localhost` korrekt, siehe `nurUeberHttps()`) |
| falsches Passwort (`FalschesPasswort!99`) | Meldung, bleibt auf /anmelden | bleibt auf `/anmelden`, Meldung „Adresse oder Passwort stimmen nicht.", **kein** Keks |
| E-Mail in Grossbuchstaben `LGOLLENSTEDE@…` | Anmeldung soll unabhängig von Gross/Klein gehen | **funktioniert**, → `/bibliothek`, Keks gesetzt. Beide Runden. |
| E-Mail mit Leerzeichen aussen (`"  lgollenstede@…  "`) | toleriert | funktioniert, → `/bibliothek` |
| Passwort mit Sonderzeichen (`Sönder!"§$%&/()=?…😀`) | saubere Abweisung | bleibt auf `/anmelden`, dieselbe Meldung, kein Absturz, kein Serverfehler |
| Passwort mit 500 Zeichen | saubere Abweisung | bleibt auf `/anmelden`, dieselbe Meldung, kein Absturz |
| E-Mail mit 500 Zeichen | saubere Abweisung | bleibt auf `/anmelden`, dieselbe Meldung, kein Absturz |
| leere Eingabe | HTML-Prüfung greift | greift: Formular wird nicht abgeschickt, Adresse bleibt `/anmelden`, `#email.checkValidity()===false`, Fokus springt auf `#email` |
| nur E-Mail gefüllt | HTML-Prüfung greift | greift, `#passwort.checkValidity()===false` |
| `keine-mail` als Adresse | HTML-Prüfung greift | greift, `#email.checkValidity()===false` (`type="email"`) |

**Knopf während der Prüfung**: in 13 von 14 Versuchen eingefangen —
vorher `{"text":"Anmelden","gesperrt":false}`, während
`{"text":"Wird geprüft …","gesperrt":true}`, danach wieder „Anmelden"
(bzw. auf `/bibliothek` der Abmelden-Knopf). Sperre **und** Textwechsel
funktionieren. (Der eine nicht eingefangene Fall war ein Messproblem meines
Skripts, nicht der Anwendung: die Abweisung kam schneller als mein 25-ms-Takt.)

Die Fehlermeldung ist für „Konto gibt es nicht" und „Passwort falsch" identisch
(`src/auth/aktionen.ts:42`) — das ist bewusst so und richtig.

### 2. Zugriffsschutz (zwei Durchgänge, je frischer Kontext ohne Kekse)

Alle Seiten leiten nach `/anmelden` um, **kein** Datenleck, **keine** Fehlerseite.
Geprüft wurde der ausgelieferte HTML-Text auf die Zeichenfolgen `PA A`, `PA B`,
`PA C`, `PA-0726`, `PA Freigegeben`, `PA Entwurf`, `PA Zurück` — kein Treffer.

```
/                                               → /anmelden   kein-leck  ok
/stellungnahmen                                 → /anmelden   kein-leck  ok
/bibliothek                                     → /anmelden   kein-leck  ok
/faelle                                         → /anmelden   kein-leck  ok
/bilder                                         → /anmelden   kein-leck  ok
/stellungnahmen/<PA A|PA B|PA C>  (3 Stück)     → /anmelden   kein-leck  ok
/faelle/<3 PA-Fälle>                            → /anmelden   kein-leck  ok
/bibliothek/<3 PA-Einträge>                     → /anmelden   kein-leck  ok
```

API ohne Anmeldung:

```
/api/bilder/<3 PA-Bild-Ids>   → HTTP 500, Körper leer          ← siehe Fehler 1
/api/bilder            (GET)  → HTTP 405 (nur POST)            ok
/api/stellungnahmen/<id>/ausgabe (GET) → HTTP 405 (nur POST)   ok
```

Nach dem Abmelden mit dem **Zurück-Knopf** auf eine geschützte Seite (zweimal
durchgespielt): landet auf `/anmelden`, die Anmeldemaske ist da, es wird
**keine** zwischengespeicherte geschützte Seite gezeigt. Anschliessendes
Neuladen bleibt auf `/anmelden`; direkte Aufrufe von `/bibliothek`, `/faelle`,
`/bilder` leiten um.

### 3. Nach der Anmeldung (zwei Runden)

- Anmeldung landet auf `/bibliothek`. ✔
- `/anmelden` im angemeldeten Zustand → `/bibliothek` (`src/app/anmelden/page.tsx:23`). ✔
- `/` im angemeldeten Zustand → `/bibliothek` (`src/app/page.tsx:5`). ✔

### 4. Menü (zwei Runden über alle vier Punkte)

| Klick | Adresse | `aria-current="page"` | Kopfleistentitel |
|---|---|---|---|
| Stellungnahmen | `/stellungnahmen` | Stellungnahmen | „Stellungnahmen" |
| Fälle | `/faelle` | Fälle | „Fälle" |
| Argumentbibliothek | `/bibliothek` | Argumentbibliothek | „Argumentbibliothek" |
| Bildbibliothek | `/bilder` | Bildbibliothek | „Bildbibliothek" |

Genau ein Punkt ist jeweils aktiv. Auf Unterseiten bleibt der Oberpunkt aktiv:

- `/bibliothek/9a664f16-…` → aktiv „Argumentbibliothek", Titel „Argumentbibliothek" ✔
- `/stellungnahmen/8c74e73d-…` → aktiv „Stellungnahmen" ✔
- `/faelle/14990b3e-…` → aktiv „Fälle" ✔

Marke: Text „Werkbank", `href="/stellungnahmen"`, landet auf `/stellungnahmen`
(siehe „Ungünstig 1").

### 5. Kopfleiste / Menüschalter

Breiter Schirm (1440×900), vier Klicks: `aria-expanded` und `aria-label`
wandern korrekt mit (`true`/„Menü einklappen" ↔ `false`/„Menü ausklappen"),
das Menü fährt tatsächlich raus und rein (`menueLinks` 30 ↔ −220), der Inhalt
rückt mit (`huelleLinks` 280 ↔ 30). Stand übersteht das Neuladen. Bei
eingeklapptem Menü: kein Querüberlauf (`scrollWidth` 1440 = `innerWidth`),
Inhalt volle Breite, das erste Bedienelement im Inhalt ist nicht verdeckt.

Schmaler Schirm: siehe **Fehler 2 und 3**.

### 6. Erscheinungsschalter

Vier Klicks, Folge stimmt und ist rund:

| Klick | `aria-label` | `data-theme` | localStorage |
|---|---|---|---|
| Start | „Erscheinungsbild: wie das System. …" | (keins) | `null` |
| 1 | „… hell. …" | `light` | `hell` |
| 2 | „… dunkel. …" | `dark` | `dunkel` |
| 3 | „… wie das System. …" | (keins) | `system` |
| 4 | „… hell. …" | `light` | `hell` |

Das `aria-label` sagt jeweils den **aktuellen** Stand und dass ein Klick
weiterschaltet — das stimmt. Der Stand übersteht das Neuladen (auf `dunkel`
gestellt, neu geladen: `data-theme=dark`, kein Aufblitzen der hellen Fassung,
das Kopfskript in `src/app/layout.tsx:17` greift).

**Dunkel-Stichprobe** mit gemessenem Kontrast (WCAG-Verhältnis Schrift zu
nächstem deckenden Hintergrund, Schwelle 3:1) über alle sichtbaren
Textelemente:

| Seite | geprüfte Textelemente | unter 3:1 |
|---|---|---|
| `/bibliothek` | 623 | **0** |
| `/stellungnahmen` | 184 | **0** |
| `/bilder` | 210 | **0** |

Keine weisse Schrift auf weissem Grund, keine unlesbare Stelle. Bildschirmfotos:
`dunkel-bibliothek.png`, `dunkel-stellungnahmen.png`, `dunkel-bilder.png`,
`dunkel-anmelden.png`.

### 7. Abmelden (zweimal)

Beide Runden: Knopf im Menüfuss → `/anmelden`, Sitzungskeks **weg**
(auch serverseitig gelöscht, `beendeSitzung()` löscht die Zeile). Danach ist
keine geschützte Seite mehr erreichbar (`/bibliothek`, `/faelle`, `/bilder`
→ `/anmelden`), auch nicht über den Zurück-Knopf.

### 8. Schmaler Schirm

900×800 und 380×760, je zwei Runden. Kein Querüberlauf bei 900px auf allen vier
Bereichen. Bei 380px: `/stellungnahmen` und `/bilder` sauber, `/bibliothek` und
`/faelle` laufen aus dem Bild (siehe **Fehler 4**, ausserhalb meiner Dateien).
Menüverhalten auf schmalem Schirm: **Fehler 2 und 3**.

---

## Fehler

### Fehler 1 — `/api/bilder/<id>` antwortet ohne Anmeldung mit HTTP 500 statt einer sauberen Abweisung

**Datei**: `src/app/api/bilder/[id]/route.ts:15` (*ausserhalb meiner Dateien —
nicht geändert*)

**Was ich tat**: In einem frischen Browserkontext ohne Kekse alle drei PA-Bilder
abgerufen, zweimal durchgespielt.

**Erwartet**: Umleitung nach `/anmelden` oder eine saubere Abweisung
(401/403) — laut Auftrag ausdrücklich „keine Serverfehlerseite".

**Passiert**: HTTP **500** mit leerem Körper, in allen sechs Versuchen.

```
/api/bilder/9b88583d-202f-4506-a59a-a3877e780a0a  http=500  laenge=0
/api/bilder/dfb6c9be-0fc2-472a-983d-46d08c7a9c82  http=500  laenge=0
/api/bilder/6a4c29fd-a3c8-4d02-8198-153646582f16  http=500  laenge=0
```

**Ursache**: Die Route ruft `await verlangeBenutzer()` auf. `verlangeBenutzer()`
(`src/auth/sitzung.ts:97-101`) wirft bei fehlender Anmeldung ein blankes
`new Error('Nicht angemeldet.')`. Ein geworfener Fehler in einem Route Handler
wird von Next.js zu einem 500 — nicht zu einer Abweisung.

Immerhin: **kein Datenleck** (Körper leer, kein Bild). Es ist ein Meldungs- und
Sauberkeitsfehler, kein Sicherheitsloch. Er verrät aber über den Statuscode auch
nichts Falsches — er sagt nur „bei mir ist etwas kaputt", wo „du bist nicht
angemeldet" richtig wäre. In den Serverprotokollen erzeugt jedes eingebettete
Bild einer abgelaufenen Sitzung einen Fehlereintrag.

**Vorschlag** (`src/app/api/bilder/[id]/route.ts`, ab Zeile 15):

```ts
import { aktuellerBenutzer } from '@/auth/sitzung'
// …
const benutzer = await aktuellerBenutzer()
if (!benutzer) return new Response('Nicht angemeldet', { status: 401 })
```

Dieselbe Stelle ist in `src/app/api/bilder/route.ts` und
`src/app/api/stellungnahmen/**` zu prüfen — dort konnte ich es per GET nicht
auslösen (die Routen antworten auf GET mit 405), das Muster
`await verlangeBenutzer()` ohne Abfangen ist dort aber dasselbe.

---

### Fehler 2 — Der Menüschalter behauptete auf schmalen Schirmen, das Menü sei offen, während es zugeklappt war (BEHOBEN)

**Datei**: `src/app/teile/kopfleiste.tsx` — *in meinen Dateien, geändert*

**Was ich tat**: Sichtfenster auf 900×800 bzw. 380×760, angemeldet, den Stand
des Schalters mit der tatsächlichen Lage des Menüs verglichen
(`getBoundingClientRect()` gegen die Kante der Schiene).

**Erwartet**: `aria-expanded` und die Beschriftung beschreiben, was zu sehen ist.

**Passiert** (vor der Behebung, an beiden Breiten, je zweimal):

```
frisch angemeldet: aria-expanded="true"  label="Menü einklappen"
                   body="(keine)"  MENÜ-WIRKLICH-SICHTBAR=false  menueLinks=-220
Klick 1:           aria-expanded="false" label="Menü ausklappen"
                   body="menue-zu"       MENÜ-WIRKLICH-SICHTBAR=false
Klick 2:           aria-expanded="true"  label="Menü einklappen"
                   body="menue-auf"      MENÜ-WIRKLICH-SICHTBAR=true
```

Der Schalter sagte beim ersten Aufruf „Menü einklappen" und meldete
`aria-expanded="true"`, obwohl das Menü bei `left: -220px` stand — für eine
Vorlesehilfe eine glatte Falschauskunft. Und der **erste Klick tat nichts
Sichtbares**: er klappte ein bereits eingeklapptes Menü ein. Man musste
zweimal drücken, um das Menü zu öffnen.

**Ursache**: `useState(true)` als Startwert, und der Aufsetz-Effekt behandelte
nur den Fall `gespeichert === 'zu'`. Unterhalb von 900px ist das Menü im
Stylesheet aber von Haus aus weggeschoben (`globals.css:351-362`) und wird erst
durch `body.menue-auf` sichtbar — diese Klasse setzte niemand beim Aufsetzen.

**Zweiter Teil desselben Fehlers**: Der gemerkte Stand `auf` wurde nie
wiederhergestellt. `localStorage['werkbank-menue'] = 'auf'` gesetzt, neu
geladen → `body="(keine)"`, Menü unsichtbar, Schalter meldete trotzdem
`aria-expanded="true"`. Auch das an beiden Breiten reproduziert.

**Behoben**: siehe „Geändert".

---

### Fehler 3 — Auf schmalen Schirmen liess sich das geöffnete Menü nicht wieder schliessen (BEHOBEN)

**Datei**: `src/app/teile/kopfleiste.tsx` — *in meinen Dateien, geändert*

**Was ich tat**: Bei 900×800 und 380×760 das Menü aufgeklappt, dann versucht,
es über den Menüschalter wieder zu schliessen.

**Erwartet**: Der Schalter schliesst das Menü wieder.

**Passiert**: Der Klick kam nie an. Playwright brach nach 30 s ab:

```
locator.click: Timeout 30000ms exceeded.
  - element is visible, enabled and stable
  - <a class="marke" href="/stellungnahmen">Werkbank</a>
    from <nav class="menue" aria-label="Hauptmenü">…</nav>
    subtree intercepts pointer events
```

Das offene Menü (`z-index: 999`) liegt auf schmalen Schirmen **über** der
Kopfleiste (`z-index: 900`) und verdeckt dabei genau den Knopf, der es
zuklappt. Meine Messung bestätigt es: `SCHALTER-ERREICHBAR=false`,
`wasLiegtAufDemSchalter="A.marke"`.

Verschärfend: Ein Klick auf einen Menüpunkt liess das Menü **offen** stehen.
Nach `Klick auf "Bildbibliothek"` (Adresse wechselte auf `/bilder`):
`MENÜ NOCH OFFEN=true, Schalter erreichbar=false`. Auf dem Telefon heisst das:
Menü öffnen → Eintrag antippen → man steht auf der neuen Seite, das Menü liegt
weiter über dem Inhalt, und der einzige Knopf dagegen liegt darunter. Aus
diesem Zustand kam man nur durch Neuladen der Seite heraus. An beiden Breiten,
je zweimal reproduziert.

**Behoben**: siehe „Geändert".

---

### Fehler 4 — Bei 380px Breite laufen `/faelle` und `/bibliothek` aus dem Bild, und die Aktenzeichen-Spalte überlappt den Nachbartext

**Dateien**: `src/app/(app)/faelle/page.tsx`, `src/app/(app)/bibliothek/page.tsx`
bzw. die Zeilen-Regeln in `src/app/globals.css`
(*ausserhalb meiner Dateien — nicht geändert*)

**Was ich tat**: Sichtfenster 380×760, angemeldet, alle vier Bereiche
aufgerufen und `document.documentElement.scrollWidth` gegen `window.innerWidth`
gemessen.

**Erwartet**: nichts läuft aus dem Bild.

**Passiert**:

```
/bibliothek:     scrollWidth=380 innerWidth=380
                 über den Rand: SPAN.zeile-titel rechts=448, SPAN.zeile-titel rechts=398
/stellungnahmen: scrollWidth=380 innerWidth=380  ueberRand=[]          ok
/faelle:         scrollWidth=433 innerWidth=380  ← QUERÜBERLAUF
                 über den Rand: SPAN.treffer-zahl rechts=433
/bilder:         scrollWidth=380 innerWidth=380  ueberRand=[]          ok
```

Auf `/faelle` scrollt die ganze Seite quer (433 statt 380). Auf `/bibliothek`
ragen Titel über den rechten Rand hinaus (bis 448px) und werden abgeschnitten.

**Zusätzlich, breitenunabhängig**: Die Aktenzeichen-Spalte überlappt den
Nachbartext. Im Bildschirmfoto `schmal-380-faelle.png` steht
`PG-0726/2011TG` quer über „Ohne Anspruchsteller"; in
`dunkel-stellungnahmen.png` (1440px!) verdeckt `PA-0726/2011TG` die Ziffer von
„3 Positionen", so dass dort nur noch „Positionen" lesbar ist. Die Spalte ist
zu schmal für ihren Inhalt und der Umbruch läuft in die Nachbarspalte.

**Vorschlag**: Für die Aktenzeichen-Spalte der Listenzeile eine feste
Mindestbreite oder `overflow-wrap: anywhere` mit eigener Spaltenbreite setzen,
und für `.treffer-zahl` unterhalb von 400px den Umbruch erlauben. Der
Fundort ist die gemeinsame Zeilenregel in `globals.css` (Klassen `.zeile-titel`,
`.treffer-zahl`); ich habe sie nicht angefasst, weil `globals.css` und die
Listenseiten ausserhalb meiner Dateien liegen.

---

## Ungünstig

### Ungünstig 1 — Die Marke „WERKBANK" führt woandershin als die Anmeldung

`src/app/(app)/layout.tsx:29` verlinkt die Marke auf `/stellungnahmen`, die
Anmeldung landet dagegen auf `/bibliothek` (`src/auth/aktionen.ts:49`), ebenso
`/` (`src/app/page.tsx:5`) und `/anmelden` im angemeldeten Zustand
(`src/app/anmelden/page.tsx:23`). Die Marke ist in solchen Oberflächen der Weg
„nach Hause"; drei Wege führen nach `/bibliothek`, der vierte nach
`/stellungnahmen`. Das ist kein Fehler — die Marke sagt nirgends zu, wohin sie
führt —, aber es ist eine Unstimmigkeit, die beim Bedienen stolpern lässt.
Ich habe es **nicht geändert**, weil ich nicht weiss, welches der beiden
Ziele das gewollte Zuhause ist; `layout.tsx` läge in meinen Dateien, die
Entscheidung aber nicht bei mir.

### Ungünstig 2 — Die Anmeldung nennt keinen Weg, wenn das Passwort weg ist

Auf `/anmelden` gibt es keinen Hinweis, was zu tun ist, wenn man sein Passwort
vergessen hat — kein Link, kein Satz, keine Adresse. Bei falschem Passwort
kommt nur „Adresse oder Passwort stimmen nicht." Für die Microsoft-Anmeldung
existiert ein solcher Verweis („Bitte an die Büroverwaltung wenden"), für die
Passwortanmeldung nicht. Nicht geändert: das ist eine inhaltliche Zusage über
einen Vorgang (wer setzt zurück, wie?), die ich nicht erfinden kann.

### Ungünstig 3 — Der Menüstand wird gemerkt, der Erscheinungsstand auch, aber beide nur im Browser

Beides liegt in `localStorage`. Wer den Rechner wechselt, fängt wieder bei der
Voreinstellung an. Das ist für einen Schalter dieser Art üblich und in
`erscheinung.tsx` auch so kommentiert — ich nenne es nur, damit es nicht als
ungeprüft gilt. Kein Änderungsbedarf.

### Ungünstig 4 — Die Meldungen der HTML-Prüfung erscheinen auf Englisch

Bei leerer Eingabe meldet der Browser „Please fill out this field.", obwohl die
Seite `lang="de"` trägt. Das ist **kein Fehler der Anwendung**: diese Texte
kommen aus der Oberflächensprache des Browsers, nicht aus dem Dokument, und
lassen sich nur durch eigene Prüftexte ersetzen. Ich habe nichts geändert —
eine eigene Prüfschicht wäre mehr Risiko als Gewinn. Für den Fall, dass es
stören sollte, ist die Stelle `src/app/anmelden/formular.tsx:23,28`.

---

## Geändert

### 1. `src/app/teile/kopfleiste.tsx` — Menüstand auf schmalen Schirmen richtiggestellt und Ausweg geschaffen

Behebt **Fehler 2** und **Fehler 3**.

- **Neue Hilfe `wendeAn(offen)`**: setzt jetzt *immer beide* Körperklassen
  (`menue-zu` **und** `menue-auf`). Vorher wurde beim Aufsetzen nur `menue-zu`
  gepflegt, und genau daran hing die Falschauskunft: unterhalb von 900px
  entscheidet `menue-auf` über die Sichtbarkeit, nicht das Fehlen von
  `menue-zu`.
- **Aufsetz-Effekt**: liest die Breite über `matchMedia('(max-width: 900px)')`
  — dieselbe Grenze wie im Stylesheet — und setzt den Startwert danach:
  auf schmalen Schirmen stets zugeklappt, auf breiten der gemerkte Wunsch
  (Voreinstellung offen). Der Startwert wird sofort an den Körper geschrieben,
  so dass Aussage und Anblick von der ersten Sekunde an zusammenpassen.
  *Warum schmal immer zu:* dort deckt das Menü den Inhalt zu; ein Deckel, der
  sich bei jedem Seitenaufruf von selbst wieder auflegt, ist eine Zumutung.
- **Neuer Effekt auf den Pfad**: schliesst das Menü auf schmalen Schirmen nach
  einem Sprung ins Menü. Der erste Lauf wird über ein `useRef` übersprungen,
  damit der Aufsetz-Zustand nicht sofort wieder überschrieben wird.
- **`wechsle()`**: merkt den Stand nur noch auf breiten Schirmen. Das Auf und
  Zu eines Überlagerungs-Deckels auf dem Telefon soll die Ansicht am
  Schreibtisch nicht umstellen.
- **Neue Deckfläche `.menue-deckel`**: wird nur gezeichnet, wenn der Schirm
  schmal **und** das Menü offen ist. `position: fixed`, `z-index: 998` — über
  dem Inhalt, unter dem Menü (999). Ein Klick darauf klappt das Menü zu. Das
  ist der Ausweg aus Fehler 3: der Menüschalter liegt unter dem Menü, aber
  jeder Klick neben das Menü — auch genau auf die Stelle des Schalters —
  trifft nun die Deckfläche und schliesst. Die Fläche trägt `aria-hidden`,
  weil sie nichts zu sagen hat.
  Die Formatierung steht als Inline-Angabe im Baustein, weil `globals.css`
  ausserhalb meiner Dateien liegt.
- Der Rückgabewert ist jetzt ein Fragment (Kopfleiste + Deckfläche) statt nur
  `<header>`. `.huelle` erzeugt keinen Stapelzusammenhang, die feste
  Positionierung greift also gegen das Sichtfenster.

**Nachweis der Behebung** (je zwei Runden bei 380×760, 900×800 und 1440×900;
`stimmigkeit` vergleicht `aria-expanded` mit der gemessenen Lage des Menüs):

```
380x760  frisch angemeldet: aria=false label="Menü ausklappen" body=menue-zu
                            sichtbar=false  AUSSAGE STIMMT  deckel=false
380x760  Klick 1:           aria=true  label="Menü einklappen" body=menue-auf
                            sichtbar=true   AUSSAGE STIMMT  deckel=true
380x760  Klick 2:           aria=false label="Menü ausklappen" body=menue-zu
                            sichtbar=false  AUSSAGE STIMMT  deckel=false
380x760  Klick neben das Menü:  sichtbar=false  AUSSAGE STIMMT
380x760  nach Klick "Bildbibliothek" (/bilder): sichtbar=false  AUSSAGE STIMMT
380x760  nach Neuladen:     aria=false  sichtbar=false  AUSSAGE STIMMT
```

„AUSSAGE STIMMT" in **allen** gemessenen Zuständen, an allen drei Breiten,
auch nach dem Neuladen. Ein Klick genau auf die Stelle des verdeckten
Schalters schliesst das Menü nun zuverlässig und es lässt sich danach wieder
öffnen:

```
380x760 Runde 1: aufgeklappt=true → Klick auf Schalterstelle → offen=false
                 aria=false → erneut aufklappbar=true
380x760 Runde 2: … dasselbe
900x800 Runde 1: … dasselbe
900x800 Runde 2: … dasselbe
```

**Keine Rückschritte** auf dem breiten Schirm: gemerkter Stand über das
Neuladen weiter in Ordnung (zugeklappt → neu geladen → zu; wieder auf → neu
geladen → auf), alle vier Menüpunkte führen an die richtige Adresse, tragen
`aria-current="page"`, der Kopfleistentitel stimmt, und auf der Unterseite
`/bibliothek/9a664f16-…` bleibt „Argumentbibliothek" aktiv.

### 2. `src/app/anmelden/page.tsx` — Schreibfehler in der Fehlermeldung

Zeile 8: „Bitte an die **Bürovewaltung** wenden." → „Bitte an die
**Büroverwaltung** wenden." Der Text erscheint auf `/anmelden?fehler=kein-konto`,
also genau dann, wenn jemand ohnehin schon nicht weiterkommt.

**`pnpm typecheck` läuft nach beiden Änderungen sauber durch.** Kein `build`,
kein `vitest`, kein `commit`, kein `push`. Alle Prüfskripte
(`probe-*.mts`) sind wieder gelöscht.

---

## Offen

1. **Fehler 1** (`/api/bilder/<id>` → HTTP 500 ohne Anmeldung) ist **nicht
   behoben**: `src/app/api/bilder/[id]/route.ts` liegt ausserhalb meiner
   Dateien. Vorschlag steht oben. Dasselbe Muster (`await verlangeBenutzer()`
   ohne Abfangen) steckt in `src/app/api/bilder/route.ts` und
   `src/app/api/stellungnahmen/**`; ich konnte es dort per GET nicht auslösen
   (405), es sollte aber mit den richtigen Verben nachgeprüft werden.

2. **Fehler 4** (Querüberlauf bei 380px auf `/faelle` und `/bibliothek`,
   überlappende Aktenzeichen-Spalte auch auf breitem Schirm) ist **nicht
   behoben**: die Listenseiten und `src/app/globals.css` liegen ausserhalb
   meiner Dateien. Die überlappende Spalte betrifft auch den breiten Schirm
   und sollte von den Prüfern der Listenseiten aufgegriffen werden.

3. **Ungünstig 1** (Marke führt nach `/stellungnahmen`, alles andere nach
   `/bibliothek`) habe ich bewusst offen gelassen — die Datei liegt in meinen
   Dateien, die Entscheidung über das gewollte Zuhause aber nicht bei mir.

4. **Nicht geprüft, weil auf diesem Server nicht eingerichtet**: der ganze
   Microsoft-Entra-Zweig der Anmeldeseite. `istEntraAktiv()` ist ohne
   `ENTRA_*`-Umgebungsvariablen `false`, der Knopf „Mit Microsoft anmelden"
   und der Trenner werden gar nicht gezeichnet. Die Fehlertexte in
   `FEHLERTEXTE` (`src/app/anmelden/page.tsx:6-16`) habe ich nur über
   `?fehler=` gelesen, den echten Ablauf konnte ich nicht auslösen.

5. **Nicht geprüft**: das Verhalten bei abgelaufener Sitzung (14 Tage
   Gültigkeit, `src/auth/sitzung.ts:9`) und bei deaktiviertem Konto
   (`aktiv = false`). Beides hätte einen Eingriff in die Datenbank ausserhalb
   meines Präfixes verlangt — die Benutzertabelle gehört keinem Prüfpräfix,
   und ein umgestelltes `aktiv`-Merkmal hätte den parallel prüfenden Kollegen
   die Anmeldung entzogen.
