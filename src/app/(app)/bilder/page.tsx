import {
  alleThemen,
  nochNichtUebernommen,
  sucheBilder,
  zaehleBilder,
  zaehleNochNichtUebernommen,
} from '@/bilder/bibliothek'
import { Bildkarte, Bildaufnahme } from './bildkarte'
import { Suchleiste } from './suchleiste'
import { verlangeAnmeldung } from '@/auth/wache'
import { Pagination } from '@/app/teile/pagination'
import { leseSeite } from '@/app/teile/seitenwahl'

/**
 * Die Bildbibliothek.
 *
 * Derselbe Gedanke wie bei den Argumenten: was einmal aufbereitet wurde,
 * bekommt Titel, Beschreibung und Themen — und ist beim nächsten Fall
 * wieder da. Der übliche Weg dorthin führt nicht über Vorratshaltung,
 * sondern über die Arbeit: unten stehen die Bilder aus Schreiben, die noch
 * nicht übernommen sind.
 *
 * Zwei unabhängige Listen auf einer Seite, zwei unabhängige
 * Seitennavigationen: die Bibliothek blättert über `seite`/`groesse`, die
 * noch nicht übernommenen Bilder über `seiteOffen`/`groesseOffen` — sonst
 * risse ein Klick auf „Weiter" in der einen Liste die andere mit.
 */

/**
 * Ein Suchparameter kann doppelt in der Adresse stehen — `?q=a&q=b`. Next.js
 * liefert dann ein Array, und `begriff.trim()` bricht mit HTTP 500 ab. Die
 * Typangabe allein hat das nicht verhindert: sie ist eine Behauptung über
 * die Adresse, keine Prüfung.
 */
function ersterWert(wert: string | string[] | undefined): string {
  if (Array.isArray(wert)) return wert[0] ?? ''
  return wert ?? ''
}

export default async function BilderSeite({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string | string[]
    thema?: string | string[]
    seite?: string | string[]
    groesse?: string | string[]
    seiteOffen?: string | string[]
    groesseOffen?: string | string[]
  }>
}) {
  // Vor allem anderen: ohne Anmeldung wird hier nichts geladen und
  // nichts gerendert. Die Pruefung im Layout kam zu spaet - die Seite
  // rendert gleichzeitig mit ihm, und ihre Nutzlast ging im Rumpf der
  // Umleitung mit hinaus.
  await verlangeAnmeldung()

  const roh = await searchParams
  const q = ersterWert(roh.q)
  const thema = ersterWert(roh.thema)
  const bib = leseSeite(roh.seite, roh.groesse)
  const offen = leseSeite(roh.seiteOffen, roh.groesseOffen)

  const [bilder, gesamtBib, themen, offene, gesamtOffen] = await Promise.all([
    sucheBilder(q, thema, bib.groesse, bib.versatz),
    zaehleBilder(q, thema),
    alleThemen(q),
    nochNichtUebernommen(offen.groesse, offen.versatz),
    zaehleNochNichtUebernommen(),
  ])

  const gesucht = Boolean(q || thema)

  return (
    <>
      <div className="seiten-kopf">
        <div>
          <h1>Bildbibliothek</h1>
          <p className="unterzeile">
            {gesamtBib} {gesamtBib === 1 ? 'Bild' : 'Bilder'}
            {gesucht ? ' gefunden' : ' in der Bibliothek'}
            {gesamtOffen > 0 ? ` · ${gesamtOffen} aus Schreiben noch nicht übernommen` : ''}
          </p>
        </div>
      </div>

      <Bildaufnahme />

      <Suchleiste begriff={q} thema={thema} themen={themen} />

      {bilder.length === 0 ? (
        <div className="leer">
          <p style={{ margin: 0 }}>
            {gesucht
              ? offene.length > 0
                ? 'Kein Bild in der Bibliothek passt zu dieser Suche. Unten stehen weiterhin die Bilder aus Schreiben — die Suche erfasst sie nicht.'
                : 'Kein Bild passt zu dieser Suche.'
              : 'Noch kein Bild in der Bibliothek. Lade eines hoch oder übernimm eines aus einem Schreiben.'}
          </p>
        </div>
      ) : (
        <>
          <div className="bildgitter">
            {bilder.map((b) => (
              <Bildkarte key={b.id} bild={b} />
            ))}
          </div>
          <Pagination seite={bib.seite} groesse={bib.groesse} gesamt={gesamtBib} />
        </>
      )}

      {offene.length > 0 ? (
        <section style={{ marginTop: 32 }}>
          <h2>Aus Schreiben — noch nicht übernommen</h2>
          <p className="unterzeile" style={{ margin: '0 0 14px' }}>
            Diese Bilder wurden in einer Stellungnahme hochgeladen. Was sich wiederverwenden
            lässt, gehört in die Bibliothek — mit Beschreibung findet es sich beim nächsten Fall
            von selbst wieder.
            {gesucht
              ? ' Suche und Themenfilter oben wirken auf diesen Abschnitt nicht: hier steht immer alles Offene.'
              : ''}
          </p>
          <div className="bildgitter">
            {offene.map((b) => (
              <Bildkarte key={b.id} bild={b} />
            ))}
          </div>
          <Pagination
            seite={offen.seite}
            groesse={offen.groesse}
            gesamt={gesamtOffen}
            seiteParam="seiteOffen"
            groesseParam="groesseOffen"
          />
        </section>
      ) : null}
    </>
  )
}
