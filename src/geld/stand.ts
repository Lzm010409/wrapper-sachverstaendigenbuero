import 'server-only'
import { aktenzeichenschluessel, sevdeskEingerichtet } from '@/sevdesk/client'
import { gleicheAb, ladeRechnungen, spiegelstand, type Spiegelstand } from '@/sevdesk/spiegel'
import { ampelFuer, type Ampel } from './ampel'

/**
 * Der Zahlungsstand, wie ihn die Oberfläche braucht.
 *
 * Hier laufen die drei Teile zusammen: der Abgleich mit sevDesk, der
 * Spiegel in der Datenbank und die Zusammenfassung je Fall. Die Oberfläche
 * bekommt neben der Ampel immer auch den **Stand des Abgleichs** — eine
 * Ampel ohne Altersangabe wäre eine Behauptung über Geld, deren Grundlage
 * niemand sieht.
 */

export interface Zahlungsansicht {
  eingerichtet: boolean
  ampeln: Map<string, Ampel>
  spiegel: Spiegelstand
}

/** Der Zahlungsstand zu einer Liste von Aktenzeichen — ein Abgleich für alle. */
export async function ladeAmpeln(aktenzeichen: (string | null)[]): Promise<Zahlungsansicht> {
  const leer: Zahlungsansicht = {
    eingerichtet: false,
    ampeln: new Map(),
    spiegel: { abgeglichenAm: null, wasserzeichen: null, anzahl: 0 },
  }
  if (!sevdeskEingerichtet()) return leer

  await gleicheAb()

  const schluessel = new Map<string, string>()
  for (const az of aktenzeichen) {
    if (az?.trim()) schluessel.set(az, aktenzeichenschluessel(az))
  }

  const [rechnungen, spiegel] = await Promise.all([
    ladeRechnungen([...schluessel.values()]),
    spiegelstand(),
  ])

  const heute = new Date()
  const ampeln = new Map<string, Ampel>()
  for (const [az, key] of schluessel) {
    ampeln.set(az, ampelFuer(rechnungen.get(key) ?? [], heute))
  }

  return { eingerichtet: true, ampeln, spiegel }
}

/** Der Zahlungsstand zu einem einzelnen Fall. */
export async function ladeAmpel(
  aktenzeichen: string | null,
): Promise<{ eingerichtet: boolean; ampel: Ampel | null; spiegel: Spiegelstand }> {
  const ansicht = await ladeAmpeln([aktenzeichen])
  return {
    eingerichtet: ansicht.eingerichtet,
    ampel: aktenzeichen ? (ansicht.ampeln.get(aktenzeichen) ?? null) : null,
    spiegel: ansicht.spiegel,
  }
}
