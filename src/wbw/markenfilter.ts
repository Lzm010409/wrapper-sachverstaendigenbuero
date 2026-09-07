/**
 * Hält markenfremde Fahrzeuge aus dem Vergleichskorb.
 *
 * Gemessen am 07.09.2026: Eine Suche nach einer **Mercedes E 53 AMG** endete
 * mit einem **Škoda Superb Combi** im Korb. Zwei Dinge trafen zusammen —
 *
 * 1. Der Kleinanzeigen-Dienst liefert Treffer, die nicht zur gesuchten Marke
 *    gehören (im selben Lauf auch Range Rover, VW Tiguan, Ford Transit).
 * 2. Die Pipeline filtert auf Laufleistung, Erstzulassung, Leistung,
 *    Ausstattungslinie, Karosserie, Getriebe und Türen — aber **nicht auf die
 *    Marke**. Sie verlässt sich darauf, dass das Portal richtig gesucht hat.
 *
 * Der Škoda hatte keine kW-Angabe. Unbekannte Werte lässt die Toleranzprüfung
 * bewusst durch — richtig so, sonst verlöre man belastbare Fahrzeuge wegen
 * einer Lücke im Inserat. Nur fällt damit die letzte Sperre weg.
 *
 * **Die Richtung des Zweifels:** Aussortiert wird nur, was sich positiv als
 * andere Marke erkennen lässt. Wo die Marke unklar bleibt, bleibt das
 * Fahrzeug im Korb — dieselbe Haltung, die das Plugin bei unbekannten Werten
 * einnimmt. Ein zu Unrecht entferntes Vergleichsfahrzeug wäre genauso
 * schädlich wie ein markenfremdes; es fiele nur nicht auf.
 */

/**
 * Marken und ihre gebräuchlichen Schreibweisen.
 *
 * Bewusst keine erschöpfende Liste: sie muss nur häufig genug treffen, um
 * einen Fremdling zu **erkennen**. Was hier fehlt, gilt als unklar und bleibt
 * im Korb — der ungefährliche Ausgang.
 */
const MARKEN: Record<string, string[]> = {
  'mercedes-benz': ['mercedes', 'mercedesbenz', 'benz', 'mb', 'amg'],
  bmw: ['bmw', 'alpina'],
  audi: ['audi'],
  volkswagen: ['vw', 'volkswagen'],
  skoda: ['skoda', 'škoda'],
  seat: ['seat', 'cupra'],
  porsche: ['porsche'],
  opel: ['opel', 'vauxhall'],
  ford: ['ford'],
  toyota: ['toyota'],
  lexus: ['lexus'],
  honda: ['honda'],
  mazda: ['mazda'],
  nissan: ['nissan', 'datsun'],
  mitsubishi: ['mitsubishi'],
  subaru: ['subaru'],
  suzuki: ['suzuki'],
  hyundai: ['hyundai'],
  kia: ['kia'],
  renault: ['renault', 'dacia', 'alpine'],
  peugeot: ['peugeot'],
  citroen: ['citroen', 'citroën', 'ds'],
  fiat: ['fiat', 'abarth', 'lancia'],
  'alfa-romeo': ['alfa', 'alfaromeo'],
  jeep: ['jeep'],
  chrysler: ['chrysler', 'dodge'],
  volvo: ['volvo', 'polestar'],
  jaguar: ['jaguar'],
  'land-rover': ['landrover', 'range', 'rangerover', 'defender', 'discovery', 'evoque'],
  mini: ['mini'],
  smart: ['smart'],
  tesla: ['tesla'],
  iveco: ['iveco'],
  man: ['man'],
  maserati: ['maserati'],
  ferrari: ['ferrari'],
  lamborghini: ['lamborghini'],
  bentley: ['bentley'],
  'rolls-royce': ['rollsroyce'],
  'aston-martin': ['astonmartin'],
  chevrolet: ['chevrolet', 'corvette'],
  cadillac: ['cadillac'],
  mg: ['mg'],
  byd: ['byd'],
}

/** Vergleichsform: klein, ohne Trennzeichen, ohne diakritische Zeichen. */
export function normalisiere(wert: string): string {
  return wert
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, '')
}

/** Die kanonische Marke zu einer beliebigen Schreibweise, oder `null`. */
export function kanonischeMarke(wert: string | null | undefined): string | null {
  if (!wert) return null
  const z = normalisiere(wert)
  if (!z) return null
  for (const [marke, schreibweisen] of Object.entries(MARKEN)) {
    if (normalisiere(marke) === z) return marke
    if (schreibweisen.some((s) => normalisiere(s) === z)) return marke
  }
  return null
}

/**
 * Erkennt die Marke am Anfang eines Inseratstitels.
 *
 * Nur am **Anfang**: „Mercedes-Benz E 300 …" beginnt mit der Marke, und ein
 * Titel wie „VW Golf, Anhängerkupplung von Opel" darf nicht als Opel gelten.
 * Geprüft werden die ersten drei Wörter — mehr braucht kein Portal.
 */
export function erkenneMarkeImTitel(titel: string | null | undefined): string | null {
  if (!titel) return null
  const woerter = titel.trim().split(/[\s,./|-]+/).slice(0, 3)
  for (const wort of woerter) {
    const treffer = kanonischeMarke(wort)
    if (treffer) return treffer
  }
  // Zusammengeschriebene Schreibweisen wie „Land Rover" oder „Alfa Romeo".
  const zwei = woerter.slice(0, 2).join('')
  return kanonischeMarke(zwei)
}

export type Markenurteil = 'passt' | 'fremd' | 'unklar'

/** Ein Inserat, so wie die Portale es liefern — die Felder heissen überall anders. */
export interface RohFahrzeug {
  titel?: string | null
  title?: string | null
  model?: string | null
  make?: string | null
  marke?: string | null
  [weitere: string]: unknown
}

/** Der Text, in dem die Marke stehen könnte — je nach Portal ein anderes Feld. */
function markentext(fahrzeug: RohFahrzeug): string {
  return [fahrzeug.marke, fahrzeug.make, fahrzeug.titel, fahrzeug.title, fahrzeug.model]
    .filter((w): w is string => typeof w === 'string' && w.trim().length > 0)
    .join(' ')
    .trim()
}

/**
 * Gehört das Inserat zur Marke des Subjektfahrzeugs?
 *
 * `unklar` heisst: im Korb lassen. Nur `fremd` wird aussortiert.
 */
export function beurteileMarke(
  fahrzeug: RohFahrzeug,
  subjektMarke: string | null | undefined,
): Markenurteil {
  const soll = kanonischeMarke(subjektMarke)
  // Ist die Marke des Subjekts selbst unbekannt, kann nichts entschieden
  // werden — dann bleibt alles drin.
  if (!soll) return 'unklar'

  const ausFeld = kanonischeMarke(
    typeof fahrzeug.marke === 'string' ? fahrzeug.marke : (fahrzeug.make ?? null),
  )
  if (ausFeld) return ausFeld === soll ? 'passt' : 'fremd'

  const ausTitel =
    erkenneMarkeImTitel(fahrzeug.titel ?? fahrzeug.title ?? null) ??
    erkenneMarkeImTitel(typeof fahrzeug.model === 'string' ? fahrzeug.model : null)
  if (ausTitel) return ausTitel === soll ? 'passt' : 'fremd'

  // Letzte Chance: steht die Marke irgendwo im Text, gilt sie als passend.
  // Das ist bewusst grosszügig — hier wird nicht aussortiert, nur bestätigt.
  const text = normalisiere(markentext(fahrzeug))
  const schreibweisen = [soll, ...(MARKEN[soll] ?? [])]
  if (schreibweisen.some((s) => text.includes(normalisiere(s)))) return 'passt'

  return 'unklar'
}

export interface Markenergebnis<T> {
  behalten: T[]
  entfernt: { fahrzeug: T; erkannt: string | null }[]
}

/**
 * Trennt markenfremde Inserate ab. Was entfernt wurde, kommt mit heraus —
 * es gehört in den Abschnitt „Nachvollziehbarkeit" des Reports und nicht
 * stillschweigend in den Papierkorb.
 */
export function filtereNachMarke<T extends RohFahrzeug>(
  fahrzeuge: T[],
  subjektMarke: string | null | undefined,
): Markenergebnis<T> {
  const behalten: T[] = []
  const entfernt: { fahrzeug: T; erkannt: string | null }[] = []

  for (const fahrzeug of fahrzeuge) {
    if (beurteileMarke(fahrzeug, subjektMarke) === 'fremd') {
      entfernt.push({
        fahrzeug,
        erkannt:
          kanonischeMarke(
            typeof fahrzeug.marke === 'string' ? fahrzeug.marke : (fahrzeug.make ?? null),
          ) ?? erkenneMarkeImTitel(fahrzeug.titel ?? fahrzeug.title ?? fahrzeug.model ?? null),
      })
    } else {
      behalten.push(fahrzeug)
    }
  }

  return { behalten, entfernt }
}
