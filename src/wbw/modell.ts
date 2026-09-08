/**
 * Bringt die Fahrzeugbezeichnung der DAT mit der Modellliste eines Portals
 * zusammen.
 *
 * Die VXS liefert den Untertyp genau: `E 53 AMG 4Matic+ (213.061)`.
 * AutoScout24 führt das Modell als `E 53 AMG` — ohne Antriebszusatz. Die
 * Auflösung des Plugins verlangt exakte Gleichheit und findet deshalb nichts:
 *
 *     aufloeseModell("E 53 AMG 4Matic+", […357 Modelle…])  →  null
 *
 * **Die Regel hier: der längste Wortpräfix, der exakt einem Modell des
 * Portals entspricht.** Das ist keine Ähnlichkeitssuche und kein Raten — es
 * ist exakte Übereinstimmung, nur nicht über den ganzen Text:
 *
 *     E 53 AMG 4Matic+  →  „E 53 AMG 4Matic+"  kein Modell
 *                          „E 53 AMG"          Modell ✓  ← gewählt
 *                          „E 53"              kein Modell
 *                          „E"                 kein Modell
 *
 * Der längste gewinnt, damit `A 45 AMG S` nicht zu `A 45 AMG` verkürzt wird,
 * wo das Portal beide führt. Passt kein Präfix, kommt `null` — dann wählt der
 * Sachverständige aus der Liste. Geraten wird nie: ein unbekanntes Modell
 * lässt das Portal stillschweigend fallen und liefert die ganze Marke.
 */

/** Vergleichsform: klein, einfacher Leerraum, ohne Trennzeichen-Eigenheiten. */
function norm(wert: string): string {
  return wert.toLowerCase().replace(/[\s\-_.]+/g, ' ').trim()
}

export interface Modellauflösung {
  /** Der Modellname des Portals, oder `null`. */
  modell: string | null
  /** Wie er gefunden wurde — für die Anzeige, damit nichts unbemerkt passiert. */
  weg: 'genau' | 'praefix' | 'offen'
  /** Was verworfen wurde, z. B. `4Matic+`. Steht in der Oberfläche. */
  verworfen: string | null
}

/**
 * Löst eine Fahrzeugbezeichnung gegen die Modellliste eines Portals auf.
 *
 * @param bezeichnung Untertyp aus der VXS, ohne Baumusterschlüssel
 * @param modelle     Modellnamen, die das Portal selbst führt
 */
export function loeseModellAuf(
  bezeichnung: string | null | undefined,
  modelle: string[],
): Modellauflösung {
  if (!bezeichnung?.trim() || modelle.length === 0) {
    return { modell: null, weg: 'offen', verworfen: null }
  }

  const nachName = new Map<string, string>()
  for (const modell of modelle) {
    const schluessel = norm(modell)
    // Bei doppelten Schreibweisen gewinnt die erste — die Reihenfolge des
    // Portals ist die des Portals.
    if (!nachName.has(schluessel)) nachName.set(schluessel, modell)
  }

  const genau = nachName.get(norm(bezeichnung))
  if (genau) return { modell: genau, weg: 'genau', verworfen: null }

  const woerter = bezeichnung.trim().split(/\s+/)
  for (let laenge = woerter.length - 1; laenge >= 1; laenge--) {
    const praefix = woerter.slice(0, laenge).join(' ')
    const treffer = nachName.get(norm(praefix))
    if (treffer) {
      return {
        modell: treffer,
        weg: 'praefix',
        verworfen: woerter.slice(laenge).join(' '),
      }
    }
  }

  return { modell: null, weg: 'offen', verworfen: null }
}

/**
 * Modelle, die zu einer Bezeichnung passen könnten — für die Auswahl, wenn
 * die Auflösung offen bleibt.
 *
 * Vorgeschlagen wird, was mit demselben Wort beginnt: bei `GLC 300 d` also
 * alle `GLC …`. Findet sich nichts, kommt die ganze Liste — dann ist eine
 * unsortierte Auswahl immer noch besser als eine leere.
 */
export function passendeModelle(
  bezeichnung: string | null | undefined,
  modelle: string[],
  hoechstens = 25,
): string[] {
  if (!bezeichnung?.trim()) return modelle.slice(0, hoechstens)
  const erstesWort = norm(bezeichnung).split(' ')[0] ?? ''
  if (!erstesWort) return modelle.slice(0, hoechstens)

  const treffer = modelle.filter((m) => {
    const teile = norm(m).split(' ')
    return teile[0] === erstesWort
  })
  return (treffer.length > 0 ? treffer : modelle).slice(0, hoechstens)
}

/**
 * Der Haupttyp einer Fahrzeugbezeichnung.
 *
 * `E 53 AMG 4Matic+` → `E 53`. Gesucht wird damit gröber, weil die Portale
 * die Ausstattungslinie und den Antriebszusatz teils gar nicht führen und
 * ein zu genauer Name dort stillschweigend fallengelassen wird.
 *
 * **Die Regel:** alles bis einschliesslich des ersten reinen Zahlworts. Nur
 * Ziffern, höchstens vier — das ist die Typnummer (`53`, `300`, `911`).
 * `2.0` trägt einen Punkt und ist der Hubraum, `4Matic+` und `320d` tragen
 * Buchstaben; beide sind keine Typnummer und beenden die Bezeichnung nicht.
 * Gibt es kein Zahlwort, bleibt das erste Wort stehen.
 *
 *     E 53 AMG 4Matic+      →  E 53
 *     GLC 300 d             →  GLC 300
 *     Superb Combi 2.0 TDI  →  Superb
 *     3er 320d              →  3er
 *     911 Carrera 4S        →  911
 *
 * Der Haupttyp ist ein **Vorschlag**, kein Portalname: ob das Portal ihn
 * kennt, entscheidet `stufenFuer`.
 */
export function haupttyp(bezeichnung: string | null | undefined): string | null {
  const geputzt = bezeichnung?.trim()
  if (!geputzt) return null

  const woerter = geputzt.split(/\s+/)
  const zahlwort = woerter.findIndex((w) => /^\d{1,4}$/.test(w))
  const bis = zahlwort >= 0 ? zahlwort + 1 : 1
  if (bis >= woerter.length) return null

  return woerter.slice(0, bis).join(' ')
}

/**
 * Die Modellnamen eines Portals, von genau nach grob.
 *
 * Jede Stufe ist ein Name, den **das Portal selbst führt** — nichts wird
 * erfunden. Wo das Portal nichts Gröberes kennt, fehlt die Stufe einfach,
 * und der Zyklus weitet dann nur die Toleranzen.
 *
 * | Stufe | Woher | Beispiel (AutoScout24, Mercedes-Benz) |
 * | --- | --- | --- |
 * | genau | wie bisher, längster passender Wortpräfix | `E 53 AMG` |
 * | haupttyp | `haupttyp()`, gegen die Liste geprüft | `E 53` |
 * | baureihe | kürzester Portalname mit gleichem ersten Wort | `E-Klasse` |
 *
 * Die Baureihe wird nicht aus der Marke abgeleitet — `E` + `-Klasse` wäre
 * eine Mercedes-Regel, die bei Skoda schon falsch ist. Stattdessen zählt,
 * was in der Liste des Portals steht: der kürzeste Eintrag, der mit
 * demselben Wort beginnt.
 */
export function stufenFuer(
  bezeichnung: string | null | undefined,
  modelle: string[],
): { stufe: 'genau' | 'haupttyp' | 'baureihe'; modell: string }[] {
  if (!bezeichnung?.trim() || modelle.length === 0) return []

  const stufen: { stufe: 'genau' | 'haupttyp' | 'baureihe'; modell: string }[] = []
  const gesehen = new Set<string>()
  const nimm = (stufe: 'genau' | 'haupttyp' | 'baureihe', modell: string | null) => {
    if (!modell || gesehen.has(norm(modell))) return
    gesehen.add(norm(modell))
    stufen.push({ stufe, modell })
  }

  nimm('genau', loeseModellAuf(bezeichnung, modelle).modell)

  const grob = haupttyp(bezeichnung)
  if (grob) nimm('haupttyp', loeseModellAuf(grob, modelle).modell)

  /*
   * Die Baureihe unter den Einträgen mit demselben ersten Wort.
   *
   * Was sie von einer Variante unterscheidet, ist **die fehlende
   * Typnummer**: `E-Klasse` gegen `E 53 AMG`, `GLC-Klasse` gegen `GLC 300`.
   * Nach der Zeichenlänge zu gehen wäre falsch — `GLC 300` ist kürzer als
   * `GLC-Klasse` und trotzdem die engere Suche. Bei Porsche trägt die
   * Baureihe selbst eine Zahl (`911`); dort haben alle Kandidaten eine, und
   * es entscheidet die Wortzahl.
   */
  const erstesWort = norm(bezeichnung).split(' ')[0] ?? ''
  if (erstesWort) {
    const typnummern = (wert: string) =>
      norm(wert)
        .split(' ')
        .filter((w) => /^\d{1,4}$/.test(w)).length

    const verwandte = modelle
      .filter((m) => norm(m).split(' ')[0] === erstesWort)
      .sort((a, b) => {
        const nummern = typnummern(a) - typnummern(b)
        if (nummern !== 0) return nummern
        const woerter = norm(a).split(' ').length - norm(b).split(' ').length
        return woerter !== 0 ? woerter : a.length - b.length
      })
    nimm('baureihe', verwandte[0] ?? null)
  }

  return stufen
}
