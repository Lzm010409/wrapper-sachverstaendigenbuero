/**
 * Platzhalter für das, was gleich kommt.
 *
 * **Warum nicht überall ein Kreisel:** Ein Kreisel sagt „es passiert etwas".
 * Ein Platzhalter sagt zusätzlich „und zwar hier, und es wird ungefähr so
 * aussehen". Bei einem Klick auf einen Knopf reicht das erste — man sieht ja,
 * wo man geklickt hat. Beim Wechsel auf eine Seite oder einen Reiter zählt
 * das zweite: die Seite steht sofort da, statt dass der Bildschirm einfriert
 * und dann alles auf einmal erscheint.
 *
 * **Die drei Stufen des Konzepts:**
 *
 * | Wartezeit auf … | Anzeige | Wo |
 * | --- | --- | --- |
 * | eine andere Seite | Platzhalter der Seite | `loading.tsx` je Bereich |
 * | einen langsamen Teil der Seite | Platzhalter des Teils | `<Suspense>` um den Teil |
 * | das Ergebnis eines Klicks | Kreisel im Knopf | `Kreisel` aus `anzeigen.tsx` |
 *
 * Serverkomponenten: sie kosten den Browser nichts.
 */

/** Ein einzelner grauer Balken. `breite` in Prozent. */
export function Balken({ breite = 100, hoehe = 14 }: { breite?: number; hoehe?: number }) {
  return <span className="skelett" style={{ width: `${breite}%`, height: hoehe }} />
}

/**
 * Der Platzhalter einer Liste — Fälle, Stellungnahmen, Bibliothek.
 *
 * Die Zeilenzahl ist bewusst fest: sie soll die Höhe der echten Liste
 * ungefähr treffen, damit der Inhalt beim Erscheinen nicht springt.
 */
export function SkelettListe({ zeilen = 6, titel }: { zeilen?: number; titel?: string }) {
  return (
    <div aria-busy="true" aria-live="polite">
      <span className="nur-vorlesen">{titel ?? 'Wird geladen'} …</span>
      <div className="skelett-kopf">
        <Balken breite={22} hoehe={22} />
        <Balken breite={12} hoehe={22} />
      </div>
      <div className="liste">
        {Array.from({ length: zeilen }, (_, i) => (
          <div className="skelett-zeile" key={i}>
            <Balken breite={38} />
            <Balken breite={18} hoehe={11} />
          </div>
        ))}
      </div>
    </div>
  )
}

/**
 * Der Platzhalter eines Fallreiters.
 *
 * Er bildet die zweispaltige Aufteilung nach, die alle Reiter haben — Inhalt
 * links, Seitenleiste rechts. Wechselt man auf „Vorgang", wartet die Seite
 * auf Pipedrive; ohne das hier stand der alte Reiter einfach weiter da und
 * nichts deutete an, dass etwas unterwegs ist.
 */
export function SkelettReiter({ was }: { was?: string }) {
  return (
    <div className="detail" aria-busy="true" aria-live="polite">
      <span className="nur-vorlesen">{was ?? 'Der Reiter'} wird geladen …</span>
      <div>
        <div className="block">
          <div className="block-label">
            <Balken breite={18} hoehe={11} />
          </div>
          <div className="karte skelett-karte">
            <Balken breite={60} />
            <Balken breite={85} />
            <Balken breite={45} />
            <Balken breite={70} />
          </div>
        </div>
      </div>
      <aside className="seitenleiste">
        <div className="karte skelett-karte">
          <Balken breite={50} hoehe={16} />
          <Balken breite={90} />
          <Balken breite={75} />
        </div>
      </aside>
    </div>
  )
}

/** Der Platzhalter einer Fallseite: Kopf, Reiterleiste, ein Reiter. */
export function SkelettFallseite() {
  return (
    <div aria-busy="true" aria-live="polite">
      <span className="nur-vorlesen">Der Fall wird geladen …</span>
      <div className="skelett-kopf" style={{ marginBottom: 14 }}>
        <Balken breite={16} hoehe={20} />
        <Balken breite={28} hoehe={24} />
      </div>
      <div className="skelett-reiterleiste">
        {Array.from({ length: 6 }, (_, i) => (
          <Balken key={i} breite={100} hoehe={13} />
        ))}
      </div>
      <SkelettReiter />
    </div>
  )
}

/**
 * Der Platzhalter eines Bilderrasters.
 *
 * Die Kacheln haben das feste Seitenverhältnis der echten Bilder — sonst
 * springt das Raster beim Erscheinen, und zwar bei jeder einzelnen Kachel.
 */
export function SkelettRaster({ kacheln = 12 }: { kacheln?: number }) {
  return (
    <div className="foto-raster" aria-busy="true" aria-live="polite">
      <span className="nur-vorlesen">Die Bilder werden geladen …</span>
      {Array.from({ length: kacheln }, (_, i) => (
        <div className="skelett skelett-kachel" key={i} />
      ))}
    </div>
  )
}
