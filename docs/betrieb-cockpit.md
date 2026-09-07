# Betrieb des Cockpits auf Coolify

Diese Anleitung richtet das **Cockpit** als eigene Anwendung ein — neben der
laufenden Kürzungsabwehr-Werkbank, nicht an ihrer Stelle. Die Werkbank unter
https://werkbank.gollenstede.app bleibt unangetastet, bis das Cockpit sie
vollständig ersetzt und umgeschaltet wird.

Der Betrieb der Werkbank ist in [`betrieb.md`](betrieb.md) beschrieben; das
meiste gilt unverändert, weil das Cockpit aus ihr hervorgegangen ist.

## Es läuft

Angelegt und deployt am 07.09.2026:

| | |
| --- | --- |
| Coolify-Projekt | `Cockpit Sachverstaendigenbuero` (`k10x1nh74v7ky0bjl5d5amft`) |
| Anwendung | `cockpit` (`d4yhrddgg34l4snwrfiqbvdq`) |
| Datenbank | `cockpit-postgres` (`frxy65xrag8n872gab8zqsqi`) — **eigener Bestand**, Weg A |
| Erreichbar | http://d4yhrddgg34l4snwrfiqbvdq.168.231.109.247.sslip.io |
| Zustand | `running:healthy` |
| Repository | `Lzm010409/wrapper-sachverstaendigenbuero`, öffentlich |
| Branch | `claude/autoixpert-wrapper-integration-0in671` |
| Build | Dockerfile, Port 3000, Healthcheck `/api/gesundheit` |
| Startbefehl | steckt im Abbild (`node starten.mjs`), nichts einzutragen |

Belegt am laufenden System: Anmeldung, Argumentbibliothek mit 90 Einträgen,
und ein **echter Fall aus autoiXpert** (`0926/2081TG`) über das Aktenzeichen
geladen, mit gefülltem WBW-Reiter. Keine Browserfehler.

### Eigene Domain

Der DNS-Eintrag für z. B. `cockpit.gollenstede.app` muss wie der der Werkbank
gesetzt werden — beide laufen über Cloudflare:

- **A-Record auf `168.231.109.247`**, über Cloudflare geleitet.

Sobald er aufgelöst wird, in Coolify unter *Domains* eintragen
(`https://cockpit.gollenstede.app`) und danach **`APP_BASIS_URL` auf dieselbe
Adresse setzen** — sie steht in den Umleitungen der Anmeldung. Vorher steht
dort die sslip-Adresse, damit die Anwendung von Anfang an benutzbar ist.

## Was beim Anlegen schiefging — und warum es hier steht

Die ersten beiden Deployments schlugen fehl, **obwohl die Anwendung sauber
hochkam**. Im Protokoll stand zehnmal:

```
/bin/sh: 1: curl: not found
/bin/sh: 1: wget: not found
New container is unhealthy. … rolling back to the old container.
```

Coolify führt seinen Healthcheck **im Container** aus und erwartet dort `curl`
oder `wget`. Das schlanke `node:22-bookworm-slim` hat beides nicht. Die
`HEALTHCHECK`-Zeile des Dockerfiles selbst benutzt Node und funktionierte —
ausgewertet wird aber die von Coolify.

Behoben durch `curl` im Laufzeit-Abbild. Der andere Weg wäre gewesen, den
Healthcheck abzuschalten; dann merkt niemand mehr, wenn der Container steht,
aber nicht antwortet — für eine Anwendung, die Gutachtendaten führt, der
falsche Handel.

Dazu die Zeitwerte auf die der laufenden Werkbank gezogen: Anlaufzeit 40 s
statt 5, Abstand 30 s statt 5. Fünf Sekunden sind für einen Next-Server zu
knapp, und alle fünf Sekunden zu fragen ist Lärm.

## Noch einzutragen

| Variable | Folge, solange sie fehlt |
| --- | --- |
| `ANTHROPIC_API_KEY` | Prüfberichte lassen sich nicht auswerten, Abschnitte nicht ausformulieren. Alles Übrige läuft. |
| `ENTRA_TENANT_ID`, `ENTRA_CLIENT_ID`, `ENTRA_CLIENT_SECRET` | Kein Microsoft-Knopf in der Anmeldung; es gilt nur die Passwortanmeldung. |

Coolify gibt Geheimnisse über seine API **nicht** heraus — die Werte der
Werkbank liessen sich deshalb nicht übernehmen und müssen von Hand hinein.

Bereits gesetzt sind `DATABASE_URL`, `APP_BASIS_URL`, `SITZUNG_GEHEIMNIS`,
`AUTOIXPERT_API_TOKEN`, `AUTOIXPERT_BASIS_URL`, `PIPEDRIVE_API_TOKEN`,
`PIPEDRIVE_BASE_URL` und die drei `ERSTER_ADMIN_*`.

> **Nach der ersten Anmeldung `ERSTER_ADMIN_PASSWORT` wieder entfernen.**
> Der Zugang bleibt bestehen; die Variable wird nur beim allerersten Start
> gebraucht.

## Kennwerte für Coolify

Das Abbild bringt `poppler-utils` mit (`pdfinfo`, `pdftotext`, `pdftoppm`);
ohne die lässt sich kein Prüfbericht einlesen.

## Die Datenbank: zwei Wege

Das Schema des Cockpits ist **identisch** mit dem der Werkbank — auf diesem
Branch ist keine einzige neue Migration hinzugekommen (7 Dateien in `drizzle/`,
dieselben wie dort). Daraus folgen zwei Möglichkeiten:

**A — Eigene, leere Datenbank** *(empfohlen für den ersten Start)*
Eine neue Postgres-Ressource in Coolify. Das Cockpit legt beim Start das
Schema an und befüllt die Argumentbibliothek mit den 90 Einträgen aus dem
Abbild. Vorhandene Stellungnahmen, Bilder und Fälle bleiben in der Werkbank.

*Dafür:* die beiden Anwendungen können sich nicht gegenseitig stören, und ein
Fehler im Cockpit erreicht die laufende Kürzungsabwehr nicht.
*Dagegen:* die Arbeit steckt zunächst in zwei Datenbeständen. Vor dem
Umschalten muss der Bestand der Werkbank übernommen werden — bei gleichem
Schema ist das ein `pg_dump`/`pg_restore`, keine Migration.

**B — Dieselbe Datenbank wie die Werkbank**
`DATABASE_URL` zeigt auf `werkbank-postgres`. Beide Oberflächen arbeiten auf
demselben Bestand; was in der einen entsteht, steht sofort in der anderen.

*Dafür:* kein zweiter Bestand, kein Umzug beim Umschalten.
*Dagegen:* **sobald das Cockpit eine neue Migration mitbringt, wandert sie
auch in die Datenbank der Werkbank.** Die ältere Anwendung läuft dann auf
einem Schema, das sie nicht kennt. Solange keine Migration dazukommt, ist der
Weg sicher — aber genau das lässt sich nicht versprechen.

> **Empfehlung:** A für den ersten Start. Sobald das Cockpit im Alltag trägt,
> in einem Zug umziehen: Werkbank stilllegen, Bestand übernehmen, DNS
> umlegen. Das ist ein Vorgang mit einem Zeitpunkt statt einer Zeit, in der
> zwei Anwendungen dasselbe verändern.

## Umgebungsvariablen

**Pflicht:**

| Variable | Bedeutung |
| --- | --- |
| `DATABASE_URL` | Verbindungs-URL der Postgres-Ressource |
| `APP_BASIS_URL` | Öffentliche Adresse, z. B. `https://cockpit.gollenstede.app` |
| `SITZUNG_GEHEIMNIS` | Signiert die Sitzungscookies. Erzeugen mit:<br>`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |

**Für die Fachfunktionen:**

| Variable | Wofür |
| --- | --- |
| `ANTHROPIC_API_KEY` | Prüfberichte auswerten, Abschnitte ausformulieren |
| `AUTOIXPERT_API_TOKEN` | Fälle aus autoiXpert laden |
| `AUTOIXPERT_BASIS_URL` | `https://app.autoixpert.de/externalApi/v1` — **mit `/v1`**, sonst laufen alle Pfade ins Leere |
| `PIPEDRIVE_API_TOKEN` | Phase, Schadenhöhe und sevDesk-Verweis im Reiter „Vorgang" |

**Abrufregel gegen autoiXpert** — Voreinstellung ist die enge Fassung, es muss
nichts gesetzt werden:

| Variable | Wirkung |
| --- | --- |
| `AUTOIXPERT_NUR_OFFENE=false` | hebt die Beschränkung auf offene Gutachten auf |
| `AUTOIXPERT_FRUEHESTENS` | frühestes Anlagedatum, Standard `2026-05-01T00:00:00.000Z` |
| `AUTOIXPERT_SCHREIBEN=erlaubt` | erlaubt schreibende Zugriffe — **bewusst setzen, nicht dauerhaft** |

**Kleinanzeigen-Beschaffung** — hier muss **nichts** gesetzt werden. Ohne
Angabe beantwortet das Cockpit die Aufrufe des WBW-Plugins selbst und vergibt
sich beim Start ein eigenes Zugangswort:

| Variable | Wirkung |
| --- | --- |
| `KA_API_BASE` | Zeigt die Beschaffung auf einen ausgelagerten Dienst statt auf das Cockpit. Gesetzt: der alte Weg. Leer: der eigene. |
| `KA_API_USER` / `KA_API_PASS` | Zugangsdaten dazu. Ohne `KA_API_BASE` werden sie beim Start erzeugt. |
| `KLEINANZEIGEN_ABSTAND_MS` | Mindestabstand zwischen zwei Abrufen bei Kleinanzeigen, Standard `1500`. |

**Anmeldung über Microsoft Entra** (fehlt eine der drei, blendet die
Anmeldemaske den Microsoft-Knopf aus und bietet nur Passwortanmeldung):

| Variable | Bedeutung |
| --- | --- |
| `ENTRA_TENANT_ID` | Verzeichnis-ID des Tenants |
| `ENTRA_CLIENT_ID` | Anwendungs-ID der App-Registrierung |
| `ENTRA_CLIENT_SECRET` | Geheimnis der App-Registrierung |
| `ENTRA_AUTO_ANLEGEN` | `true` legt unbekannte Tenant-Konten selbst an; Standard `false` |

> **Wichtig bei eigener Domain:** In der Entra-App-Registrierung muss die
> Umleitungs-URI des Cockpits ergänzt werden:
> `https://cockpit.gollenstede.app/api/auth/entra/callback`.
> Die der Werkbank bleibt daneben stehen — eine Registrierung verträgt mehrere.

**Erster Zugang** (nur beim allerersten Start wirksam, wenn es noch gar keinen
Benutzer gibt):

| Variable | Bedeutung |
| --- | --- |
| `ERSTER_ADMIN_EMAIL` | legt einen Admin-Zugang an |
| `ERSTER_ADMIN_NAME` | Anzeigename dazu |
| `ERSTER_ADMIN_PASSWORT` | ohne diesen Wert ist der Zugang nur über Entra nutzbar |

## Was beim Start passiert

`starten.mjs` läuft vor dem Server und ist wiederholbar:

1. **Migrationen anwenden** — versionierte SQL-Dateien aus `drizzle/`, mit
   Buchführung in `__migrationen`. Bereits angewandte werden übersprungen.
2. **Argumentbibliothek befüllen**, falls leer. Eine gepflegte Bibliothek
   bleibt unangetastet.
3. **Ersten Zugang anlegen**, falls `ERSTER_ADMIN_EMAIL` gesetzt ist und noch
   überhaupt kein Benutzer existiert.

Nachgestellt geprüft (07.09.2026, Container-Layout gegen echtes Postgres):

```
[start] Migration 0000_silent_bloodaxe.sql … bis 0006
[start] Schema aktuell (7 Migrationen).
[start] Bibliothek abgeglichen: 90 neu, 0 geändert, 0 unverändert.
[start] Erster Zugang angelegt: … (mit Passwort).
[start] Server wird gestartet.
```

Zweiter Start derselben Datenbank:

```
[start] Schema aktuell (7 Migrationen).
[start] Bibliothek ist auf Stand — 90 Einträge unverändert.
```

Nichts doppelt, nichts überschrieben. Ein Neustart oder ein neues Deployment
ist damit gefahrlos.

## Nach dem ersten Deployment

1. **DNS** auf die Coolify-Adresse zeigen lassen, Zertifikat ausstellen lassen.
2. **`APP_BASIS_URL`** auf die endgültige Adresse setzen und neu starten —
   sie steht in den Umleitungen der Anmeldung.
3. **Entra-Umleitungs-URI** ergänzen (siehe oben).
4. **Anmelden** mit dem ersten Zugang, dann `ERSTER_ADMIN_PASSWORT` wieder
   entfernen.
5. **Weitere Zugänge** über das Container-Terminal in Coolify:
   ```bash
   pnpm benutzer:anlegen --email vorname@gollenstede-sachverstand.de \
                         --name "Vorname Nachname" --rolle ersteller
   ```
   Ohne `--passwort` entsteht ein Zugang, der sich ausschliesslich über
   Microsoft Entra nutzen lässt — der vorgesehene Normalfall.

## Anmeldepflicht — und warum sie in der Seite steht

Am 07.09.2026 gefunden: Ein Abruf **ohne jedes Cookie** lieferte HTTP 307, im
Rumpf der Antwort stand aber die vollständig gerenderte Seite — Aktenzeichen,
Name des Anspruchstellers, Kennzeichen, Gutachtentyp im Klartext. Der Browser
folgt der Umleitung und zeigt davon nichts; jeder andere HTTP-Client sieht alles.

Ursache: Die Prüfung stand nur im Layout. Im App Router rendert die Seite
**gleichzeitig** mit dem Layout, lädt dabei ihre Daten und gibt sie als
RSC-Nutzlast aus, bevor die Umleitung greift.

Seitdem zwei Riegel:

1. `verlangeAnmeldung()` als **erste Anweisung jeder Seite**, vor dem ersten
   Ladevorgang (`src/auth/wache.ts`). `redirect()` bricht sofort ab.
2. `src/middleware.ts` leitet ohne Sitzungscookie um, bevor gerendert wird.
   Bewusst nur eine Vorprüfung — Middleware hat keinen Datenbankzugriff.

Ein struktureller Test hält es fest: jede `page.tsx` unter `src/app/(app)` muss
`verlangeAnmeldung()` aufrufen, und zwar vor jedem anderen `await`.

Nachgemessen nach der Behebung, gegen die laufende Anwendung:

| Abruf | vorher | nachher |
| --- | --- | --- |
| ohne Cookie | 8 530 B mit Falldaten | 9 B, keine Daten |
| mit gefälschtem Cookie | — | 7 113 B, nur Next-Gerüst |

> **Die laufende Kürzungsabwehr-Werkbank hat dieselbe Lücke** (Stand
> 07.09.2026: `/faelle` 13 223 B, `/stellungnahmen` 13 913 B mit Falldaten im
> Rumpf). Sie liegt in einem anderen Repository. Derselbe Eingriff behebt sie:
> `src/auth/wache.ts` und `src/middleware.ts` übernehmen, `verlangeAnmeldung()`
> in jede Seite unter `src/app/(app)`.

## Trennung von Daten und Oberfläche

Die Oberfläche greift nicht selbst auf Datenbank oder fremde Schnittstellen
zu. Dazwischen liegt eine Schicht:

| Schicht | Wo | Kennt |
| --- | --- | --- |
| Reines Modell | `src/fall/modell.ts` | nur Typen und Umformungen — keine Datenbank, kein Netz |
| Datenzugriff | `src/fall/ansicht.ts` | Datenbank, Schemaprüfung, Feldabbildung |
| Fremdsystem | `src/fall/vorgang.ts` | Pipedrive, mit eigener Ausfallart |
| Oberfläche | `src/app/(app)/faelle/…` | nur Darstellung |

Zwei Dinge folgen daraus, die im Betrieb zählen:

- **Ein Ausfall von Pipedrive legt die Fallseite nicht lahm.** Der Abruf hat
  vier unterscheidbare Ausgänge — gefunden, kein Treffer, nicht eingerichtet,
  Fehler — und jeder sagt in der Oberfläche etwas anderes. Sie alle als „kein
  Deal gefunden" zu zeigen wäre die gefährlichste Auskunft: wer das liest,
  legt den Vorgang womöglich ein zweites Mal in Pipedrive an.
- **Unlesbare Falldaten sperren nicht den ganzen Fall.** Die Schreiben hängen
  an der Fall-Id, nicht an den Daten aus autoiXpert; der Reiter
  „Stellungnahmen" bleibt erreichbar.

## Grösse des Abbilds

Die Standalone-Ausgabe lag bei 64 MB, davon 17 MB abgelegte API-Dokumentation
als MHTML. Ursache: `src/export/docx.ts` liest die Geschäftspapier-Vorlage über
einen zur Bauzeit unbekannten Pfad, woraufhin Next zur Sicherheit das ganze
Projektverzeichnis mitnimmt. `outputFileTracingExcludes` in `next.config.ts`
grenzt das ein — jetzt 45 MB, praktisch nur noch `node_modules`.

## Berichtigungen zur Werkbank-Dokumentation

Drei Angaben in [`betrieb.md`](betrieb.md) stimmen nicht mehr:

- **Die laufende Werkbank ist nicht die dort genannte Anwendung.** Live unter
  https://werkbank.gollenstede.app ist `clone-of-werkbank-s11odxavd6ul8vqr9v1o1c1e`
  mit der Datenbank `werkbank-postgres-clone-wo2zwmfgkjngcbjgmp9wiyvc`. Die
  dokumentierten Ressourcen `werkbank` (`g7oinc0…`) und `werkbank-postgres`
  (`thsbzqy…`) stehen auf `exited`. Wer nach der Dokumentation arbeitet, ändert
  am toten Objekt.

- **`app.autoixpert.de` ist aus der Claude-Code-Umgebung erreichbar.** Die dort
  vermerkte Sperre der Egress-Richtlinie besteht nicht mehr; die Schnittstelle
  wurde am 07.09.2026 gegen echte Daten geprüft (7 offene Gutachten ab Mai 2026).
- **Kalkulationsbeträge sind zu bekommen** — nicht im Gutachten-Objekt, aber über
  `GET /reports/{id}/vxs` als DAT-XML. Das ist der nächste Ausbauschritt.

## Kleinanzeigen ohne zweiten Dienst

Bis zum 07.09.2026 lief die Beschaffung der Vergleichsfahrzeuge über eine
**eigene Anwendung** auf Coolify: `ka-api.gollenstede.app`, zwei Container
(ein Basic-Auth-Vorschalter und der unveränderte Upstream
`DanielWTE/ebay-kleinanzeigen-api`), eine öffentliche Domain, ein Passwort.
Das Cockpit beantwortet dieselben Aufrufe jetzt selbst.

**Warum das geht.** Der ausgelagerte Dienst fährt für jede Seite ein Chromium
hoch. Gebraucht wird das nicht: Kleinanzeigen liefert Trefferliste und
Detailseite fertig gerendert aus. Nachgemessen am 07.09.2026 mit einem
gewöhnlichen HTTP-Aufruf — ohne Browser, ohne JavaScript, ohne Cookies —
kamen dieselben 27 Treffer und dieselben 15 Merkmalzeilen heraus. Beide
Antworten liegen als Beleg in `tests/fixtures/`.

**Was der Browser tatsächlich abfing**, und was an seine Stelle tritt:
Kleinanzeigen weist Anfragen zeitweise mit HTTP 403 ab („IP-Bereich
vorübergehend gesperrt"). Das ist eine Frequenzbremse, keine
Browsererkennung — sechs Aufrufe ohne Pause ergaben `403 200 200 403 403 200`,
dieselbe Adresse mit vier Sekunden Abstand dreimal `200`. Das Cockpit hält
deshalb **einen Abruf zur Zeit**, einen Mindestabstand dazwischen, und fragt
nach einer Abweisung mit wachsender Wartezeit erneut.

**Was sich dadurch ändert:**

| | vorher | jetzt |
| --- | --- | --- |
| Anwendungen in Coolify | Cockpit + ka-api | Cockpit |
| Öffentliche Adressen | zwei | eine |
| Zu pflegende Passwörter | `KA_API_USER`/`KA_API_PASS` von Hand | wird beim Start erzeugt |
| Zwei Suchseiten holen | Chromium-Start + 2 s Pause je Seite | 2,4 s insgesamt (gemessen) |
| Speicherbedarf | ein Chromium je Abruf | keiner |

**Am Plugin ändert sich nichts.** Es spricht weiter gegen `KA_API_BASE` —
diese Adresse zeigt nur auf das Cockpit statt nach draussen. Geprüft mit dem
unveränderten Adapter `wbw-plugin/adapters/kleinanzeigen.js`: Such-URL,
Trefferliste, fünf Detailabrufe, vollständige Fahrzeuge mit Laufleistung,
Erstzulassung, Leistung in kW, Getriebe, Türen, Ausstattung und Bildern.

**Der alte Weg bleibt offen.** Wer `KA_API_BASE` in Coolify auf
`https://ka-api.gollenstede.app` setzt, bekommt wieder den ausgelagerten
Dienst. Der Wechsel ist eine Variable und kein Umbau — deshalb sollte die
alte Anwendung erst abgeschaltet werden, wenn ein vollständiger Lauf über den
neuen Weg im Alltag durchgelaufen ist.

**Nebenbefund.** Die neue Trefferliste von Kleinanzeigen trägt Laufleistung
und Erstzulassung bereits mit; beim ausgelagerten Dienst standen sie nur auf
der Detailseite. Das Cockpit gibt sie in `results[]` mit aus. Genutzt wird das
noch nicht — das Plugin holt die Detailseiten ohnehin wegen der Ausstattung —
aber es liegt bereit, wenn ein schneller Überblick ohne Detailabrufe gebraucht
wird.

## Die alte Kleinanzeigen-Anwendung abschalten

Wenn der neue Weg sich bewährt hat:

1. In Coolify die Anwendung hinter `ka-api.gollenstede.app` stoppen.
2. Den DNS-Eintrag für `ka-api.gollenstede.app` entfernen.
3. Im Cockpit **kein** `KA_API_BASE` setzen (oder ein gesetztes löschen) —
   sonst zeigt die Beschaffung weiter ins Leere.

Der Quelltext der alten Anwendung liegt weiter in
`Lzm010409/WBW-Sachverstaendigenbuero` unter `ops/ka-api/`; sie lässt sich
jederzeit wieder anlegen.

## Der WBW-Recherchelauf

Der Knopf „Vergleichsfahrzeuge suchen" im Reiter „Wiederbeschaffungswert"
stösst einen Lauf an, der **Minuten** dauert: AutoScout24 und Kleinanzeigen
werden nacheinander abgefragt, zwischen den Abrufen wird bewusst pausiert,
und zu jedem Kleinanzeigen-Inserat kommt eine Detailseite. Gemessen am
07.09.2026: 102 Sekunden für 6 + 14 Treffer.

**Der Lauf steht in der Datenbank** (`wbw_lauf`), nicht im Arbeitsspeicher.
Wer ihn angestossen hat, kann die Seite neu laden oder den Rechner zuklappen;
der Stand ist beim nächsten Öffnen des Reiters wieder da, samt Ergebnis. Die
Oberfläche fragt alle zwei Sekunden nach.

**Was ein Neustart des Containers bedeutet:** Der Lauf arbeitet im Prozess
der Anwendung. Startet der Container neu, ist er fort — `starten.mjs`
vermerkt hängengebliebene Läufe deshalb beim Hochfahren als abgebrochen,
statt sie für immer auf „läuft" stehen zu lassen. Ein Deployment während
eines Laufs kostet den Lauf; er muss neu angestossen werden.

**Kein zweiter Lauf für denselben Fall.** Zwei gleichzeitig würden sich
gegenseitig in die Frequenzbremse der Portale treiben. Der zweite Versuch
wird mit einer Meldung abgewiesen.

**Kostenpflichtige Stufen** (mobile.de über Apify) sind je Lauf zu wählen und
nicht dauerhaft geschaltet: das Häkchen setzt `WBW_ALLOW_PAID=1` für **diesen
einen** Kindprozess. Ein dauerhafter Schalter im Container wäre genau die
Art Einstellung, die irgendwann niemand mehr sieht.

**Ordner der erzeugten Dateien:** Das Plugin schreibt HTML, PDF und
Linkliste in ein Verzeichnis unter `/tmp`. Der Pfad steht in der Zeile; die
Dateien überleben aber keinen Neustart des Containers. Die Zahlen selbst
(`result.json`) liegen in der Datenbank und bleiben.
