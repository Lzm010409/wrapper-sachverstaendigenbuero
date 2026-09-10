/**
 * Die Vergabe der Gliederungsnummer für einen neu angelegten Eintrag.
 *
 * **Warum sie nicht eingetippt wird.** Die Nummer ist keine Beschriftung,
 * sondern die Ordnung der Bibliothek: Die Liste sortiert danach (natürlich,
 * siehe `sortierSchluessel` in `abfragen.ts`), und über (Bereich, Nummer)
 * läuft ein eindeutiger Index. Wer sie von Hand setzen soll, muss die
 * bestehende Gliederung im Kopf haben und läuft sonst in eine Fehlermeldung,
 * die er nicht erwartet hat. Die App weiss es besser als der Anleger.
 *
 * **Die Regel.** Der neue Eintrag setzt die Gliederung seines Abschnitts
 * fort, statt eine zweite danebenzustellen:
 *
 * - Abschnitt gibt es schon → die höchste Nummer dieses Abschnitts wird um
 *   eins weitergezählt, auf ihrer Ebene und unter ihrem Elternzweig: aus
 *   `1.1 … 1.10` wird `1.11`, aus `B.7 … B.8` wird `B.9`, aus `1.2.1 …
 *   1.2.2` wird `1.2.3`.
 * - Abschnitt ist neu → hinter dem letzten Zweig des Bereichs wird ein
 *   neuer eröffnet, in derselben Form: `3.1` in der Kalkulation, `B.9` bei
 *   den Sonderfällen.
 *
 * **Warum überall das Maximum und nirgends eine Mehrheit entscheidet.** Der
 * Bestand kommt ohne festgelegte Reihenfolge aus der Datenbank — Postgres
 * darf sie nach einem UPDATE oder VACUUM ändern. Eine Regel, die bei
 * Gleichstand „das zuerst Gesehene" nimmt, vergibt dann heute `A.3` und
 * morgen `B.3`. Das Maximum hängt von keiner Reihenfolge ab.
 *
 * Reine Rechnung, kein Datenbankzugriff: die Einträge kommen von aussen
 * herein, damit Vergabe und Einfügen im Aufrufer in **einer** Transaktion
 * unter Sperre liegen können (`sperre.ts`) — zwei gleichzeitige Anlagen
 * dürfen nicht auf dieselbe Nummer laufen.
 */

export interface Nummernbestand {
  nummer: string
  abschnitt: string
}

export interface Zerlegte {
  /** Der Buchstabenteil der Sonderfall-Notation, z.B. `"B."` — sonst leer. */
  praefix: string
  /**
   * Die Zahlen der Gliederung: `1.2.3` → `[1, 2, 3]`. Leer beim blossen
   * Buchstaben `"A"`, den die Vorbemerkung der Sonderfälle trägt.
   */
  teile: number[]
}

const MUSTER = /^\s*(?:([A-Z])\.?)?((?:\d+)(?:\.\d+)*)?\s*$/

/**
 * Die Grenzen, ab denen eine Zeichenkette keine Gliederungsnummer mehr ist.
 *
 * Die Spalte ist Text ohne Prüfung, und `teileUeberschrift` im Parser lässt
 * beliebig viele Ziffern durch. `Number('1'+'0'.repeat(22))` ist `1e22`:
 * daraus entstünde die „Nummer" `1e+22`, und weiterzählen liesse sie sich
 * auch nicht mehr, weil `1e22 + 1 === 1e22` — die Ausweichschleife am Ende
 * käme nie zum Ende. Solche Zeichenketten werden übergangen, statt Unsinn
 * zu erzeugen.
 */
const HOECHSTE_ZAHL = 999_999
const HOECHSTE_TIEFE = 6

/** Zerlegt `"1.2"`, `"7"`, `"B.7"`, `"1.2.3"` oder `"A"`. Sonst `null`. */
export function zerlegeNummer(nummer: string): Zerlegte | null {
  const treffer = MUSTER.exec(nummer)
  if (!treffer) return null

  const buchstabe = treffer[1]
  const zahlen = treffer[2]
  if (!buchstabe && !zahlen) return null

  const teile = zahlen ? zahlen.split('.').map(Number) : []
  if (teile.length > HOECHSTE_TIEFE) return null
  if (teile.some((z) => !Number.isSafeInteger(z) || z > HOECHSTE_ZAHL)) return null

  return { praefix: buchstabe ? `${buchstabe}.` : '', teile }
}

function baue(praefix: string, teile: number[]): string {
  return `${praefix}${teile.join('.')}`
}

/** Abschnitte werden von Hand getippt — „ Restwert" und „restwert" sind derselbe. */
function schluessel(abschnitt: string): string {
  return abschnitt.trim().toLowerCase()
}

/**
 * Ordnet zwei Nummern: erst der Buchstabenteil, dann Zahl für Zahl.
 * Negativ, wenn `a` vor `b` steht.
 */
function vergleiche(a: Zerlegte, b: Zerlegte): number {
  if (a.praefix !== b.praefix) return a.praefix < b.praefix ? -1 : 1
  const tiefe = Math.max(a.teile.length, b.teile.length)
  for (let i = 0; i < tiefe; i++) {
    const links = a.teile[i] ?? -1
    const rechts = b.teile[i] ?? -1
    if (links !== rechts) return links - rechts
  }
  return 0
}

function hoechste(nummern: Zerlegte[]): Zerlegte | undefined {
  return nummern.reduce<Zerlegte | undefined>(
    (bisher, jetzt) => (bisher === undefined || vergleiche(jetzt, bisher) > 0 ? jetzt : bisher),
    undefined,
  )
}

function gleicherZweig(a: number[], b: number[]): boolean {
  return a.length === b.length && a.every((z, i) => z === b[i])
}

/**
 * Die nächste freie Nummer für einen Eintrag im Abschnitt `abschnitt`.
 *
 * `bestand` sind **alle** Einträge des gewählten Bereichs — auch die anderer
 * Abschnitte, denn der eindeutige Index kennt den Abschnitt nicht.
 */
export function naechsteNummer(bestand: Nummernbestand[], abschnitt: string): string {
  const gesucht = schluessel(abschnitt)
  const vergeben = new Set(bestand.map((e) => e.nummer.trim()))

  const zerlegt: { nummer: Zerlegte; abschnitt: string }[] = []
  for (const e of bestand) {
    const nummer = zerlegeNummer(e.nummer)
    if (nummer) zerlegt.push({ nummer, abschnitt: schluessel(e.abschnitt) })
  }

  /*
    Ob es den Abschnitt gibt, wird am **rohen** Bestand entschieden, nicht an
    den lesbaren Nummern. Der Bereich `sonderfall` enthält genau den Fall:
    „Teil A: Vorbemerkung" hat einen einzigen Eintrag, und der trägt die
    Nummer „A". Wurde er beim Zerlegen übergangen, sah der Abschnitt leer aus
    — der neue Eintrag bekam die Fortsetzung von Teil B und landete in einer
    fremden Gliederung.
  */
  const abschnittBekannt = bestand.some((e) => schluessel(e.abschnitt) === gesucht)
  const imAbschnitt = zerlegt.filter((e) => e.abschnitt === gesucht).map((e) => e.nummer)

  const leitend = abschnittBekannt
    ? (hoechste(imAbschnitt) ?? hoechste(zerlegt.map((e) => e.nummer)))
    : hoechste(zerlegt.map((e) => e.nummer))

  // Ein Bereich ohne eine einzige lesbare Nummer fängt bei „1.1" an.
  if (!leitend) return ausweichen(vergeben, '', [1, 1])

  const setztAbschnittFort = abschnittBekannt && imAbschnitt.length > 0

  if (setztAbschnittFort) {
    /*
      Weitergezählt wird die höchste Nummer des Abschnitts, auf ihrer Ebene
      und unter ihrem Elternzweig. Der blosse Buchstabe „A" hat keine Ebene:
      unter ihm wird eine eröffnet, also „A.1".
    */
    const zweig = leitend.teile.slice(0, -1)
    const geschwister = zerlegt
      .map((e) => e.nummer)
      .filter(
        (n) =>
          n.praefix === leitend.praefix &&
          n.teile.length === zweig.length + 1 &&
          gleicherZweig(n.teile.slice(0, -1), zweig),
      )
    const hoechsteZahl = Math.max(0, ...geschwister.map((n) => n.teile[n.teile.length - 1] ?? 0))
    return ausweichen(vergeben, leitend.praefix, [...zweig, hoechsteZahl + 1])
  }

  /*
    Ein neuer Abschnitt eröffnet einen neuen Zweig — hinter dem letzten des
    Bereichs, nicht in der Mitte eines früheren. Die Form (Buchstabenteil und
    Gliederungstiefe) übernimmt er von dort.
  */
  const zweige = zerlegt.map((e) => e.nummer).filter((n) => n.praefix === leitend.praefix)
  const hoechsterZweig = Math.max(0, ...zweige.map((n) => n.teile[0] ?? 0))
  const tiefe = Math.max(1, leitend.teile.length)
  const neu = [hoechsterZweig + 1, ...Array<number>(tiefe - 1).fill(1)]
  return ausweichen(vergeben, leitend.praefix, neu)
}

/**
 * Zählt weiter, solange die Nummer schon vergeben ist.
 *
 * Der eindeutige Index über (Bereich, Nummer) kennt keine Abschnitte: Die
 * errechnete Nummer kann in einem anderen stehen. Dann weiterzuzählen ist
 * freundlicher, als in eine Datenbankmeldung zu laufen, die niemand
 * versteht. Da jede Zahl unter `HOECHSTE_ZAHL` liegt und der Bestand endlich
 * ist, endet die Schleife.
 */
function ausweichen(vergeben: Set<string>, praefix: string, teile: number[]): string {
  const letzte = teile.length - 1
  const arbeit = [...teile]
  while (vergeben.has(baue(praefix, arbeit))) {
    arbeit[letzte] = (arbeit[letzte] ?? 0) + 1
  }
  return baue(praefix, arbeit)
}
