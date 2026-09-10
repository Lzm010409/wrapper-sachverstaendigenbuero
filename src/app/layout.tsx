import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Cockpit — Sachverständigenbüro Gollenstede',
  description:
    'Fallakte, Wiederbeschaffungswert und Kürzungsabwehr für autoiXpert, Pipedrive und sevDesk.',
}

/**
 * Setzt das gespeicherte Erscheinungsbild vor dem ersten Zeichnen.
 *
 * Ohne dieses Skript blitzt bei jedem Seitenaufruf kurz die helle Fassung
 * auf, bevor React die Wahl nachträgt. Es läuft absichtlich synchron im
 * Kopf der Seite und tut genau eine Sache.
 */
const ERSCHEINUNG_SKRIPT = `
try {
  var w = localStorage.getItem('werkbank-erscheinung');
  if (w === 'hell') document.documentElement.dataset.theme = 'light';
  else if (w === 'dunkel') document.documentElement.dataset.theme = 'dark';
} catch (e) {}
`

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: ERSCHEINUNG_SKRIPT }} />
      </head>
      <body>{children}</body>
    </html>
  )
}
