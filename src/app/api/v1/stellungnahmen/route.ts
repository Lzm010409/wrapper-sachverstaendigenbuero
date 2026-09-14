import { apiBenutzerOderAntwort, apiJsonAntwort } from '@/app/api/wache'
import { leseSeitenparameter } from '@/app/api/seite'
import { ladeStellungnahmenApiListe, zaehleStellungnahmen } from '@/stellungnahme/abfragen'

/**
 * Die Stellungnahmenliste per API — unabhängig vom Stand, auch Entwürfe.
 *
 * Ohne den vollen Text und ohne PDF: die stehen im Einzelabruf
 * (`/api/v1/stellungnahmen/{id}`), wo sie tatsächlich gebraucht werden. Sie
 * in der Liste mitzuschicken hiesse, für jede Zeile ein PDF zu rendern, nur
 * damit die Liste sie nicht zeigt.
 */
export async function GET(anfrage: Request): Promise<Response> {
  const wache = await apiBenutzerOderAntwort(anfrage)
  if (wache instanceof Response) return wache

  const { limit, versatz } = leseSeitenparameter(new URL(anfrage.url))

  const [daten, gesamt] = await Promise.all([
    ladeStellungnahmenApiListe(limit, versatz),
    zaehleStellungnahmen(),
  ])

  return apiJsonAntwort({ daten, gesamt, limit, versatz })
}
