import Link from 'next/link'
import { ladeGliederung } from '@/bibliothek/abfragen'
import { verlangeAnmeldung } from '@/auth/wache'
import { EintragFormular } from './eintrag-formular'

/**
 * Einen Textbaustein von Hand anlegen.
 *
 * Bis hierher konnte die Bibliothek nur wachsen, indem jemand eine
 * Referenzdatei änderte und den Import laufen liess — ein Weg, der einem
 * Sachverständigen am Schreibtisch nicht offensteht. Was hier entsteht,
 * steht auf „Entwurf" und ist damit ein Vorschlag, keine Zusage; die
 * Freigabe bleibt der Rolle vorbehalten, die es schon immer war (E5).
 */
export const dynamic = 'force-dynamic'

export default async function NeuerEintrag() {
  // Wie auf den übrigen Bibliotheksseiten: ohne Anmeldung wird hier nichts
  // geladen und nichts gerendert.
  await verlangeAnmeldung()

  const gliederung = await ladeGliederung()

  return (
    <>
      <p style={{ margin: '0 0 14px', fontSize: 13 }}>
        <Link href="/bibliothek">← Argumentbibliothek</Link>
      </p>

      <div className="seiten-kopf">
        <div>
          <h1>Neuer Textbaustein</h1>
          <p className="unterzeile">
            Gliederungsnummer und Platzhalter ergeben sich von selbst — einzuordnen ist der
            Eintrag nur nach Bereich und Abschnitt.
          </p>
        </div>
      </div>

      <EintragFormular gliederung={gliederung} />
    </>
  )
}
