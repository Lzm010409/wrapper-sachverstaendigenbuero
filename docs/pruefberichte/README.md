# Prüfberichte der Seitenprüfung

Sieben Prüfer, je einer für eine Unterseite, haben die Anwendung im August
2026 durchgespielt: jede Schaltfläche mindestens zweimal, jede Seite gegen
drei absichtlich verschiedene Datensätze (vollständig, karg, schräg), und
jede Wirkung nachgeprüft — nach dem Neuladen und in der Datenbank, nicht nur
an der Meldung auf dem Schirm.

Die Datensätze legt `scripts/probedaten.ts` an; jeder Prüfer arbeitete unter
einem eigenen Präfix, damit sich sieben Läufe nicht in die Quere kommen.

| Bericht | Seite |
|---|---|
| [`anmeldung-rahmen.md`](anmeldung-rahmen.md) | `/anmelden`, Menü, Kopfleiste, Erscheinungsbild |
| [`bibliothek-liste.md`](bibliothek-liste.md) | `/bibliothek` — Liste, Suche, Filter |
| [`bibliothek-eintrag.md`](bibliothek-eintrag.md) | `/bibliothek/[id]` — Eintrag, Freigabe, Fundstellen |
| [`faelle.md`](faelle.md) | `/faelle` und `/faelle/[id]` |
| [`bilder.md`](bilder.md) | `/bilder` — Bildbibliothek |
| [`stellungnahmen-liste.md`](stellungnahmen-liste.md) | `/stellungnahmen` — Übersicht, Anlegen, Löschen |
| [`schreibtisch.md`](schreibtisch.md) | `/stellungnahmen/[id]` — der Schreibtisch |

Jeder Bericht ist gleich aufgebaut: **Geprüft** (was getan wurde),
**Fehler** (was nicht tat, was es versprach), **Ungünstig** (was tat, aber
schweigt, verdeckt oder in die Irre führt), **Geändert** (Datei, Änderung,
Begründung) und **Offen** (was liegen blieb — und warum).

Ein Satz, der der Anwendung widerspricht, gilt hier als Fehler. Der Anlass
für die ganze Runde war genau so einer: die Eintragsseite behauptete, nur
freigegebene Argumente liessen sich übernehmen — übernehmen liess sich
jedes.

Die Berichte sind der Stand vom Tag der Prüfung. Was danach behoben wurde,
steht in der Versionsgeschichte (`L1` bis `L6`); die Abschnitte *Offen*
sind deshalb teilweise bereits erledigt.
