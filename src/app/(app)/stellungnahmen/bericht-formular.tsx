'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Kreisel } from '@/app/teile/anzeigen'

/** Die zwei Wege, auf denen eine Stellungnahme aus einer Datei entsteht. */
type Uploadmodus = 'pruefbericht' | 'import'

const MODUS_ANGABEN: Record<
  Uploadmodus,
  { titel: string; ziel: string; feld: string; beschriftung: string; knopf: string }
> = {
  pruefbericht: {
    titel: 'Prüfbericht',
    ziel: '/api/stellungnahmen/auswerten',
    feld: 'pruefbericht',
    beschriftung: 'Prüfbericht als PDF',
    knopf: 'Prüfbericht auswerten',
  },
  import: {
    titel: 'Bestehende Stellungnahme',
    ziel: '/api/stellungnahmen/importieren',
    feld: 'stellungnahme',
    beschriftung: 'Stellungnahme als PDF',
    knopf: 'Stellungnahme übernehmen',
  },
}

/**
 * Prüfbericht auswerten oder eine bereits fertige Stellungnahme übernehmen.
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
 *
 * Zwei Umschaltknöpfe statt zweier Formulare untereinander: ein Prüfbericht
 * und eine bereits verfasste Stellungnahme führen zum selben Ziel — dem
 * Schreibtisch mit ausgelesenen Positionen —, nur die Quelle ist eine
 * andere. Beide Wege teilen sich deshalb dieselbe Maske und denselben
 * Fortschritt auf der Detailseite (`auswertungslauf.tsx`).
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
  const [modus, setzeModus] = useState<Uploadmodus>('pruefbericht')
  const [laeuft, setzeLaeuft] = useState(false)
  const [meldung, setzeMeldung] = useState<{ text: string; fehler: boolean } | null>(null)
  const [fallId, setzeFallId] = useState('')
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

  const angaben = MODUS_ANGABEN[modus]
  /*
    Bei einer bereits verfassten Stellungnahme ist der Fall Pflicht — ohne
    ihn liesse sie sich später nirgends wiederfinden. Beim Prüfbericht bleibt
    „Ohne Fallzuordnung" weiterhin erlaubt, wie bisher.
  */
  const fallPflicht = modus === 'import' && !festerFall
  const fehltFall = fallPflicht && !fallId

  /** Gibt `true` zurück, wenn eine Stellungnahme entstanden ist. */
  const fuehreAus = async (formular: FormData): Promise<boolean> => {
    setzeMeldung(null)
    setzeLaeuft(true)

    let antwort: Response
    try {
      antwort = await fetch(angaben.ziel, { method: 'POST', body: formular })
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
        text: rumpf?.fehler ?? 'Die Datei liess sich nicht entgegennehmen.',
        fehler: true,
      })
      return false
    }

    formularRef.current?.reset()
    setzeFallId('')
    router.push(`/stellungnahmen/${rumpf.stellungnahmeId}`)
    return true
  }

  const werteAus = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (inArbeit.current || fehltFall) return
    inArbeit.current = true
    const formular = new FormData(e.currentTarget)
    let fertig = false
    try {
      fertig = await fuehreAus(formular)
    } finally {
      // Nach einem Fehlschlag darf sofort wieder abgeschickt werden — nach
      // einem Erfolg nicht: dort läuft der Wechsel in den Schreibtisch
      // noch, und ein Klick in diese Lücke legte ein zweites Schreiben aus
      // derselben Datei an.
      if (!fertig) inArbeit.current = false
    }
  }

  return (
    <>
      {/*
        Zwei Chips statt eines Auswahlfeldes: bei nur zwei Werten ist ein
        Klick schneller als ein Aufklappen, und beide Wege stehen von
        Anfang an sichtbar nebeneinander — nicht der eine hinter einem
        „mehr"-Knopf versteckt.
      */}
      <div className="label-chip-reihe" role="group" aria-label="Art der Datei" style={{ marginBottom: 10 }}>
        {(Object.keys(MODUS_ANGABEN) as Uploadmodus[]).map((m) => (
          <button
            key={m}
            type="button"
            className={`label-chip ${modus === m ? 'aktiv' : ''}`}
            aria-pressed={modus === m}
            disabled={laeuft}
            onClick={() => {
              setzeModus(m)
              setzeMeldung(null)
              formularRef.current?.reset()
              setzeFallId('')
            }}
          >
            {MODUS_ANGABEN[m].titel}
          </button>
        ))}
      </div>

      <form ref={formularRef} onSubmit={werteAus} className="werkzeugleiste" style={{ marginBottom: 12 }}>
        <input
          key={modus}
          type="file"
          name={angaben.feld}
          accept="application/pdf,.pdf"
          required
          disabled={!aktiv || laeuft}
          aria-label={angaben.beschriftung}
          style={{ flex: 1, minWidth: 240, fontSize: 13.5 }}
        />
        {festerFall ? (
          <>
            <input type="hidden" name="fallId" value={festerFall.id} />
            <span className="treffer-zahl">zu {festerFall.bezeichnung}</span>
          </>
        ) : (
          <select
            name="fallId"
            value={fallId}
            onChange={(e) => setzeFallId(e.target.value)}
            disabled={!aktiv || laeuft}
            aria-label="Fall zuordnen"
            aria-required={fallPflicht}
          >
            {fallPflicht ? (
              <option value="">Fall auswählen …</option>
            ) : (
              <option value="">Ohne Fallzuordnung</option>
            )}
            {faelle.map((f) => (
              <option key={f.id} value={f.id}>
                {f.bezeichnung}
              </option>
            ))}
          </select>
        )}
        <button type="submit" className="haupt" disabled={!aktiv || laeuft || fehltFall}>
          {laeuft ? <Kreisel text="Wird übertragen" /> : angaben.knopf}
        </button>
        <span className="treffer-zahl">Die Auswertung läuft danach im Hintergrund</span>
      </form>

      {fehltFall ? (
        <div className="hinweis warn" style={{ marginBottom: 18 }}>
          Bitte den Fall auswählen, dem diese Stellungnahme zugeordnet werden soll.
        </div>
      ) : null}

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
