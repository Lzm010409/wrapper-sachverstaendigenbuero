import Link from 'next/link'

/**
 * Für eine Kennung, die es nicht (mehr) gibt.
 *
 * Ohne diese Datei landete der Leser auf der englischen Vorgabeseite von
 * Next.js („This page could not be found") — mitten in einer deutschen
 * Anwendung und ohne Weg zurück.
 */
export default function NichtGefunden() {
  return (
    <>
      <p style={{ margin: '0 0 14px', fontSize: 13 }}>
        <Link href="/bibliothek">← Argumentbibliothek</Link>
      </p>

      <div className="seiten-kopf">
        <div>
          <h1>Eintrag nicht gefunden</h1>
          <p className="unterzeile">
            Zu dieser Adresse gibt es keinen Bibliothekseintrag. Vermutlich wurde er gelöscht oder
            die Adresse ist verschrieben.
          </p>
        </div>
      </div>

      <div className="karte">
        <p style={{ margin: 0 }}>
          <Link href="/bibliothek">Zurück zur Argumentbibliothek</Link>
        </p>
      </div>
    </>
  )
}
