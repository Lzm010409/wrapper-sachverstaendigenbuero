# Cockpit Sachverständigenbüro

Eine Oberfläche über **autoiXpert**, **Pipedrive** und **sevDesk** für das
Kfz-Sachverständigenbüro Gollenstede. Sie führt zusammen, was heute in vier
Systemen liegt, und automatisiert einzelne Schritte im Gutachten.

Optik und Bedienlogik folgen bewusst autoiXpert, damit der Benutzerfluss nicht bricht.

Hervorgegangen aus der **Kürzungsabwehr-Werkbank** (werkbank.gollenstede.app), die
hierher überführt wurde. Die laufende Werkbank bleibt unangetastet, bis das Cockpit
sie vollständig ersetzt.

## Stand

| Bereich | Stand |
| --- | --- |
| Anmeldung (Microsoft Entra, Rollen, Sitzungen) | steht |
| PostgreSQL mit Drizzle und Migrationen | steht |
| Argumentbibliothek: Suche, Detail, Freigabe | steht |
| Prüfbericht einlesen, Positionen auslesen | steht |
| Stellungnahme: Ausformulieren, vier Wächter, Word-Ausgabe | steht |
| Brief-Editor mit Anmerkungen am Rand, Bildbibliothek | steht |
| Fälle aus autoiXpert über Aktenzeichen, ID oder externe ID | steht |
| Abrufregel gegen autoiXpert (nur offene Fälle ab Mai 2026, nichts Schreibendes) | steht |
| Oberfläche im autoiXpert-Look | Rahmen, Listen, Karten, Felder stehen |
| Fallakte im Stil der autoiXpert-Gutachtenmaske | offen |
| WBW-Modul: Eingabemaske und `params.json` | Abbildung steht, Maske noch nicht eingehängt |
| WBW-Modul: Recherchelauf über die Portale | offen (Job-Dienst, Portal-Zugangsdaten) |
| Pipedrive-Phase und sevDesk-Verweis in der Fallakte | Client steht, Anzeige offen |
| Betrieb des Cockpits auf Coolify | offen (Dockerfile ist da) |

## Entwickeln

```bash
pnpm install
cp .env.example .env.local     # DATABASE_URL eintragen
pnpm db:push                   # Schema anlegen
pnpm bibliothek:import         # Argumentbibliothek übernehmen
pnpm benutzer:anlegen --email du@example.org --name "Du" \
                      --rolle admin --passwort geheim
pnpm dev
```

| Befehl | Zweck |
| --- | --- |
| `pnpm dev` | Entwicklungsserver |
| `pnpm check` | Typprüfung und Tests |
| `pnpm test` | Tests (Vitest) |
| `pnpm lint` | ESLint |
| `pnpm build` | Produktionsbau |
| `pnpm exec tsx scripts/probedaten.ts <präfix>` | Probedaten für Bedienproben |
| `pnpm exec tsx scripts/rundgang.ts` | Bildschirmfotos durch die Anwendung |

Die drei PDF-Tests brauchen `poppler-utils` (`pdfinfo`, `pdftotext`, `pdftoppm`).
Das Dockerfile installiert sie; lokal gehören sie ins System.

## Abrufregel gegen autoiXpert

Solange der Ausbau läuft, gilt eine enge Sperre. Sie steht in
`src/autoixpert/abrufregel.ts` und wirkt **im Client**, nicht im Aufrufer:

| Regel | Voreinstellung | Lösen über |
| --- | --- | --- |
| nur offene Gutachten | an | `AUTOIXPERT_NUR_OFFENE=false` |
| frühestens angelegt am | `2026-05-01` | `AUTOIXPERT_FRUEHESTENS` |
| schreibende Zugriffe | gesperrt | `AUTOIXPERT_SCHREIBEN=erlaubt` |

Grund ist nicht nur der Auftrag, sondern auch Geld: autoiXpert rechnet Lesezugriffe
**je Gutachten einmalig** ab. Ein ungefilterter Listendurchlauf kostet für jedes
berührte Gutachten.

## Aufbau

```
skills/                  Die Skills — versionierte fachliche Grundlage
src/autoixpert/          Client, Datentypen, Abrufregel, Aktenzeichen, Feldabbildung
src/pipedrive/           lesender Zugriff auf Deals (Phase, sevDesk-Verweis)
src/wbw/                 Gutachten -> params.json des WBW-Plugins
src/bibliothek/          Argumentbibliothek: Parser, Suche, Freigabe
src/pruefbericht/        PDF einlesen, Kürzungspositionen auslesen
src/stellungnahme/       Treffer, Komposition, Auswertung
src/dokument/            Der Dokumentbaum, Editor-Schema, Prüfung
src/bilder/              Bilder lesen, ablegen, Bildbibliothek
src/export/              Vier Wächter, Hausstil, Word-Ausgabe
src/auth/                Sitzungen, Passwort, Microsoft Entra
src/db/                  Datenmodell
src/app/                 Routen und Oberfläche
Autoixpert API/          abgelegte API-Dokumentation (MHTML)
docs/werkbank-README.md  Die ausführliche Dokumentation der Werkbank
```

Die Optik hängt an den Variablen in `src/app/globals.css` — dort und nirgends sonst.

Hintergrund und Begründung der Entscheidungen: `ARCHITEKTUR.md`.
