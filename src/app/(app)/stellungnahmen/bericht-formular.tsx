'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Kreisel } from '@/app/teile/anzeigen'

/**
 * Prüfbericht hochladen.
 *
 * Der Upload dauert Sekunden, die Auswertung Minuten — deshalb sind das
 * zwei Dinge. Diese Maske schickt die Datei ab und führt weiter zu der
 * Stellungnahme, die dabei entsteht; die Auswertung läuft danach im
 * Hintergrund, und ihren Stand zeigt die Detailseite.
 *
 * Vorher hing der ganze Vorgang an dieser Maske: der Balken stand
 * minutenlang bei wenigen Prozent, weil das Auslesen der Positionen **ein**
 * langer Aufruf an das Sprachmodell ist und dazwischen nichts meldet. Wer
 * das Fenster wechselte oder die Verbindung verlor, hatte die Arbeit
 * verloren.
 */
export function BerichtFormular({
  faelle,
  aktiv,
  festerFall,
}: {
  faelle: { id: string; bezeichnung: string }[]
  aktiv: boolean
  /**
   * Wird die Maske aus einem Fall heraus benutzt, steht der Fall schon fest.
   * Dann gibt es nichts auszuwählen — und vor allem nichts falsch
   * auszuwählen: das Auswahlfeld stand auf „Ohne Fallzuordnung", und wer es
   * übersah, legte ein Schreiben ohne Fall an.
   */
  festerFall?: { id: string; bezeichnung: string }
}) {
  const router = useRouter()
  const [laeuft, setzeLaeuft] = useState(false)
  const [meldung, setzeMeldung] = useState<{ text: string; fehler: boolean } | null>(null)
  const formularRef = useRef<HTMLFormElement>(null)
  /**
   * Die Sperre gegen den zweiten Klick.
   *
   * Ein Zustand allein reicht dafür nicht: er wird erst beim nächsten
   * Rendern wirksam. Zwei Klicks kurz hintereinander liefen beide durch —
   * gemessen: zwei POST auf `/auswerten` aus einem Doppelklick, und daraus
   * zwei Schreiben aus einem Prüfbericht. Eine Ref wirkt sofort.
   */
  const inArbeit = useRef(false)

  /** Gibt `true` zurück, wenn eine Stellungnahme entstanden ist. */
  const fuehreAus = async (formular: FormData): Promise<boolean> => {
    setzeMeldung(null)
    setzeLaeuft(true)

    let antwort: Response
    try {
      antwort = await fetch('/api/stellungnahmen/auswerten', { method: 'POST', body: formular })
    } catch {
      setzeLaeuft(false)
      setzeMeldung({ text: 'Die Verbindung ist abgerissen.', fehler: true })
      return false
    }

    const rumpf = (await antwort.json().catch(() => null)) as {
      stellungnahmeId?: string
      fehler?: string
    } | null

    if (!antwort.ok || !rumpf?.stellungnahmeId) {
      setzeLaeuft(false)
      setzeMeldung({
        text: rumpf?.fehler ?? 'Der Prüfbericht liess sich nicht entgegennehmen.',
        fehler: true,
      })
      return false
    }

    formularRef.current?.reset()
    router.push(`/stellungnahmen/${rumpf.stellungnahmeId}`)
    return true
  }

  const werteAus = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (inArbeit.current) return
    inArbeit.current = true
    const formular = new FormData(e.currentTarget)
    let fertig = false
    try {
      fertig = await fuehreAus(formular)
    } finally {
      // Nach einem Fehlschlag darf sofort wieder abgeschickt werden — nach
      // einem Erfolg nicht: dort läuft der Wechsel in den Schreibtisch
      // noch, und ein Klick in diese Lücke legte ein zweites Schreiben aus
      // demselben Prüfbericht an.
      if (!fertig) inArbeit.current = false
    }
  }

  return (
    <>
      <form ref={formularRef} onSubmit={werteAus} className="werkzeugleiste" style={{ marginBottom: 12 }}>
        <input
          type="file"
          name="pruefbericht"
          accept="application/pdf,.pdf"
          required
          disabled={!aktiv || laeuft}
          aria-label="Prüfbericht als PDF"
          style={{ flex: 1, minWidth: 240, fontSize: 13.5 }}
        />
        {festerFall ? (
          <>
            <input type="hidden" name="fallId" value={festerFall.id} />
            <span className="treffer-zahl">zu {festerFall.bezeichnung}</span>
          </>
        ) : (
          <select name="fallId" disabled={!aktiv || laeuft} aria-label="Fall zuordnen">
            <option value="">Ohne Fallzuordnung</option>
            {faelle.map((f) => (
              <option key={f.id} value={f.id}>
                {f.bezeichnung}
              </option>
            ))}
          </select>
        )}
        <button type="submit" className="haupt" disabled={!aktiv || laeuft}>
          {laeuft ? <Kreisel text="Wird übertragen" /> : 'Prüfbericht auswerten'}
        </button>
        <span className="treffer-zahl">Die Auswertung läuft danach im Hintergrund</span>
      </form>

      {meldung ? (
        <div
          className={`hinweis ${meldung.fehler ? 'fehler' : ''}`}
          style={{ marginBottom: 18 }}
          role={meldung.fehler ? 'alert' : 'status'}
        >
          {meldung.text}
        </div>
      ) : null}
    </>
  )
}
