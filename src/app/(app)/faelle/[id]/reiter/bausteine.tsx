import Link from 'next/link'

/**
 * Kleinteile, die mehrere Reiter der Fallseite gemeinsam benutzen.
 * Sie lagen vorher alle in der einen langen Fallseite; beim Aufteilen in
 * Reiter hätten sie sich sonst vervierfacht.
 */

/** Eine Zeile in einer Kennwerttabelle. Ohne Wert erscheint sie nicht. */
export function Zeile({ label, wert }: { label: string; wert: string | null | undefined }) {
  if (!wert) return null
  return (
    <>
      <dt>{label}</dt>
      <dd style={{ textAlign: 'left' }}>{wert}</dd>
    </>
  )
}

/**
 * Sagt an, dass ein Kasten leer ist, weil das Gutachten nichts hergibt.
 * Ein leerer Kasten ohne Text lässt offen, ob nichts da ist oder etwas
 * fehlgeschlagen ist.
 */
export function Ohne({ was }: { was: string }) {
  return (
    <p className="unterzeile" style={{ margin: 0 }}>
      Das Gutachten enthält keine {was}.
    </p>
  )
}

export function BeteiligtenZeile({
  rolle,
  b,
  zusatz,
}: {
  rolle: string
  b: { name: string; strasse: string | null; plzOrt: string | null } | null
  zusatz?: string | null
}) {
  return (
    <div className="zeile" style={{ gridTemplateColumns: '150px minmax(0,1fr)' }}>
      <span style={{ fontSize: 12.5, color: 'var(--ink-soft)', paddingTop: 2 }}>{rolle}</span>
      <span>
        {b ? (
          <>
            <span className="zeile-titel">{b.name || '—'}</span>
            <span className="zeile-meta">
              {b.strasse ? <span>{b.strasse}</span> : null}
              {b.plzOrt ? <span>{b.plzOrt}</span> : null}
              {zusatz ? <span>{zusatz}</span> : null}
            </span>
          </>
        ) : (
          <span style={{ color: 'var(--ink-soft)', fontSize: 13.5 }}>nicht hinterlegt</span>
        )}
      </span>
    </div>
  )
}

/** Datum als TT.MM.JJJJ — wie überall sonst im Haus. */
export function tagesdatum(wert: Date | string): string {
  return new Date(wert).toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

/** Verweis auf ein Schreiben, wie er in der Liste des Reiters steht. */
export function SchreibenZeile({
  s,
}: {
  s: {
    id: string
    betreff: string | null
    erstelltAm: Date | null
    versendetAm: Date | null
    positionen: number
  }
}) {
  return (
    <Link href={`/stellungnahmen/${s.id}`} className="zeile">
      <span className="zeile-nummer">{s.positionen}&nbsp;Pos.</span>
      <span>
        <span className="zeile-titel">{s.betreff?.trim() || 'Ohne Betreff'}</span>
        <span className="zeile-meta">
          {s.erstelltAm ? <span>angelegt {tagesdatum(s.erstelltAm)}</span> : null}
          {s.versendetAm ? <span>versendet {tagesdatum(s.versendetAm)}</span> : null}
        </span>
      </span>
      <span className="zeile-rechts">
        <span className={`marke-pille ${s.versendetAm ? 'm-freigegeben' : 'm-entwurf'}`}>
          {s.versendetAm ? 'versendet' : 'in Arbeit'}
        </span>
      </span>
    </Link>
  )
}
