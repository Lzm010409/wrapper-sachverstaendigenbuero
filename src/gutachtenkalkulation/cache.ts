import 'server-only'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '@/db'
import { fallKalkulation } from '@/db/schema'
import { clientAusUmgebung } from '@/autoixpert/client'
import { protokolliereWarnung } from '@/protokoll'
import { ladeGutachtenKalkulation, type Kalkulationsquelle } from './laden'
import { kalkulationszeileSchema, type Kalkulationszeile } from './schema'

/**
 * Zwischenspeicher des Kalkulationsauszugs — eine Zeile je Fall, wie
 * `src/fotos/analyse-ablage.ts` es für die Fotovorschläge vormacht.
 *
 * **Warum die abgelegten Zeilen noch einmal geprüft werden.** In der
 * jsonb-Spalte steht, was zum Zeitpunkt des Schreibens hineinpasste — wird
 * `Kalkulationszeile` später erweitert, liegen ältere Einträge trotzdem
 * weiter in der Datenbank. Ungeprüft gelesen könnte das eine Zeile ohne
 * Betrag ergeben, die beim Summieren des Vorschlags NaN erzeugt.
 */

const zeilenSchema = z.array(kalkulationszeileSchema)

function liesZeilen(roh: unknown, fallId: string): Kalkulationszeile[] {
  const geprueft = zeilenSchema.safeParse(roh)
  if (geprueft.success) return geprueft.data
  protokolliereWarnung('gutachtenkalkulation.cache', 'Abgelegte Kalkulationszeilen passten nicht mehr zum Schema.', {
    fallId,
  })
  return []
}

export interface FallKalkulationCache {
  quelle: Kalkulationsquelle
  zeilen: Kalkulationszeile[]
  erstelltAm: Date
}

export type FallKalkulationStand =
  | { stand: 'gefunden'; cache: FallKalkulationCache }
  /** Kein `AUTOIXPERT_API_TOKEN` hinterlegt — wie bei `fall/kalkulation.ts`. */
  | { stand: 'nicht_eingerichtet' }
  /** Der Fall hat keine autoiXpert-ID — es gibt nichts zu laden. */
  | { stand: 'kein_gutachten' }
  | { stand: 'fehler'; meldung: string }

/** Liest den zwischengespeicherten Kalkulationsauszug, ohne autoiXpert zu berühren. */
export async function ladeGecachteKalkulation(fallId: string): Promise<FallKalkulationCache | null> {
  const [zeile] = await db.select().from(fallKalkulation).where(eq(fallKalkulation.fallId, fallId)).limit(1)
  if (!zeile) return null
  return { quelle: zeile.quelle, zeilen: liesZeilen(zeile.zeilen, fallId), erstelltAm: zeile.erstelltAm }
}

/**
 * Lädt die Kalkulation neu von autoiXpert und ersetzt den Zwischenspeicher
 * vollständig — für den manuellen „Neu laden"-Knopf, wenn sich das Gutachten
 * geändert hat, und für den ersten Bedarf, wenn es noch gar keinen Stand gibt.
 *
 * Es gibt bewusst keine Historie: ein zweiter Aufruf für denselben Fall
 * überschreibt den vorigen Stand, wie bei `foto_analyse`.
 */
export async function aktualisiereFallKalkulation(
  fallId: string,
  autoixpertId: string,
  benutzerId: string | null,
): Promise<FallKalkulationStand> {
  const client = clientAusUmgebung()
  if (!client) return { stand: 'nicht_eingerichtet' }

  let geladen
  try {
    geladen = await ladeGutachtenKalkulation(client, autoixpertId)
  } catch (fehler) {
    return { stand: 'fehler', meldung: fehler instanceof Error ? fehler.message : String(fehler) }
  }

  const erstelltAm = new Date()
  const werte = {
    fallId,
    quelle: geladen.quelle,
    zeilen: geladen.zeilen,
    summeNetto: geladen.summeNetto?.toString() ?? null,
    unklarheiten: geladen.unklarheiten,
    erstelltVon: benutzerId,
    erstelltAm,
  }
  await db.insert(fallKalkulation).values(werte).onConflictDoUpdate({ target: fallKalkulation.fallId, set: werte })

  return { stand: 'gefunden', cache: { quelle: geladen.quelle, zeilen: geladen.zeilen, erstelltAm } }
}

/** Liest aus dem Zwischenspeicher — oder lädt einmalig nach, wenn er leer ist. */
export async function holeOderLadeFallKalkulation(
  fallId: string,
  autoixpertId: string | null,
  benutzerId: string | null,
): Promise<FallKalkulationStand> {
  const gecacht = await ladeGecachteKalkulation(fallId)
  if (gecacht) return { stand: 'gefunden', cache: gecacht }
  if (!autoixpertId) return { stand: 'kein_gutachten' }
  return aktualisiereFallKalkulation(fallId, autoixpertId, benutzerId)
}
