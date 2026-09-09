'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

/**
 * Suche und Themenfilter der Bildbibliothek.
 *
 * Gesucht wird über Titel, Beschreibung, Dateiname und Themen — wer
 * „Beilackierung" eingibt, soll das Bild finden, gleich wo das Wort steht.
 */
export function Suchleiste({
  begriff,
  thema,
  themen,
}: {
  begriff: string
  thema: string
  themen: { thema: string; anzahl: number }[]
}) {
  const router = useRouter()
  const parameter = useSearchParams()
  const [laeuft, starte] = useTransition()
  const [suche, setzeSuche] = useState(begriff)

  /**
   * Das Feld muss der Adresse folgen, wenn diese sich von aussen ändert —
   * Zurück-Taste, ein Verweis mit `?q=`, ein Aufruf aus der Kopfleiste.
   * Sonst zeigte das Feld dauerhaft etwas anderes an als die Liste darunter.
   *
   * Die eigene Adressänderung aus der Entprellung unten ist davon
   * ausgenommen: sie hinkt dem Feld naturgemäss hinterher, und sie zu
   * übernehmen hiesse, in schnelles Tippen die zuletzt gesendete Fassung
   * zurückzuschreiben.
   */
  const eigenesZiel = useRef(begriff)
  const zuletztGesehen = useRef(begriff)
  if (begriff !== zuletztGesehen.current) {
    zuletztGesehen.current = begriff
    if (begriff !== eigenesZiel.current) setzeSuche(begriff)
  }

  const ziel = (q: string, t: string) => {
    eigenesZiel.current = q
    // `seiteOffen`/`groesseOffen` bleiben stehen: die Suche wirkt nur auf die
    // Bibliothek, nicht auf die Bilder aus Schreiben darunter (siehe Hinweis
    // im Abschnitt). `seite`/`groesse` fallen weg — ein geänderter Filter
    // macht die vorherige Bibliotheksseite ungültig.
    const p = new URLSearchParams(parameter.toString())
    p.delete('seite')
    if (q) p.set('q', q)
    else p.delete('q')
    if (t) p.set('thema', t)
    else p.delete('thema')
    const rest = p.toString()
    return rest ? `/bilder?${rest}` : '/bilder'
  }

  // Serverseitige Suche; ohne Verzögerung löste jeder Tastendruck eine
  // Anfrage aus. 250 ms fühlen sich noch unmittelbar an.
  useEffect(() => {
    if (suche === begriff) return
    const zeit = setTimeout(() => starte(() => router.replace(ziel(suche, thema))), 250)
    return () => clearTimeout(zeit)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suche, begriff, thema, router])

  return (
    <div className="werkzeugleiste">
      <input
        type="search"
        placeholder="Titel, Beschreibung, Thema …"
        value={suche}
        onChange={(e) => setzeSuche(e.target.value)}
        aria-label="Bildbibliothek durchsuchen"
      />

      <select
        value={thema}
        aria-label="Thema"
        onChange={(e) => starte(() => router.replace(ziel(suche, e.target.value)))}
      >
        <option value="">Alle Themen</option>
        {themen.map((t) => (
          <option key={t.thema} value={t.thema}>
            {t.thema} ({t.anzahl})
          </option>
        ))}
      </select>

      {begriff || thema ? (
        <button
          type="button"
          onClick={() => {
            // Erst das Feld leeren, dann die Adresse: sonst stellt die
            // Verzögerung oben die eben weggeräumte Suche sofort wieder her
            // — der Knopf machte sich selbst rückgängig.
            setzeSuche('')
            starte(() => router.replace(ziel('', '')))
          }}
        >
          Filter zurücksetzen
        </button>
      ) : null}

      {laeuft ? <span className="treffer-zahl">sucht …</span> : null}
    </div>
  )
}
