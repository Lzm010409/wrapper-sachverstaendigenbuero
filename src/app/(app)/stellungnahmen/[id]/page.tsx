import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ladeStellungnahme } from '@/stellungnahme/abfragen'
import { holeVorschlaege } from '@/stellungnahme/aktionen'
import type { Sonderfallbefund } from '@/pruefbericht/sonderfaelle'
import type { Extraktion } from '@/pruefbericht/schema'
import { gutachtenSchema } from '@/autoixpert/typen'
import { leseFalldaten, platzhalterWerte } from '@/autoixpert/felder'
import { stelleDokumentBereit } from '@/dokument/dienst'
import { kiVerfuegbar } from '@/ki/client'
import { Schreibtisch } from './schreiben'
import { Kopfbereich } from './kopf'
import { KlappenSchliesser } from './klappen'
import { Loeschknopf } from '../loeschknopf'
import { Auswertungslauf } from './auswertungslauf'

function euro(wert: string | number | null | undefined): string {
  if (wert === null || wert === undefined) return '—'
  const zahl = typeof wert === 'string' ? Number(wert) : wert
  if (Number.isNaN(zahl)) return '—'
  return zahl.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })
}

function falldatenWerte(daten: unknown): Record<string, string> {
  const geprueft = gutachtenSchema.safeParse(daten)
  if (!geprueft.success) return {}
  return platzhalterWerte(leseFalldaten(geprueft.data))
}

/**
 * Eine Adresse wie `/stellungnahmen/unfug` ist keine Kennung.
 *
 * Ohne diese Prüfung geht der Text als Kennung an die Datenbank, und
 * Postgres bricht die Abfrage mit „invalid input syntax for type uuid" ab:
 * die Seite antwortete mit HTTP 500 und der allgemeinen Fehlerseite. Ein
 * Tippfehler in der Adresse ist aber kein Störfall, sondern eine Seite, die
 * es nicht gibt — und dafür steht die deutsche „nicht gefunden"-Seite.
 */
const KENNUNG = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default async function StellungnahmeSeite({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  if (!KENNUNG.test(id)) notFound()

  const s = await ladeStellungnahme(id)
  if (!s) notFound()

  /*
    Läuft die Auswertung noch, gibt es weder Positionen noch einen Brief —
    und es wäre falsch, jetzt einen aus dem Nichts zu bauen: `stelleDokumentBereit`
    legte ein leeres Dokument an, das die fertige Auswertung gleich wieder
    überschreiben müsste. Solange steht hier der Stand der Verarbeitung.
  */
  if (s.auswertungsstand === 'laeuft' || s.auswertungsstand === 'fehler') {
    return (
      <>
        <p style={{ margin: '0 0 14px', fontSize: 13 }}>
          {/* Der Fall ist der Anker: gibt es einen, führt der Rückweg dorthin
              und nicht in die Liste aller Schreiben. */}
          {s.fall ? (
            <Link href={`/faelle/${s.fall.id}?reiter=stellungnahmen`}>
              ← {s.fall.aktenzeichen ?? 'Fall'}
            </Link>
          ) : (
            <Link href="/stellungnahmen">← Stellungnahmen</Link>
          )}
        </p>

        <div className="seiten-kopf">
          <div>
            <h1>{s.betreff ?? 'Neue Stellungnahme'}</h1>
            <p className="unterzeile">
              {s.pruefberichtDateiname
                ? `Prüfbericht „${s.pruefberichtDateiname}"`
                : 'Prüfbericht in Arbeit'}
            </p>
          </div>
        </div>

        <Auswertungslauf
          stellungnahmeId={s.id}
          stand={s.auswertungsstand}
          schritt={s.auswertungsschritt}
          prozent={s.auswertungsProzent}
          fehler={s.auswertungsfehler}
          dateiname={s.pruefberichtDateiname}
          aktualisiertAm={s.auswertungAktualisiertAm}
        />
      </>
    )
  }

  const [vorschlaege, brief] = await Promise.all([holeVorschlaege(id), stelleDokumentBereit(s)])

  const befunde = (s.sonderfaelle ?? []) as Sonderfallbefund[]
  const extraktion = s.extraktion as Extraktion | null
  const summe = s.positionen.reduce((acc, p) => acc + Number(p.differenz ?? 0), 0)

  return (
    <>
      {/*
        Eine Zeile für alles, was nicht der Brief ist: Rückweg, Aktenzeichen,
        Betreff, Kennzahlen. Die aufklappbaren Kästen stehen daneben, nicht
        untereinander — jede Zeile darüber ist eine Zeile weniger Brief.
      */}
      <div className="brief-kopfzeile">
        {/*
          Der Rückweg führt in den Fall, nicht in die Liste: der Fall ist der
          Anker, und das Schreiben ist einer seiner Reiter. Nur ein Schreiben
          ohne Fallzuordnung kehrt in die Übersicht zurück.
        */}
        <Link
          href={s.fall ? `/faelle/${s.fall.id}?reiter=stellungnahmen` : '/stellungnahmen'}
          className="zurueck"
          aria-label={s.fall ? 'Zurück zum Fall' : 'Zurück zur Übersicht'}
        >
          ←
        </Link>
        {s.fall ? (
          <Link href={`/faelle/${s.fall.id}`} className="brief-aktenzeichen">
            {s.fall.aktenzeichen ?? extraktion?.aktenzeichen ?? 'ohne Aktenzeichen'}
          </Link>
        ) : (
          <span className="brief-aktenzeichen">
            {extraktion?.aktenzeichen ?? 'ohne Aktenzeichen'}
          </span>
        )}
        <h1 title={s.betreff ?? undefined}>{s.betreff ?? 'Stellungnahme'}</h1>
        <span className="brief-kennzahlen">
          {[
            extraktion?.pruefdienstleister,
            extraktion?.versicherer,
            s.pruefberichtSeiten ? `${s.pruefberichtSeiten} S.` : null,
          ]
            .filter(Boolean)
            .join(' · ')}
          <strong>{euro(summe)}</strong>
        </span>

        <KlappenSchliesser />
        <div className="brief-kopf-klappen">
        {befunde.length > 0 ? (
          <details className="klappe schmal">
            <summary>
              Prüfliste
              <span className="marke-pille m-warn">{befunde.length}</span>
            </summary>
            <div className="klappe-inhalt">
              {befunde.map((b) => (
                <div key={b.kennung} className={`sonderfall ${b.dringlichkeit}`}>
                  <div className="sonderfall-titel">
                    <span className="marke-pille m-akzent">{b.kennung}</span>
                    {b.titel}
                  </div>
                  <div className="sonderfall-text">{b.befund}</div>
                  <div className="sonderfall-handlung">{b.handlung}</div>
                </div>
              ))}
            </div>
          </details>
        ) : null}

        {extraktion?.unklarheiten && extraktion.unklarheiten.length > 0 ? (
          <details className="klappe schmal">
            <summary>
              Unklar
              <span className="marke-pille m-warn">{extraktion.unklarheiten.length}</span>
            </summary>
            <div className="klappe-inhalt">
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {extraktion.unklarheiten.map((u, i) => (
                  <li key={i}>{u}</li>
                ))}
              </ul>
            </div>
          </details>
        ) : null}

        <Kopfbereich
          stellungnahmeId={s.id}
          empfaengerName={s.empfaengerName}
          empfaengerStrasse={s.empfaengerStrasse}
          empfaengerPlzOrt={s.empfaengerPlzOrt}
          einleitungDatum={s.einleitungDatum}
          einleitungMedium={s.einleitungMedium}
        />

        {!s.versendetAm ? (
          <Loeschknopf
            stellungnahmeId={s.id}
            betreff={s.betreff ?? 'Ohne Betreff'}
            danach="/stellungnahmen"
            beschriftung="🗑 Löschen"
          />
        ) : null}
        </div>
      </div>

      {s.positionen.length === 0 ? (
        <div className="leer">
          <p style={{ margin: 0 }}>
            Aus diesem Bericht wurde keine Position übernommen, die in eine Stellungnahme gehört.
          </p>
        </div>
      ) : null}

      <Schreibtisch
        stellungnahmeId={s.id}
        dokument={brief.dokument}
        stand={brief.stand}
        kiAktiv={kiVerfuegbar()}
        versendet={Boolean(s.versendetAm)}
        werte={falldatenWerte(s.fall?.daten)}
        positionen={s.positionen.map((p) => ({
          id: p.id,
          bezeichnung: p.bezeichnung,
          betragGutachten: p.betragGutachten,
          betragGekuerzt: p.betragGekuerzt,
          differenz: p.differenz,
          begruendungVersicherer: p.begruendungVersicherer,
          behandlung: p.behandlung,
          seite: p.seite,
        }))}
        vorschlaege={vorschlaege.map((v) => ({
          positionId: v.positionId,
          besteGuete: v.besteGuete,
          kandidaten: v.kandidaten.map((k) => ({
            eintragId: k.eintrag.id,
            nummer: k.eintrag.nummer,
            titel: k.eintrag.titel,
            abschnitt: k.eintrag.abschnitt,
            status: k.eintrag.status,
            haeufigkeitText: k.eintrag.haeufigkeitText,
            guete: k.guete,
            treffergruende: k.treffergruende,
            // Der Text der passenden Variante kommt mit — die Blase soll ihn
            // zeigen und bearbeiten lassen, ohne dafür nachzuladen.
            passendeVarianten: k.passendeVarianten.map((pv) => ({
              id: pv.id,
              bezeichnung: pv.bezeichnung,
              text: k.eintrag.varianten.find((x) => x.id === pv.id)?.text ?? '',
            })),
            text: k.eintrag.gegenargument,
            vorgehen: k.eintrag.vorgehen,
          })),
        }))}
      />
    </>
  )
}
