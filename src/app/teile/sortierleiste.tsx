'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { leseSortierung, mitSortierung, type Richtung } from './sortierung'

export interface Sortierfeld {
  wert: string
  text: string
}

export interface SortierleisteEigenschaften {
  felder: Sortierfeld[]
}

/**
 * Sortieren für die Karten-/Zeilenlisten (Fälle, Stellungnahmen, Bibliothek,
 * Verwaltung).
 *
 * Diese Listen sind keine Tabellen mit Spalten — sie haben keine Kopfzeile,
 * an die sich ein klickbarer Spaltenkopf wie im WBW-Korb (`Spaltenkopf`)
 * anheften liesse; mehrere der hier gezeigten Angaben stecken ohnehin in
 * derselben Zelle. Stattdessen ein Dropdown plus Richtungsknopf, als eigenes
 * Steuerelement über der Liste — genau wie die Filterleiste.
 *
 * **Der Stand liegt in der Adresse**, aus demselben Grund wie der Filter
 * (siehe `filterleiste.tsx`): weiterschickbar, als Lesezeichen brauchbar,
 * vom Zurück-Knopf erreichbar. Ein Wechsel des Filters darf ihn nicht
 * verlieren — deshalb reicht die jeweilige Seite ihn als `zusatzParameter`
 * an die `Filterleiste` weiter.
 */
export function Sortierleiste({ felder }: SortierleisteEigenschaften) {
  const parameter = useSearchParams()
  const router = useRouter()
  const pfad = usePathname()

  const gueltig = felder.map((f) => f.wert)
  const stand = leseSortierung(
    {
      sortiert: parameter.get('sortiert') ?? undefined,
      richtung: parameter.get('richtung') ?? undefined,
    },
    gueltig,
  )

  function geheZu(naechster: { feld: string; richtung: Richtung } | null) {
    const naechste = mitSortierung(parameter, naechster)
    router.push(naechste.size > 0 ? `${pfad}?${naechste}` : pfad)
  }

  function beiFeld(e: React.ChangeEvent<HTMLSelectElement>) {
    const feld = e.target.value
    geheZu(feld ? { feld, richtung: 'aufsteigend' } : null)
  }

  function beiRichtung() {
    if (!stand) return
    geheZu({
      feld: stand.feld,
      richtung: stand.richtung === 'absteigend' ? 'aufsteigend' : 'absteigend',
    })
  }

  return (
    <div className="sortierleiste">
      <div className="feld">
        <label htmlFor="sortierleiste-feld">Sortieren nach</label>
        <select id="sortierleiste-feld" value={stand?.feld ?? ''} onChange={beiFeld}>
          <option value="">Standard</option>
          {felder.map((f) => (
            <option key={f.wert} value={f.wert}>
              {f.text}
            </option>
          ))}
        </select>
      </div>

      {stand ? (
        <button
          type="button"
          className="knopf-schlicht sortierrichtung"
          onClick={beiRichtung}
          aria-label={
            stand.richtung === 'absteigend'
              ? 'Absteigend sortiert — umkehren'
              : 'Aufsteigend sortiert — umkehren'
          }
        >
          <span aria-hidden="true">{stand.richtung === 'absteigend' ? '↓' : '↑'}</span>
          <span className="nur-vorlesen">
            {stand.richtung === 'absteigend' ? 'absteigend' : 'aufsteigend'}
          </span>
        </button>
      ) : null}
    </div>
  )
}
