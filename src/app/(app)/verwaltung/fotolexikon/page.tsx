import Link from 'next/link'
import { verlangeAnmeldung } from '@/auth/wache'
import { darf } from '@/rechte/zugriff'
import { ladeLexikon } from '@/fotos/lexikon-ablage'
import { Meldung } from '@/app/teile/meldung'
import { TeilFormular } from './formular'

/**
 * Das Fotolexikon: welche Teile es gibt, welche Seiten dafür gelten und mit
 * welchem Wortlaut eine Beschädigung daran heisst.
 *
 * **Warum es diese Seite gibt.** Der Fotoassistent (`src/fotos/assistent.ts`)
 * formuliert Schäden nur noch in diesem Wortlaut, sobald er ein hier
 * gelistetes Teil erkennt — alles andere bleibt freier Text wie bisher. Wer
 * das Wording des Hauses pflegen will, tut es hier, nicht im Code.
 */
export const dynamic = 'force-dynamic'

export default async function Fotolexikon() {
  await verlangeAnmeldung()

  if (!(await darf('fotolexikon.verwalten'))) {
    return (
      <Meldung art="warnung">
        Für das Fotolexikon fehlt die Berechtigung. Sie liegt bei der Administration.
      </Meldung>
    )
  }

  const teile = await ladeLexikon()

  return (
    <>
      <div className="seiten-kopf">
        <div>
          <h1>Fotolexikon</h1>
          <p className="unterzeile">
            {teile.length === 0
              ? 'Noch kein Teil hinterlegt — der Fotoassistent formuliert Schäden bis dahin frei.'
              : `${teile.length} ${teile.length === 1 ? 'Teil' : 'Teile'} hinterlegt`}
          </p>
        </div>
        <Link href="/verwaltung" className="knopf-schlicht">
          Zur Verwaltung
        </Link>
      </div>

      <div className="hinweis" style={{ marginBottom: 16 }}>
        <span className="hinweis-titel">Wie das wirkt</span>
        Erkennt die KI eines dieser Teile, wählt sie Beschädigungsart nur noch aus der hier
        hinterlegten Liste — der Satz wird daraus zusammengesetzt, nicht formuliert. Für Längs-,
        Quer- und Höhenachse lässt sich je Teil eingrenzen, welche Werte die KI überhaupt
        vorschlagen darf — nicht angekreuzte Achsen verwirft sie automatisch, das verringert
        Fehlzuordnungen. Im Klickmenü der Fotobearbeitung bleiben dagegen immer alle Achsen
        wählbar, unabhängig von dieser Einschränkung — ein Mensch klickt nur an, was er wirklich
        sieht. Ein hier nicht gelistetes Teil bleibt wie bisher freier Text.
      </div>

      <div className="liste">
        <TeilFormular />
        {teile.map((teil) => (
          <TeilFormular key={teil.id} teil={teil} />
        ))}
      </div>
    </>
  )
}
