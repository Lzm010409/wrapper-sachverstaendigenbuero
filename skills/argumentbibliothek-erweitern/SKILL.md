---
name: argumentbibliothek-erweitern
description: >
  This skill should be used when the user wants to add a new case to the argument
  library, says "füge das zur Argumentbibliothek hinzu", "neue Stellungnahme in die
  Bibliothek einpflegen", "Argumentbibliothek erweitern", "neues Gegenargument
  speichern", or provides a pair of an existing Stellungnahme and the corresponding
  Kürzungsschreiben/Prüfbericht, just a Kürzungsschreiben without an existing
  Stellungnahme, or just one or more already-sent Stellungnahmen without the
  corresponding Kürzungsschreiben (e.g. a batch of older cases where only the
  office's own letters were kept). Distinct from stellungnahme-erstellen, which
  drafts a brand-new Stellungnahme rather than growing the reference library.
metadata:
  version: "0.1.0"
---

# Argumentbibliothek erweitern

Dieser Skill pflegt die Referenzdateien des Skills `stellungnahme-erstellen` (`../stellungnahme-erstellen/references/*.md`). Er ermöglicht dem Büro, die Bibliothek selbst um neue, in der Praxis bereits verwendete Fälle zu erweitern, ohne dass jemand die Dateien händisch durchsuchen und bearbeiten muss.

## Wann dieser Skill greift

- Der Nutzer liefert eine bereits verschickte Stellungnahme zusammen mit dem zugehörigen Kürzungsschreiben/Prüfbericht und möchte die darin verwendeten Argumente für künftige Fälle festhalten.
- Der Nutzer liefert NUR ein Kürzungsschreiben (z.B. ein neuer WBW/Restwert-Fall, für den noch keine Musterargumente existieren) und eigene Stichpunkte/Notizen, wie darauf geantwortet wurde oder werden soll.
- Der Nutzer liefert NUR eine bereits verschickte Stellungnahme, OHNE das zugehörige Kürzungsschreiben (z.B. weil dieses nicht mehr auffindbar ist). Auch das ist verwertbar, siehe Schritt 3a.
- Der Nutzer bittet ausdrücklich, ein einzelnes neu formuliertes Gegenargument in die Bibliothek aufzunehmen.

## Schritt 1: Eingang lesen (wie in stellungnahme-erstellen)

Gleiche Technik wie im Skill `stellungnahme-erstellen`, Schritt 1: zuerst `pdftotext -layout`, bei Scans/Bildern `pdftoppm` und visuelles Lesen. Bei mehrseitigen Dokumenten alle Seiten durchgehen.

## Schritt 2: Dokumentbündel auseinanderhalten

Prüfe aktiv, ob das gelieferte Material mehrere, inhaltlich unabhängige Abschnitte bündelt (siehe `../stellungnahme-erstellen/references/allgemeine-vorbemerkung-und-sonderfaelle.md`, Abschnitt B.1): Sachverständigenhonorar-Rechnungsprüfung, Nutzungsausfall-Prüfbericht, Totalschaden/WBW-Abrechnung vor einer separaten Kalkulation, oder ein Versicherer-eigenes Gegengutachten statt eines externen Prüfdienstleister-Prüfberichts (Abschnitt B.2). Stelle für jeden Abschnitt fest, welchem Anspruchstyp er zuzuordnen ist (Kalkulation/Wertminderung/WBW/Restwert/Sachverständigenhonorar/Nutzungsausfall), und bearbeite nur die für die Bibliothek relevanten Typen (Kalkulation, Wertminderung — sowie WBW/Restwert, sobald hierfür Material vorliegt).

## Schritt 3: Positionen der Stellungnahme den Zeilen des Kürzungsschreibens zuordnen

Falls eine fertige Stellungnahme vorliegt: gleiche jede dort behandelte Position (erkennbar an der Nummerierung und Kapitelüberschrift) mit der passenden Zeile/dem passenden Abschnitt im Kürzungsschreiben ab. Abgleichkriterien, in dieser Reihenfolge:
1. **Betrag** — exakte oder sehr ähnliche Eurobeträge bzw. Arbeitswerte (AW) zwischen Stellungnahme-Text und Prüfbericht-Tabelle sind der zuverlässigste Anker.
2. **Stichwort/Bauteilbezeichnung** — auch bei unterschiedlicher Schreibweise (z.B. "Halteleiste Stoßfänger" im Prüfbericht vs. "Halterung Stoßfänger" in der Stellungnahme).
3. **Kategorie/Thema** — wenn Betrag und Bauteilname nicht eindeutig zuzuordnen sind, über den inhaltlichen Themenbereich (Lackierung, Ersatzteile, Nebenkosten etc.) eingrenzen.

Liegt KEINE fertige Stellungnahme vor (z.B. neuer WBW-Fall), extrahiere stattdessen die Kürzungspositionen direkt aus dem Kürzungsschreiben und kombiniere sie mit den vom Nutzer mitgelieferten Stichpunkten/Notizen zu einem vollständigen, hausstilgemäßen Gegenargument-Entwurf (Ton und Aufbau wie in `../stellungnahme-erstellen/references/hausstil-aufbau-stellungnahme.md` beschrieben).

### Schritt 3a: Nur Stellungnahme vorhanden, kein Kürzungsschreiben

Liegt umgekehrt NUR eine bereits verschickte Stellungnahme vor, ohne das zugehörige Kürzungsschreiben (häufiger Fall bei älteren Akten, bei denen nur der eigene Schriftverkehr aufbewahrt wurde), ist das Material trotzdem verwertbar:

1. Lies jede nummerierte Position der Stellungnahme. In aller Regel referiert der erste Satz oder die Kapitelüberschrift jeder Position bereits die Position/Begründung des Versicherers, bevor das Gegenargument folgt (z.B. "Der Prüfdienstleister vertritt die Auffassung, dass...", "Mit Schreiben vom... wurde X mit der Begründung gestrichen, dass..."). Rekonstruiere daraus die "Begründung Versicherer" sinngemäß — markiere sie als sinngemäße Rekonstruktion, nicht als wörtliches Zitat, da der Originaltext nicht vorliegt.
2. Der exakte Kürzungsbetrag fehlt in diesem Szenario häufiger oder ist nur indirekt erschließbar (z.B. aus einer abschließenden Summen-/Ergebnis-Tabelle der Stellungnahme); falls nicht zweifelsfrei feststellbar, ohne Betrag arbeiten statt einen falschen zu raten.
3. Das eigentlich Wertvolle — der bereits ausformulierte, hausstilgemäße Gegenargument-Text — liegt vollständig vor und kann wie gewohnt kanonisiert werden (Schritt 4).
4. Bei Stapelverarbeitung vieler Stellungnahmen ohne Kürzungsschreiben (z.B. ein größerer Nachtrag von alten Akten): zuerst alle Fälle grob nach Anspruchstyp sortieren (Kalkulation/Wertminderung/WBW/Restwert) und nach Kategorie/Kürzungsgrund gruppieren, bevor einzelne Einträge in die Referenzdateien geschrieben werden — das macht die spätere Kanonisierung (Schritt 4) deutlich einfacher, da sich Mehrfachvorkommen direkt erkennen lassen, statt jede Datei isoliert zu bearbeiten und am Ende viele Near-Duplikate zu erzeugen. Besonders auf WBW/Restwert-Fälle achten, da hierfür noch keine eigene Referenzdatei existiert. Für die Bestätigung vor dem Schreiben gilt der Stapelmodus aus Schritt 5 — keine 150 Einzelbestätigungen.

## Schritt 4: Kanonisieren statt 1:1 übernehmen

Übernimm NICHT einfach den wörtlichen Text aus der einzelnen Stellungnahme in die Bibliothek. Prüfe zuerst, ob für dieses Thema bereits ein Eintrag in `argumente-kalkulation.md` bzw. `argumente-wertminderung.md` existiert:

- **Existiert bereits ein passender Eintrag:** Nur ergänzen, wenn der neue Fall eine wirklich neue Variante, ein neues Zitat/Urteil oder einen relevanten Aspekt liefert, der im bestehenden Eintrag fehlt. Keine Duplikate mit nur leicht abweichendem Wortlaut anlegen.
- **Existiert noch kein Eintrag:** Verallgemeinere den fallspezifischen Text (konkrete Beträge, Seitenangaben links/rechts, Datumsangaben durch Platzhalter ersetzen oder als Beispielwert kennzeichnen) und lege einen neuen Abschnitt nach dem bestehenden Muster an (Format: **Kürzungsgrund** → typische Begründung → einsatzfertiges Gegenargument → Hinweise/Varianten — siehe bestehende Einträge als Vorlage).

## Schritt 5: Bestätigung einholen, dann Referenzdatei ändern

**Einzelfall (ein Fall oder eine Handvoll Fälle):** Zeige dem Nutzer den geplanten neuen oder geänderten Bibliothekseintrag im Entwurf und hole eine Bestätigung ein, BEVOR die Referenzdatei tatsächlich verändert wird.

**Stapelmodus (viele Fälle auf einmal, z.B. ein größerer Nachtrag alter Akten):** Hole NICHT für jeden einzelnen Fall eine eigene Bestätigung ein — das wäre bei mehreren Dutzend oder Hundert Fällen weder praktikabel noch hilfreich. Gehe statt dessen so vor:
1. Arbeite zunächst alle Fälle des Stapels durch und sammle die geplanten Einträge/Ergänzungen, ohne bereits etwas zu schreiben.
2. Fasse das Ergebnis in einer einzigen, kompakten Übersicht zusammen, gegliedert nach Zieldatei/Kategorie: wie viele Fälle wurden welcher Kategorie zugeordnet, wie viele führten zu einem komplett neuen Eintrag vs. einer Ergänzung eines bestehenden Eintrags, und welche Fälle ließen sich keiner Kategorie zuordnen oder waren unklar (diese explizit auflisten statt sie stillschweigend zu verwerfen).
3. Bei neuen Einträgen (nicht bei reinen Ergänzungen bestehender Einträge) den vorgeschlagenen Text mindestens kurz zeigen, da hier das Risiko einer Fehlkategorisierung am größten ist.
4. Erst nach Bestätigung dieser Gesamtübersicht alle Änderungen gesammelt in die jeweiligen Referenzdateien schreiben.
5. Bei sehr großen Stapeln (deutlich über 50 Fälle) den Stapel in mehrere Tranchen aufteilen (z.B. nach Anspruchstyp Kalkulation/Wertminderung/WBW/Restwert) und für jede Tranche einzeln nach diesem Muster vorgehen, statt alles in einem einzigen Rutsch zu verarbeiten.

In beiden Modi gilt: erst nach Bestätigung den Eintrag in die passende Datei einfügen:
- Kalkulationspositionen → `../stellungnahme-erstellen/references/argumente-kalkulation.md`, im passenden Themenabschnitt (1–10) einsortieren.
- Wertminderungspositionen → `../stellungnahme-erstellen/references/argumente-wertminderung.md`.
- WBW/Restwert-Positionen → sobald der erste Fall vorliegt, eine neue Datei `../stellungnahme-erstellen/references/argumente-wbw-restwert.md` nach demselben Format anlegen und in `../stellungnahme-erstellen/SKILL.md` als zusätzliche zu ladende Referenzdatei ergänzen.
- Strukturelle Lessons-Learned (Dokumentbündel-Muster, Sonderfälle) → `../stellungnahme-erstellen/references/allgemeine-vorbemerkung-und-sonderfaelle.md`, Teil B.

## Schritt 6: Kurz zusammenfassen

Nach erfolgreicher Ergänzung kurz zusammenfassen, was geändert wurde (neuer Eintrag vs. Ergänzung eines bestehenden Eintrags, in welcher Datei/welchem Abschnitt) — keine ausführliche Wiederholung des gesamten neuen Textes, das wurde bereits zur Bestätigung gezeigt.

## Hinweise zur Arbeitsweise

- Im Zweifel lieber einen bestehenden Eintrag um eine Variante/einen Hinweis ergänzen, statt einen nahezu identischen neuen Eintrag anzulegen — die Bibliothek soll kompakt und wartbar bleiben, nicht zu einer Sammlung von Einzelfall-Duplikaten werden.
- Bei jeder neuen WBW/Restwert-Position aktiv darauf hinweisen, dass dies einer der ersten Einträge für diese bisher leere Kategorie ist.
- Niemals eine Referenzdatei verändern, ohne dass der Nutzer den geplanten Eintrag vorher gesehen und bestätigt hat.
