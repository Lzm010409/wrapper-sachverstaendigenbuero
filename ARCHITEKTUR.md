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

**n8n wird nicht ersetzt.** Die 76 vorhandenen Workflows (Sync, Kürzungssync,
Rechnungsworkflow, Postfachwächter, Deal-Index, Kalk-Lernkreislauf) bleiben die
Automatisierung; der Wrapper ist die Oberfläche darüber. Alles andere hieße zwei
Wahrheiten über denselben Fall.

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

- schmale Icon-Leiste links, helle Kopfzeile
- weiße Karten auf hellem Grund, Überschriften gesperrt in Großbuchstaben, zentriert
- Formularfelder ohne Rahmen, nur Unterstrich, winziges graues Label darüber
- Blau als einzige Akzentfarbe, Beträge grün mit grauem Sekundärwert
- Kennzeichen als Schild, Status als Chip mit farbigem Punkt

Alle Werte liegen als Designtokens in `src/app/globals.css`. Keine Farbe und kein
Radius steht direkt in einer Komponente.

## Offene Punkte

- Recherchelauf des WBW-Plugins anschließen (Job-Dienst, Portal-Zugangsdaten,
  Rückschreiben des Reports als Gutachten-Dokument)
- Kürzungscockpit aus dem vorhandenen Projekt integrieren
- Extraktion der Kalkulationszahlen aus dem gerenderten Gutachten-Dokument
- Anmeldung, Datenbank, Änderungsprotokoll
- Fotos-Reiter und Dokumenten-/Versandcockpit
