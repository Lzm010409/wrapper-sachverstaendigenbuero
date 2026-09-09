import { STANDNAMEN, type Zahlungsstand } from '@/geld/ampel'
import { formatEuro } from '@/format'

/**
 * Der Zahlungsstand als Pille — dieselbe Form wie jede andere Marke in
 * dieser Anwendung, damit die Fallliste nicht zum Ampelbrett wird.
 *
 * Die Bedeutung trägt der farbige Punkt, nicht die Fläche: vier Pillen
 * nebeneinander sollen sich noch als Text lesen lassen. Und weil Farbe
 * allein für niemanden reicht, der sie nicht unterscheidet, steht der
 * Zustand immer ausgeschrieben daneben.
 */

const KLASSEN: Record<Zahlungsstand, string> = {
  ohne_rechnung: 'm-entwurf',
  entwurf: 'm-entwurf',
  offen: 'm-akzent',
  ueberfaellig: 'm-krit',
  teilbezahlt: 'm-warn',
  bezahlt: 'm-gut',
}

/** Ein Betrag in Cent als Euro. */
export function euroAusCent(cent: number): string {
  return formatEuro(cent / 100)
}

export function Geldpille({
  stand,
  offenCent,
}: {
  stand: Zahlungsstand
  /** Wird nur gezeigt, wo noch etwas aussteht. */
  offenCent?: number
}) {
  const rest = stand === 'teilbezahlt' || stand === 'ueberfaellig' ? offenCent : undefined
  return (
    <span className={`marke-pille ${KLASSEN[stand]}`}>
      {STANDNAMEN[stand]}
      {rest !== undefined && rest > 0 ? (
        <span style={{ color: 'var(--ink-soft)' }}>{euroAusCent(rest)}</span>
      ) : null}
    </span>
  )
}
