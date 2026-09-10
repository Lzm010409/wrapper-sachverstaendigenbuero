'use client'

import Link from 'next/link'

/**
 * Ein Fehler **innerhalb** des angemeldeten Bereichs.
 *
 * Vorher gab es nur `src/app/error.tsx`: jeder Fehler sprang bis zur Wurzel,
 * und mit ihm verschwanden Schiene, Kopfleiste und Menü. Der Benutzer stand
 * auf einer nackten Seite und musste sich neu zurechtfinden, obwohl nur ein
 * Reiter gestolpert war.
 *
 * Hier bleibt der Rahmen stehen; ersetzt wird nur der Inhalt.
 */
export default function Bereichsfehler({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div style={{ maxWidth: 680 }}>
      <div className="seiten-kopf">
        <div>
          <h1>Diese Ansicht liess sich nicht laden</h1>
          <p className="unterzeile">
            Der Rest der Anwendung ist davon nicht betroffen — links geht es weiter.
          </p>
        </div>
      </div>

      <div className="karte">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
          <button type="button" className="haupt" onClick={() => reset()}>
            Noch einmal versuchen
          </button>
          <Link href="/faelle" style={{ alignSelf: 'center', fontSize: 13 }}>
            Zur Fallübersicht
          </Link>
        </div>

        {/*
          Die Kennung ist kein Zierrat: derselbe Wert steht seit
          `onRequestError` (instrumentation.ts) im Fehlerprotokoll. Wer sie
          durchgibt, macht aus „da kam ein Fehler" eine auffindbare Zeile.
        */}
        {error.digest ? (
          <p className="unterzeile" style={{ margin: 0 }}>
            Kennung: <code>{error.digest}</code> — damit findet die Administration den Vorfall im
            Fehlerprotokoll.
          </p>
        ) : null}
      </div>
    </div>
  )
}
