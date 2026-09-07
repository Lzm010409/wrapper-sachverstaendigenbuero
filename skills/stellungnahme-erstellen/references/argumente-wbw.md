# Argumentbibliothek WBW (Wiederbeschaffungswert)

Diese Datei enthält Bausteine für Stellungnahmen gegen Kürzungen des Wiederbeschaffungswerts. Es gibt zwei grundlegend verschiedene Szenarien — welches zutrifft, wird in Schritt 2a des Workflows bestimmt.

---

## Szenario-Erkennung

**Szenario A — Pauschalkürzung:** Der Versicherer nennt KEINEN konkreten Vergleichsmarkt oder keine konkreten Vergleichsfahrzeuge. Die Kürzung ist pauschal begründet (z.B. „WBW nicht nachvollziehbar", „DAT-Wert nicht anerkannt", „eigene Bewertung ergibt anderen Wert") oder der Versicherer kürzt einfach ohne Begründung. → Kurze/tabellarische Darlegung der eigenen Ermittlungsmethode.

**Szenario B — Vergleichsfahrzeuge:** Der Versicherer benennt konkrete Vergleichsfahrzeuge (z.B. aus Mobile.de, AutoScout24, eigene Datenbank) als Begründung für den niedrigeren WBW. → Systematische Demontage der Vergleichsfahrzeuge.

Ist unklar welches Szenario vorliegt: Nutzer fragen.

---

## Szenario A: Pauschalkürzung — tabellarische Darlegung

### Benötigte Infos vom Nutzer (aktiv abfragen falls nicht aus Unterlagen ersichtlich):
- DAT-Bewertungsdatum
- Basiswert laut DAT / Marktrecherche (Fahrzeug ohne Vorschäden, mit Kilometerfilter)
- Kilometerfilter der Recherche (z.B. 10.000–40.000 km)
- Genutzte Plattformen (z.B. DAT, Mobile.de, AutoScout24)
- Liste der Vorschäden/Abzüge (Bezeichnung + Betrag je Vorschaden)
- Eigener ermittelter WBW (Endwert)
- Vom Versicherer angesetzter WBW (Kürzungsbetrag)

### Einleitungssatz (Vorlage):
> zu Ihrer Kürzung des Wiederbeschaffungswerts um [Kürzungsbetrag] € (von [eigener WBW] € auf [Versicherer-WBW] €) nehmen wir wie folgt Stellung:

### Hauptblock (Vorlage):
> Die Ermittlung des Wiederbeschaffungswerts des in Rede stehenden Fahrzeugs erfolgte am [DAT-Datum] auf Basis einer DAT-Bewertung sowie durch Recherchearbeiten auf den gängigen Plattformen ([Plattformen]).

Danach folgt eine Tabelle:

| Position | Betrag |
|---|---|
| Gebrauchtfahrzeug ([Plattform] ohne Schäden, [km-Filter] km) | [Basiswert] € |
| [Vorschaden 1 Bezeichnung] | −[Betrag] € |
| [Vorschaden 2 Bezeichnung] | −[Betrag] € |
| … | … |
| **Wiederbeschaffungswert inkl. Vorschäden** | **[WBW inkl. Schäden] €** |
| **Wiederbeschaffungswert korrigiert** | **[finaler WBW] €** |

> Der von Ihnen angesetzte Wert von [Versicherer-WBW] € ist damit nicht nachvollziehbar. Der Wiederbeschaffungswert von [eigener WBW] € ist auf Basis der vorstehenden Ermittlung gerechtfertigt und vollständig zu erstatten.

### Hinweise für Szenario A:
- Liegen keine Vorschäden vor, entfallen die Abzugszeilen; die Tabelle hat dann nur Basiswert und finalen WBW.
- Liegt kein DAT-Datum vor, kann auch das Besichtigungsdatum oder das Auftragsdatum verwendet werden.
- Der Stil ist bewusst kurz und tabellarisch — kein langer Fließtext.

---

## Szenario B: Ausführliche Stellungnahme — stichpunktbasiert

Szenario B ist kein starres Template, sondern ein **Stil- und Strukturrahmen**. Der Inhalt kommt vollständig als Stichpunkte vom Nutzer — der Agent übernimmt ausschließlich die sprachliche Ausformulierung und die Dokumentstruktur.

### Stil- und Strukturvorgabe (orientiert am Gollenstede-Beispiel)

Das fertige Dokument folgt diesem Aufbau:

1. **Einleitungssatz** — nennt Kürzungsbetrag, eigenen WBW, Versicherer-WBW und die wörtliche/sinngemäße Versichererbegründung
2. **Hauptvorwurf** — ein oder zwei Sätze die den Kernfehler der Versicherer-Argumentation benennen (z.B. „Die Vergleichsfahrzeuge sind nicht vergleichbar")
3. **Gegliederte Unterpunkte** — jeder Kritikpunkt als eigener Absatz mit **Fettüberschrift**, gefolgt von 2–4 Sätzen Fließtext. Keine nummerierten Listen, keine Bulletpoints im Fließtext
4. **Marktlage-Absatz** (falls vom Nutzer angegeben) — belegt den eigenen WBW mit Marktbeobachtungen
5. **Abschlussformel** — fasst zusammen warum die Kürzung nicht nachvollziehbar ist und warum der eigene WBW gerechtfertigt ist

Sprachlich: sachlich-bestimmt, keine Konjunktive, Fachbegriffe ohne Erklärung, keine übertriebene Schärfe aber klare Aussagen.

### Ablauf im Workflow

Der Agent fragt den Nutzer einmalig nach seinen Stichpunkten — offen und ohne vorgegebene Kategorien:

> „Welche konkreten Unterschiede/Mängel der Vergleichsfahrzeuge möchtest du ansprechen? Gib einfach Stichpunkte — ich formuliere daraus den ausführlichen Text im Gollenstede-Stil."

Der Nutzer antwortet frei, z.B.:
- „Falsche Farbe, unser Auto ist weiß, die haben grüne und blaue genommen"
- „Ausstattung fehlt: SHZ, LM-Felgen, Sportfahrwerk"
- „Eines der Vergleichsautos hat Seitenschaden"
- „Markt: weiße Autos mit dieser Ausstattung gehen für über 3000 weg"
- Oder auch nur: „Kilometerstand 20k höher als unserer"

Der Agent baut daraus automatisch die passenden Absätze mit Fettüberschriften und Fließtext — ohne dass der Nutzer Kategorienamen kennen oder auswählen muss.

Falls der Nutzer Screenshots hochgeladen hat, wird am Ende eine Fotoanlage ergänzt.

### Einleitungssatz (Vorlage — Werte einsetzen):
> zu Ihrer Kürzung des Wiederbeschaffungswerts um [Kürzungsbetrag] € (von [eigener WBW] € auf [Versicherer-WBW] €) mit der Begründung, „[Versichererbegründung]", nehmen wir wie folgt Stellung:

> Die von Ihnen herangezogenen Vergleichsfahrzeuge entsprechen nicht dem Mandantenfahrzeug und sind daher als Bewertungsgrundlage ungeeignet.

### Abschlussformel (Vorlage — anpassen je nach genannten Punkten):
> Aufgrund der vorstehenden Ausführungen ist Ihre Begründung für die Kürzung fachlich nicht nachvollziehbar. [Kurze Zusammenfassung der Hauptpunkte]. Der Wiederbeschaffungswert von [eigener WBW] € ist daher gerechtfertigt und vollständig zu erstatten.

---

## Kombination WBW + Kalkulation im selben Dokument

Enthält ein Kürzungsschreiben sowohl eine WBW-Kürzung als auch Kalkulations-Kürzungen, gilt:

1. **WBW-Block kommt zuerst** im fertigen Schreiben — als eigener nummerierter Abschnitt (z.B. „I. Wiederbeschaffungswert") vor den Kalkulations-Positionen (z.B. „II. Reparaturkostenabrechnung"). Ausnahme: Nutzer wünscht andere Reihenfolge.
2. **Einleitungssatz** nennt beide Kürzungstypen: „zu Ihrer Kürzung des Wiederbeschaffungswerts sowie der Reparaturkostenabrechnung nehmen wir wie folgt Stellung:"
3. **Sammelabfrage in Schritt 5** enthält den WBW-Block als erste Gruppe, die Kalkulations-Positionen als zweite Gruppe — alles in einem einzigen `ask_user_input`-Aufruf.
4. **Abschlussformel** fasst beide Bereiche zusammen.
5. **Fotoanlage** (falls vorhanden) kommt nach dem Kalkulations-Teil, ganz am Ende.
