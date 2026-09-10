# Fotoassistent: Hochkantbilder korrekt skalieren + Lexikon-Seite als drei freie Achsen

Datum: 10.09.2026
Status: freigegeben (per `/grill-me` geklärt), zur Umsetzung an `/senior-dev`

## Teil A — Hochkantbilder werden falsch skaliert

### Kontext

Screenshot des Nutzers: ein Hochkantfoto füllt im Prüfmodus/in der
Grossansicht die ganze Bühne, Navigationsleiste und Beschriftungsformular
sind nicht mehr sichtbar. Querformat-Bilder waren nie betroffen.

### Ursache

`.foto-buehne-inhalt` (der Flex-Container, der Bild, Leiste und Formular
untereinander anordnet) hat `max-height: 100%` — eine Deckelung, kein
fester Wert. Nach der Flexbox-Spezifikation ist die daraus abgeleitete
Höhe von `.foto-buehne-bild` (und damit die Bezugsgrösse für
`img { max-height: 100% }`) dadurch nicht in jedem Fall "definit". Für ein
Querformat-Bild greift ohnehin `max-width: 100%` als bindende Grenze —
der Fehler blieb dort unsichtbar. Für ein Hochkantbild ist `max-width`
nie die bindende Grenze; dort entscheidet allein `max-height`, und die
löst sich in genau den Fällen, in denen `.foto-buehne-inhalt` nicht durch
seinen Inhalt (Leiste + Formular) auf eine definite Höhe gezwungen wird,
als unbegrenzt auf — das Bild wächst auf seine native (sehr grosse)
Höhe.

### Fix

- `.foto-buehne-inhalt`: `max-height: 100%` → `height: 100%` (definit,
  nicht mehr nur gedeckelt).
- `.foto-buehne-bild img`: `object-fit: contain` → `object-fit:
  scale-down` — mit einer jetzt immer vollen Höhe darf ein kleines Bild
  nicht mehr hochskaliert werden, `scale-down` verhält sich wie `contain`,
  vergrössert aber nie über die native Grösse hinaus.

Betrifft ausschliesslich `src/app/globals.css`, keine weitere Datei.

### Verifikation

- `pnpm build` (reiner CSS-Fix, kein Typecheck-relevanter Code).
- Manuell im Browser: ein Hochkantfoto und ein Querformat-Foto im
  Prüfmodus und in der normalen Grossansicht öffnen, bei unterschiedlichem
  Browser-Zoom (100 %, 150 %, 67 %) prüfen, dass Leiste und Formular immer
  sichtbar bleiben und das Bild nicht über seine native Grösse
  hinauswächst.

---

## Teil B — Lexikon-Seite wird zu drei freien Achsen

### Kontext

`Seite` ist aktuell eine feste Menge von vier Werten (links, rechts,
vorne, hinten), je Teil im Lexikon einzeln freigeschaltet
(`FotoTeil.seiten`) und im Klickmenü als eine einzelne Auswahl-Reihe
abgebildet. Wunsch: Ausdrücke wie "vorne links" oder "hinten rechts"
zusammenbauen können — plus, per Nachtrag mitten in der Umsetzung, eine
dritte Achse für "oben"/"unten"/"mittig" (z. B. ein Stossfänger, an dem
nur der obere oder der untere Bereich beschädigt ist).

### Entscheidungen (per `/grill-me` geklärt)

- **Drei unabhängige, beliebig kombinierbare Achsen** statt einer flachen
  Werteliste oder eines pro Teil konfigurierten Kombinationsfelds:
  - Längsachse: `vorne` | `hinten`
  - Querachse: `links` | `rechts`
  - Höhenachse: `oben` | `unten` | `mittig`
  Jede Achse ist für sich optional — ein Treffer kann keine, eine, zwei
  oder alle drei setzen (z. B. nur `quer: rechts` für "Kotflügel rechts",
  oder `laengs: vorne, quer: links` für "vorne links", oder zusätzlich
  `hoehe: unten` für "vorne links unten").
- **Gilt für alle Teile gleich, keine Konfiguration je Teil mehr.** Bisher
  legte die Verwaltungsseite je Teil fest, welche Seiten überhaupt gültig
  sind (`FotoTeil.seiten`). Das entfällt ersatzlos — jedes Teil im
  Lexikon erlaubt ab sofort alle drei Achsen in jeder Kombination. Damit
  verschwindet auch die bisherige harte Prüfung in `klausel()` ("Seite
  nicht in `teil.seiten`" → Treffer verworfen).
- **Die KI darf alle drei Achsen ebenfalls nutzen**, trotz des in
  `2026-09-10-fotoassistent-verlaesslichkeit-design.md` benannten
  Wahrscheinlichkeitsproblems bei der Links/Rechts-Erkennung. Bewusste
  Entscheidung des Nutzers: dieselbe Fahrtrichtungs-Regel, die für die
  Eckansichten-Kategorien schon gilt, gilt jetzt auch für die
  Achsenwerte eines Schaden-Treffers.
- **Reihenfolge im zusammengesetzten Satz:** Längs → Quer → Höhe → Teil
  bereits vorn, Begriff hinten, z. B. "Kotflügel vorne links oben
  deformiert". Nicht gesetzte Achsen fallen einfach heraus, keine Lücke
  im Satz.

### Datenmodell — `src/fotos/lexikon.ts`

`SEITEN`/`Seite`/`istSeite` werden durch drei Achsen-Konstanten samt
Typen und Wächtern ersetzt:

```ts
export const LAENGSACHSEN = ['vorne', 'hinten'] as const
export type Laengsachse = (typeof LAENGSACHSEN)[number]
export function istLaengsachse(wert: string): wert is Laengsachse {
  return (LAENGSACHSEN as readonly string[]).includes(wert)
}

export const QUERACHSEN = ['links', 'rechts'] as const
export type Querachse = (typeof QUERACHSEN)[number]
export function istQuerachse(wert: string): wert is Querachse {
  return (QUERACHSEN as readonly string[]).includes(wert)
}

export const HOEHENACHSEN = ['oben', 'unten', 'mittig'] as const
export type Hoehenachse = (typeof HOEHENACHSEN)[number]
export function istHoehenachse(wert: string): wert is Hoehenachse {
  return (HOEHENACHSEN as readonly string[]).includes(wert)
}
```

`FotoTeil` verliert `seiten` ersatzlos:

```ts
export interface FotoTeil {
  id: string
  name: string
  erkennungsmerkmal: string | null
  beschaedigungsarten: Beschaedigungsart[]
}
```

`Rohtreffer` bekommt drei optionale Achsenfelder statt eines `seite`-Felds:

```ts
export interface Rohtreffer {
  teil: string
  laengs: Laengsachse | null
  quer: Querachse | null
  hoehe: Hoehenachse | null
  begriff: string
}
```

`klausel()` prüft nur noch Teil und Begriff gegen das Lexikon — keine
Achse wird mehr gegen eine Teil-Konfiguration geprüft, weil es keine mehr
gibt. Die Klausel reiht die gesetzten Achsen in fester Reihenfolge ein:

```ts
function klausel(teile: readonly FotoTeil[], treffer: Rohtreffer): string | null {
  const teil = teile.find((t) => t.name === treffer.teil)
  if (!teil) return null
  if (!teil.beschaedigungsarten.some((b) => b.begriff === treffer.begriff)) return null

  const achsen = [treffer.laengs, treffer.quer, treffer.hoehe].filter(
    (a): a is string => a !== null,
  )
  return [teil.name, ...achsen, treffer.begriff].join(' ')
}
```

`zusammensetzen()` bleibt unverändert (arbeitet nur mit `klausel()`).

`toggleTreffer()`'s Gleichheitsprüfung wird um die zwei neuen Felder
erweitert:

```ts
export function toggleTreffer(aktiv: readonly Rohtreffer[], neu: Rohtreffer): Rohtreffer[] {
  const index = aktiv.findIndex(
    (r) =>
      r.teil === neu.teil &&
      r.laengs === neu.laengs &&
      r.quer === neu.quer &&
      r.hoehe === neu.hoehe &&
      r.begriff === neu.begriff,
  )
  if (index === -1) return [...aktiv, neu]
  return aktiv.filter((_, i) => i !== index)
}
```

### Tests — `src/fotos/lexikon.test.ts`

Vollständig überarbeiten:
- Fixtures ohne `seiten`-Feld.
- `zusammensetzen`: Treffer nur mit `quer`, Treffer mit `laengs` + `quer`,
  Treffer mit allen drei Achsen, Treffer ganz ohne Achse (nur Teil +
  Begriff) — jeweils die erwartete Wortreihenfolge Längs → Quer → Höhe.
  Die bisherigen "Seite nicht erlaubt für dieses Teil"-Tests entfallen
  (es gibt keine Teil-Restriktion mehr); stattdessen ein Test, der zeigt,
  dass **jedes** Teil jede Achsenkombination annimmt.
- `toggleTreffer`: bestehende vier Tests, plus einen, der zwei Treffer
  mit gleichem Teil und gleicher Querachse, aber unterschiedlicher
  Höhenachse unterscheidet (keine Verwechslung zwischen den Achsen).

### Datenbank — `src/db/schema.ts` + Migration

`fotoTeilSeiteEnum` und `fotoTeil.seiten` fallen ersatzlos weg — es gibt
keine Teil-Restriktion mehr, die eine Spalte bräuchte. Die drei
Achsenwerte eines Treffers sind reine Laufzeitdaten des Klickmenüs bzw.
des KI-Werkzeugs, nirgends als Teil-Eigenschaft gespeichert.

```ts
// entfällt: export const fotoTeilSeiteEnum = pgEnum(...)
// in fotoTeil: entfällt die Zeile
//   seiten: fotoTeilSeiteEnum().array().notNull().default(sql`'{}'::foto_teil_seite[]`),
```

Migration mit `pnpm db:generate` erzeugen, nicht von Hand schreiben —
Drizzle kennt die Reihenfolge (Spalte vor Typ droppen). Das generierte
SQL vor dem Ausführen kurz gegenlesen: erwartet werden ein
`ALTER TABLE "foto_teil" DROP COLUMN "seiten";` und ein
`DROP TYPE "foto_teil_seite";`, in dieser Reihenfolge.

### Datenschicht — `src/fotos/lexikon-ablage.ts`, `lexikon-aktionen.ts`

- `lexikon-ablage.ts`: Import von `SEITEN`/`Seite` entfernen, das
  `seiten:`-Feld aus `FotoTeilEingabe` und aus der Zeilenabbildung in
  `ladeLexikon()` streichen.
- `lexikon-aktionen.ts`: `seiten: string[]` aus `FotoTeilEingabe`
  streichen, `istSeite`-Import und die `seiten: eingabe.seiten.filter(istSeite)`-Zeile
  in `geputzt()` entfernen.

### Verwaltungsseite — `formular.tsx`, `page.tsx`

- `formular.tsx`: den kompletten "Seiten"-Block entfernen — `SEITEN`/
  `Seite`-Import, `seiten`-State, `schalteSeite()`, das Checkbox-Feld
  samt Erklärtext, den `seiten`-Anteil im `verwerfe()`/`speichere()`-Reset
  und im `seitenText` der eingeklappten Kartenansicht (dort nur noch
  `begriffe` anzeigen).
- `page.tsx`: den Satz "Ein Teil ohne angekreuzte Seite bekommt keine
  Seite in den Satz." aus dem Hinweistext entfernen — durch einen Satz
  ersetzen, der erklärt, dass Längs-, Quer- und Höhenachse jetzt frei je
  Treffer gewählt werden (im Klickmenü bzw. von der KI), nicht mehr je
  Teil vorkonfiguriert.

### KI-Werkzeug — `src/fotos/assistent.ts`

**Schema-Frage, hier entschieden statt live gegen die API geprüft.** Die
in einer früheren Runde erwogene nullable-Enum-Schreibweise
(`type: ["string", "null"]`) liesse sich in dieser Umgebung nicht gegen
die echte Anthropic-Schnittstelle verifizieren (kein
`ANTHROPIC_API_KEY` im Sandbox). Ein falsch geratenes Schema führt bei
`strict: true` zu einem 400 auf **jeden** Foto-Beschriftungsaufruf, nicht
nur zu einem einzelnen Ausreisser — das Risiko ist also nicht
symmetrisch zu einem einzelnen Test-Fehlschlag. Statt zu raten: jede
Achse bleibt ein einfacher, verpflichtender String-Enum wie das
bisherige `seite`-Feld, ergänzt um einen expliziten Signalwert `"keine"`
für "keine Angabe" — exakt dasselbe, bereits produktiv laufende Muster
wie `teil`/`beschaedigungsart` schon heute, nur mit einem zusätzlichen
Wert. Dieser Signalwert wird sofort beim Einlesen auf `null` abgebildet
und erreicht `Rohtreffer` nie als String.

```ts
const trefferSchema = z.object({
  teil: z.string(),
  laengs: z.string(),
  quer: z.string(),
  hoehe: z.string(),
  beschaedigungsart: z.string(),
})
```

In `bauWerkzeug()`:

```ts
properties: {
  teil: { /* unverändert */ },
  laengs: {
    type: 'string',
    enum: [...LAENGSACHSEN, 'keine'],
    description: 'Längsachse des Schadens: vorne, hinten, oder "keine", wenn nicht erkennbar oder nicht zutreffend.',
  },
  quer: {
    type: 'string',
    enum: [...QUERACHSEN, 'keine'],
    description: 'Querachse des Schadens, in Fahrtrichtung: links, rechts, oder "keine".',
  },
  hoehe: {
    type: 'string',
    enum: [...HOEHENACHSEN, 'keine'],
    description: 'Höhenachse des Schadens: oben, unten, mittig, oder "keine".',
  },
  beschaedigungsart: { /* unverändert */ },
},
required: ['teil', 'laengs', 'quer', 'hoehe', 'beschaedigungsart'],
```

In `bildunterschrift()` (Abbildung roh → geprüft, dasselbe Muster wie
bisher mit `istSeite`):

```ts
const rohtreffer: Rohtreffer[] = vorschlag.treffer.slice(0, 1).map((t) => ({
  teil: t.teil,
  laengs: istLaengsachse(t.laengs) ? t.laengs : null,
  quer: istQuerachse(t.quer) ? t.quer : null,
  hoehe: istHoehenachse(t.hoehe) ? t.hoehe : null,
  begriff: t.beschaedigungsart,
}))
```

`auftragstext()`: die Zeile `Seite: ${teil.seiten.length > 0 ? ... :
'ohne'}` entfällt, weil `teil.seiten` nicht mehr existiert — die
Teile-Zeile im Auftragstext zeigt künftig nur noch Name,
Erkennungsmerkmal und Begriffe.

**SYSTEM-Prompt.** Die bestehende Fahrtrichtungs-Regel ("Die
Seitenangabe folgt der Fahrtrichtung, nicht dem Blick des Betrachters.")
und die geometrische Eckansichten-Regel bleiben unverändert bestehen —
sie betreffen die Kategorienamen (`ansicht_vorne_links` etc.), nicht die
Treffer-Achsen. Neu ergänzt werden muss eine Erklärung der drei
Treffer-Achsen, an der Stelle, an der bisher von "Seite" die Rede war:

- `laengs`, `quer` und `hoehe` sind unabhängig voneinander — genau wie
  bei den Kategorienamen gilt für `quer` die Fahrtrichtung, nicht der
  Blick des Betrachters.
- Jede der drei bleibt `"keine"`, wenn sie nicht erkennbar oder für den
  Schaden nicht sinnvoll ist (z. B. ein Kratzer über die gesamte Breite
  eines Stossfängers hat keine sinnvolle Querachse).
- Das Beispiel "Kotflügel rechts leicht verbeult" (falsch, weil frei
  formuliert) bleibt als Gegenbeispiel bestehen, mit aktualisiertem
  richtigen Treffer: `{teil: "Kotflügel", laengs: "keine", quer:
  "rechts", hoehe: "keine", beschaedigungsart: "deformiert"}`.

### Klickmenü — `Klickmenue` in `foto-assistent.tsx`

Da es keine Teil-Restriktion mehr gibt, ist die Sequenz nicht mehr
"Teil → gültige Seiten → gültige Schadensarten", sondern nach der
Teil-Wahl erscheinen alle drei Achsen-Reihen und die Begriffs-Reihe
gleichzeitig — die drei Achsen sind unabhängig voneinander, es gibt
nichts mehr, worauf eine der anderen warten müsste:

```tsx
function Klickmenue({ teile, aktiv, setzeAktiv }: { ... }) {
  const [teil, setzeTeil] = useState<FotoTeil | null>(null)
  const [laengs, setzeLaengs] = useState<Laengsachse | null>(null)
  const [quer, setzeQuer] = useState<Querachse | null>(null)
  const [hoehe, setzeHoehe] = useState<Hoehenachse | null>(null)

  function schliesseAb(begriff: string) {
    if (!teil) return
    setzeAktiv(toggleTreffer(aktiv, { teil: teil.name, laengs, quer, hoehe, begriff }))
    setzeTeil(null)
    setzeLaengs(null)
    setzeQuer(null)
    setzeHoehe(null)
  }

  return (
    <div className="klickmenue">
      <div className="klickmenue-reihe" role="group" aria-label="Teil wählen">
        {/* unverändert */}
      </div>

      {teil ? (
        <>
          <AchsenReihe label="Längsachse wählen" werte={LAENGSACHSEN} wert={laengs} setzeWert={setzeLaengs} />
          <AchsenReihe label="Querachse wählen" werte={QUERACHSEN} wert={quer} setzeWert={setzeQuer} />
          <AchsenReihe label="Höhenachse wählen" werte={HOEHENACHSEN} wert={hoehe} setzeWert={setzeHoehe} />

          <div className="klickmenue-reihe" role="group" aria-label="Schadensart wählen">
            {teil.beschaedigungsarten.map((b) => (
              <button
                key={b.begriff}
                type="button"
                className="label-chip"
                title={b.hinweis}
                onClick={() => schliesseAb(b.begriff)}
              >
                {b.begriff}
              </button>
            ))}
          </div>
        </>
      ) : null}

      {/* aktive Kombinationen: Label erweitert um alle drei Achsen */}
    </div>
  )
}

/** Eine Achse: höchstens ein Wert aktiv, erneutes Klicken wählt ab. */
function AchsenReihe<W extends string>({
  label,
  werte,
  wert,
  setzeWert,
}: {
  label: string
  werte: readonly W[]
  wert: W | null
  setzeWert: (w: W | null) => void
}) {
  return (
    <div className="klickmenue-reihe" role="group" aria-label={label}>
      {werte.map((w) => (
        <button
          key={w}
          type="button"
          className={`label-chip ${wert === w ? 'aktiv' : ''}`}
          aria-pressed={wert === w}
          onClick={() => setzeWert(wert === w ? null : w)}
        >
          {w}
        </button>
      ))}
    </div>
  )
}
```

Die aktiven Kombinationen (unterste Zeile) bauen ihre Beschriftung aus
allen drei optionalen Achsen statt nur `r.seite`:

```tsx
{r.teil}
{r.laengs ? ` ${r.laengs}` : ''}
{r.quer ? ` ${r.quer}` : ''}
{r.hoehe ? ` ${r.hoehe}` : ''} {r.begriff} ✕
```

`AchsenReihe` ist eine reine Präsentationskomponente ohne eigene Logik
(die Auswahl-Umschaltung ist ein Einzeiler) — anders als `toggleTreffer`
lohnt sich hier keine gesonderte, ausserhalb der Komponente testbare
Funktion.

### Betroffene, aber unveränderte Dateien

`fotos-raster.tsx`s `Beschriftung`-Komponente und `foto-assistent.tsx`s
`Vorschlagsformular` reichen `teile` und `aktiv: Rohtreffer[]` nur durch
und rufen `zusammensetzen`/`toggleTreffer` unverändert auf — sie ändern
sich nur insofern, als `Rohtreffer`-Literale jetzt drei Achsenfelder
statt eines `seite`-Felds brauchen (kommt automatisch durch den
TypeScript-Typ zutage, keine eigene Logikänderung).

`scripts/fotolexikon-vorlagen.ts`: `Vorlage.seiten: Seite[]` entfällt
(Import von `Seite` streichen), da `FotoTeil`/die DB-Spalte keine
Teil-Restriktion mehr kennen. Die neun Beispielteile ändern sich
inhaltlich nicht — sie verlieren nur das nicht mehr existierende Feld.

`scripts/starten.mjs`: `befuelleFotolexikon()`s Insert-Anweisung verliert
die `${seitenListe}::foto_teil_seite[]`-Spalte und den zugehörigen
Spaltennamen `seiten` komplett — die Tabelle hat die Spalte nach der
Migration nicht mehr.

`scripts/fotolexikon-seed-erzeugen.ts`, `scripts/fotolexikon-seed.ts`:
keine inhaltliche Änderung nötig, sie reichen `TEILE` nur durch — der
Typecheck deckt ab, ob irgendwo noch `seiten` referenziert wird.

### Bewusst nicht Teil dieser Änderung

- Keine Migration bestehender Fotolexikon-Einträge auf die neuen Achsen
  — die Spalte wird ersatzlos gedroppt, es gab ohnehin keine
  produktiven Daten ausserhalb der Beispielvorlagen.
- Keine nullable-JSON-Schema-Schreibweise für die KI — bewusst der
  sichere Sentinel-Wert `"keine"`, siehe Begründung oben.
- Keine Änderung an der Ein-Treffer-Grenze der KI oder an der
  Mindestsicherheit — beide bleiben wie in der Verlässlichkeits-Runde
  festgelegt.
- Keine Grenze der drei Achsen aufeinander (z. B. "hoehe nur bei
  bestimmten Teilen sinnvoll") — das wäre wieder eine Teil-Restriktion,
  genau das, was diese Änderung abschafft.

## Verifikation (beide Teile zusammen)

- `pnpm typecheck`, `pnpm lint`, `pnpm test`.
- `pnpm db:generate` ausführen, die erzeugte SQL-Datei gegenlesen (siehe
  oben), dann `pnpm build`.
- Manuell im Browser: ein Schadendetail-Foto mit Lexikon im Prüfmodus und
  in der normalen Bearbeitung öffnen, ein Teil wählen, alle drei Achsen
  in einer Kombination setzen (z. B. vorne + links + oben), prüfen, dass
  der Satz in der richtigen Reihenfolge zusammengesetzt wird, eine Achse
  wieder abwählen (erneuter Klick), prüfen, dass sie aus dem Satz
  verschwindet, ohne die anderen zu beeinflussen. Zusätzlich das
  Hochkantbild-Verhalten aus Teil A im selben Durchgang mitprüfen.
