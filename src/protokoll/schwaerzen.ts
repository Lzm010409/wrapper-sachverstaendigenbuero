/**
 * Schwärzt personenbezogene Daten und Zugangsdaten, bevor sie ins Protokoll
 * geraten.
 *
 * **Warum das hier nötig ist.** Die Anwendung verarbeitet Unfallschäden: Namen
 * von Geschädigten, Kennzeichen, Fahrgestellnummern, Anschriften,
 * Schadennummern. Ein Protokoll, in dem das steht, ist selbst ein Ort mit
 * personenbezogenen Daten — mit allem, was daran hängt: Aufbewahrung,
 * Auskunft, Löschung. Ein Container-Protokoll erfüllt davon nichts.
 *
 * **Was stattdessen dasteht.** Die Fall-ID. Wer den Fall sehen darf, sieht ihn
 * in der Anwendung; wer ins Protokoll schaut, sieht, *welcher* Fall betroffen
 * war, ohne zu erfahren, *wer* das ist.
 *
 * **Warum am Ausgang und nicht an jeder Aufrufstelle.** Weil man es dort
 * vergisst. Die Schwärzung sitzt in `schreibe()`; keine Meldung kommt an ihr
 * vorbei, auch keine, die jemand in einem Jahr hinzufügt.
 */

/** Feldnamen, deren Wert grundsätzlich nicht ins Protokoll gehört. */
const HEIKLE_FELDER =
  /^(pass(wort|word)?|token|secret|geheimnis|api[_-]?key|authorization|cookie|session|sitzung|hash|kennzeichen|licensePlate|license_plate|vin|vehicleIdentNumber|iban|email|e-?mail|telefon|phone|anschrift|strasse|street)$/i

/**
 * Muster, die auch mitten im Text getroffen werden.
 *
 * Die Reihenfolge zählt: die Fahrgestellnummer steht vor dem Kennzeichen,
 * weil ein VIN-Fragment sonst als Kennzeichen durchginge.
 */
const MUSTER: { name: string; muster: RegExp; ersatz: string }[] = [
  /*
   * Der Parameterblock einer Datenbankfehlermeldung — und der steht ganz
   * vorn, weil er alles enthalten kann, was in einer Abfrage vorkommt.
   *
   * Drizzle hängt an jede gescheiterte Abfrage `\nparams: <werte>` an. Am
   * 08.09.2026 stand deshalb der Hash eines Sitzungstokens im Protokoll —
   * die Abfrage der angemeldeten Sitzung war beim Ausfall der Datenbank
   * gescheitert, und ihr Parameter ging mit hinaus. Die Abfrage selbst sagt,
   * was schiefging; ihre Werte sagen es nicht und sind genau das Risiko.
   *
   * Bewusst nur bis zum Zeilenende: die Stapelspur steht dahinter und ist
   * das Wertvollste am ganzen Eintrag.
   */
  { name: 'db-parameter', muster: /(\nparams: ).*/g, ersatz: '$1«geschwärzt»' },
  // Bearer-Token und Basic-Auth in Kopfzeilen und URLs.
  { name: 'token', muster: /\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{8,}/gi, ersatz: '$1 «geschwärzt»' },
  // Ein Token im Fragezeichenteil einer Adresse.
  {
    name: 'query-token',
    muster: /([?&](?:token|key|api_?key|access_token|auth|password|secret|signature)=)[^&\s]+/gi,
    ersatz: '$1«geschwärzt»',
  },
  // Fahrgestellnummer: 17 Zeichen, ohne I, O und Q.
  { name: 'vin', muster: /\b[A-HJ-NPR-Z0-9]{17}\b/g, ersatz: '«VIN»' },
  // Deutsches Kennzeichen: 1-3 Buchstaben, Trennzeichen, 1-2 Buchstaben, 1-4 Ziffern.
  {
    name: 'kennzeichen',
    muster: /\b[A-ZÄÖÜ]{1,3}[-\s·][A-ZÄÖÜ]{1,2}[-\s]?\d{1,4}[EH]?\b/g,
    ersatz: '«Kennzeichen»',
  },
  { name: 'email', muster: /\b[\w.+-]+@[\w-]+\.[\w.-]+\b/g, ersatz: '«E-Mail»' },
  { name: 'iban', muster: /\b[A-Z]{2}\d{2}[A-Z0-9]{10,30}\b/g, ersatz: '«IBAN»' },
  /*
   * Das Netz unter den anderen Regeln: eine lange Kette aus Hexzeichen ist
   * in dieser Anwendung nie ein Fachdatum, sondern ein Hash oder ein Token —
   * ein Sitzungstoken hat 64, ein SHA-256 dasselbe. Sie steht am Ende, damit
   * die Fahrgestellnummer vorher ihre eigene Kennzeichnung bekommt.
   */
  { name: 'hash', muster: /\b[0-9a-f]{32,}\b/gi, ersatz: '«Hash»' },
]

/** Schwärzt eine Zeichenkette. */
export function schwaerzeText(text: string): string {
  let ergebnis = text
  for (const regel of MUSTER) {
    ergebnis = ergebnis.replace(regel.muster, regel.ersatz)
  }
  return ergebnis
}

/**
 * Schwärzt einen beliebigen Wert für das Protokoll.
 *
 * Tiefe und Länge sind begrenzt: ein Protokolleintrag soll lesbar bleiben und
 * darf keine 400-KB-Antwort mitschleppen. Was abgeschnitten wird, sagt es.
 */
export function schwaerze(wert: unknown, tiefe = 0): unknown {
  if (tiefe > 5) return '«zu tief»'
  if (wert === null || wert === undefined) return wert
  if (typeof wert === 'string') {
    const geschwaerzt = schwaerzeText(wert)
    return geschwaerzt.length > 1000 ? `${geschwaerzt.slice(0, 1000)}… «gekürzt»` : geschwaerzt
  }
  if (typeof wert === 'number' || typeof wert === 'boolean') return wert
  if (wert instanceof Date) return wert.toISOString()
  if (Array.isArray(wert)) {
    const stueck = wert.slice(0, 20).map((w) => schwaerze(w, tiefe + 1))
    return wert.length > 20 ? [...stueck, `… und ${wert.length - 20} weitere`] : stueck
  }
  if (typeof wert === 'object') {
    const ergebnis: Record<string, unknown> = {}
    for (const [name, inhalt] of Object.entries(wert as Record<string, unknown>)) {
      ergebnis[name] = HEIKLE_FELDER.test(name) ? '«geschwärzt»' : schwaerze(inhalt, tiefe + 1)
    }
    return ergebnis
  }
  return String(wert)
}
