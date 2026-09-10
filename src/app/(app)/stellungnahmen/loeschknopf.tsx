'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { loescheStellungnahme } from '@/stellungnahme/export-aktionen'
import { Kreisel } from '@/app/teile/anzeigen'

/**
 * Wirft eine Stellungnahme weg.
 *
 * Mit Rückfrage, und die Rückfrage nennt den Betreff: „Löschen?" allein
 * beantwortet niemand richtig, wenn zehn Zeilen untereinander stehen.
 *
 * Was die Aktion ablehnt, steht als Meldung neben dem Knopf. Der eine Fall,
 * den `loescheStellungnahme` ablehnt — ein versendetes Schreiben —, kommt
 * hier allerdings nicht an: Liste und Detailseite zeigen den Knopf dort
 * erst gar nicht. Wer wissen will, warum ein versendetes Schreiben sich
 * nicht wegräumen lässt, erfährt es an dieser Stelle nicht.
 */
export function Loeschknopf({
  stellungnahmeId,
  betreff,
  danach,
  beschriftung,
}: {
  stellungnahmeId: string
  betreff: string
  /** Wohin danach: zurück zur Liste oder einfach neu laden. */
  danach?: string
  beschriftung?: string
}) {
  const router = useRouter()
  const [laeuft, starte] = useTransition()
  const [fehler, setzeFehler] = useState<string | null>(null)

  return (
    <>
      <button
        type="button"
        className="loeschknopf gefahr"
        disabled={laeuft}
        title={`„${betreff}" löschen`}
        aria-label={`„${betreff}" löschen`}
        onClick={() => {
          if (!confirm(`„${betreff}" endgültig löschen? Der Brief und alle Positionen gehen mit.`)) {
            return
          }
          starte(async () => {
            const e = await loescheStellungnahme(stellungnahmeId)
            if (e.fehler) {
              setzeFehler(e.fehler)
              // Auch der Fehlschlag ist eine Nachricht über den Stand der
              // Dinge: „gibt es nicht mehr" heisst, dass diese Ansicht
              // veraltet ist — etwa weil ein zweiter Tab dasselbe Schreiben
              // schon gelöscht hat. Ohne das Auffrischen bliebe die
              // Geisterzeile stehen und führte beim Anklicken ins Leere.
              router.refresh()
              return
            }
            if (danach) router.push(danach)
            router.refresh()
          })
        }}
      >
        {laeuft ? <Kreisel text="Löschen" /> : (beschriftung ?? '🗑')}
      </button>
      {fehler ? (
        <span className="hinweis fehler" role="alert">
          {fehler}
        </span>
      ) : null}
    </>
  )
}
