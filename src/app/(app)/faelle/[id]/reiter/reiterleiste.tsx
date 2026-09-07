import Link from 'next/link'

/**
 * Die Reiterleiste des Falls.
 *
 * Der Fall ist der Anker: alles, was zu einem Vorgang gehört, liegt in
 * seinen Reitern — so wie in autoiXpert, wo ein Gutachten die Reiter
 * „Unfall & Beteiligte", „Fahrzeugauswahl", „Zustand", „Fotos",
 * „Kalkulation", „Rechnung" und „Druck & Versand" trägt.
 *
 * Vorher standen Fälle und Stellungnahmen als zwei getrennte Listen
 * nebeneinander, und die Verbindung war eine Karte in der Seitenleiste. Wer
 * einen Vorgang bearbeiten wollte, sprang zwischen zwei Bereichen hin und
 * her und legte im Zweifel ein zweites Schreiben zum selben Fall an.
 *
 * Der Stand steht in der Adresse (`?reiter=…`) und nicht im Browser: ein
 * Reiter ist damit verlinkbar, und der Zurück-Knopf tut, was er soll.
 */

export const REITER = [
  { schluessel: 'beteiligte', name: 'Unfall & Beteiligte' },
  { schluessel: 'fahrzeug', name: 'Fahrzeug' },
  { schluessel: 'kalkulation', name: 'Kalkulation' },
  { schluessel: 'wbw', name: 'Wiederbeschaffungswert' },
  { schluessel: 'stellungnahmen', name: 'Stellungnahmen' },
  { schluessel: 'vorgang', name: 'Vorgang' },
] as const

export type ReiterSchluessel = (typeof REITER)[number]['schluessel']

/** Unbekannte oder fehlende Angaben landen auf dem ersten Reiter. */
export function leseReiter(wert: string | undefined): ReiterSchluessel {
  const treffer = REITER.find((r) => r.schluessel === wert)
  return treffer?.schluessel ?? 'beteiligte'
}

export function Reiterleiste({
  fallId,
  aktiv,
  zaehler,
}: {
  fallId: string
  aktiv: ReiterSchluessel
  /** Zahl hinter einem Reiter, z. B. die Anzahl der Schreiben. */
  zaehler?: Partial<Record<ReiterSchluessel, number>>
}) {
  return (
    <nav className="fall-reiter" aria-label="Bereiche des Falls">
      {REITER.map((r) => {
        const zahl = zaehler?.[r.schluessel]
        return (
          <Link
            key={r.schluessel}
            href={`/faelle/${fallId}?reiter=${r.schluessel}`}
            aria-current={r.schluessel === aktiv ? 'page' : undefined}
          >
            {r.name}
            {zahl !== undefined && zahl > 0 ? <span className="fall-reiter-zahl">{zahl}</span> : null}
          </Link>
        )
      })}
    </nav>
  )
}
