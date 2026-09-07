import Link from 'next/link'

/**
 * Die Seite für jede Adresse, die es nicht gibt.
 *
 * Ohne sie antwortete Next.js mit seiner englischen Vorgabe („This page
 * could not be found") — mitten in einer durchweg deutschen Anwendung, ohne
 * Weg zurück und ohne den Rahmen der Werkbank. Einzelne Bereiche haben
 * eigene, genauere Fassungen (etwa die Argumentbibliothek); diese hier
 * fängt alles Übrige.
 *
 * Sie liegt in der Wurzel und damit ausserhalb der Gruppe `(app)`, also
 * ohne Menü — die Adresse ist unbekannt, folglich auch der Bereich, in dem
 * der Leser gerade sein wollte. Statt eines Menüs stehen darum die
 * Einstiegspunkte als Verweise da.
 */
export default function NichtGefunden() {
  return (
    <main style={{ maxWidth: 680 }}>
      <div className="seiten-kopf">
        <div>
          <h1>Seite nicht gefunden</h1>
          <p className="unterzeile">
            Zu dieser Adresse gibt es nichts. Vermutlich ist sie verschrieben, oder was hier lag,
            wurde inzwischen gelöscht.
          </p>
        </div>
      </div>

      <div className="karte">
        <p style={{ marginTop: 0 }}>Von hier aus geht es weiter:</p>
        <ul style={{ margin: 0, paddingLeft: 20, lineHeight: 1.9 }}>
          <li>
            <Link href="/stellungnahmen">Stellungnahmen</Link> — die Schreiben, an denen gearbeitet
            wird
          </li>
          <li>
            <Link href="/bibliothek">Argumentbibliothek</Link> — die Textbausteine
          </li>
          <li>
            <Link href="/faelle">Fälle</Link> — die Vorgänge aus autoiXpert
          </li>
          <li>
            <Link href="/bilder">Bildbibliothek</Link> — Skizzen und Vergleichsfotos
          </li>
        </ul>
      </div>
    </main>
  )
}
