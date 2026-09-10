# Fotoassistent: Verlässlichkeit statt Vollständigkeit

Datum: 10.09.2026
Status: freigegeben (per `/grill-me` geklärt), zur Umsetzung an `/senior-dev`

## Kontext

Beim Testen mit echten Fällen wurden vier Probleme in `src/fotos/assistent.ts`
gefunden, die über die letzten beiden Fixes (Ein-Treffer-Grenze,
Positionsfotos bekommen feste Bildunterschrift) hinausgehen:

1. Ein Vorschlag mit `sicherheit < 50` wurde trotzdem mit vollem
   Lexikon-Treffer übernommen — eine Unsicherheit, die der Systemtext selbst
   einfordert ("Unter 50, wenn das Bild unklar ist"), hatte keine Folge.
2. Beschreibungen weichen weiterhin vom Lexikon-Wortlaut ab. Ursache: der
   Freitext-Fallback bei `kategorie: schaden`, wenn kein gültiger Treffer
   zustande kam (Modell hat sich nicht ans Lexikon gehalten, oder wollte ein
   nicht gelistetes Teil beschreiben) — dieser Pfad lässt beliebigen Wortlaut
   durch, obwohl ein Lexikon vorhanden ist.
3. Bei den vier Eckansichten (`ansicht_vorne_links/rechts`,
   `ansicht_hinten_links/rechts`) wird links/rechts in Fahrtrichtung falsch
   zugeordnet — ein Beleg zeigte eine Heckaufnahme mit der Fahrzeugseite links
   im Bild, beschriftet als "hinten rechts" statt korrekt "hinten links".
4. Fotos, die in autoiXpert bereits eine echte, von einem Menschen verfasste
   Beschreibung tragen, werden trotzdem durch den Assistenten geschickt —
   verschwendete Modellaufrufe, und im Ergebnis unbenutzte Vorschläge (die
   Prüf-Oberfläche blendet sie zwar über `!foto.beschreibung` aus, aber der
   Aufruf ist trotzdem passiert).

## Entscheidungen (per `/grill-me` geklärt)

- **Sicherheitsgrenze gilt global.** `sicherheit < 50` verwirft den
  kompletten Vorschlag, unabhängig von der Kategorie — nicht nur bei
  `schaden` mit Treffer. Das Foto zählt dann wie eines, zu dem das Modell gar
  nichts geliefert hat: kein Vorschlag, nächster Lauf versucht es erneut.
- **Kein Freitext-Fallback mehr bei `schaden`, wenn ein Lexikon existiert.**
  Kommt kein gültiger Treffer zustande, entfällt der Vorschlag komplett —
  auch für ein tatsächlich nicht gelistetes Teil. Das ist eine bewusste
  Entscheidung für maximale Kontrolle über den Wortlaut: lieber kein
  KI-Vorschlag als einer mit eigener Formulierung. Existiert (noch) gar kein
  Lexikon (`teile.length === 0`), bleibt `schaden` wie bisher frei
  formuliert — dafür gibt es keine Alternative.
- **Ecken-Zuordnung: nur ein schärferer, geometrisch korrekter Prompt-Hinweis.**
  Keine zusätzliche serverseitige Absicherung (z. B. Sicherheit künstlich
  deckeln) — die neue globale 50 %-Grenze fängt die Fälle ab, in denen das
  Modell seine eigene Unsicherheit schon erkennt; alles darüber bleibt ein
  Wahrscheinlichkeitsproblem, das mit besserer Prompt-Führung, aber ohne
  Garantie, angegangen wird.
- **"Bereits beschriftet"-Erkennung: einfacher Vergleich.** `description`
  (autoiXpert) wird mit `original_name` ohne Dateiendung und ohne
  Gross-/Kleinschreibung verglichen. Stimmen sie überein, oder ist
  `description` leer, gilt das Foto als unbeschriftet und wird analysiert.
  Weichen sie ab, gilt es als von einem Menschen beschriftet und wird
  übersprungen — ganz ohne Modellaufruf.

## Fix A — harte Sicherheitsgrenze

**Datei:** `src/fotos/assistent.ts`

Neue Konstante:

```ts
/**
 * Unterhalb dieser Sicherheit entfällt ein Vorschlag komplett — für jede
 * Kategorie, nicht nur bei einem Lexikon-Treffer. Das Foto zählt dann wie
 * eines, zu dem das Modell nichts geliefert hat: kein Vorschlag, der nächste
 * Lauf versucht es erneut. Eine Unsicherheit, die der Systemtext selbst
 * einfordert ("unter 50, wenn das Bild unklar ist"), soll auch eine Folge
 * haben, statt nur eine Zahl neben einem übernommenen Vorschlag zu sein.
 */
const MINDESTSICHERHEIT = 50
```

In `beschriftePaket`, direkt nach dem Zuordnen des Vorschlags, **vor**
`bildunterschrift(...)`:

```ts
const vorschlag = nachId.get(bild.fotoId)
if (!vorschlag) continue

const sicherheit = Math.round(vorschlag.sicherheit)
if (sicherheit < MINDESTSICHERHEIT) continue

const beschreibung = bildunterschrift(vorschlag, teile)
if (!beschreibung) continue
vorschlaege.push({
  fotoId: bild.fotoId,
  kategorie: vorschlag.kategorie,
  beschreibung,
  verwendung: verwendungFuer(vorschlag.kategorie),
  sicherheit, // schon gerundet — nicht zweimal runden
  stand: 'offen',
})
```

Gerundet wird einmal, an dieser Stelle — die bisherige zweite Rundung beim
Aufbau des `Fotovorschlag` entfällt, sie war ohnehin redundant.

**Aufräumen in der UI (`foto-assistent.tsx`):** Da kein Vorschlag mehr unter
50 % ankommen kann, ist die Warn-Pille (`UNSICHER_SCHWELLE`, `m-warn`) toter
Code — sie kann nie mehr greifen. Entfernen: die Konstante, den
Verzweigungscode in `Pruefmodus`, und stattdessen immer die schlichte
`<span className="unterzeile">Sicherheit {vorschlag.sicherheit} %</span>`
zeigen. Das Sortieren nach Sicherheit beim Öffnen des Prüfmodus
(`[...offene].sort((a, b) => a.sicherheit - b.sicherheit)`) bleibt — unter den
verbleibenden 50–100 ist die Reihenfolge weiterhin nützlich.

## Fix B — kein Freitext-Fallback mehr bei `schaden`

**Datei:** `src/fotos/assistent.ts`, Funktion `bildunterschrift`.

Rückgabetyp ändert sich von `string` zu `string | null` — `null` heisst
„kein Vorschlag für dieses Foto", genau wie ein leerer String heute schon
behandelt wird.

```ts
function bildunterschrift(
  vorschlag: z.infer<typeof vorschlagSchema>,
  teile: readonly FotoTeil[],
): string | null {
  if (POSITIONSKATEGORIEN.includes(vorschlag.kategorie)) {
    return kategoriename(vorschlag.kategorie)
  }

  if (vorschlag.kategorie === 'schaden' && teile.length > 0) {
    // Existiert ein Lexikon, gilt für schaden ausschliesslich sein
    // Wortlaut. Kommt kein gültiger Treffer zustande — das Modell hat sich
    // nicht daran gehalten, oder es ist wirklich ein nicht gelistetes Teil
    // zu sehen — entfällt der Vorschlag komplett. Bewusst kein Freitext
    // mehr als Ausweg: lieber kein KI-Vorschlag als einer mit eigener
    // Formulierung, die vom Hausstil abweicht.
    const rohtreffer: Rohtreffer[] = vorschlag.treffer.slice(0, 1).map((t) => ({
      teil: t.teil,
      seite: istSeite(t.seite) ? t.seite : null,
      begriff: t.beschaedigungsart,
    }))
    const zusammengesetzt = zusammensetzen(teile, rohtreffer)
    if (!zusammengesetzt) return null
    return zusammengesetzt.trim().replace(/[.;:,\s]+$/, '').slice(0, 120)
  }

  // schaden ohne Lexikon (es gibt noch keine Einträge — dann bleibt gar
  // keine Alternative zu Freitext) sowie Reifen/Innenraum/Papiere/Sonstiges.
  const text = vorschlag.beschreibung.trim().replace(/[.;:,\s]+$/, '').slice(0, 120)
  return text || null
}
```

Aufrufer (`beschriftePaket`) bleibt bei `if (!beschreibung) continue` — die
Prüfung passt unverändert für `null` und leeren String.

**Systemtext-Anpassung:** Der Satz "Ist keines der gelisteten Teile zu sehen,
lass treffer leer und beschreibe wie gewohnt frei im Feld beschreibung." ist
nicht mehr richtig, sobald ein Lexikon existiert — dieser Fall bekommt jetzt
gar keinen Vorschlag mehr. Ersetzen durch:

```
- Existiert ein Teile-Lexikon (siehe unten), wird bei kategorie "schaden"
  ausschliesslich der Lexikon-Treffer verwendet — beschreibung wird in
  diesem Fall nie benutzt, auch nicht wenn treffer leer bleibt. Erkennst du
  keines der gelisteten Teile beschädigt, lass treffer leer und schreibe
  trotzdem eine knappe beschreibung (Validierung verlangt das Feld) — sie
  wird nur ignoriert, verschwende darauf also keine Mühe.
```

## Fix C — Ecken-Zuordnung (Fahrtrichtung bei den vier Eckansichten)

**Datei:** `src/fotos/assistent.ts`, `SYSTEM`-Text.

Neuer Absatz, direkt nach der bestehenden Zeile "Die Seitenangabe folgt der
Fahrtrichtung, nicht dem Blick des Betrachters.":

```
- Bei den vier Eckansichten (ansicht_vorne_links/rechts,
  ansicht_hinten_links/rechts) entscheidet eine einfache Regel, keine
  Vermutung: Bei einer Aufnahme von HINTEN blickst du gedanklich in
  dieselbe Richtung wie das Fahrzeug fährt — keine Spiegelung, was im Bild
  links erscheint, ist auch in Fahrtrichtung links. Bei einer Aufnahme von
  VORNE blickst du dem Fahrzeug entgegen — hier spiegelt sich die Seite,
  was im Bild links erscheint, ist in Fahrtrichtung rechts, und umgekehrt.
  Beispiel: Auf einer Heckaufnahme ist links im Bild eine Fahrzeugseite mit
  Rad und Kotflügel zu sehen, rechts nur Kennzeichen und Rückleuchte — das
  ist "ansicht_hinten_links", nicht "ansicht_hinten_rechts".
```

Das ist ein Wahrscheinlichkeitsproblem der Bildwahrnehmung, keine
Logikkorrektur — die neue globale Sicherheitsgrenze (Fix A) fängt einen Teil
der verbleibenden Fehlklassifikationen ab, wenn das Modell seine eigene
Unsicherheit erkennt; eine Garantie gibt es nicht und ist auch nicht
vorgesehen.

## Fix D — bereits menschlich beschriftete Fotos überspringen

**Datei:** `src/fotos/analyse-aktionen.ts`

Neue lokale Funktion, vor `fuehreAnalyseAus`:

```ts
/**
 * Ob ein Foto schon eine echte, von einem Menschen stammende Beschreibung
 * trägt — im Unterschied zu einem Wert, der zufällig nur den Dateinamen
 * wiederholt (z. B. weil ein Import ihn dort hineingeschrieben hat). Nur
 * Fotos ohne echte Beschreibung gehen überhaupt zum Modell — ein
 * Modellaufruf für ein längst beschriftetes Foto kostet Geld für einen
 * Vorschlag, den ohnehin niemand zu sehen bekommt (die Prüf-Oberfläche
 * blendet ihn über `!foto.beschreibung` ohnehin aus).
 */
function bereitsMenschlichBeschriftet(foto: Fotodaten): boolean {
  const beschreibung = foto.description?.trim()
  if (!beschreibung) return false
  const dateiname = foto.original_name?.trim()
  if (!dateiname) return true
  const ohneEndung = (text: string) => text.replace(/\.[a-z0-9]+$/i, '').toLowerCase()
  return ohneEndung(beschreibung) !== ohneEndung(dateiname)
}
```

Import ergänzen: `import type { Fotodaten } from '@/autoixpert/typen'`.

In `fuehreAnalyseAus`, nach `const fotos = await client.holeFotos(reportId)`:

```ts
const fotos = await client.holeFotos(reportId)
gesamt = fotos.length

const zuAnalysieren = fotos.filter((f) => !bereitsMenschlichBeschriftet(f))

if (zuAnalysieren.length > 0) {
  // ... Fahrzeugkontext, ladeLexikon() wie bisher ...

  // Stilbeispiele weiterhin aus ALLEN Fotos: gerade die schon von Hand
  // beschrifteten sind die besten Vorlagen für den Hausstil.
  const stilbeispiele = fotos
    .map((f) => f.description?.trim())
    .filter((b): b is string => Boolean(b))
    .slice(0, 8)

  // ... Schleife wie bisher, aber naechstesPaket bekommt zuAnalysieren ...
  const offen = naechstesPaket(zuAnalysieren, new Set(bekannt.keys()), gescheitert)
}
```

`gesamt` bleibt die Gesamtzahl der Fotos des Falls (für die bestehende
Notiz "X von Y Fotos beschriftet" — Y soll weiterhin die Fallgrösse zeigen,
nicht nur die tatsächlich angefragten). Die Notiz-Formulierung selbst wird
ergänzt, wenn Fotos übersprungen wurden:

```ts
const uebersprungen = fotos.length - zuAnalysieren.length
await notiere({
  ...,
  text:
    `${stand?.vorschlaege.length ?? 0} von ${gesamt} Fotos beschriftet` +
    (uebersprungen > 0 ? ` (${uebersprungen} hatten bereits eine Beschreibung).` : '.'),
  ...,
})
```

## Tests

- `src/fotos/assistent.test.ts`:
  - Sicherheit 49 (jede Kategorie) → kein Vorschlag.
  - Sicherheit 50 → Vorschlag bleibt (Grenzwert-Test, `>=` nicht `>`).
  - `schaden` mit Lexikon, kein gültiger Treffer → kein Vorschlag (ersetzt/ergänzt
    die bisherigen "fällt auf freien Text zurück"-Tests — deren Erwartung
    dreht sich jetzt um: von "freier Text" zu "kein Vorschlag").
  - `schaden` ohne Lexikon (`teile: []`) → freier Text bleibt wie bisher.
- `src/fotos/analyse-aktionen.ts` hat aktuell keine Tests (Serveraktion mit
  DB/autoiXpert-Abhängigkeiten) — `bereitsMenschlichBeschriftet` wird für die
  Testbarkeit **exportiert** (auch wenn nur intern gebraucht) und bekommt
  eigene Unit-Tests in einer neuen `src/fotos/analyse-aktionen.test.ts`:
  - `description` leer → `false`.
  - `description === original_name` (gleiche Gross-/Kleinschreibung) → `true`
    (bereits beschriftet im Sinne der Funktion — Vorsicht: das ist der Fall,
    der NICHT übersprungen werden soll; die Funktion beschreibt nur den
    Stringvergleich, der Aufrufer entscheidet mit `!bereitsMenschlichBeschriftet(f)`,
    ob analysiert wird. Test-Namen entsprechend eindeutig wählen, z. B.
    `gibt false zurück, wenn die Beschreibung dem Dateinamen entspricht`).
  - `description` gleicht Dateinamen ohne Endung/Gross-Klein
    (`"img_1234"` vs. `"IMG_1234.JPEG"`) → `false`.
  - `description` weicht wirklich ab (`"Ansicht hinten links"`) → `true`.
  - `original_name` fehlt, aber `description` gesetzt → `true` (kann nicht
    geprüft werden, im Zweifel als „schon beschriftet" behandeln, nicht
    unnötig neu beschriften).

## Bewusst nicht Teil dieser Änderung

- Keine serverseitige Deckelung der Sicherheit für die vier Eckansichten —
  nur der schärfere Prompt-Hinweis (Fix C).
- Keine Änderung an der Mehrteile-pro-Foto-Frage (Tür/Schweller/Seitenwand-
  Überlappung) — dafür sollen weiterhin erst mehr Testfälle gesammelt werden.
- Keine Änderung an `zusammensetzen()`/`lexikon.ts` — die Komposition selbst
  bleibt, nur wann sie noch einen Fallback hat, ändert sich.
