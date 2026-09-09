'use client'

import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { SEITENGROESSEN } from './seitenwahl'

/**
 * Die Seitennavigation unter einer Liste.
 *
 * **Der Zustand steht in der Adresse, nicht in React** — wie bei der
 * `Filterleiste`: eine Seite ist etwas, das man weiterschickt und sich als
 * Lesezeichen legt. Vorhandene Filter- und Suchparameter bleiben beim
 * Blättern erhalten, nur der eigene Seiten-/Größenparameter ändert sich.
 *
 * **Zwei Parameter statt fest `seite`/`groesse`.** Auf der Bildseite stehen
 * zwei unabhängige Listen nebeneinander (Bibliothek, „noch nicht
 * übernommen"); jede braucht ihren eigenen Namen in der Adresse, sonst
 * blätterten beide gemeinsam.
 */
export interface PaginationEigenschaften {
  /** Aktuelle Seite, 1-indiziert. */
  seite: number
  groesse: number
  /** Gesamtzahl der Treffer des aktuellen Filters — nicht die Länge der geladenen Seite. */
  gesamt: number
  seiteParam?: string
  groesseParam?: string
}

export function Pagination({
  seite,
  groesse,
  gesamt,
  seiteParam = 'seite',
  groesseParam = 'groesse',
}: PaginationEigenschaften) {
  const parameter = useSearchParams()
  const pfad = usePathname()
  const router = useRouter()

  // Nichts zu blättern — die „keine Treffer"-Meldung der Liste sagt bereits,
  // was los ist.
  if (gesamt === 0) return null

  const gesamtSeiten = Math.max(1, Math.ceil(gesamt / groesse))

  function ziel(aenderungen: Record<string, string>): string {
    const naechste = new URLSearchParams(parameter.toString())
    for (const [schluessel, wert] of Object.entries(aenderungen)) {
      naechste.set(schluessel, wert)
    }
    return `${pfad}?${naechste}`
  }

  return (
    <nav className="werkzeugleiste" aria-label="Seiten" style={{ marginTop: 16 }}>
      <span className="treffer-zahl">
        Seite {seite} von {gesamtSeiten} · {gesamt} Treffer
      </span>

      {seite > 1 ? (
        <Link href={ziel({ [seiteParam]: String(seite - 1) })} className="knopf-schlicht">
          ← Zurück
        </Link>
      ) : (
        <button type="button" className="knopf-schlicht" disabled>
          ← Zurück
        </button>
      )}

      {seite < gesamtSeiten ? (
        <Link href={ziel({ [seiteParam]: String(seite + 1) })} className="knopf-schlicht">
          Weiter →
        </Link>
      ) : (
        <button type="button" className="knopf-schlicht" disabled>
          Weiter →
        </button>
      )}

      <select
        value={String(groesse)}
        aria-label="Einträge pro Seite"
        onChange={(e) =>
          router.push(ziel({ [groesseParam]: e.target.value, [seiteParam]: '1' }))
        }
      >
        {SEITENGROESSEN.map((g) => (
          <option key={g} value={g}>
            {g} pro Seite
          </option>
        ))}
      </select>
    </nav>
  )
}
