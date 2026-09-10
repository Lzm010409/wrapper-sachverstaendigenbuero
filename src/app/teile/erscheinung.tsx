'use client'

import { useEffect, useState } from 'react'

/**
 * Umschalter für das Erscheinungsbild.
 *
 * Drei Zustände, nicht zwei: hell, dunkel und „wie das System". Der dritte
 * ist die Voreinstellung und der Grund, warum die Anwendung überhaupt schon
 * dunkel konnte — er darf nicht verloren gehen, nur weil ein Schalter
 * dazukommt.
 *
 * Gespeichert wird im Browser; ein kurzes Skript im Seitenkopf setzt den
 * Wert vor dem ersten Zeichnen, damit es nicht hell aufblitzt.
 */

export const SPEICHERSCHLUESSEL = 'werkbank-erscheinung'

export type Erscheinung = 'system' | 'hell' | 'dunkel'

const FOLGE: Erscheinung[] = ['system', 'hell', 'dunkel']

const BESCHRIFTUNG: Record<Erscheinung, { zeichen: string; name: string }> = {
  system: { zeichen: '◐', name: 'wie das System' },
  hell: { zeichen: '☀', name: 'hell' },
  dunkel: { zeichen: '☾', name: 'dunkel' },
}

export function wendeAn(wert: Erscheinung): void {
  const wurzel = document.documentElement
  if (wert === 'system') delete wurzel.dataset.theme
  else wurzel.dataset.theme = wert === 'dunkel' ? 'dark' : 'light'
}

export function Erscheinungsschalter() {
  const [wert, setzeWert] = useState<Erscheinung>('system')

  useEffect(() => {
    const gespeichert = localStorage.getItem(SPEICHERSCHLUESSEL)
    if (gespeichert === 'hell' || gespeichert === 'dunkel' || gespeichert === 'system') {
      setzeWert(gespeichert)
    }
  }, [])

  const weiter = () => {
    const naechster = FOLGE[(FOLGE.indexOf(wert) + 1) % FOLGE.length]!
    setzeWert(naechster)
    localStorage.setItem(SPEICHERSCHLUESSEL, naechster)
    wendeAn(naechster)
  }

  const b = BESCHRIFTUNG[wert]

  return (
    <button
      type="button"
      className="erscheinung"
      onClick={weiter}
      title={`Erscheinungsbild: ${b.name} — klicken zum Wechseln`}
      aria-label={`Erscheinungsbild: ${b.name}. Klicken wechselt zum nächsten.`}
    >
      <span aria-hidden="true">{b.zeichen}</span>
    </button>
  )
}
