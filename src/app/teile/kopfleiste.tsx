'use client'

import { usePathname } from 'next/navigation'
import { Erscheinungsschalter } from './erscheinung'

/**
 * Die Kopfleiste über dem Inhalt, nach dem Vorbild von autoiXpert: flach,
 * hell, links das Zeichen und der Name des Bereichs, rechts der Benutzer.
 *
 * Der Menüschalter ist entfallen. Er klappte ein 250px breites Menü ein und
 * aus und trug dafür gemerkten Stand, eine Grenze bei 900px und eine
 * Deckfläche für den Klick daneben. Die Schiene ist 56px breit und steht
 * auch auf dem Telefon — es gibt nichts mehr auf- und zuzuklappen.
 */

const BEREICHE: { pfad: string; name: string }[] = [
  { pfad: '/faelle', name: 'Fälle' },
  { pfad: '/stellungnahmen', name: 'Stellungnahmen' },
  { pfad: '/bibliothek', name: 'Argumentbibliothek' },
  { pfad: '/bilder', name: 'Bildbibliothek' },
]

export function Kopfleiste({ rechts }: { rechts?: React.ReactNode }) {
  const pfad = usePathname()
  const bereich = BEREICHE.find((b) => pfad.startsWith(b.pfad))?.name ?? 'Cockpit'

  return (
    <header className="topbar">
      <span className="topbar-titel">{bereich}</span>
      <div className="topbar-rechts">
        {rechts}
        <Erscheinungsschalter />
      </div>
    </header>
  )
}
