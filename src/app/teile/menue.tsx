'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

/**
 * Die Menüpunkte — in autoiXpert sind sie eine Reihe von Piktogrammen in der
 * schmalen Leiste links, ohne Beschriftung.
 *
 * Als Client-Baustein, weil der aktive Punkt am Pfad hängt — und weil ein
 * Menü, das nicht zeigt, wo man steht, kein Menü ist.
 *
 * Die Beschriftung entfällt nur für das Auge: `title` zeigt sie beim
 * Verweilen, und ein Text für Screenreader bleibt im Markup. Ein Piktogramm
 * allein wäre für die Tastatur- und Sprachbedienung eine Verschlechterung.
 */

// Der Fall steht oben: er ist der Anker, alles Weitere liegt in seinen
// Reitern. Bibliothek und Bilder sind fallübergreifende Nachschlagewerke
// und stehen deshalb darunter.
const PUNKTE = [
  {
    pfad: '/faelle',
    name: 'Fälle',
    pfadDaten: 'M3 6a1 1 0 0 1 1-1h4l2 2h6a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6z',
  },
  {
    pfad: '/stellungnahmen',
    name: 'Stellungnahmen',
    pfadDaten: 'M5 3h7l4 4v10a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zm7 0v4h4M7 11h6M7 14h6',
  },
  {
    pfad: '/bibliothek',
    name: 'Argumentbibliothek',
    pfadDaten: 'M4 4h5a2 2 0 0 1 2 2v10a2 2 0 0 0-2-2H4V4zm12 0h-5a2 2 0 0 0-2 2v10a2 2 0 0 1 2-2h5V4z',
  },
  {
    pfad: '/bilder',
    name: 'Bildbibliothek',
    pfadDaten: 'M3 5h14v10H3V5zm0 8 3.5-3.5 3 3L13 9l4 4M12.5 8a1 1 0 1 0 0-2 1 1 0 0 0 0 2z',
  },
]

export function Menuepunkte() {
  const pfad = usePathname()

  return (
    <div className="menue-nav">
      {PUNKTE.map((p) => (
        <Link
          key={p.pfad}
          href={p.pfad}
          aria-current={pfad.startsWith(p.pfad) ? 'page' : undefined}
          title={p.name}
        >
          <svg viewBox="0 0 20 20" aria-hidden="true">
            <path
              d={p.pfadDaten}
              fill="none"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span className="nur-vorlesen">{p.name}</span>
        </Link>
      ))}
    </div>
  )
}
