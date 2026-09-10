'use client'

import { useState, useTransition } from 'react'
import { gebeFrei, setzeStatus, type AktionsErgebnis } from '@/bibliothek/aktionen'

interface Eigenschaften {
  id: string
  status: string
  darfFreigeben: boolean
  offeneBelege: number
}

export function Freigabeleiste({ id, status, darfFreigeben, offeneBelege }: Eigenschaften) {
  const [laeuft, starte] = useTransition()
  const [rueckmeldung, setzeRueckmeldung] = useState<AktionsErgebnis | null>(null)

  const fuehreAus = (arbeit: () => Promise<AktionsErgebnis>) => {
    starte(async () => setzeRueckmeldung(await arbeit()))
  }

  const gesperrt = offeneBelege > 0

  return (
    <div className="karte">
      <h2>Freigabe</h2>

      {/*
        Die Freigabe ist ein Gütesiegel, keine Sperre — mit einer Ausnahme.

        Hier stand, nur freigegebene Einträge liessen sich übernehmen — das
        war schlicht falsch: die Randspalte schlägt jeden Eintrag vor und
        fügt jeden ein, weist bei einem ungeprüften aber darauf hin. Eine
        Zusage, die die Anwendung nicht einhält, ist schlimmer als gar keine.

        Der pauschale Gegensatz „freigegeben / nicht freigegeben" war
        allerdings genauso ungenau: `ladeVerwendbareEintraege` und
        `sucheInBibliothek` lassen `zurueckgezogen` ausdrücklich aus
        (`ne(eintrag.status, 'zurueckgezogen')`). Ein zurückgezogener Eintrag
        ist eben *nicht* übernehmbar; das muss hier stehen.
      */}
      {status === 'freigegeben' ? (
        <p className="unterzeile" style={{ marginTop: 0 }}>
          Dieser Eintrag ist gesichtet und freigegeben.
        </p>
      ) : status === 'zurueckgezogen' ? (
        <p className="unterzeile" style={{ marginTop: 0 }}>
          Zurückgezogen. Beim Schreiben einer Stellungnahme wird dieser Eintrag weder
          vorgeschlagen noch von der Suche gefunden — übernehmen lässt er sich nicht.
        </p>
      ) : (
        <p className="unterzeile" style={{ marginTop: 0 }}>
          Noch nicht freigegeben. Übernehmen lässt sich der Eintrag trotzdem — die Anmerkung am
          Rand weist beim Einfügen darauf hin.
        </p>
      )}

      {/*
        Bei einem bereits freigegebenen Eintrag sperrt eine offene Fundstelle
        nichts: die Freigabe steht ja schon. Der alte Text behauptete
        trotzdem „Die Freigabe bleibt bis dahin gesperrt" — direkt unter dem
        Satz, der den Eintrag als freigegeben ausweist.
      */}
      {offeneBelege > 0 ? (
        <div className="hinweis warn" style={{ marginBottom: 12 }}>
          {offeneBelege} Fundstelle{offeneBelege === 1 ? '' : 'n'} noch nicht bestätigt.{' '}
          {status === 'freigegeben'
            ? 'Die Freigabe steht trotzdem — sie stammt von vorher. Einmal zurückgenommen, wäre sie bis zur Prüfung gesperrt.'
            : 'Die Freigabe bleibt bis dahin gesperrt.'}
        </div>
      ) : null}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {status !== 'freigegeben' ? (
          <button
            type="button"
            className="haupt freigabe"
            disabled={laeuft || !darfFreigeben || gesperrt}
            onClick={() => fuehreAus(() => gebeFrei(id))}
            title={
              !darfFreigeben
                ? 'Dafür fehlt die Rolle „Freigeber" oder „Administrator".'
                : gesperrt
                  ? 'Erst die Fundstellen bestätigen.'
                  : undefined
            }
          >
            Freigeben
          </button>
        ) : (
          /*
            Zurücknehmen entwertet die Prüfung eines anderen und verlangt
            deshalb dieselbe Rolle wie das Erteilen. Der Knopf stand hier
            früher offen für jeden — die Aktion hätte ihn ohnehin
            abgewiesen, aber erst nach dem Klick.
          */
          <button
            type="button"
            disabled={laeuft || !darfFreigeben}
            title={
              !darfFreigeben
                ? 'Eine Freigabe zurücknehmen darf nur, wer die Rolle „Freigeber" oder „Administrator" hat.'
                : undefined
            }
            onClick={() => fuehreAus(() => setzeStatus(id, 'entwurf'))}
          >
            Freigabe zurücknehmen
          </button>
        )}

        {status === 'entwurf' ? (
          <button
            type="button"
            disabled={laeuft}
            onClick={() => fuehreAus(() => setzeStatus(id, 'pruefung'))}
          >
            Zur Prüfung
          </button>
        ) : null}

        {/*
          Der Rückweg auf „Entwurf".

          Ohne ihn war „Zurückgezogen" eine Sackgasse: dort stand allein
          „Freigeben" — und das war gesperrt, sobald eine Fundstelle offen
          war, und schlug fehl, solange weder Gegenargument noch Vorgehen
          gefüllt sind. Wer nicht freigeben darf, kam überhaupt nicht mehr
          heraus. Auch „In Prüfung" führte nur vorwärts oder ins Aus.
        */}
        {status === 'pruefung' || status === 'zurueckgezogen' ? (
          <button
            type="button"
            disabled={laeuft}
            onClick={() => fuehreAus(() => setzeStatus(id, 'entwurf'))}
          >
            Zurück auf Entwurf
          </button>
        ) : null}

        {status !== 'zurueckgezogen' ? (
          <button
            type="button"
            disabled={laeuft}
            onClick={() => fuehreAus(() => setzeStatus(id, 'zurueckgezogen'))}
          >
            Zurückziehen
          </button>
        ) : null}
      </div>

      {!darfFreigeben && status !== 'freigegeben' ? (
        <p className="unterzeile" style={{ marginBottom: 0 }}>
          Freigeben darf nur, wer die Rolle „Freigeber" oder „Administrator" hat. Die übrigen
          Schritte stehen jedem offen.
        </p>
      ) : null}

      {rueckmeldung?.fehler ? (
        <div className="hinweis fehler" style={{ marginTop: 12 }} role="alert">
          {rueckmeldung.fehler}
        </div>
      ) : null}
      {rueckmeldung?.erfolg ? (
        <div className="hinweis" style={{ marginTop: 12 }} role="status">
          {rueckmeldung.erfolg}
        </div>
      ) : null}
    </div>
  )
}
