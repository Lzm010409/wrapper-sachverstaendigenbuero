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
