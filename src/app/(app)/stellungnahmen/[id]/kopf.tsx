'use client'

import { useState, useTransition } from 'react'
import { speichereKopf } from '@/stellungnahme/export-aktionen'
import { nachDeutsch, nachIso } from '@/export/datum'
import { EREIGNIS_KOPF } from '@/dokument/editor-schema'

/**
 * Empfänger und Anschreiben-Datum.
 *
 * Betreff, Anrede und Ergebnis stehen seit dem Umbau im Brief selbst — sie
 * werden dort geschrieben, nicht in einem Formular daneben. Was hier bleibt,
 * sind die Angaben, die nicht im Fliesstext auftauchen, sondern im
 * Geschäftspapier: die Anschrift des Empfängers.
 */
export function Kopfbereich(props: {
  stellungnahmeId: string
  empfaengerName: string | null
  empfaengerStrasse: string | null
  empfaengerPlzOrt: string | null
  einleitungDatum: string | null
  einleitungMedium: string | null
}) {
  const [laeuft, starte] = useTransition()
  const [meldung, setzeMeldung] = useState<string | null>(null)
  const [werte, setzeWerte] = useState({
    empfaengerName: props.empfaengerName ?? '',
    empfaengerStrasse: props.empfaengerStrasse ?? '',
    empfaengerPlzOrt: props.empfaengerPlzOrt ?? '',
    // Was kein Datum ist, gilt als keines. In älteren Schreiben steht hier
    // gelegentlich ein Bruchstück — der Kasten klappte beim Tippen zu, und
    // was bis dahin im Feld stand, wurde später gespeichert.
    einleitungDatum: nachDeutsch(nachIso(props.einleitungDatum ?? '')),
    einleitungMedium: props.einleitungMedium ?? 'schreiben',
  })

  const setze = (feld: keyof typeof werte, wert: string) =>
    setzeWerte((w) => ({ ...w, [feld]: wert }))

  const fehlend = [
    !werte.empfaengerName && 'Empfänger',
    !werte.einleitungDatum && 'Datum des Anschreibens',
  ].filter(Boolean)

  /**
   * Ob der Kasten offen steht, entscheidet der Benutzer — nicht der Inhalt.
   *
   * Zweimal war es andersherum falsch. Erst hing `open` unmittelbar an den
   * fehlenden Angaben: das erste getippte Zeichen im letzten leeren Feld
   * machte die Lücke voll, und der Kasten klappte mitten im Wort zu. Dann
   * ging er beim Öffnen der Seite von selbst auf und legte sich über
   * Werkzeugleiste und Positionsmarken — bei achtzehn Positionen sah es
   * aus, als wären sie verschwunden.
   *
   * Der Hinweis auf das, was fehlt, steht deshalb in der Zeile darüber:
   * „2 offen" in Warnfarbe, einen Klick entfernt. Er verdeckt nichts.
   */
  const [offen, setzeOffen] = useState(false)

  return (
    <details
      className="klappe schmal"
      open={offen}
      onToggle={(e) => setzeOffen(e.currentTarget.open)}
    >
      <summary>
        Empfänger
        {fehlend.length > 0 ? (
          <span className="marke-pille m-warn">{fehlend.length} offen</span>
        ) : (
          <span className="unterzeile" style={{ margin: 0, fontWeight: 400 }}>
            {werte.empfaengerName}
          </span>
        )}
      </summary>
      <div className="klappe-inhalt">

      {fehlend.length > 0 ? (
        <div className="hinweis warn" style={{ marginBottom: 12 }}>
          Noch offen: {fehlend.join(', ')}. Der Hausstil verlangt, diese Angaben zu erfragen statt
          sie zu raten.
        </div>
      ) : null}

      <div
        style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 12 }}
      >
        <div className="feld">
          <label htmlFor="empf">Empfänger</label>
          <input
            id="empf"
            value={werte.empfaengerName}
            onChange={(e) => setze('empfaengerName', e.target.value)}
          />
        </div>
        <div className="feld">
          <label htmlFor="str">Straße</label>
          <input
            id="str"
            value={werte.empfaengerStrasse}
            onChange={(e) => setze('empfaengerStrasse', e.target.value)}
          />
        </div>
        <div className="feld">
          <label htmlFor="plz">PLZ und Ort</label>
          <input
            id="plz"
            value={werte.empfaengerPlzOrt}
            onChange={(e) => setze('empfaengerPlzOrt', e.target.value)}
          />
        </div>
        <div className="feld">
          <label htmlFor="dat">Datum des Anschreibens</label>
          {/* Ein echter Datumswähler statt eines Textfeldes: das Datum geht
              in den Einleitungssatz des Briefes ein, und ein Tippfehler
              darin fällt erst im versandten Schreiben auf. */}
          <input
            id="dat"
            type="date"
            value={nachIso(werte.einleitungDatum)}
            onChange={(e) => setze('einleitungDatum', nachDeutsch(e.target.value))}
          />
          {/*
            Wie der Datumswähler aussieht, bestimmt der Browser — mal
            TT.MM.JJJJ, mal MM/TT/JJJJ. Was im Brief steht, bestimmt das
            Büro. Deshalb steht es hier ausgeschrieben daneben.

            Und mit der Einschränkung, die dazugehört: eine Anrede, die
            schon auf einen Namen lautet, wird nicht angerührt — auch nicht
            beim Wechsel des Empfängers. Sie gilt als selbst geschrieben,
            und was jemand selbst geschrieben hat, nimmt ihm keine
            Automatik wieder weg.

            Lange stand hier eine Zusage, die die Felder nicht einhielten:
            der Einleitungssatz wurde beim **Anlegen** einmal gebaut und
            danach nie wieder. Wer das Datum später nachtrug — und beim
            Anlegen ist es oft noch nicht bekannt —, änderte damit nur die
            Aktennotiz; im Brief blieb die Stelle leer. Seit dem Speichern
            trägt der Kopf den Satz nach: er wird in den Brief geschrieben,
            solange dort noch der Satz aus der Vorlage steht. Selbst
            geschriebenes bleibt unangetastet.
          */}
          <span className="unterzeile" style={{ margin: '4px 0 0' }}>
            {werte.einleitungDatum
              ? `Im Brief: „mit ${werte.einleitungMedium === 'mail' ? 'der Mail' : 'dem Schreiben'} vom ${werte.einleitungDatum} überliessen Sie uns …" — beim Speichern nachgetragen, sofern der Absatz nicht selbst geschrieben ist.`
              : 'Noch kein Datum — der Brief beginnt dann ohne Einleitungssatz.'}
          </span>
        </div>
        <div className="feld">
          <label htmlFor="med">Übermittlungsweg</label>
          <select
            id="med"
            value={werte.einleitungMedium}
            onChange={(e) => setze('einleitungMedium', e.target.value)}
          >
            <option value="schreiben">Schreiben</option>
            <option value="mail">Mail</option>
          </select>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 12 }}>
        <button
          type="button"
          className="haupt"
          disabled={laeuft}
          onClick={() =>
            starte(async () => {
              const e = await speichereKopf(props.stellungnahmeId, werte)
              setzeMeldung(e.fehler ?? e.hinweis ?? null)
              /*
                Der Brief steht im Editor daneben und weiss von diesem
                Formular nichts. Damit die Kopfdaten dort ankommen, meldet
                das Speichern sie an — der Schreibtisch trägt Anrede und
                Einleitungssatz nach, soweit dort noch die Vorlage steht.
                Ein Ereignis am Fenster ist hier der schmalste Weg: kein
                gemeinsamer Zustand, keine Runde über den Server, und der
                Kopf bleibt für sich prüfbar.
              */
              if (!e.fehler) {
                window.dispatchEvent(
                  new CustomEvent(EREIGNIS_KOPF, {
                    detail: {
                      empfaengerName: werte.empfaengerName,
                      einleitungDatum: werte.einleitungDatum,
                      einleitungMedium: werte.einleitungMedium,
                    },
                  }),
                )
              }
            })
          }
        >
          {laeuft ? 'Speichert …' : 'Speichern'}
        </button>
        {meldung ? (
          <span className="unterzeile" style={{ margin: 0 }}>
            {meldung}
          </span>
        ) : null}
      </div>
      </div>
    </details>
  )
}
