'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { Erscheinungsschalter } from './erscheinung'

/**
 * Die Kopfleiste über dem Inhalt.
 *
 * Sie trägt den Schalter für das Menü, den Namen des Bereichs und den
 * Umschalter für das Erscheinungsbild. Auf schmalen Schirmen ist das Menü
 * standardmässig eingeklappt und wird von hier aus geöffnet.
 */

const BEREICHE: { pfad: string; name: string }[] = [
  { pfad: '/stellungnahmen', name: 'Stellungnahmen' },
  { pfad: '/faelle', name: 'Fälle' },
  { pfad: '/bibliothek', name: 'Argumentbibliothek' },
  { pfad: '/bilder', name: 'Bildbibliothek' },
]

const SPEICHERSCHLUESSEL = 'werkbank-menue'

/**
 * Dieselbe Grenze wie im Stylesheet. Darunter liegt das Menü **über** dem
 * Inhalt und ist standardmässig zu; darüber steht es daneben und ist
 * standardmässig auf.
 */
const SCHMAL = '(max-width: 900px)'

function istSchmal(): boolean {
  return window.matchMedia(SCHMAL).matches
}

/**
 * Schreibt den Stand an den Körper — immer beide Klassen.
 *
 * Nur `menue-zu` zu setzen reichte nicht: unterhalb von 900px ist das Menü
 * von Haus aus weggeschoben und wird erst durch `menue-auf` sichtbar. Wer
 * dort nur `menue-zu` pflegte, liess den Schalter behaupten, das Menü sei
 * offen, während es zugeklappt am Rand stand.
 */
function wendeAn(offen: boolean): void {
  document.body.classList.toggle('menue-zu', !offen)
  document.body.classList.toggle('menue-auf', offen)
}

export function Kopfleiste() {
  const pfad = usePathname()
  const [offen, setzeOffen] = useState(true)
  const [schmal, setzeSchmal] = useState(false)
  const ersterPfad = useRef(true)

  // Der gespeicherte Stand wird erst nach dem ersten Zeichnen angewandt —
  // der Server weiss nichts vom Browser, und ein Sprung ist besser als eine
  // Meldung über nicht übereinstimmende Ausgaben.
  useEffect(() => {
    const medium = window.matchMedia(SCHMAL)
    const merkeBreite = () => setzeSchmal(medium.matches)
    merkeBreite()
    medium.addEventListener('change', merkeBreite)

    // Auf schmalen Schirmen deckt das Menü den Inhalt zu. Ein Deckel, der
    // sich bei jedem Aufruf von selbst wieder auflegt, ist eine Zumutung —
    // dort wird also stets zugeklappt begonnen. Der gemerkte Wunsch gilt
    // für den breiten Schirm, wo das Menü niemandem im Weg steht.
    const gespeichert = localStorage.getItem(SPEICHERSCHLUESSEL)
    const start = medium.matches ? false : gespeichert !== 'zu'
    setzeOffen(start)
    wendeAn(start)

    return () => medium.removeEventListener('change', merkeBreite)
  }, [])

  // Nach einem Sprung ins Menü soll auf schmalen Schirmen der Inhalt zu
  // sehen sein, nicht weiter das Menü davor.
  useEffect(() => {
    if (ersterPfad.current) {
      ersterPfad.current = false
      return
    }
    if (!istSchmal()) return
    setzeOffen(false)
    wendeAn(false)
  }, [pfad])

  const wechsle = () => {
    const neu = !offen
    setzeOffen(neu)
    wendeAn(neu)
    // Gemerkt wird nur der breite Schirm: dort ist der Stand eine
    // Arbeitsvorliebe. Das Auf und Zu eines Deckels auf dem Telefon
    // soll die Ansicht am Schreibtisch nicht umstellen.
    if (!istSchmal()) localStorage.setItem(SPEICHERSCHLUESSEL, neu ? 'auf' : 'zu')
  }

  const bereich = BEREICHE.find((b) => pfad.startsWith(b.pfad))?.name ?? 'Werkbank'

  return (
    <>
      <header className="topbar">
        <button
          type="button"
          className="menue-schalter"
          onClick={wechsle}
          aria-label={offen ? 'Menü einklappen' : 'Menü ausklappen'}
          aria-expanded={offen}
        >
          <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">
            <path
              d="M3 5h14M3 10h14M3 15h14"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              fill="none"
            />
          </svg>
        </button>

        <span className="topbar-titel">{bereich}</span>

        <Erscheinungsschalter />
      </header>

      {/*
       * Auf dem schmalen Schirm liegt das offene Menü über der Kopfleiste
       * und verdeckt dabei genau den Knopf, der es wieder zuklappt. Diese
       * Fläche fängt den Klick daneben ab — sonst käme man aus dem Menü
       * nur durch Neuladen wieder heraus.
       */}
      {schmal && offen ? (
        <div
          className="menue-deckel"
          onClick={wechsle}
          aria-hidden="true"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 998,
            background: 'rgba(0, 0, 0, 0.35)',
          }}
        />
      ) : null}
    </>
  )
}
