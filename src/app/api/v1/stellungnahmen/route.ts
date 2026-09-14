import { apiBenutzerOderAntwort, apiJsonAntwort } from '@/app/api/wache'
import { leseSeitenparameter } from '@/app/api/seite'
import {
  ladePositionenZuStellungnahmen,
  ladeStellungnahmenApiListe,
  zaehleStellungnahmen,
} from '@/stellungnahme/abfragen'
import { kuerzungspositionenApi } from '@/stellungnahme/kuerzungen-api'

/**
 * Die Stellungnahmenliste per API — unabhängig vom Stand, auch Entwürfe.
 *
 * Ohne den vollen Text und ohne PDF: die stehen im Einzelabruf
 * (`/api/v1/stellungnahmen/{id}`), wo sie tatsächlich gebraucht werden. Sie
 * in der Liste mitzuschicken hiesse, für jede Zeile ein PDF zu rendern, nur
 * damit die Liste sie nicht zeigt. Die Kürzungspositionen mit ihren Summen
 * stehen dagegen auch hier — eine Zeile je Stellungnahme reicht nicht, um zu
 * sehen, worum es geht und wie viel auf dem Spiel steht.
 */
export async function GET(anfrage: Request): Promise<Response> {
  const wache = await apiBenutzerOderAntwort(anfrage)
  if (wache instanceof Response) return wache

  const { limit, versatz } = leseSeitenparameter(new URL(anfrage.url))

  const [zeilen, gesamt] = await Promise.all([
    ladeStellungnahmenApiListe(limit, versatz),
    zaehleStellungnahmen(),
  ])

  const positionenJeStellungnahme = await ladePositionenZuStellungnahmen(
    zeilen.map((z) => z.id),
  )
  const daten = zeilen.map((z) => ({
    ...z,
    ...kuerzungspositionenApi(positionenJeStellungnahme.get(z.id) ?? []),
  }))

  return apiJsonAntwort({ daten, gesamt, limit, versatz })
}
