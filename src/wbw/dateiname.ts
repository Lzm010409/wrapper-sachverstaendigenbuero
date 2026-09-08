/**
 * Die Dateinamen der Belege, die in den Gutachtenordner gehen.
 *
 * **Sie werden gelesen, nicht angeklickt.** Im Gutachtenordner liegen sie
 * neben Lichtbildern, Kalkulation und Schriftverkehr; wer dort sucht, will an
 * der Zeile erkennen, welches Vergleichsfahrzeug gemeint ist — ohne die Datei
 * zu öffnen. Deshalb stehen die drei Angaben darin, die ein Fahrzeug im Korb
 * unterscheiden: Laufleistung, Erstzulassungsjahr und das eine
 * Ausstattungsmerkmal, das es besonders macht.
 *
 *     WBW-konkret-129tkm-ez19-panoramadach.pdf
 *
 * `WBW-konkret` steht wörtlich davor — so heissen diese Belege im Haus.
 *
 * **Wo Angaben fehlen, fällt der Teil weg** statt durch einen Platzhalter
 * ersetzt zu werden: `WBW-konkret-ez19.pdf` ist ehrlicher als
 * `WBW-konkret-0tkm-ez19.pdf`, denn null Kilometer stünden da als Angabe.
 */

/**
 * Macht aus einem Wort einen Namensbestandteil.
 *
 * Umlaute werden ausgeschrieben statt entfernt: „Anhängerkupplung" wird zu
 * `anhaengerkupplung` und nicht zu `anhngerkupplung`. Ein Dateiname, den man
 * nicht mehr aussprechen kann, hat seinen Zweck verfehlt.
 */
export function teil(wert: string | null | undefined): string {
  if (!wert) return ''
  return wert
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    /*
     * Alles, was kein Buchstabe und keine Ziffer ist, wird zum Trennstrich —
     * das deckt die Zeichen mit ab, die Windows und OneDrive verbieten
     * (`\ / : * ? " < > |`). Sie einzeln zu entfernen wäre nicht nur
     * doppelt, sondern falsch: aus „Sport*Paket" würde `sportpaket` statt
     * `sport-paket`, und zwei Wörter wären zu einem verschmolzen.
     */
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/**
 * Die Laufleistung in Tausenderschreibweise.
 *
 * Gerundet, nicht abgeschnitten: 129.700 km sind `130tkm`. Unter 500 km
 * ergäbe die Rundung `0tkm` — dann steht lieber nichts da.
 */
export function laufleistungsteil(km: number | null | undefined): string {
  if (km == null || !Number.isFinite(km) || km < 500) return ''
  return `${Math.round(km / 1000)}tkm`
}

/**
 * Das Erstzulassungsjahr, zweistellig.
 *
 * Nimmt `MM/JJJJ`, `MM.JJJJ`, `JJJJ-MM-TT` und ein nacktes `JJJJ` — die
 * Portale schreiben es verschieden, und ein Beleg soll nicht daran scheitern.
 */
export function erstzulassungsteil(ez: string | null | undefined): string {
  const jahr = ez?.match(/(19|20)(\d{2})/)
  return jahr ? `ez${jahr[2]}` : ''
}

/**
 * Der Name eines Einzelbelegs.
 *
 * `merkmal` ist das Ausstattungsmerkmal, das dieses Fahrzeug von den übrigen
 * im Korb abhebt — es kommt aus der Prüfung, nicht aus einer festen Liste.
 */
export function belegname(fahrzeug: {
  kilometerstand?: number | null
  erstzulassung?: string | null
  merkmal?: string | null
}): string {
  const teile = [
    'WBW-konkret',
    laufleistungsteil(fahrzeug.kilometerstand),
    erstzulassungsteil(fahrzeug.erstzulassung),
    teil(fahrzeug.merkmal),
  ].filter(Boolean)

  // 120 Zeichen: OneDrive erlaubt mehr, aber ein Name, der in der Spalte
  // abgeschnitten wird, ist so gut wie keiner.
  return `${teile.join('-').slice(0, 120)}.pdf`
}

/** Der Name eines Portalpakets: `WBW-autoscout24.pdf`, `WBW-mobile-de.pdf`. */
export function paketname(portal: string): string {
  return `WBW-${teil(portal) || 'portal'}.pdf`
}

/**
 * Macht eine Liste von Namen eindeutig.
 *
 * Zwei Fahrzeuge mit gleicher Laufleistung, gleichem Baujahr und gleichem
 * Merkmal ergeben denselben Namen — beim Hochladen überschriebe der zweite
 * den ersten, und im Ordner läge ein Beleg weniger als im Korb. Der zweite
 * bekommt deshalb `-2`, der dritte `-3`.
 *
 * Die Reihenfolge bleibt erhalten: der erste behält seinen Namen, damit ein
 * erneuter Lauf nicht plötzlich andere Dateien schreibt.
 */
export function eindeutig(namen: string[]): string[] {
  const gezaehlt = new Map<string, number>()
  return namen.map((name) => {
    const schluessel = name.toLowerCase()
    const bisher = gezaehlt.get(schluessel) ?? 0
    gezaehlt.set(schluessel, bisher + 1)
    if (bisher === 0) return name
    const punkt = name.lastIndexOf('.')
    const stamm = punkt > 0 ? name.slice(0, punkt) : name
    const endung = punkt > 0 ? name.slice(punkt) : ''
    return `${stamm}-${bisher + 1}${endung}`
  })
}
