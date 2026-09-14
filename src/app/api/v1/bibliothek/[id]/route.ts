import { apiBenutzerOderAntwort, apiFehlerAntwort, apiJsonAntwort } from '@/app/api/wache'
import { istUuid } from '@/app/api/kennung'
import { ladeEintrag } from '@/bibliothek/abfragen'

/** Ein einzelner Bibliothekseintrag per API, vollständig verschachtelt. */
export async function GET(
  anfrage: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const wache = await apiBenutzerOderAntwort(anfrage)
  if (wache instanceof Response) return wache

  const { id } = await params
  if (!istUuid(id)) return apiFehlerAntwort(404, 'Diesen Bibliothekseintrag gibt es nicht.')

  const eintrag = await ladeEintrag(id)
  if (!eintrag) return apiFehlerAntwort(404, 'Diesen Bibliothekseintrag gibt es nicht.')

  return apiJsonAntwort(eintrag)
}
