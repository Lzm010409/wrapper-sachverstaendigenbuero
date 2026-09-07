'use client'

import { useEffect } from 'react'
import Link from 'next/link'

/**
 * Die Seite für einen Fehler, den niemand vorhergesehen hat.
 *
 * Ohne sie zeigte Next.js im Betrieb eine leere englische Fehlerseite. Hier
 * steht stattdessen auf Deutsch, was passiert ist, dazu ein Knopf, der es
 * noch einmal versucht — die meisten dieser Fehler sind vorübergehend
 * (Datenbank kurz weg, Netz gestockt) — und ein Weg zurück in die Anwendung.
 *
 * Die Kennung wird mitgezeigt: sie ist die einzige Brücke zwischen dem, was
 * der Leser sieht, und dem Eintrag im Serverprotokoll. Der Fehlertext selbst
 * bleibt draussen; er kann Namen und Aktenzeichen enthalten.
 */
export default function Fehlerseite({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('Unerwarteter Fehler:', error)
  }, [error])

  return (
    <main style={{ maxWidth: 680 }}>
      <div className="seiten-kopf">
        <div>
          <h1>Da ist etwas schiefgegangen</h1>
          <p className="unterzeile">
            Der Vorgang ist unerwartet abgebrochen. Gespeicherte Arbeit ist davon nicht betroffen —
            was zuletzt gespeichert wurde, steht weiterhin in der Datenbank.
          </p>
        </div>
      </div>

      <div className="karte">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
          <button type="button" className="haupt" onClick={() => reset()}>
            Noch einmal versuchen
          </button>
          <Link href="/stellungnahmen" style={{ alignSelf: 'center', fontSize: 13 }}>
            Zur Übersicht
          </Link>
        </div>

        {error.digest ? (
          <p className="unterzeile" style={{ margin: 0 }}>
            Kennung für das Protokoll: <code>{error.digest}</code>
          </p>
        ) : null}
      </div>
    </main>
  )
}
