import 'server-only'
import { holeJson, objekte, schreibeJson, SevdeskAnfragefehler } from './anfrage'
import type { Objektart } from '@/kontakte/plan'

/**
 * Die schreibenden Aufrufe an sevDesk — jeder mit Nachkontrolle.
 *
 * **Warum nach jedem Schreibzugriff noch ein Lesezugriff steht.** Eine 200
 * von sevDesk heisst „die Anfrage war in Ordnung", nicht „ich habe es
 * getan". Bei einem Vorgang, der Rechnungen zwischen Kunden verschiebt, ist
 * das der Unterschied zwischen einem Protokoll und einer Behauptung. Also:
 * schreiben, zurücklesen, vergleichen — und nur was wirklich gewechselt
 * hat, gilt als geglückt.
 *
 * **Was am 09.09.2026 am echten Konto geprüft wurde:** ein `PUT` auf eine
 * nicht festgeschriebene Rechnung mit ausschliesslich dem Feld `contact`
 * ändert genau zwei Felder — `contact` und `update`. Die übrigen 73 bleiben
 * unangetastet. Ein Teil-`PUT` leert hier also nichts, und der Rückweg
 * funktioniert genauso.
 */

export interface Schrittergebnis {
  erfolg: boolean
  /** Bei Misserfolg: was sevDesk gesagt hat, oder woran es sonst lag. */
  meldung?: string
}

/**
 * In welchem Feld die jeweilige Objektart ihren Kontakt trägt.
 *
 * Der Beleg tanzt aus der Reihe: dort heisst das Feld `supplier`, weil ein
 * Beleg aus Sicht der Buchhaltung von einem Lieferanten kommt.
 */
const KONTAKTFELD: Record<Objektart, 'contact' | 'supplier'> = {
  Invoice: 'contact',
  Order: 'contact',
  CreditNote: 'contact',
  Voucher: 'supplier',
  ContactAddress: 'contact',
  CommunicationWay: 'contact',
}

function kontaktIdAus(objekt: unknown, feld: 'contact' | 'supplier'): string | null {
  if (!objekt || typeof objekt !== 'object') return null
  const bezug = (objekt as Record<string, unknown>)[feld]
  if (!bezug || typeof bezug !== 'object') return null
  const id = (bezug as { id?: unknown }).id
  return id === undefined || id === null ? null : String(id)
}

async function holeEinzeln(art: Objektart, objektId: string): Promise<unknown> {
  const roh = await holeJson(`/${art}/${encodeURIComponent(objektId)}`)
  return objekte(roh)[0] ?? null
}

/**
 * Hängt ein Objekt auf einen anderen Kontakt um.
 *
 * Gibt `erfolg: false` zurück, wenn sevDesk ablehnt **oder** wenn es
 * zustimmt, aber nichts ändert. Der zweite Fall ist der gefährlichere: ohne
 * die Nachkontrolle stünde im Protokoll „umgehängt", und der Kontakt liesse
 * sich anschliessend nicht löschen, ohne dass jemand wüsste warum.
 */
export async function haengeUm(
  art: Objektart,
  objektId: string,
  zielKontaktId: string,
): Promise<Schrittergebnis> {
  const feld = KONTAKTFELD[art]
  try {
    await schreibeJson(`/${art}/${encodeURIComponent(objektId)}`, 'PUT', {
      [feld]: { id: Number(zielKontaktId), objectName: 'Contact' },
    })
  } catch (fehler) {
    return { erfolg: false, meldung: grund(fehler) }
  }

  let nachher: unknown
  try {
    nachher = await holeEinzeln(art, objektId)
  } catch (fehler) {
    return { erfolg: false, meldung: `Nicht nachprüfbar: ${grund(fehler)}` }
  }

  const jetzt = kontaktIdAus(nachher, feld)
  if (jetzt !== String(zielKontaktId)) {
    return {
      erfolg: false,
      meldung: `sevDesk hat die Zuordnung nicht gewechselt (steht weiter auf ${jetzt ?? 'unbekannt'}).`,
    }
  }
  return { erfolg: true }
}

/** Der Vermerk, den ein stehenbleibender Verlierer bekommt. */
export function dublettenvermerk(siegerBezeichnung: string): string {
  return `Dublette zu ${siegerBezeichnung} — nicht mehr verwenden.`
}

/**
 * Schreibt den Dublettenvermerk in die Beschreibung des Kontakts.
 *
 * Eine vorhandene Beschreibung wird nicht überschrieben, sondern ergänzt.
 * Was jemand dort einmal notiert hat, ist nicht meine Zeile zum Löschen.
 */
export async function markiere(kontaktId: string, vermerk: string): Promise<Schrittergebnis> {
  let vorhanden = ''
  try {
    const roh = objekte(await holeJson(`/Contact/${encodeURIComponent(kontaktId)}`))[0]
    const text = roh && typeof roh === 'object' ? (roh as { description?: unknown }).description : null
    vorhanden = typeof text === 'string' ? text : ''
  } catch (fehler) {
    return { erfolg: false, meldung: grund(fehler) }
  }

  if (vorhanden.includes(vermerk)) return { erfolg: true }
  const neu = [vorhanden.trim(), vermerk].filter(Boolean).join('\n')

  try {
    await schreibeJson(`/Contact/${encodeURIComponent(kontaktId)}`, 'PUT', { description: neu })
  } catch (fehler) {
    return { erfolg: false, meldung: grund(fehler) }
  }

  const roh = objekte(await holeJson(`/Contact/${encodeURIComponent(kontaktId)}`))[0]
  const text = roh && typeof roh === 'object' ? (roh as { description?: unknown }).description : null
  return typeof text === 'string' && text.includes(vermerk)
    ? { erfolg: true }
    : { erfolg: false, meldung: 'sevDesk hat den Vermerk nicht übernommen.' }
}

/**
 * Löscht einen Kontakt und prüft nach, dass er fort ist.
 *
 * Ob er leer ist, entscheidet **nicht** diese Funktion — das gehört eine
 * Ebene höher, unmittelbar vor den Aufruf und auf frischen Daten.
 */
export async function loescheKontakt(kontaktId: string): Promise<Schrittergebnis> {
  try {
    await schreibeJson(`/Contact/${encodeURIComponent(kontaktId)}`, 'DELETE')
  } catch (fehler) {
    return { erfolg: false, meldung: grund(fehler) }
  }

  try {
    const roh = objekte(await holeJson(`/Contact/${encodeURIComponent(kontaktId)}`))
    return roh.length === 0
      ? { erfolg: true }
      : { erfolg: false, meldung: 'sevDesk liefert den Kontakt weiterhin aus.' }
  } catch (fehler) {
    // Ein 404 auf den gelöschten Kontakt ist die erwartete Antwort.
    if (fehler instanceof SevdeskAnfragefehler && fehler.status === 404) return { erfolg: true }
    return { erfolg: false, meldung: `Nicht nachprüfbar: ${grund(fehler)}` }
  }
}

function grund(fehler: unknown): string {
  if (fehler instanceof SevdeskAnfragefehler) {
    return fehler.antwort ? `${fehler.message} ${fehler.antwort}` : fehler.message
  }
  return fehler instanceof Error ? fehler.message : String(fehler)
}
