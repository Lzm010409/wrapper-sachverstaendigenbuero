import { alleThemen, nochNichtUebernommen, sucheBilder } from '@/bilder/bibliothek'
import { Bildkarte, Bildaufnahme } from './bildkarte'
import { Suchleiste } from './suchleiste'

/**
 * Die Bildbibliothek.
 *
 * Derselbe Gedanke wie bei den Argumenten: was einmal aufbereitet wurde,
 * bekommt Titel, Beschreibung und Themen — und ist beim nächsten Fall
 * wieder da. Der übliche Weg dorthin führt nicht über Vorratshaltung,
 * sondern über die Arbeit: unten stehen die Bilder aus Schreiben, die noch
 * nicht übernommen sind.
 */

/**
 * Die Obergrenzen, die `sucheBilder` und `nochNichtUebernommen` von sich aus
 * setzen. Sie stehen hier noch einmal, weil die Kopfzeile sonst eine
 * gekappte Liste als Gesamtzahl ausgäbe: bei 73 Bildern in der Datenbank
 * behauptete sie „60 Bilder in der Bibliothek", und wer sein Bild nicht
 * findet, hält es für nicht vorhanden.
 */
const GRENZE_BIBLIOTHEK = 60
const GRENZE_OFFEN = 40

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
  searchParams: Promise<{ q?: string | string[]; thema?: string | string[] }>
}) {
  const roh = await searchParams
  const q = ersterWert(roh.q)
  const thema = ersterWert(roh.thema)

  const [bilder, themen, offene] = await Promise.all([
    sucheBilder(q, thema),
    alleThemen(q),
    nochNichtUebernommen(),
  ])

  const gesucht = Boolean(q || thema)
  const gekappt = bilder.length >= GRENZE_BIBLIOTHEK
  const offeneGekappt = offene.length >= GRENZE_OFFEN

  return (
    <>
      <div className="seiten-kopf">
        <div>
          <h1>Bildbibliothek</h1>
          <p className="unterzeile">
            {gekappt ? 'mindestens ' : ''}
            {bilder.length} {bilder.length === 1 ? 'Bild' : 'Bilder'}
            {gesucht ? ' gefunden' : ' in der Bibliothek'}
            {offene.length > 0
              ? ` · ${offeneGekappt ? 'mindestens ' : ''}${offene.length} aus Schreiben noch nicht übernommen`
              : ''}
            {gekappt || offeneGekappt
              ? ' — die Liste endet hier; grenze die Suche ein, um den Rest zu sehen'
              : ''}
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
        <div className="bildgitter">
          {bilder.map((b) => (
            <Bildkarte key={b.id} bild={b} />
          ))}
        </div>
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
        </section>
      ) : null}
    </>
  )
}
