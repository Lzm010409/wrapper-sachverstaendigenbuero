'use client'

import { useState, useTransition } from 'react'
import { aktualisiereFall, type ImportZustand } from '@/autoixpert/aktionen'
import { Kreisel } from '@/app/teile/anzeigen'
import { useMelder } from '@/app/teile/melder'
import { ausErgebnis } from '@/melden/typen'

/**
 * Holt den Fall neu aus autoiXpert.
 *
 * Der Abruf geht über das Netz und dauert je nach Umfang des Gutachtens
 * mehrere Sekunden. Vorher stand während der Wartezeit nur „Lädt …" im Knopf
 * — richtig, aber still. Jetzt dreht sich der Kreisel, und das Ergebnis
 * kommt als Einblendung: der Knopf sitzt oben rechts, das Ergebnis stand
 * darunter in 12,5 Pixeln und wurde leicht übersehen.
 */
export function Aktualisieren({ fallId }: { fallId: string }) {
  const [laeuft, starte] = useTransition()
  const [zustand, setzeZustand] = useState<ImportZustand | null>(null)
  const { melde } = useMelder()

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
      <button
        type="button"
        disabled={laeuft}
        onClick={() =>
          starte(async () => {
            const ergebnis = await aktualisiereFall(fallId)
            setzeZustand(ergebnis)
            const meldung = ausErgebnis(ergebnis)
            if (meldung) melde(meldung)
          })
        }
      >
        {laeuft ? <Kreisel text="Aus autoiXpert neu laden" /> : 'Aus autoiXpert neu laden'}
      </button>
      {zustand?.fehler ? (
        <span style={{ fontSize: 12.5, color: 'var(--crit)' }} role="alert">
          {zustand.fehler}
        </span>
      ) : null}
    </div>
  )
}
