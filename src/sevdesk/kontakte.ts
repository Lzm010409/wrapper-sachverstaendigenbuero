import 'server-only'
import { z } from 'zod'
import { gruppiere, type Dublettengruppe, type Kontakt } from '@/kontakte/dubletten'

/**
 * Die Kontakte aus sevDesk — für die Dublettenschau.
 *
 * **Warum die Belegzahl nicht für alle geholt wird.** Sie kommt aus einem
 * eigenen Aufruf je Kontakt (`/Contact/{id}/getTabsItemCount`). Für alle
 * 131 Kontakte wären das 131 Anfragen, für eine Zahl, die bei 112 von
 * ihnen niemanden interessiert. Deshalb wird erst gruppiert und dann nur
 * für die 19 Einträge nachgefragt, die überhaupt in einer Gruppe stehen.
 *
 * **Warum nichts gespiegelt wird.** 131 Kontakte in einer Anfrage — der
 * Aufwand einer Tabelle mit Abgleich stünde in keinem Verhältnis. Anders
 * als bei den 1444 Rechnungen.
 */

const ZEITLIMIT_MS = 20_000

const kontaktSchema = z.object({
  id: z.union([z.string(), z.number()]),
  name: z.string().nullish(),
  name2: z.string().nullish(),
  surename: z.string().nullish(),
  familyname: z.string().nullish(),
  customerNumber: z.string().nullish(),
  create: z.string().nullish(),
})

const listeSchema = z.object({ objects: z.array(z.unknown()).nullish() })
const zaehlerSchema = z.object({ objects: z.record(z.string(), z.unknown()).nullish() })

function basisUrl(): string {
  return process.env.SEVDESK_BASIS_URL ?? 'https://my.sevdesk.de/api/v1'
}

async function hole(pfad: string): Promise<unknown> {
  const token = process.env.SEVDESK_API_TOKEN
  if (!token) throw new Error('sevDesk ist auf diesem Server nicht eingerichtet.')
  const antwort = await fetch(basisUrl() + pfad, {
    headers: { authorization: token },
    signal: AbortSignal.timeout(ZEITLIMIT_MS),
  })
  if (!antwort.ok) throw new Error(`sevDesk antwortete mit ${antwort.status} auf ${pfad}.`)
  return antwort.json()
}

/** Der Anzeigename: Firmenname, sonst Vor- und Nachname. */
function anzeigename(roh: z.infer<typeof kontaktSchema>): string {
  const firma = [roh.name, roh.name2].filter(Boolean).join(' ').trim()
  if (firma) return firma
  return [roh.surename, roh.familyname].filter(Boolean).join(' ').trim()
}

/**
 * Die Dublettengruppen, mit der Zahl der Belege je Eintrag.
 *
 * `gruppiere` läuft zweimal: einmal, um überhaupt die Kandidaten zu finden,
 * und einmal mit den nachgeholten Belegzahlen, weil erst die die
 * Reihenfolge und das Urteil „aufräumbar" tragen. Zweimal eine reine
 * Funktion aufzurufen ist billiger als eine zweite, halbfertige Variante
 * davon zu schreiben.
 */
export async function ladeDubletten(): Promise<Dublettengruppe[]> {
  const roh = listeSchema.safeParse(await hole('/Contact?limit=1000'))
  if (!roh.success) throw new Error('Die Kontaktliste von sevDesk hatte eine unerwartete Form.')

  const kontakte: Kontakt[] = []
  for (const eintrag of roh.data.objects ?? []) {
    const geprueft = kontaktSchema.safeParse(eintrag)
    if (!geprueft.success) continue
    const anzeige = anzeigename(geprueft.data)
    if (!anzeige) continue
    kontakte.push({
      id: String(geprueft.data.id),
      anzeige,
      kundennummer: geprueft.data.customerNumber?.trim() || null,
      angelegtAm: geprueft.data.create ? new Date(geprueft.data.create) : null,
      belege: 0,
    })
  }

  const kandidaten = gruppiere(kontakte).flatMap((g) => g.kontakte)
  if (kandidaten.length === 0) return []

  // Nebeneinander: es sind so viele Anfragen, wie es Dubletten gibt — am
  // 09.09.2026 neunzehn. Nacheinander waren das gemessene Sekunden, in
  // denen die Seite leer blieb.
  const mitBelegen = await Promise.all(
    kandidaten.map(async (kandidat) => ({ ...kandidat, belege: await belegzahl(kandidat.id) })),
  )
  return gruppiere(mitBelegen)
}

/**
 * Wie viele Rechnungen, Belege und Aufträge an einem Kontakt hängen.
 *
 * Bei einem Fehler wird `-1` zurückgegeben und nicht `0`: „keine Belege"
 * ist die Aussage, auf die sich ein Löschen stützen würde, und die darf
 * eine Störung nicht erzeugen.
 */
async function belegzahl(id: string): Promise<number> {
  try {
    const roh = zaehlerSchema.safeParse(await hole(`/Contact/${encodeURIComponent(id)}/getTabsItemCount`))
    if (!roh.success) return -1
    let summe = 0
    for (const wert of Object.values(roh.data.objects ?? {})) {
      const zahl = Number(wert)
      if (Number.isFinite(zahl) && zahl > 0) summe += zahl
    }
    return summe
  } catch {
    return -1
  }
}
