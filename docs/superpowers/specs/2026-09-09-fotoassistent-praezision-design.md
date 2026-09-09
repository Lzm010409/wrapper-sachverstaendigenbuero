# Fotoassistent: Präzision der Lexikon-Beschriftung erhöhen

Status: zur Umsetzung freigegeben (Design), Umsetzung durch separaten Agenten.

## Kontext

Der Fotoassistent (`src/fotos/assistent.ts`) beschriftet Gutachtenfotos automatisch
über Claude (Haiku-Tier, `MODELLE.schnell`). Für erkannte Fahrzeugteile erzwingt das
Fotolexikon (`src/fotos/lexikon.ts`, Verwaltung unter `/verwaltung/fotolexikon`)
bereits ein festes Vokabular: Teil, Seite und Beschädigungsart kommen nicht aus
freier Formulierung, sondern werden über ein striktes Tool-Schema aus der
Lexikon-Liste gewählt und serverseitig zu einem Hausstil-Satz zusammengesetzt
(`zusammensetzen()`).

Trotzdem treten in der Praxis zwei Fehlerbilder auf:

1. **Ein Foto zeigt zwei beschädigte Teile.** Das heutige Schema erlaubt genau
   *ein* Teil/Seite/Beschädigungsart-Tripel pro Foto (`bauWerkzeug()` in
   `assistent.ts`, Felder `teil`, `seite`, `beschaedigungsart` direkt auf dem
   Vorschlag). Sind zwei Teile betroffen, muss sich das Modell für eins
   entscheiden oder vermischt beides im freien Beschreibungstext.
2. **Verwechslung zwischen benachbarten/ähnlichen Teilen im selben Foto.** Das
   Fotolexikon (`FotoTeil`) kennt nur `name`, `seiten` und
   `beschaedigungsarten` — es gibt keine Stelle, an der festgehalten wird, wie
   sich ein Teil optisch von einem Nachbarteil abgrenzt (z. B. Kotflügel vs.
   Tür). Das Modell hat dafür also nur den nackten Namen.

Nicht betroffen (ausdrücklich geprüft und ausgeschlossen): eine Verwechslung der
Foto-Zuordnung *zwischen* verschiedenen Fotos innerhalb eines Pakets. Die
Zuordnung erfolgt bereits über `id`, nicht über Reihenfolge (siehe
`beschriftePaket`, Test „ordnet die Vorschläge nach id zu, nicht nach
Reihenfolge“) und ist nicht Gegenstand dieser Änderung.

## Ziel

Drei unabhängig auslieferbare Änderungen an der bestehenden Struktur — keine
neue Infrastruktur, kein Wechsel des Modells, keine Änderung an der
gespeicherten `Fotovorschlag`-Form (`beschreibung` bleibt ein einzelner
String, weil autoiXpert pro Foto nur ein Beschreibungsfeld kennt):

- **Fix 1:** Mehrere Teile pro Foto zulassen.
- **Fix 2:** Ein Abgrenzungs-Hinweis je Lexikon-Teil, gegen Verwechslung mit
  Nachbarteilen.
- **Fix 3:** Unsichere Vorschläge in der Prüf-UI sichtbar machen, statt sie in
  der Reihenfolge untergehen zu lassen.

## Reihenfolge

1. Fix 1 (größter Hebel, kein Migrationsrisiko)
2. Fix 3 (klein, unabhängig, kann parallel zu 1 laufen)
3. Fix 2 (braucht zusätzlich redaktionelle Pflege der Lexikon-Einträge, sonst
   bleibt das neue Feld leer und wirkt nicht)

Alle drei können in getrennten Pull Requests umgesetzt werden; es gibt keine
Abhängigkeit zwischen ihnen.

---

## Fix 1 — Mehrere Teile pro Foto

### Datenfluss (neu)

Statt einzelner Felder `teil` / `seite` / `beschaedigungsart` liefert das
Modell pro Vorschlag ein Array `treffer` mit 0 bis 3 Einträgen. Ein leeres
Array bedeutet: kein Lexikon-Teil erkannt, `beschreibung` bleibt freier Text
— das ersetzt die heutigen Sentinel-Werte `'kein_teil'` / `'ohne'` /
`'keine'`, die damit komplett entfallen.

### `src/fotos/lexikon.ts`

`zusammensetzen()` bekommt eine neue Signatur, die eine Liste von Treffern
statt eines einzelnen Tripels entgegennimmt:

```ts
export interface Rohtreffer {
  teil: string
  seite: Seite | null
  begriff: string
}

/**
 * Setzt aus mehreren Teil/Seite/Beschädigungsart-Treffern den Hausstil-Satz
 * zusammen — ein Klausel je gültigem Treffer, durch Komma getrennt.
 *
 * Jeder Treffer wird einzeln geprüft wie bisher: passt er nicht zu einem
 * gelisteten Teil, zur zugehörigen Beschädigungsart oder zur erlaubten
 * Seite, fällt **nur dieser eine Treffer** heraus — nicht das ganze Paket.
 * Bleibt am Ende kein gültiger Treffer übrig, gibt die Funktion `null`
 * zurück, das Signal für den Aufrufer, auf den freien Text zurückzufallen.
 */
export function zusammensetzen(
  teile: readonly FotoTeil[],
  treffer: readonly Rohtreffer[],
): string | null
```

Die interne Prüf-Logik pro Treffer (Teil im Lexikon vorhanden, Begriff gehört
zum Teil, Seite ist für das Teil zulässig bzw. wird bei einem seitenlosen
Teil ignoriert) bleibt inhaltlich wie im heutigen `zusammensetzen()` — sie
wird nur pro Array-Element statt einmalig ausgeführt. Gültige Klauseln werden
mit `', '` verbunden, z. B. `"Stoßfänger vorne links deformiert, Kotflügel
vorne links kratzbeschädigt"`.

`src/fotos/lexikon.test.ts` ist entsprechend umzuschreiben: alle bestehenden
Fälle (gültige Kombination, seitenloses Teil, unbekanntes Teil, falsche
Beschädigungsart, falsche Seite, fehlende Seite, `null`/`null`) bleiben als
Einzeltreffer-in-Array-Fälle erhalten, ergänzt um mindestens:

- zwei gültige Treffer → beide Klauseln im Ergebnis, durch `, ` getrennt
- ein gültiger und ein ungültiger Treffer → nur die gültige Klausel im
  Ergebnis (der ungültige fällt lautlos raus, das Paket nicht)
- leeres Array → `null`

### `src/fotos/assistent.ts`

**`bauWerkzeug(teile)`:** Das Feld `treffer` ersetzt die drei Einzelfelder.
Aufbau (nur wenn `teile.length > 0` — sonst wie heute schon üblich das ganze
Feld weglassen, ein leeres `enum: []` ist ungültiges JSON Schema):

```ts
properties: {
  id: { ... },            // unverändert
  kategorie: { ... },     // unverändert
  beschreibung: {
    type: 'string',
    description:
      'Die Bildunterschrift fürs Gutachten, sofern treffer leer ist — sonst ' +
      'wird dieses Feld ignoriert und der Satz aus den treffer-Einträgen ' +
      'zusammengesetzt. Deutsch, höchstens 120 Zeichen, ohne Satzzeichen am Ende.',
  },
  treffer: {
    type: 'array',
    description:
      'Erkannte Fahrzeugteile aus dem Teile-Lexikon im Auftrag, je eines pro ' +
      'sichtbarem Schaden. Leer lassen, wenn keines der gelisteten Teile zu ' +
      'sehen ist — dann zählt allein das Feld beschreibung. Höchstens drei ' +
      'Einträge; mehr passt ohnehin nicht in eine Bildunterschrift.',
    items: {
      type: 'object',
      additionalProperties: false,
      properties: {
        teil: { type: 'string', enum: teilNamen, description: '...' },
        seite: { type: 'string', enum: SEITEN, description: '...nur wenn das Lexikon für dieses Teil eine Seite vorsieht...' },
        beschaedigungsart: { type: 'string', enum: alleBegriffe, description: '...exakt einer der im Lexikon für DIESES Teil gelisteten Begriffe...' },
      },
      required: ['teil', 'seite', 'beschaedigungsart'],
    },
  },
  sicherheit: { ... },     // unverändert
},
required: [ 'id', 'kategorie', 'beschreibung', 'treffer', 'sicherheit' ], // 'treffer' nur, wenn das Feld existiert
```

Wichtig, aus der bestehenden Anmerkung im Code übernommen: `strict: true`
erzwingt kein `minItems`/`maxItems` auf Arrays (siehe Kommentar in
`bauWerkzeug` zum 400er bei `PRUEF_WERKZEUG` in `wbw/pruefung.ts`,
08.09.2026) — die Drei-Treffer-Grenze steht deshalb **nur im
Beschreibungstext**, nicht als Schema-Constraint. Die Begrenzung auf drei
muss serverseitig beim Verarbeiten der Antwort erzwungen werden (siehe
unten), nicht über das Schema.

**`vorschlagSchema` (Zod):**

```ts
const trefferSchema = z.object({
  teil: z.string(),
  seite: z.string(),
  beschaedigungsart: z.string(),
})

const vorschlagSchema = z.object({
  id: z.string(),
  kategorie: z.enum(KATEGORIESCHLUESSEL as [Kategorie, ...Kategorie[]]),
  beschreibung: z.string(),
  // Grosszügig statt hart begrenzt (safeParse soll bei einem Ausreisser
  // nicht das ganze Paket kippen) — die Drei-Grenze wird danach im Code
  // per `.slice(0, 3)` erzwungen, nicht hier.
  treffer: z.array(trefferSchema).default([]),
  sicherheit: z.number().transform((wert) => Math.min(100, Math.max(0, wert))),
})
```

**`beschriftePaket()`:** beim Zusammensetzen pro Vorschlag:

```ts
const rohtreffer: Rohtreffer[] = vorschlag.treffer.slice(0, 3).map((t) => ({
  teil: t.teil,
  seite: istSeite(t.seite) ? t.seite : null,
  begriff: t.beschaedigungsart,
}))
const zusammengesetzt = zusammensetzen(teile, rohtreffer)
```

Der Rest der Funktion (Kürzen auf 120 Zeichen, Satzzeichen am Ende entfernen,
leere Beschreibung verwerfen) bleibt unverändert.

**`SYSTEM`-Text:** Der Absatz zum Teile-Lexikon wird angepasst — sinngemäß:
„Erkennst du eines oder mehrere der im Teile-Lexikon gelisteten Teile
beschädigt, gib zu jedem einen eigenen Eintrag in `treffer` zurück
(höchstens drei) — nie einen eigenen Begriff, auch wenn er naheliegt. Ist
keines der gelisteten Teile zu sehen, lass `treffer` leer und beschreibe wie
gewohnt frei im Feld `beschreibung`." Die bisherigen Sätze zu
`kein_teil`/`ohne`/`keine` entfallen.

### `src/fotos/assistent.test.ts`

Bestehende Tests, die `teil`/`seite`/`beschaedigungsart` flach auf dem
Antwort-Objekt setzen, sind auf `treffer: [{ teil, seite, beschaedigungsart }]`
umzustellen (betrifft mindestens: „setzt den Hausstil-Satz … zusammen“, „fällt
auf den freien Text zurück, wenn kein Teil erkannt wurde“ → jetzt `treffer:
[]` statt der Sentinel-Werte, „fällt auf den freien Text zurück, wenn sich
das Modell nicht ans Lexikon gehalten hat“, „formuliert frei, wenn die
Antwort … gar nicht enthält“ → jetzt schlicht ohne `treffer`-Feld, greift der
Zod-Default `[]`). Zusätzlich ein neuer Test mit zwei gültigen Treffern in
einem `treffer`-Array, der die zusammengesetzte Beschreibung mit beiden
Klauseln prüft.

### Migration / Rollout

Keine Datenbank-Änderung. Bereits gespeicherte `Fotoanalyse`-Datensätze
(`analyse-ablage.ts`) enthalten `Fotovorschlag`-Objekte mit fertigem
`beschreibung`-String — die interne Umstellung im Werkzeugaufruf betrifft nur
neu erzeugte Vorschläge und ist rückwirkungsfrei. Ein Neulauf über den
bestehenden „Zurücksetzen“-Knopf ist nicht zwingend nötig, aber sinnvoll, um
von der Verbesserung zu profitieren.

---

## Fix 2 — Erkennungsmerkmal je Teil

### `src/db/schema.ts`

Neue nullable Textspalte auf `fotoTeil`:

```ts
export const fotoTeil = pgTable(
  'foto_teil',
  {
    id: uuid().primaryKey().defaultRandom(),
    name: text().notNull(),
    seiten: fotoTeilSeiteEnum().array().notNull().default(sql`'{}'::foto_teil_seite[]`),
    /** Wie sich dieses Teil optisch von Nachbarteilen abgrenzt — frei für den Auftragstext. */
    erkennungsmerkmal: text(),
    beschaedigungsarten: jsonb().notNull().default(sql`'[]'::jsonb`),
    erstelltVon: uuid().references(() => benutzer.id, { onDelete: 'set null' }),
    erstelltAm: timestamp({ withTimezone: true }).notNull().defaultNow(),
    geaendertAm: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('foto_teil_name_idx').on(sql`lower(${t.name})`)],
)
```

Migration danach mit `npm run db:generate` erzeugen lassen (Drizzle-Kit) —
keine SQL-Datei von Hand schreiben, damit sie zur bestehenden Nummerierung
unter `drizzle/` passt (zuletzt `0016_superb_firelord.sql`).

### `src/fotos/lexikon.ts`

`FotoTeil` bekommt `erkennungsmerkmal: string | null`.

### `src/fotos/lexikon-ablage.ts`

`ladeLexikon()`: Feld mitlesen und durchreichen (kein zusätzliches
Zod-Schema nötig, ein einzelner nullable Text erfordert keine Validierung wie
bei den `beschaedigungsarten`).

`FotoTeilEingabe` (hier und identisch in `lexikon-aktionen.ts`) bekommt
`erkennungsmerkmal: string`. `speichereTeil()` schreibt das Feld mit durch.

### `src/fotos/lexikon-aktionen.ts`

`geputzt()` trimmt `erkennungsmerkmal`; ein leerer String wird als `null`
gespeichert (Konsistenz mit „Feld ist optional“ statt eines leeren Strings in
der Spalte).

### `src/app/(app)/verwaltung/fotolexikon/formular.tsx`

Neues optionales Textfeld „Erkennungsmerkmal" zwischen dem Namensfeld und dem
Seiten-Block, analog zu den bestehenden `hinweis`-Feldern bei den
Beschädigungsarten (einfaches `<input type="text">` oder `<textarea>`, mit
Platzhaltertext wie „Wie unterscheidet sich dieses Teil optisch von
Nachbarteilen? Optional, aber hilfreich bei leicht verwechselbaren Teilen.").
Zustand analog zu `name`/`seiten` im bestehenden `useState`, wird beim
Speichern in `speichereFotoTeil()` mitgeschickt. In der eingeklappten
Kartenansicht (Zeile ~94–112) muss nichts ergänzt werden — das Merkmal ist
ein Hilfsfeld für die KI, keine Information, die im eingeklappten Überblick
gebraucht wird.

### `src/fotos/assistent.ts`

`auftragstext()`: beim Auflisten des Teile-Lexikons das Merkmal einfügen,
wenn gesetzt:

```ts
...teile.flatMap((teil) => [
  `- ${teil.name} (Seite: ${teil.seiten.length > 0 ? teil.seiten.join('/') : 'ohne'}):`,
  ...(teil.erkennungsmerkmal ? [`  Erkennungsmerkmal: ${teil.erkennungsmerkmal}`] : []),
  ...teil.beschaedigungsarten.map((b) => `  · "${b.begriff}" — ${b.hinweis}`),
]),
```

`assistent.test.ts`: ein Test, der ein `FotoTeil` mit gesetztem
`erkennungsmerkmal` durch `auftragstext()` schickt und prüft, dass der Text
im Ergebnis auftaucht; ein Test, der ohne das Feld (`erkennungsmerkmal:
null`) prüft, dass keine leere „Erkennungsmerkmal:"-Zeile erscheint.

### Redaktionelle Vorarbeit (kein Code)

Dieses Feld wirkt nur, wenn es befüllt wird. Sinnvoll ist, es zunächst gezielt
für die Teile einzutragen, die in der Praxis am häufigsten verwechselt
wurden — nicht pauschal für das ganze Lexikon auf einmal.

---

## Fix 3 — Confidence-Triage in der Prüf-UI

### `src/app/(app)/faelle/[id]/reiter/foto-assistent.tsx`

**Sortierung:** Die Liste, die beim Klick auf „N Vorschläge durchgehen"
übergeben wird, nach `sicherheit` aufsteigend sortieren, statt in
unspezifizierter Reihenfolge:

```ts
<button
  type="button"
  className="knopf haupt"
  onClick={() => setzePruefung([...offene].sort((a, b) => a.sicherheit - b.sicherheit))}
>
```

Damit stehen die unsichersten Vorschläge zuerst im Prüfmodus, nicht am Ende,
wo sie am ehesten überflogen werden.

**Visuelle Markierung:** Die bestehende Zeile

```tsx
<span className="unterzeile">Sicherheit {vorschlag.sicherheit} %</span>
```

in `Pruefmodus` wird unterhalb einer Schwelle (Konstante `UNSICHER_SCHWELLE
= 50`, oben in der Datei neben `ABSTAND_MS` definiert) durch die bestehende
Pillen-Klasse ersetzt, die im Haus schon für „Achtung" steht:

```tsx
{vorschlag.sicherheit < UNSICHER_SCHWELLE ? (
  <span className="marke-pille m-warn">Sicherheit {vorschlag.sicherheit} %</span>
) : (
  <span className="unterzeile">Sicherheit {vorschlag.sicherheit} %</span>
)}
```

Das nutzt die bestehenden CSS-Klassen `.marke-pille` / `.m-warn` aus
`globals.css` (dort schon für andere Warnhinweise verwendet) — keine neue
Farbe, keine neue Klasse.

Kein Test zwingend nötig (reine Darstellung); falls das Projekt für
`foto-assistent.tsx` bereits Komponententests führt, dort einen Fall für
„sortiert nach Sicherheit aufsteigend" ergänzen.

---

## Bewusst nicht Teil dieser Änderung

- **Kaskadierte Zweitprüfung** (separater, enger gefasster Modellaufruf zur
  Verifikation einzelner Treffer) — zurückgestellt, bis sich aus den
  Korrekturen der Sachverständigen zeigt, welche konkreten Teile-Paare
  weiterhin verwechselt werden, obwohl Fix 1 und 2 greifen.
- **Few-Shot-Bildbeispiele im Prompt** — gleicher Grund, erst mit Daten aus
  dem laufenden Betrieb gezielt einsetzen.
- **Modellwechsel** (z. B. auf `MODELLE.formulieren` statt `MODELLE.schnell`)
  — nicht Teil dieser Änderung; falls Fix 1–3 nicht ausreichen, separat zu
  prüfen.
