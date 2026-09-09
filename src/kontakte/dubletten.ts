/**
 * Dubletten unter den sevDesk-Kontakten.
 *
 * **Woher sie kommen.** Der n8n-Workflow „Neuer Rechnungsworfklow" sucht
 * den Kontakt zur Rechnung über `customerName` — exakt. Trifft er nicht,
 * legt er einen neuen an. Am Konto nachgezählt (09.09.2026): unter 131
 * Kontakten stehen 6 Gruppen mit zusammen 19 Einträgen. Allein „Arndt
 * Automobile GmbH" liegt achtmal da, sechs davon am selben Tag angelegt
 * und ohne einen einzigen Beleg.
 *
 * **Was diese Datei tut und was nicht.** Sie fasst zusammen, was
 * zusammengehören dürfte, und sagt, welche Einträge leer sind. Sie
 * entscheidet nichts: ob zwei gleich benannte Privatpersonen wirklich
 * dieselbe sind, weiss nur ein Mensch.
 *
 * Rein: kein Netz, keine Datenbank. Damit ist die Zusammenfassung prüfbar.
 */

/** Rechtsformen und Bindewörter, die für den Vergleich nichts beitragen. */
const RECHTSFORMEN =
  /\b(gmbh|mbh|ag|kg|ohg|ug|gbr|se|kgaa|ek|e\s?k|ev|e\s?v|co|und|inh|inhaber)\b/g

/**
 * Der Vergleichsschlüssel eines Namens.
 *
 * Vier Dinge fallen weg, jedes aus einem beobachteten Grund:
 * Gross-/Kleinschreibung, Umlaute („Düsseldorf" gegen „Duesseldorf"),
 * Rechtsformen („Salt & Pictures GmbH" gegen „Salt und Pictures GmbH") und
 * alles, was kein Buchstabe und keine Ziffer ist — darunter das weiche
 * Trennzeichen, das in „Industrieterrains Düsseldorf-­Reisholz" steckt und
 * das man dem Namen nicht ansieht.
 */
export function normalisiere(...teile: (string | null | undefined)[]): string {
  return teile
    .filter((t): t is string => Boolean(t?.trim()))
    .join(' ')
    .toLowerCase()
    .replace(/[äàáâã]/g, 'a')
    .replace(/[öòóô]/g, 'o')
    .replace(/[üùúû]/g, 'u')
    .replace(/[ëèéê]/g, 'e')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(RECHTSFORMEN, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export interface Kontakt {
  id: string
  /** Der Name, wie sevDesk ihn führt. */
  anzeige: string
  kundennummer: string | null
  angelegtAm: Date | null
  /** Rechnungen, Belege, Aufträge — alles, was an diesem Kontakt hängt. */
  belege: number
}

export interface Dublettengruppe {
  schluessel: string
  /** Der längste der beteiligten Namen — meist der vollständigste. */
  anzeige: string
  /** Alle Einträge, die meisten Belege zuerst. */
  kontakte: Kontakt[]
  /** Die Einträge ohne jeden Beleg. Nur sie lassen sich über die API entfernen. */
  leere: Kontakt[]
  /**
   * Ob in dieser Gruppe mehr als ein Eintrag Belege trägt. Dann hilft die
   * API nicht weiter: Rechnungen lassen sich nicht umhängen, und ein
   * `merge` gibt es nicht — das geht nur in sevDesk selbst.
   */
  nurInSevdesk: boolean
}

/**
 * Fasst Kontakte zu Gruppen zusammen.
 *
 * Sortiert nach dem, was sich aufräumen lässt: Gruppen mit leeren Einträgen
 * zuerst, danach die grösseren. Wer die Seite öffnet, soll oben das finden,
 * wo eine Handbewegung genügt.
 */
export function gruppiere(kontakte: Kontakt[]): Dublettengruppe[] {
  const nach = new Map<string, Kontakt[]>()
  for (const kontakt of kontakte) {
    const schluessel = normalisiere(kontakt.anzeige)
    if (!schluessel) continue
    const liste = nach.get(schluessel) ?? []
    liste.push(kontakt)
    nach.set(schluessel, liste)
  }

  const gruppen: Dublettengruppe[] = []
  for (const [schluessel, liste] of nach) {
    if (liste.length < 2) continue
    const sortiert = [...liste].sort((a, b) => b.belege - a.belege || a.id.localeCompare(b.id))
    const leere = sortiert.filter((k) => k.belege === 0)
    gruppen.push({
      schluessel,
      anzeige: sortiert.reduce((a, b) => (b.anzeige.length > a.length ? b.anzeige : a), ''),
      kontakte: sortiert,
      leere,
      nurInSevdesk: sortiert.filter((k) => k.belege > 0).length > 1,
    })
  }

  return gruppen.sort(
    (a, b) =>
      b.leere.length - a.leere.length ||
      b.kontakte.length - a.kontakte.length ||
      a.anzeige.localeCompare(b.anzeige, 'de'),
  )
}
