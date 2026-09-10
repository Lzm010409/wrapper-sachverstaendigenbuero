import type { Meldung as Meldungsdaten, Meldungsart } from '@/melden/typen'
import { rolleZu } from '@/melden/typen'

/**
 * Eine Meldung an ihrem Platz — dort, wo die Sache steht, um die es geht.
 *
 * Für alles, was den Blick verlassen kann (Hintergrundläufe, Importe), gibt
 * es zusätzlich die Einblendung oben rechts; siehe `melder.tsx`. Ein
 * Formularfehler gehört aber ans Formular und nicht in eine Ecke des
 * Bildschirms.
 *
 * Serverkomponente: sie darf in jeder Seite stehen, ohne Ladelast im Browser
 * zu erzeugen.
 */
export function Meldung({
  art,
  titel,
  children,
  className = '',
  style,
}: {
  art: Meldungsart
  titel?: string
  children: React.ReactNode
  className?: string
  style?: React.CSSProperties
}) {
  return (
    <div className={`hinweis ${KLASSE[art]} ${className}`.trim()} role={rolleZu(art)} style={style}>
      {titel ? <strong className="hinweis-titel">{titel}</strong> : null}
      {children}
    </div>
  )
}

/** Dieselbe Meldung aus einem Datensatz statt aus Kindern. */
export function Meldungszeile({ meldung, style }: { meldung: Meldungsdaten; style?: React.CSSProperties }) {
  return (
    <Meldung art={meldung.art} titel={meldung.titel} style={style}>
      {meldung.text}
    </Meldung>
  )
}

/** `info` hat keine eigene Klasse — das ist die Grundform von `.hinweis`. */
const KLASSE: Record<Meldungsart, string> = {
  fehler: 'fehler',
  warnung: 'warn',
  erfolg: 'erfolg',
  info: '',
}
