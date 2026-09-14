import { apiBenutzerOderAntwort, apiJsonAntwort } from '@/app/api/wache'
import { leseSeitenparameter } from '@/app/api/seite'
import { ladeEintraegeMitDetails, zaehleEintraege } from '@/bibliothek/abfragen'

/**
 * Die Argumentbibliothek per API — alle Einträge, unabhängig vom
 * Freigabestatus, mit Varianten, Ergänzungen, Belegen und Platzhaltern
 * vollständig verschachtelt.
 *
 * Token-gesichert wie jede Route unter `/api/v1/*`; siehe `src/app/api/wache.ts`.
 */
export async function GET(anfrage: Request): Promise<Response> {
  const wache = await apiBenutzerOderAntwort(anfrage)
  if (wache instanceof Response) return wache

  const { limit, versatz } = leseSeitenparameter(new URL(anfrage.url))

  const [daten, gesamt] = await Promise.all([
    ladeEintraegeMitDetails(limit, versatz),
    zaehleEintraege({}),
  ])

  return apiJsonAntwort({ daten, gesamt, limit, versatz })
}
