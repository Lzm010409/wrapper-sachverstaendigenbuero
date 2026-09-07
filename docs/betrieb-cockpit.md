# Betrieb des Cockpits auf Coolify

Diese Anleitung richtet das **Cockpit** als eigene Anwendung ein — neben der
laufenden Kürzungsabwehr-Werkbank, nicht an ihrer Stelle. Die Werkbank unter
https://werkbank.gollenstede.app bleibt unangetastet, bis das Cockpit sie
vollständig ersetzt und umgeschaltet wird.

Der Betrieb der Werkbank ist in [`betrieb.md`](betrieb.md) beschrieben; das
meiste gilt unverändert, weil das Cockpit aus ihr hervorgegangen ist.

## Kennwerte für Coolify

| | |
| --- | --- |
| Repository | `Lzm010409/wrapper-sachverstaendigenbuero` |
| Branch | `claude/autoixpert-wrapper-integration-0in671` |
| Build | Dockerfile (im Wurzelverzeichnis) |
| Port | `3000` |
| Healthcheck | `/api/gesundheit` — antwortet `{"zustand":"ok","datenbank":"erreichbar"}` |
| Startbefehl | steckt im Abbild (`node starten.mjs`), nichts einzutragen |
| Domain | frei wählbar, z. B. `cockpit.gollenstede.app` — DNS zeigt darauf |

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

Zwei Angaben in [`betrieb.md`](betrieb.md) stimmen nicht mehr:

- **`app.autoixpert.de` ist aus der Claude-Code-Umgebung erreichbar.** Die dort
  vermerkte Sperre der Egress-Richtlinie besteht nicht mehr; die Schnittstelle
  wurde am 07.09.2026 gegen echte Daten geprüft (7 offene Gutachten ab Mai 2026).
- **Kalkulationsbeträge sind zu bekommen** — nicht im Gutachten-Objekt, aber über
  `GET /reports/{id}/vxs` als DAT-XML. Das ist der nächste Ausbauschritt.
