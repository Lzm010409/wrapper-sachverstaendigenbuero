'use client'

import { useEffect } from 'react'

/**
 * Schliesst die Kästen in der Kopfzeile, sobald man daneben klickt.
 *
 * Prüfliste, Unklarheiten und Empfänger klappen als schwebende Kästen auf
 * und legen sich dabei über die Werkzeugleiste und die Positionsmarken.
 * Das ist richtig, solange man in ihnen arbeitet — und im Weg, sobald man
 * weiterarbeitet. Bisher blieben sie offen, bis jemand ihre Zeile noch
 * einmal traf; bei einem Fall mit achtzehn Positionen sah es dann aus, als
 * wären die Marken verschwunden.
 *
 * Ein eigener Baustein statt einer Zeile in der Seite: die Kopfzeile wird
 * auf dem Server gebaut, dieser Griff braucht aber den Browser.
 */
export function KlappenSchliesser() {
  useEffect(() => {
    const zu = (ereignis: PointerEvent) => {
      const ziel = ereignis.target as HTMLElement | null
      if (!ziel || ziel.closest('.brief-kopf-klappen')) return
      for (const k of document.querySelectorAll<HTMLDetailsElement>(
        '.brief-kopf-klappen details[open]',
      )) {
        k.open = false
      }
    }
    document.addEventListener('pointerdown', zu)
    return () => document.removeEventListener('pointerdown', zu)
  }, [])

  return null
}
