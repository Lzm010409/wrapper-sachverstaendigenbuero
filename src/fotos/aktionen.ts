'use server'

import { eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { db } from '@/db'
import { fall } from '@/db/schema'
import { verlangeRecht } from '@/rechte/zugriff'
import { clientAusUmgebung } from '@/autoixpert/client'
import { gutachtenSchema } from '@/autoixpert/typen'
import type { Aktionsergebnis } from '@/melden/typen'

/**
 * Beschriften eines Fotos — Titel, Beschreibung und die Häkchen, in welchen
 * Dokumenten es auftaucht.
 *
 * **Schreibender Zugriff.** Er geht durch dieselbe Sperre wie alles andere:
 * ohne `AUTOIXPERT_SCHREIBEN=erlaubt` wirft der Client, bevor etwas das Haus
 * verlässt. Die Oberfläche fragt vorher und blendet die Felder aus, aber
 * darauf verlässt sich hier nichts.
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
  await verlangeRecht('autoixpert.schreiben')

  const client = clientAusUmgebung()
  if (!client) return { fehler: 'autoiXpert ist auf diesem Server nicht eingerichtet.' }

  const [zeile] = await db
    .select({ daten: fall.daten })
    .from(fall)
    .where(eq(fall.id, fallId))
    .limit(1)
  const geprueft = zeile?.daten ? gutachtenSchema.safeParse(zeile.daten) : null
  const reportId = geprueft?.success ? geprueft.data.id || geprueft.data.external_id : null
  if (!reportId) return { fehler: 'Zu diesem Fall fehlt die autoiXpert-Kennung.' }

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
    return { fehler: fehler instanceof Error ? fehler.message : String(fehler) }
  }

  revalidatePath(`/faelle/${fallId}`)
  return { hinweis: 'Gespeichert.' }
}
