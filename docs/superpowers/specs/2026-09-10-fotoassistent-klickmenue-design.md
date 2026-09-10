# Fotoassistent: Klickmenü für Teil/Seite/Schadensart im Prüfmodus

Datum: 10.09.2026
Status: freigegeben (per `/grill-me` geklärt), zur Umsetzung an `/senior-dev`

## Kontext

Die letzten Fixes (Mindestsicherheit, kein Freitext-Fallback mehr bei
`schaden` mit Lexikon) greifen — beim erneuten Testen sah der Nutzer aber
weiterhin Ausdrücke ausserhalb des Lexikons. Geklärt: Das waren Fotos
ausserhalb der Kategorie `schaden` (Reifen/Innenraum/Papiere/Sonstiges) —
dort gibt es kein Lexikon, Freitext ist dort weiterhin richtiges Verhalten,
kein Bug.

Der eigentliche Wunsch: eine schnellere Art, eine Bildunterschrift im
Prüfmodus zu korrigieren, ohne zu tippen. Konkret: im
`Vorschlagsformular` (`src/app/(app)/faelle/[id]/reiter/foto-assistent.tsx`)
soll neben dem bestehenden Freitextfeld ein Klickmenü erscheinen — getrennte
Gruppen anklickbarer Labels für Teile, Seiten und Schadensarten aus dem
Fotolexikon, mit denen sich die Beschreibung per Klick statt per Tippen
zusammensetzen lässt.

## Entscheidungen (per `/grill-me` geklärt)

- **Freitextfeld bleibt bestehen**, das Klickmenü ergänzt es (nicht
  ersetzt) — für Kategorien ohne Lexikon (Reifen, Innenraum, Papiere,
  Sonstiges) bleibt Tippen ohnehin die einzige Option.
- **Mehrere Kombinationen pro Foto sind erlaubt.** Anders als die KI (die
  wegen Halluzinationsgefahr auf einen Treffer je Foto begrenzt ist, siehe
  `2026-09-10-fotoassistent-verlaesslichkeit-design.md`) kann der
  Sachverständige beliebig viele Teil/Seite/Schadensart-Kombinationen
  zusammenklicken — ein Mensch klickt nur an, was er wirklich sieht.
- **Chips bleiben aktiv/inaktiv, das Feld wird immer neu zusammengesetzt.**
  Jede fertige Kombination wird ein Chip; solange mindestens ein Chip aktiv
  ist, zeigt das Beschreibungsfeld genau das, was aus den aktiven Chips
  zusammengesetzt ist (Komma-getrennt, über dieselbe `zusammensetzen()` wie
  beim KI-Vorschlag). Ein Klick auf einen aktiven Chip entfernt ihn wieder
  sauber.
- **Sequentielle Gruppen.** Reihe 1 zeigt alle Teile aus dem Lexikon. Erst
  nach der Wahl eines Teils erscheinen Reihe 2 (dessen gültige Seiten, ganz
  ausgeblendet, wenn das Teil keine hat) und Reihe 3 (dessen gültige
  Schadensarten) — keine ungültigen Kombinationen sind überhaupt anklickbar.
- **Kein Auto-Weiterblättern.** Der bestehende „Übernehmen"-Knopf bleibt
  nötig — das Klickmenü füllt nur das Textfeld, der Sachverständige prüft
  und bestätigt bewusst wie bisher.
- **Nur bei `kategorie: schaden` mit vorhandenem Lexikon.** Bei jeder
  anderen Kategorie, und bei `schaden` ohne Lexikon-Einträge, gibt es
  nichts zum Klicken — das Klickmenü wird dort gar nicht gerendert.

## Datenfluss

`teile: FotoTeil[]` existiert bereits serverseitig (`ladeLexikon()` in
`src/fotos/lexikon-ablage.ts`), wird aber aktuell nur in
`analyse-aktionen.ts` für den KI-Aufruf geladen — nicht für die Anzeige.
Neu durchzureichen:

```
src/app/(app)/faelle/[id]/reiter/fotos.tsx   (Server Component, FotoReiter)
  → lädt zusätzlich: const teile = await ladeLexikon()
  → reicht `teile` an <Fotoraster> weiter

fotos-raster.tsx   (Fotoraster, Client)
  → neue Prop `teile: FotoTeil[]`
  → reicht an <Fotoassistent teile={teile} .../> weiter

foto-assistent.tsx   (Fotoassistent, Client)
  → neue Prop `teile: FotoTeil[]`
  → reicht an <Pruefmodus teile={teile} .../> weiter

Pruefmodus
  → neue Prop `teile: FotoTeil[]`
  → reicht an <Vorschlagsformular teile={teile} .../> weiter

Vorschlagsformular
  → neue Prop `teile: FotoTeil[]`
  → rendert <Klickmenue> nur wenn vorschlag.kategorie === 'schaden' && teile.length > 0
```

`FotoTeil`, `Seite`, `Rohtreffer`, `zusammensetzen` kommen aus
`src/fotos/lexikon.ts` — client-sicher, keine `server-only`-Markierung
(siehe Kopfkommentar dort), problemlos importierbar in der bereits
`'use client'`-markierten `foto-assistent.tsx`.

## Neue reine Funktion — `src/fotos/lexikon.ts`

Die einzige nicht-triviale Logik (eine Kombination toggeln: hinzufügen,
wenn neu; entfernen, wenn schon aktiv) gehört als reine Funktion neben
`zusammensetzen()`, nicht in die Komponente — so bleibt sie ohne
Render-Aufwand testbar. **Wichtiger Fund:** In diesem Projekt gibt es keine
Infrastruktur für React-Komponententests (kein `@testing-library`, keine
jsdom-Umgebung in `vitest.config`) — die Logik muss deshalb als reine
Funktion herauslösbar sein, um überhaupt automatisiert testbar zu sein. Das
Rendering/Verdrahten selbst wird nur durch Typecheck, Build und manuelles
Durchklicken im Browser abgesichert, nicht durch einen automatisierten Test
— das ist eine bewusste Lücke, kein Versehen.

```ts
/**
 * Fügt einen Treffer der aktiven Liste hinzu, oder entfernt ihn wieder,
 * falls exakt derselbe (teil, seite, begriff) schon aktiv ist — das
 * Toggle-Verhalten der Chips im Klickmenü.
 */
export function toggleTreffer(aktiv: readonly Rohtreffer[], neu: Rohtreffer): Rohtreffer[] {
  const index = aktiv.findIndex(
    (r) => r.teil === neu.teil && r.seite === neu.seite && r.begriff === neu.begriff,
  )
  if (index === -1) return [...aktiv, neu]
  return aktiv.filter((_, i) => i !== index)
}
```

**Tests** (`src/fotos/lexikon.test.ts`):
- Fügt einen neuen Treffer hinzu, wenn die Liste leer ist.
- Fügt einen zweiten, unterschiedlichen Treffer hinzu, ohne den ersten zu
  verlieren.
- Entfernt einen Treffer wieder, wenn exakt derselbe (teil, seite, begriff)
  erneut übergeben wird.
- Unterscheidet zwei Treffer mit gleichem Teil, aber unterschiedlicher Seite
  (bleiben beide erhalten, keine Verwechslung).

## Neue Komponente — `Klickmenue` in `foto-assistent.tsx`

```tsx
/**
 * Schnellauswahl für ein Schadendetail-Foto: Teil, Seite, Schadensart per
 * Klick statt Tippen — dieselbe Bindung wie beim KI-Vorschlag
 * (`zusammensetzen` in `lexikon.ts`), nur von Hand statt vom Modell
 * geraten. Mehrere Kombinationen sind erlaubt: ein Mensch klickt nur an,
 * was er wirklich sieht, die Ein-Treffer-Grenze der KI gilt hier nicht.
 */
function Klickmenue({
  teile,
  aktiv,
  setzeAktiv,
}: {
  teile: FotoTeil[]
  aktiv: Rohtreffer[]
  setzeAktiv: (naechste: Rohtreffer[]) => void
}) {
  const [teil, setzeTeil] = useState<FotoTeil | null>(null)
  const [seite, setzeSeite] = useState<Seite | null>(null)

  function schliesseAb(begriff: string) {
    if (!teil) return
    const treffer: Rohtreffer = {
      teil: teil.name,
      seite: teil.seiten.length > 0 ? seite : null,
      begriff,
    }
    setzeAktiv(toggleTreffer(aktiv, treffer))
    setzeTeil(null)
    setzeSeite(null)
  }

  return (
    <div className="klickmenue">
      <div className="klickmenue-reihe" role="group" aria-label="Teil wählen">
        {teile.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`label-chip ${teil?.id === t.id ? 'aktiv' : ''}`}
            aria-pressed={teil?.id === t.id}
            onClick={() => {
              setzeTeil(t)
              setzeSeite(null)
            }}
          >
            {t.name}
          </button>
        ))}
      </div>

      {teil && teil.seiten.length > 0 ? (
        <div className="klickmenue-reihe" role="group" aria-label="Seite wählen">
          {teil.seiten.map((s) => (
            <button
              key={s}
              type="button"
              className={`label-chip ${seite === s ? 'aktiv' : ''}`}
              aria-pressed={seite === s}
              onClick={() => setzeSeite(s)}
            >
              {s}
            </button>
          ))}
        </div>
      ) : null}

      {teil && (teil.seiten.length === 0 || seite) ? (
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
      ) : null}

      {aktiv.length > 0 ? (
        <div className="klickmenue-reihe klickmenue-aktiv" role="group" aria-label="Ausgewählte Kombinationen">
          {aktiv.map((r) => (
            <button
              key={`${r.teil}-${r.seite}-${r.begriff}`}
              type="button"
              className="label-chip aktiv"
              title="Klicken zum Entfernen"
              onClick={() => setzeAktiv(toggleTreffer(aktiv, r))}
            >
              {r.teil}
              {r.seite ? ` ${r.seite}` : ''} {r.begriff} ✕
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
```

## Änderungen an `Vorschlagsformular`

Neuer State `aktiv: Rohtreffer[]` (Anfangswert `[]` — bewusst **nicht**
aus `vorschlag.beschreibung` rückwärts geparst: `Fotovorschlag` speichert
nur den fertigen Satz, keine Struktur, ein Rückparsen wäre brüchiges
String-Matching. Das Klickmenü ist ein rein additives Schnellwerkzeug, kein
Abbild dessen, was die KI schon gewählt hat).

```tsx
const [aktiv, setzeAktiv] = useState<Rohtreffer[]>([])

// Solange mindestens ein Chip aktiv ist, gewinnt die Chip-Komposition.
// Werden alle Chips wieder entfernt, bleibt das Feld unangetastet — kein
// überraschendes Leeren dessen, was der Sachverständige zuletzt selbst
// hineingeschrieben hat.
useEffect(() => {
  if (aktiv.length === 0) return
  const komponiert = zusammensetzen(teile, aktiv)
  if (komponiert) setzeBeschreibung(komponiert)
}, [aktiv, teile])
```

Im JSX, direkt nach dem bestehenden `<div className="feld">` mit dem
Freitextfeld:

```tsx
{vorschlag.kategorie === 'schaden' && teile.length > 0 ? (
  <Klickmenue teile={teile} aktiv={aktiv} setzeAktiv={setzeAktiv} />
) : null}
```

## CSS

Visuell an das bestehende Pillen-Muster `.foto-filterknopf` /
`.foto-filterknopf.aktiv` anlehnen (Rand, Radius 999px, `--accent-soft` im
aktiven Zustand) — neue, eigene Klassen `.klickmenue`, `.klickmenue-reihe`,
`.label-chip`, `.label-chip.aktiv`, damit das Klickmenü nicht an eine
namentlich fremde Funktion (Fotofilter) gekoppelt ist. Genaues Spacing ist
Ermessenssache der Umsetzung, keine weitere Vorgabe nötig.

## Verifikation

- `pnpm typecheck`, `pnpm lint`, `pnpm test` — wie bei den letzten beiden
  Runden.
- `pnpm build` — zur Sicherheit, wie beim letzten Mal (dort war es der
  `'use server'`-Fund; hier ist kein Server-Code betroffen, aber der Bau
  bestätigt die Typen über alle fünf neuen Props hinweg).
- **Manuell im Browser prüfen** (`/run`, falls vorhanden, oder `pnpm dev`):
  ein Schadendetail-Foto mit Lexikon im Prüfmodus öffnen, Teil → Seite →
  Schadensart durchklicken, prüfen dass das Feld korrekt zusammengesetzt
  wird, einen Chip wieder abwählen, eine zweite Kombination hinzufügen,
  prüfen dass beide kommagetrennt im Feld stehen. Das ersetzt die fehlende
  automatisierte Komponentenabdeckung.

## Bewusst nicht Teil dieser Änderung

- Kein Rückparsen der KI-Beschreibung in vorausgewählte Chips.
- Keine Änderung an der KI-seitigen Ein-Treffer-Grenze — die gilt weiterhin
  nur für das Modell, nicht für die manuelle Auswahl.
- Keine Erweiterung auf Nicht-`schaden`-Kategorien — dort gibt es kein
  Lexikon, also nichts zum Klicken.
