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
 * - Abschnitt gibt es schon → nächste freie Zahl auf **derselben Ebene**,
 *   auf der die Nummern dieses Abschnitts stehen: aus `1.1 … 1.10` wird
 *   `1.11`, aus `B.7 … B.8` wird `B.9`.
 * - Abschnitt ist neu → nächste freie Hauptnummer im Bereich, in der Form,
 *   die im Bereich üblich ist: `3.1` in der Kalkulation, `B.9` bei den
 *   Sonderfällen.
 *
 * Reine Rechnung, kein Datenbankzugriff: die Einträge kommen von aussen
 * herein, damit Vergabe und Einfügen im Aufrufer in **einer** Transaktion
 * liegen können — zwei gleichzeitige Anlagen dürfen nicht auf dieselbe
 * Nummer laufen.
 */

export interface Nummernbestand {
  nummer: string
  abschnitt: string
}

export interface Zerlegte {
  /** Der Buchstabenteil der Sonderfall-Notation, z.B. `"B."` — sonst leer. */
  praefix: string
  haupt: number
  /** `null` bei einstufiger Gliederung wie `"B.7"`. */
  unter: number | null
}

const MUSTER = /^\s*([A-Z]\.)?(\d+)(?:\.(\d+))?\s*$/

/** Zerlegt `"1.2"`, `"7"` oder `"B.7"`. `null`, wenn nichts davon zutrifft. */
export function zerlegeNummer(nummer: string): Zerlegte | null {
  const treffer = MUSTER.exec(nummer)
  if (!treffer) return null
  return {
    praefix: treffer[1] ?? '',
    haupt: Number(treffer[2]),
    unter: treffer[3] === undefined ? null : Number(treffer[3]),
  }
}

function baue(praefix: string, haupt: number, unter: number | null): string {
  return unter === null ? `${praefix}${haupt}` : `${praefix}${haupt}.${unter}`
}

/** Abschnitte werden von Hand getippt — „ Restwert" und „restwert" sind derselbe. */
function schluessel(abschnitt: string): string {
  return abschnitt.trim().toLowerCase()
}

/** Was am häufigsten vorkommt; bei Gleichstand das zuerst gesehene. */
function haeufigste<T>(werte: T[]): T | undefined {
  const zaehler = new Map<T, number>()
  for (const w of werte) zaehler.set(w, (zaehler.get(w) ?? 0) + 1)
  let beste: T | undefined
  let bestZahl = 0
  for (const [wert, zahl] of zaehler) {
    if (zahl > bestZahl) {
      beste = wert
      bestZahl = zahl
    }
  }
  return beste
}

/**
 * Die nächste freie Nummer für einen Eintrag im Abschnitt `abschnitt`.
 *
 * `bestand` sind **alle** Einträge des gewählten Bereichs — auch die anderer
 * Abschnitte, denn der eindeutige Index kennt den Abschnitt nicht.
 */
export function naechsteNummer(bestand: Nummernbestand[], abschnitt: string): string {
  const zerlegt = bestand
    .map((e) => ({ ...zerlegeNummer(e.nummer), abschnitt: schluessel(e.abschnitt) }))
    .filter((e): e is Zerlegte & { abschnitt: string } => e.haupt !== undefined)

  const vergeben = new Set(bestand.map((e) => e.nummer.trim()))
  const imAbschnitt = zerlegt.filter((e) => e.abschnitt === schluessel(abschnitt))

  // Die Form (Buchstabenteil und Gliederungstiefe) richtet sich nach dem
  // Abschnitt, wenn es ihn gibt — sonst nach dem, was im Bereich üblich ist.
  const massgeblich = imAbschnitt.length > 0 ? imAbschnitt : zerlegt
  const praefix = haeufigste(massgeblich.map((e) => e.praefix)) ?? ''
  const zweistufig = massgeblich.length === 0 || haeufigste(massgeblich.map((e) => e.unter !== null))

  const gleicheForm = zerlegt.filter((e) => e.praefix === praefix)

  let haupt: number
  let unter: number | null

  if (imAbschnitt.length > 0 && zweistufig) {
    // Bestehender Abschnitt, zweistufig: dieselbe Hauptnummer weiterzählen.
    haupt = haeufigste(imAbschnitt.filter((e) => e.praefix === praefix).map((e) => e.haupt)) ?? 1
    const belegt = gleicheForm.filter((e) => e.haupt === haupt && e.unter !== null)
    unter = Math.max(0, ...belegt.map((e) => e.unter as number)) + 1
  } else if (zweistufig) {
    // Neuer Abschnitt: eine neue Hauptnummer eröffnen.
    haupt = Math.max(0, ...gleicheForm.map((e) => e.haupt)) + 1
    unter = 1
  } else {
    // Einstufige Gliederung: die Hauptnummer selbst zählt weiter.
    haupt = Math.max(0, ...gleicheForm.map((e) => e.haupt)) + 1
    unter = null
  }

  // Der eindeutige Index über (Bereich, Nummer) kennt keine Abschnitte. Ist
  // die errechnete Nummer anderswo schon vergeben, wird weitergezählt statt
  // in eine Fehlermeldung zu laufen, die niemand versteht.
  while (vergeben.has(baue(praefix, haupt, unter))) {
    if (unter === null) haupt++
    else unter++
  }

  return baue(praefix, haupt, unter)
}
