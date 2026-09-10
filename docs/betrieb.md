# Betrieb auf Coolify

**Die Anwendung läuft:** https://werkbank.gollenstede.app

| | |
| --- | --- |
| Coolify-Projekt | Kuerzungsabwehr-Werkbank |
| Anwendung | `werkbank` (`g7oinc0aszdlwsaz7n6tae2u`) |
| Datenbank | `werkbank-postgres` (`thsbzqyeov34rei7pexf17bu`) |
| Branch | `claude/stellungnahme-webapp-konzept-kyhxer` |
| Build | Dockerfile, Port 3000, Healthcheck `/api/gesundheit` |

## Der Startvorgang richtet sich selbst ein

Bei jedem Start läuft `starten.mjs`, bevor der Server hochkommt:

Zum Stand mit dem Brief-Editor gehören die Migrationen `0002` (Spalten
`dokument`, `dokument_stand`, `dokument_geaendert_am`) und `0003` (Tabelle
`bild`) und `0004` (Titel, Beschreibung, Themen und Bibliotheksmerkmal am
Bild). Ältere
Stellungnahmen bekommen ihr Schreiben beim ersten Öffnen aus ihren
bisherigen Bausteinen — ein eigenes Migrationsskript gibt es dafür nicht.

1. **Migrationen anwenden** — versionierte SQL-Dateien aus `drizzle/`, mit
   Buchführung in `__migrationen`. Bereits angewandte werden übersprungen.
2. **Bibliothek befüllen**, falls sie leer ist — die Startbefüllung entsteht
   beim Bauen des Abbilds. Eine gefüllte Bibliothek bleibt unangetastet.
3. **Ersten Zugang anlegen**, falls `ERSTER_ADMIN_EMAIL` gesetzt ist und noch
   überhaupt kein Benutzer existiert.

Ein Neustart oder ein neues Deployment ist damit gefahrlos: nichts wird
doppelt angelegt, nichts überschrieben.

## Umgebungsvariablen

| Variable | Pflicht | Bedeutung |
| --- | --- | --- |
| `DATABASE_URL` | ja | Verbindungs-URL der Postgres-Ressource |
| `APP_BASIS_URL` | ja | Öffentliche Adresse, z.B. `https://werkbank.gollenstede.app` |
| `ANTHROPIC_API_KEY` | ja | Gesetzt. Ohne diesen Wert liessen sich Prüfberichte nicht auswerten und Abschnitte nicht ausformulieren; alles Übrige — Bibliothek, Fallimport, Schreibtisch, Wächter, Ausgabe — läuft auch ohne ihn. |
| `AUTOIXPERT_API_TOKEN` | für P2 | Bearer-Token der externen Schnittstelle |
| `ENTRA_TENANT_ID` | für Microsoft-Anmeldung | Verzeichnis-ID des Tenants |
| `ENTRA_CLIENT_ID` | für Microsoft-Anmeldung | Anwendungs-ID der App-Registrierung |
| `ENTRA_CLIENT_SECRET` | für Microsoft-Anmeldung | Geheimnis der App-Registrierung |
| `ENTRA_AUTO_ANLEGEN` | nein | `true` legt unbekannte Tenant-Konten selbst an. Standard ist `false`: dann kann sich nur anmelden, wer vorher eingetragen wurde. |
| `ERSTER_ADMIN_EMAIL` | einmalig | Legt beim allerersten Start einen Admin-Zugang an |
| `ERSTER_ADMIN_NAME` | nein | Anzeigename dazu |
| `ERSTER_ADMIN_PASSWORT` | nein | Ohne diesen Wert ist der Zugang nur über Entra nutzbar |

Fehlt eine der drei `ENTRA_*`-Variablen, blendet die Anmeldemaske den
Microsoft-Knopf einfach aus und bietet nur die Passwortanmeldung an.

## App-Registrierung in Microsoft Entra

Im Azure-Portal unter **Microsoft Entra ID → App-Registrierungen → Neue
Registrierung**:

- Unterstützte Kontotypen: **nur eigenes Verzeichnis** (Single Tenant)
- Umleitungs-URI, Typ **Web**:
  `https://<APP_BASIS_URL>/api/auth/entra/callback`
- Unter **Zertifikate & Geheimnisse** ein Client-Geheimnis erzeugen
- Unter **API-Berechtigungen** genügen die Standardrechte
  `openid`, `profile`, `email` — es werden keine Graph-Daten gelesen

Mehr braucht die Anwendung nicht: sie liest aus dem ID-Token nur
Objekt-ID, Mailadresse und Anzeigename.

## Weitere Zugänge anlegen

Die Coolify-API bietet keinen Endpunkt, um Befehle im laufenden Container
auszuführen — deshalb die Einrichtung über den Startvorgang. Weitere
Benutzer legst Du über das Container-Terminal in der Coolify-Oberfläche an:

```bash
pnpm benutzer:anlegen --email vorname@gollenstede-sachverstand.de \
                      --name "Vorname Nachname" --rolle ersteller
```

Ohne `--passwort` entsteht ein Zugang, der sich ausschliesslich über
Microsoft Entra nutzen lässt — der vorgesehene Normalfall.

## Bibliothek zurück nach Markdown

Damit die Skills im Chat mit dem aktuellen Stand arbeiten:

```bash
pnpm bibliothek:export
```

## Bilder

Die Bytes liegen in der Tabelle `bild`, base64-kodiert, mit
Fremdschlüssel auf die Stellungnahme — eine gelöschte Stellungnahme nimmt
ihre Bilder mit. Ausgeliefert werden sie über `/api/bilder/<id>`, nur
angemeldet: in Kalkulationsauszügen stehen Kennzeichen und Schadennummern.

Angenommen werden **PNG und JPEG** bis 8 MB. Format und Masse liest die
Anwendung aus den Bytes selbst, nicht aus dem Dateinamen — im Word-Dokument
entscheidet das echte Seitenverhältnis darüber, ob ein Bild verzerrt
erscheint.

Ein Bild trägt zwei Rollen in einer Zeile: `stellungnahme_id` sagt, wo es
hereinkam, `in_bibliothek` sagt, ob es wiederverwendbar ist. Beim Einfügen
aus der Bibliothek wird **nicht kopiert** — deshalb prüft das Löschen, ob
das Bild noch in einem Dokumentbaum vorkommt, und verweigert sich dann.

Das Datenverzeichnis wächst damit mit den Bildern. Ein Kalkulationsauszug
liegt bei 100 bis 500 KB; bei einigen hundert Stellungnahmen im Jahr sind
das wenige hundert Megabyte. Sollte das je stören, ist der Weg ein
Objektspeicher hinter derselben Schnittstelle — die Anwendung kennt nur
`speichereBild` und `ladeBild`.

## Erscheinungsbild und Aufbau der Oberfläche

Farben, Masse und Formen folgen der Vorlage „Judia" (Bootstrap 5.3): Blau
als einzige Signalfarbe, kühle Blaugrautöne für Text, helle Flächen mit
dünnen Rändern. Links eine schmale dunkle Schiene, daneben das Menü, darüber
die Kopfleiste; der Inhalt rückt um beides ein. Das Menü lässt sich
einklappen — auf schmalen Schirmen ist es das von sich aus.

Der Brief selbst bleibt Serifensatz. Er soll wie ein Schreiben aussehen und
nicht wie eine Bildschirmmaske; das ist der Unterschied zwischen der
Anwendung und ihrem Erzeugnis.

Alle Farben stehen dreifach: hell, dunkel über die Systemvorgabe, dunkel
über den Schalter. Ein Test vergleicht die drei Blöcke — fehlt in einem ein
Wert, fällt sonst stillschweigend die helle Fassung durch.

## Rollen

| Rolle | Darf |
| --- | --- |
| `ersteller` | Einträge anlegen und ändern, Fundstellen bestätigen |
| `freigeber` | zusätzlich Einträge freigeben |
| `admin` | wie Freigeber, plus Benutzerverwaltung |

Der Statuswechsel auf `freigegeben` ist ausschließlich über die Oberfläche
möglich und verlangt die Rolle `freigeber` oder `admin`. Kein KI-Aufruf
erreicht diesen Weg — das ist Entscheidung E5 aus dem Konzept, und sie ist
im Code verankert, nicht nur beschrieben.

## Lokale Entwicklung

```bash
pnpm install
cp .env.example .env.local     # DATABASE_URL eintragen
pnpm db:push
pnpm bibliothek:import
pnpm benutzer:anlegen --email test@example.org --name Test \
                      --rolle admin --passwort geheim
pnpm dev
```

Zwei Sichtprüfungsläufe durch einen echten Browser, mit Bildschirmfotos:

```bash
pnpm exec tsx scripts/rundgang.ts http://localhost:3000 /tmp/rundgang
pnpm exec tsx scripts/rundgang-brief.ts http://localhost:3000 /tmp/brief
```

Der zweite geht den Weg am Schreibtisch ab: Prüfbericht hochladen und den
Fortschritt beobachten, Brief öffnen, Anmerkung aufklappen, Baustein
bearbeiten und einfügen, einen zweiten hineinziehen, im Brief
weiterschreiben, Erscheinungsbild umschalten, Position herausnehmen und
wieder aufnehmen, Dokument erzeugen. Er meldet jeden Konsolenfehler und
bricht dann ab. Ohne `ANTHROPIC_API_KEY` lässt er den Auswertungsschritt
aus, statt zu scheitern.

## Was die Anwendung kann

| Bereich | Zustand |
| --- | --- |
| Argumentbibliothek pflegen und freigeben | läuft |
| Fall aus autoiXpert laden | läuft, Schnittstelle noch nicht gegen echte Daten geprüft |
| Prüfbericht einlesen (Text und Scan) | läuft |
| Kürzungspositionen auslesen | läuft |
| Sonderfall-Prüfliste B.1–B.8 | läuft |
| Brief-Editor mit Anmerkungen am Rand | läuft |
| Bausteine per Klick oder Ziehen einfügen | läuft |
| Bilder einfügen, stufenlos ziehen, beschriften | läuft |
| Bildbibliothek mit Themen, Beschreibung und Suche | läuft |
| Bilder im Word-Dokument, Marker im Klartext | läuft |
| Fortschrittsanzeige beim Auswerten und Erzeugen | läuft |
| Hell, dunkel oder wie das System | läuft |
| Vorschläge, Bibliothekssuche und eigener Text je Position | läuft |
| Ausformulieren je Abschnitt | läuft |
| Vier Wächter, laufend und als Randnotiz | läuft |
| Word- und Klartext-Ausgabe | läuft |
| Selbst geschriebenen Abschnitt in die Bibliothek übernehmen | läuft |

## Bekannte Einschränkungen

- **`app.autoixpert.de`** ist aus der Claude-Code-Umgebung heraus durch die
  Egress-Richtlinie gesperrt (403 auf den CONNECT-Tunnel). Der Fall-Import
  (P2) lässt sich deshalb dort nicht gegen die echte Schnittstelle prüfen.
  Auf dem Coolify-Server besteht diese Beschränkung nicht.
- Das **Container-Abbild** lässt sich in der Entwicklungsumgebung nicht bauen,
  weil auch Docker Hub gesperrt ist. Gebaut wird deshalb auf Coolify — dort
  läuft es. Geprüft wurde vorab im nachgestellten Container-Layout: Migration,
  Startbefüllung, Serverstart und ein zweiter Lauf ohne Doppelarbeit.
- **Kalkulationsbeträge** liefert die autoiXpert-Schnittstelle laut ihrer
  eigenen Dokumentation noch nicht („werden zukünftig im Gutachten-Objekt
  enthalten sein"). Die Kürzungspositionen kommen deshalb aus dem
  Prüfbericht; die Fallansicht weist darauf hin.
- **Lesezugriffe auf Gutachten sind kostenpflichtig**, je Gutachten einmalig.
  Der Client greift deshalb zuerst über den Pfad zu (genau ein Zugriff) und
  sucht nur dann über das Aktenzeichen, wobei die Suche nach zehn Listenseiten
  abbricht und das auch meldet.
