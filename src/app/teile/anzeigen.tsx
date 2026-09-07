'use client'

/**
 * Zwei Anzeigen für Wartezeit.
 *
 * Der Kreisel steht für kurze Wege, bei denen nur zählt, dass überhaupt
 * etwas läuft. Der Balken steht für die beiden langen Vorgänge — Prüfbericht
 * auswerten und Dokument erzeugen —, und er zeigt dabei an, **woran** gerade
 * gearbeitet wird. Ein Balken ohne Beschriftung ist eine Beschäftigung des
 * Auges, keine Auskunft.
 */

export function Kreisel({
  text,
  gross = false,
}: {
  /** Wird vorgelesen und neben dem Kreisel gezeigt. */
  text?: string
  gross?: boolean
}) {
  return (
    <span className="kreisel-zeile" role="status" aria-live="polite">
      <span className={`kreisel ${gross ? 'gross' : ''}`} aria-hidden="true" />
      {text ? <span className="kreisel-text">{text}</span> : <span className="nur-vorlesen">Lädt …</span>}
    </span>
  )
}

export interface Fortschrittsstand {
  /** 0 bis 1. */
  anteil: number
  text: string
  /** Bereits abgearbeitete Meldungen, jüngste zuletzt. */
  verlauf?: string[]
  fehler?: string | null
}

export function Fortschritt({ stand }: { stand: Fortschrittsstand }) {
  const prozent = Math.round(Math.min(1, Math.max(0, stand.anteil)) * 100)

  return (
    <div className={`fortschritt ${stand.fehler ? 'fehler' : ''}`}>
      <div className="fortschritt-kopf">
        <span className="fortschritt-text">
          {!stand.fehler ? <span className="kreisel" aria-hidden="true" /> : null}
          {stand.fehler ?? stand.text}
        </span>
        <span className="fortschritt-zahl">{prozent} %</span>
      </div>

      <div
        className="fortschritt-schiene"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={prozent}
        aria-valuetext={stand.fehler ?? stand.text}
      >
        <div className="fortschritt-fuellung" style={{ width: `${prozent}%` }} />
      </div>

      {stand.verlauf && stand.verlauf.length > 0 ? (
        <ol className="fortschritt-verlauf">
          {stand.verlauf.map((z, i) => (
            <li key={i}>{z}</li>
          ))}
        </ol>
      ) : null}
    </div>
  )
}
