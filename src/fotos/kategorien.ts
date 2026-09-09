/**
 * Was auf einem Gutachtenfoto zu sehen ist — und was zu sehen sein muss.
 *
 * **Warum eine feste Liste und kein freies Etikett.** Die Kategorie ist
 * kein Schmuck, sie trägt die Vollständigkeitsprüfung: „zu diesem Fall
 * fehlt die Aufnahme der Fahrgestellnummer" lässt sich nur sagen, wenn
 * beide Seiten dieselben Namen benutzen. Ein freies Etikett vom Modell
 * ergäbe beim einen Fall „VIN", beim nächsten „Fahrgestellnummer" und beim
 * dritten „Typschild" — und die Prüfung fände nie etwas.
 *
 * **Warum die vier Ecken vier Kategorien sind und nicht eine mit Anzahl
 * vier.** „Mindestens vier Eckansichten" wäre erfüllt, wenn viermal
 * dieselbe Ecke fotografiert wurde. Und die Meldung „es fehlt eine
 * Eckansicht" sagt einem Menschen nicht, wo er hinlaufen muss; „es fehlt
 * die Ansicht hinten rechts" schon.
 *
 * Diese Datei enthält bewusst **keinen** Server-Code: der Fotos-Reiter
 * zeigt die Lücken im Browser an, und ein `import 'server-only'` hier
 * würde beim Bau die halbe Anwendung ins Browserpaket ziehen.
 */

export const KATEGORIEN = {
  kennzeichen: 'Kennzeichen',
  vin: 'Fahrgestellnummer',
  tacho: 'Tachostand',
  ansicht_vorne_links: 'Ansicht vorne links',
  ansicht_vorne_rechts: 'Ansicht vorne rechts',
  ansicht_hinten_links: 'Ansicht hinten links',
  ansicht_hinten_rechts: 'Ansicht hinten rechts',
  schaden: 'Schadendetail',
  innenraum: 'Innenraum',
  reifen: 'Reifen mit Profil',
  papiere: 'Papiere',
  sonstiges: 'Sonstiges',
} as const

export type Kategorie = keyof typeof KATEGORIEN

export const KATEGORIESCHLUESSEL = Object.keys(KATEGORIEN) as Kategorie[]

export function istKategorie(wert: string): wert is Kategorie {
  return wert in KATEGORIEN
}

export function kategoriename(wert: Kategorie): string {
  return KATEGORIEN[wert]
}

/**
 * Der Pflichtfotosatz dieses Hauses (festgelegt am 09.09.2026).
 *
 * `papiere` und `sonstiges` stehen bewusst nicht darin: Fahrzeugschein und
 * Beiwerk sind nützlich, aber ihr Fehlen ist kein Mangel des Fotosatzes.
 */
export const PFLICHT: Kategorie[] = [
  'kennzeichen',
  'vin',
  'tacho',
  'ansicht_vorne_links',
  'ansicht_vorne_rechts',
  'ansicht_hinten_links',
  'ansicht_hinten_rechts',
  'schaden',
  'innenraum',
  'reifen',
]

/**
 * Welche Pflichtaufnahmen fehlen.
 *
 * Die Reihenfolge folgt `PFLICHT` und nicht dem Zufall der Eingabe — die
 * Meldung soll bei zwei Läufen desselben Falls gleich aussehen.
 */
export function luecken(vorhanden: Iterable<Kategorie>): Kategorie[] {
  const gesehen = new Set(vorhanden)
  return PFLICHT.filter((k) => !gesehen.has(k))
}
