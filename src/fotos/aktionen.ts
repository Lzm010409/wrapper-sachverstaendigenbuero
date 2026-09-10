'use server'

import { eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { db } from '@/db'
import { fall } from '@/db/schema'
import { verlangeRecht } from '@/rechte/zugriff'
import { clientAusUmgebung } from '@/autoixpert/client'
import { gutachtenSchema } from '@/autoixpert/typen'
import { notiere } from '@/melden/ablage'
import type { Aktionsergebnis } from '@/melden/typen'

/**
 * Beschriften eines Fotos — Titel, Beschreibung und die Häkchen, in welchen
 * Dokumenten es auftaucht.
 *
 * **Schreibender Zugriff.** Er geht durch dieselbe Sperre wie alles andere:
 * ohne `AUTOIXPERT_SCHREIBEN=erlaubt` wirft der Client, bevor etwas das Haus
 * verlässt. Die Oberfläche fragt vorher und blendet die Felder aus, aber
 * darauf verlässt sich hier nichts.
 *
 * **Warum eine dauerhafte Meldung, obwohl die Oberfläche schon eine
 * flüchtige zeigt.** Diese Funktion ist der einzige Ort, an dem eine
 * Beschreibung tatsächlich nach autoiXpert geschrieben wird — ob über den
 * „Übernehmen"-Knopf im Prüfmodus (`uebernimmVorschlag`) oder das
 * automatische Speichern in der normalen Fotobearbeitung. Eine flüchtige
 * Meldung ist weg, sobald die Seite wechselt; ob die Übernahme wirklich
 * ankam, soll man auch später noch über die Glocke nachsehen können — vor
 * allem beim Fehlschlag, den man sonst leicht übersieht, wenn man längst
 * weitergeblättert hat.
 */
export async function beschrifteFoto(
  fallId: string,
  fotoId: string,
  aenderung: {
    beschreibung?: string
    imGutachten?: boolean
    inRestwertboerse?: boolean
    inReparaturbestaetigung?: boolean
    inStellungnahme?: boolean
  },
): Promise<Aktionsergebnis> {
  // Wirkt im führenden System, nicht nur hier. Die globale Sperre
  // AUTOIXPERT_SCHREIBEN gilt zusätzlich — das Recht allein genügt nicht.
  const benutzer = await verlangeRecht('autoixpert.schreiben')

  // Nur die eigentliche Beschreibung ist der Glocke eine dauerhafte Meldung
  // wert — ein einzelnes Häkchen ist kein Vorgang, den man nachverfolgen
  // will, und würde die Glocke bei jedem Klick zumüllen.
  async function meldeBeschreibung(erfolg: boolean, text: string) {
    if (aenderung.beschreibung === undefined) return
    await notiere({
      benutzerId: benutzer.id,
      art: erfolg ? 'erfolg' : 'fehler',
      titel: erfolg ? 'Bildbeschreibung übernommen' : 'Bildbeschreibung nicht übernommen',
      text,
      verweis: `/faelle/${fallId}?reiter=fotos`,
      quelle: 'fotos',
    })
  }

  const client = clientAusUmgebung()
  if (!client) {
    const meldung = 'autoiXpert ist auf diesem Server nicht eingerichtet.'
    await meldeBeschreibung(false, meldung)
    return { fehler: meldung }
  }

  const [zeile] = await db
    .select({ daten: fall.daten })
    .from(fall)
    .where(eq(fall.id, fallId))
    .limit(1)
  const geprueft = zeile?.daten ? gutachtenSchema.safeParse(zeile.daten) : null
  const reportId = geprueft?.success ? geprueft.data.id || geprueft.data.external_id : null
  if (!reportId) {
    const meldung = 'Zu diesem Fall fehlt die autoiXpert-Kennung.'
    await meldeBeschreibung(false, meldung)
    return { fehler: meldung }
  }

  // Nur senden, was sich wirklich ändert — ein PATCH mit allen Feldern würde
  // auch das überschreiben, was jemand anders gerade in autoiXpert gesetzt hat.
  const rumpf: Record<string, string | boolean> = {}
  if (aenderung.beschreibung !== undefined) rumpf.description = aenderung.beschreibung.trim()
  if (aenderung.imGutachten !== undefined) rumpf.included_in_report = aenderung.imGutachten
  if (aenderung.inRestwertboerse !== undefined) {
    rumpf.included_in_residual_value_exchange = aenderung.inRestwertboerse
  }
  if (aenderung.inReparaturbestaetigung !== undefined) {
    rumpf.included_in_repair_confirmation = aenderung.inReparaturbestaetigung
  }
  if (aenderung.inStellungnahme !== undefined) {
    rumpf.included_in_expert_statement = aenderung.inStellungnahme
  }
  if (Object.keys(rumpf).length === 0) return {}

  try {
    await client.aendereFoto(reportId, fotoId, rumpf)
  } catch (fehler) {
    const meldung = fehler instanceof Error ? fehler.message : String(fehler)
    await meldeBeschreibung(
      false,
      `„${aenderung.beschreibung?.trim()}" liess sich nicht nach autoiXpert übernehmen: ${meldung}`,
    )
    return { fehler: meldung }
  }

  await meldeBeschreibung(
    true,
    `„${aenderung.beschreibung?.trim()}" wurde nach autoiXpert übernommen.`,
  )

  revalidatePath(`/faelle/${fallId}`)
  return { hinweis: 'Gespeichert.' }
}
