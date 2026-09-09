'use client'

import type { Richtung } from './sortierung'

/**
 * Eine sortierbare Spaltenüberschrift für eine echte `<table>`.
 *
 * Extrahiert aus dem WBW-Vergleichskorb (`korbtabelle.tsx`), der als erste
 * Tabelle im Haus eine klickbare Sortierung bekam — dort sitzt der Stand im
 * Bauteilzustand, weil dort schon alle Zeilen geladen sind. Generisch über
 * den Spaltenschlüssel, damit eine künftige Tabelle dieselbe Optik und A11y
 * bekommt, ohne den Korb anzufassen.
 */
export function Spaltenkopf<Feld extends string>({
  spalte,
  jetzt,
  richtung,
  klick,
  children,
}: {
  spalte: Feld
  jetzt: Feld
  richtung: Richtung
  klick: (spalte: Feld) => void
  children: React.ReactNode
}) {
  const aktiv = jetzt === spalte
  return (
    <th aria-sort={aktiv ? (richtung === 'absteigend' ? 'descending' : 'ascending') : 'none'}>
      <button type="button" className="spaltenkopf" onClick={() => klick(spalte)}>
        {children}
        <span aria-hidden="true">{aktiv ? (richtung === 'absteigend' ? ' ↓' : ' ↑') : ''}</span>
        <span className="nur-vorlesen">
          {aktiv
            ? richtung === 'absteigend'
              ? ', absteigend sortiert'
              : ', aufsteigend sortiert'
            : ', sortieren'}
        </span>
      </button>
    </th>
  )
}
