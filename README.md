# Wrapper Sachverständigenbüro

Oberfläche über **autoiXpert**, **Pipedrive** und **sevDesk** für das
Kfz-Sachverständigenbüro Gollenstede. Ziel ist eine Fallakte, die alles zu einem
Aktenzeichen an einer Stelle zeigt, und die Automatisierung einzelner Schritte im
Gutachten — beginnend mit der Recherche des Wiederbeschaffungswerts.

Optik und Bedienlogik folgen bewusst autoiXpert, damit der Benutzerfluss nicht bricht.

## Stand

| Bereich | Stand |
| --- | --- |
| Fallübersicht (Liste aus autoiXpert) | steht |
| Fallakte: Unfall & Beteiligte, Fahrzeugauswahl | steht |
| Fallakte: Pipedrive-Phase und Deal-Felder | steht |
| WBW-Modul: Eingabemaske und `params.json` aus den Gutachtendaten | steht |
| WBW-Modul: Recherchelauf über die Portale | offen (Job-Dienst + Zugangsdaten) |
| Kürzungscockpit | offen (wartet auf das vorhandene Projekt als Vorbild) |
| Anmeldung über Microsoft 365 | offen |
| PostgreSQL für Jobs, Zwischenspeicher und Protokoll | offen |

## Entwickeln

```bash
npm install
cp .env.example .env.local     # optional; ohne Schlüssel läuft der Demomodus
npm run dev
```

| Befehl | Zweck |
| --- | --- |
| `npm run dev` | Entwicklungsserver |
| `npm run build` | Produktionsbau |
| `npm test` | Unit-Tests (Vitest) |
| `npm run typecheck` | TypeScript ohne Ausgabe |
| `npm run lint` | ESLint |

**Ohne `AUTOIXPERT_API_KEY` startet die Anwendung im Demomodus** mit erfundenen
Beispieldaten. So ist die Oberfläche prüfbar, ohne einen kostenpflichtigen
API-Zugriff auszulösen.

## Aufbau

```
src/
  app/                 Routen (App Router)
    faelle/            Fallübersicht und Fallakte
  components/          AppShell, Karten, Felder, Reiter, WBW-Maske
  lib/
    autoixpert/        Client und Datentypen der externalApi
    pipedrive/         lesender Zugriff auf Deals
    faelle/            Zusammenführung beider Quellen (+ Beispieldaten)
    wbw/               Abbildung Gutachten -> params.json des WBW-Plugins
tests/                 Vitest
Autoixpert API/        abgelegte API-Dokumentation (MHTML)
```

Die gesamte Optik hängt an den Designtokens in `src/app/globals.css`.
Wer autoiXpert nachziehen will, ändert dort — und nirgends sonst.

Hintergrund und Begründung der Architekturentscheidungen: `ARCHITEKTUR.md`.
