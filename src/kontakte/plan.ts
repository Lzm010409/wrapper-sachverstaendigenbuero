/**
 * Der Plan einer Zusammenführung — was passieren soll, bevor irgendetwas
 * passiert.
 *
 * **Warum es diesen Zwischenschritt gibt.** Zusammenführen heisst: fremde
 * Buchhaltung anfassen. Zwischen „ich glaube, das gehört zusammen" und
 * „sevDesk hat es getan" gehört ein Blatt Papier, auf dem Schritt für
 * Schritt steht, was gleich geschieht — samt der Stellen, an denen es
 * voraussichtlich nicht geht.
 *
 * **Warum alles umgehängt und nichts kopiert wird.** Rechnung, Beleg,
 * Anschrift und Kommunikationsweg tragen in sevDesk alle ein Feld
 * `contact` (beim Beleg heisst es `supplier`). Ein einziger Handgriff —
 * `PUT` mit dem neuen Kontakt — genügt für alle vier, und am Verlierer
 * bleibt nichts zurück. Anlegen und Löschen wäre derselbe Vorgang in zwei
 * Schritten, von denen der zweite misslingen kann.
 *
 * **Warum ein Vorbehalt und kein Ausschluss.** Eine festgeschriebene
 * Rechnung lässt sich vermutlich nicht umhängen. Vermutlich — nachgewiesen
 * ist es nicht, und sevDesk könnte es morgen anders halten. Der Plan sagt
 * deshalb „vermutlich blockiert" und versucht es trotzdem; entschieden wird
 * am Ergebnis des Aufrufs, nicht an einer Annahme.
 *
 * Rein: kein Netz, keine Datenbank. Damit ist der Plan prüfbar.
 */

/** Was an einem sevDesk-Kontakt hängen kann. */
export type Objektart =
  | 'Invoice'
  | 'Voucher'
  | 'Order'
  | 'CreditNote'
  | 'ContactAddress'
  | 'CommunicationWay'

export const OBJEKTNAMEN: Record<Objektart, string> = {
  Invoice: 'Rechnung',
  Voucher: 'Beleg',
  Order: 'Auftrag',
  CreditNote: 'Gutschrift',
  ContactAddress: 'Anschrift',
  CommunicationWay: 'Kontaktweg',
}

/**
 * Die Arten, die ein Löschen verhindern.
 *
 * Anschriften und Kommunikationswege gehören zum Kontakt und gehen mit ihm;
 * ein Beleg gehört der Buchhaltung und darf niemals herrenlos werden.
 */
export const BELEGARTEN: Objektart[] = ['Invoice', 'Voucher', 'Order', 'CreditNote']

export interface Anhang {
  art: Objektart
  id: string
  /** Rechnungsnummer oder Belegbezeichnung — im Protokoll wiederzufinden. */
  bezeichnung: string
  festgeschrieben: boolean
}

export interface Adresse {
  id: string
  strasse: string | null
  plz: string | null
  ort: string | null
}

export interface Weg {
  id: string
  /** `EMAIL`, `PHONE`, `MOBILE`, `WEB` … */
  typ: string
  wert: string
}

export interface Kontaktanhaenge {
  kontaktId: string
  anzeige: string
  anhaenge: Anhang[]
  adressen: Adresse[]
  wege: Weg[]
}

export type Schrittart = 'umhaengen' | 'markieren' | 'loeschen'

export interface Planschritt {
  art: Schrittart
  verliererId: string
  objektArt?: Objektart
  objektId?: string
  bezeichnung: string
  /** Gesetzt, wenn dieser Schritt voraussichtlich scheitert. Kein Ausschluss. */
  vorbehalt?: string
}

export interface Plan {
  siegerId: string
  schritte: Planschritt[]
  /** Verlierer, die nach dem Plan voraussichtlich leer und damit löschbar sind. */
  voraussichtlichLeer: string[]
  /** Verlierer, an denen etwas hängen bleibt — sie werden nur markiert. */
  bleibenStehen: string[]
}

/**
 * Die Vergleichsform einer Anschrift.
 *
 * Verglichen werden **Straße und Postleitzahl, nicht der Ort**: am Konto
 * steht dieselbe Anschrift einmal als „40589 Düsseldorf" und einmal als
 * „40589 Ddorf". Die Postleitzahl bestimmt den Ort ohnehin, und eine
 * Abkürzung im Ortsnamen darf keine zweite Anschrift erzeugen.
 *
 * „Ruwerstr. 7a" und „Ruwerstraße 7a" sind ebenfalls dieselbe Adresse —
 * beide stehen im Konto, an Sieger und Verlierer. Deshalb wird `str`
 * ausgeschrieben, bevor verglichen wird.
 */
export function adressschluessel(adresse: Adresse): string {
  const strasse = (adresse.strasse ?? '')
    .toLowerCase()
    .replace(/ß/g, 'ss')
    .replace(/[äàáâ]/g, 'a')
    .replace(/[öòóô]/g, 'o')
    .replace(/[üùúû]/g, 'u')
    .replace(/[^a-z0-9]+/g, ' ')
    // Kein `\bstr\b`: deutsche Strassennamen sind zusammengesetzt. In
    // „ruwerstr" steht vor dem „str" ein Wortzeichen, eine Wortgrenze gibt
    // es dort also nicht — gesucht ist die Abkuerzung am Wortende.
    .replace(/str\b/g, 'strasse')
    .replace(/\s+/g, '')
  return `${strasse}|${(adresse.plz ?? '').replace(/\D/g, '')}`
}

/** Eine Anschrift ohne Straße, Postleitzahl und Ort ist keine. */
export function leereAdresse(adresse: Adresse): boolean {
  return !adresse.strasse?.trim() && !adresse.plz?.trim() && !adresse.ort?.trim()
}

export function wegschluessel(weg: Weg): string {
  return `${weg.typ.toLowerCase()}|${weg.wert.toLowerCase().replace(/[^a-z0-9@.+]/g, '')}`
}

/**
 * Baut den Plan.
 *
 * Die Reihenfolge der Schritte ist nicht kosmetisch: erst wandert alles
 * herüber, dann wird der Verlierer angefasst. Andersherum stünde am Ende
 * ein gelöschter Kontakt mit einer Rechnung, die niemandem mehr gehört.
 */
export function planeSchritte(sieger: Kontaktanhaenge, verlierer: Kontaktanhaenge[]): Plan {
  const schritte: Planschritt[] = []
  const voraussichtlichLeer: string[] = []
  const bleibenStehen: string[] = []

  const bekannteAdressen = new Set(sieger.adressen.filter((a) => !leereAdresse(a)).map(adressschluessel))
  const bekannteWege = new Set(sieger.wege.map(wegschluessel))

  for (const kontakt of verlierer) {
    let bleibtEtwas = false

    for (const anhang of kontakt.anhaenge) {
      const vorbehalt = anhang.festgeschrieben
        ? 'festgeschrieben — sevDesk lässt das voraussichtlich nicht zu'
        : undefined
      if (vorbehalt) bleibtEtwas = true
      schritte.push({
        art: 'umhaengen',
        verliererId: kontakt.kontaktId,
        objektArt: anhang.art,
        objektId: anhang.id,
        bezeichnung: `${OBJEKTNAMEN[anhang.art]} ${anhang.bezeichnung}`,
        ...(vorbehalt ? { vorbehalt } : {}),
      })
    }

    // Anschriften und Kommunikationswege nur, soweit der Sieger sie nicht
    // schon hat. Der Rest verschwindet mit dem Kontakt — das ist gewollt:
    // sieben Mal dieselbe Anschrift am Sieger wäre keine Rettung, sondern
    // dieselbe Unordnung an anderer Stelle.
    for (const adresse of kontakt.adressen) {
      if (leereAdresse(adresse)) continue
      const schluessel = adressschluessel(adresse)
      if (bekannteAdressen.has(schluessel)) continue
      bekannteAdressen.add(schluessel)
      schritte.push({
        art: 'umhaengen',
        verliererId: kontakt.kontaktId,
        objektArt: 'ContactAddress',
        objektId: adresse.id,
        bezeichnung: `Anschrift ${[adresse.strasse, [adresse.plz, adresse.ort].filter(Boolean).join(' ')]
          .filter(Boolean)
          .join(', ')}`,
      })
    }

    for (const weg of kontakt.wege) {
      const schluessel = wegschluessel(weg)
      if (bekannteWege.has(schluessel)) continue
      bekannteWege.add(schluessel)
      schritte.push({
        art: 'umhaengen',
        verliererId: kontakt.kontaktId,
        objektArt: 'CommunicationWay',
        objektId: weg.id,
        bezeichnung: `Kontaktweg ${weg.typ}: ${weg.wert}`,
      })
    }

    if (bleibtEtwas) {
      bleibenStehen.push(kontakt.kontaktId)
      schritte.push({ art: 'markieren', verliererId: kontakt.kontaktId, bezeichnung: kontakt.anzeige })
    } else {
      voraussichtlichLeer.push(kontakt.kontaktId)
      schritte.push({ art: 'loeschen', verliererId: kontakt.kontaktId, bezeichnung: kontakt.anzeige })
    }
  }

  return { siegerId: sieger.kontaktId, schritte, voraussichtlichLeer, bleibenStehen }
}

/**
 * Der Schritt, an dem sich zeigt, ob das Umhängen überhaupt trägt.
 *
 * Bewusst ein Beleg und keine Anschrift: die Frage ist, ob sevDesk eine
 * **Rechnung** wandern lässt. Gelingt das, gelingt der Rest erst recht.
 */
export function probeschritt(plan: Plan): Planschritt | null {
  return (
    plan.schritte.find(
      (s) =>
        s.art === 'umhaengen' &&
        !s.vorbehalt &&
        s.objektArt !== undefined &&
        BELEGARTEN.includes(s.objektArt),
    ) ?? null
  )
}
