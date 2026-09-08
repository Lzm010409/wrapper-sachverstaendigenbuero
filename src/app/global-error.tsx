'use client'

/**
 * Die letzte Auffanglinie: ein Fehler im **Wurzel-Layout**.
 *
 * `error.tsx` fängt Fehler *innerhalb* des Layouts. Bricht das Layout selbst,
 * greift nur diese Datei — und weil sie das Layout ersetzt, muss sie
 * `<html>` und `<body>` selbst mitbringen. Ohne sie zeigte Next die eigene
 * englische Vorgabeseite; also genau in dem Fall, der am meisten erklärt
 * werden müsste, stand am wenigsten da.
 *
 * Bewusst ohne die Gestaltung der Anwendung: wenn das Layout gebrochen ist,
 * ist auch das Stilblatt nicht verlässlich geladen. Die paar Zeilen hier
 * stehen deshalb direkt am Element.
 */
export default function Wurzelfehler({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html lang="de">
      <body
        style={{
          margin: 0,
          padding: '48px 24px',
          fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
          color: '#37474f',
          background: '#f4f6f8',
        }}
      >
        <main style={{ maxWidth: 640, margin: '0 auto' }}>
          <h1 style={{ fontSize: 22, marginBottom: 8 }}>Die Anwendung ist abgestürzt</h1>
          <p style={{ fontSize: 15, lineHeight: 1.55, color: '#4a5c66' }}>
            Nicht nur eine Seite, sondern der Rahmen selbst. Gespeicherte Arbeit ist davon nicht
            betroffen — was zuletzt gespeichert wurde, steht weiterhin in der Datenbank.
          </p>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 18 }}>
            <button
              type="button"
              onClick={() => reset()}
              style={{
                padding: '8px 16px',
                borderRadius: 6,
                border: 0,
                background: '#1f8fd4',
                color: '#fff',
                fontSize: 14,
                cursor: 'pointer',
              }}
            >
              Noch einmal versuchen
            </button>
            {/*
              Hier ist `<a>` richtig und `<Link>` falsch: diese Seite ersetzt
              das ganze Dokument, weil die Wurzel gescheitert ist. Ein
              Router-Wechsel bliebe in derselben kaputten Anwendung; nur ein
              vollständiger Neuaufbau bringt sie wieder hoch.
            */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a href="/faelle" style={{ fontSize: 14, color: '#1878b4' }}>
              Zur Fallübersicht
            </a>
          </div>
          {error.digest ? (
            <p style={{ fontSize: 13, color: '#9aa4ad', marginTop: 20 }}>
              Kennung: <code>{error.digest}</code> — damit findet die Administration den Vorfall
              im Fehlerprotokoll.
            </p>
          ) : null}
        </main>
      </body>
    </html>
  )
}
