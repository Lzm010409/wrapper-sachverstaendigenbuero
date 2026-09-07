'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useState, useTransition } from 'react'

interface Eigenschaften {
  abschnitte: { abschnitt: string; anzahl: number }[]
  bereichsnamen: Record<string, string>
  trefferzahl: number
}

export function Suchleiste({ abschnitte, bereichsnamen, trefferzahl }: Eigenschaften) {
  const router = useRouter()
  const parameter = useSearchParams()
  const [laeuft, starte] = useTransition()
  const [suche, setzeSuche] = useState(parameter.get('q') ?? '')

  // Die Suche läuft serverseitig. Ohne Verzögerung würde jeder Tastendruck
  // eine Anfrage auslösen; 250 ms fühlen sich noch unmittelbar an.
  useEffect(() => {
    const aktuell = parameter.get('q') ?? ''
    if (suche === aktuell) return
    const zeit = setTimeout(() => {
      starte(() => router.replace(`/bibliothek?${baue(parameter, { q: suche })}`))
    }, 250)
    return () => clearTimeout(zeit)
  }, [suche, parameter, router])

  const setze = (schluessel: string, wert: string) => {
    // Ein Abschnitt gehört immer zu genau einem Bereich. Bleibt er beim
    // Bereichswechsel stehen, filtert die Liste auf einen Abschnitt, den es
    // im neuen Bereich nicht gibt: null Treffer, und das Auswahlfeld zeigt
    // trotzdem „Alle Abschnitte" — der wirksame Filter wäre unsichtbar.
    const aenderungen =
      schluessel === 'bereich' ? { bereich: wert, abschnitt: '' } : { [schluessel]: wert }
    starte(() => router.replace(`/bibliothek?${baue(parameter, aenderungen)}`))
  }

  // Steht in der Adresse ein Abschnitt, den die Liste der Optionen nicht
  // kennt (etwa aus einem Lesezeichen), wird er trotzdem angezeigt. Sonst
  // stünde das Feld auf „Alle Abschnitte", während gefiltert wird.
  const abschnittWert = parameter.get('abschnitt') ?? ''
  const abschnittFremd =
    abschnittWert !== '' && !abschnitte.some((a) => a.abschnitt === abschnittWert)

  const hatFilter = ['q', 'bereich', 'status', 'abschnitt'].some((k) => parameter.get(k))

  return (
    <div className="werkzeugleiste">
      <input
        type="search"
        placeholder="Bauteil, Kürzungsgrund, Textstelle …"
        value={suche}
        onChange={(e) => setzeSuche(e.target.value)}
        aria-label="Bibliothek durchsuchen"
      />

      <select
        value={parameter.get('bereich') ?? ''}
        onChange={(e) => setze('bereich', e.target.value)}
        aria-label="Bereich"
      >
        <option value="">Alle Bereiche</option>
        {Object.entries(bereichsnamen).map(([wert, name]) => (
          <option key={wert} value={wert}>
            {name}
          </option>
        ))}
      </select>

      <select
        value={abschnittWert}
        onChange={(e) => setze('abschnitt', e.target.value)}
        aria-label="Abschnitt"
      >
        <option value="">Alle Abschnitte</option>
        {abschnittFremd ? <option value={abschnittWert}>{abschnittWert} (0)</option> : null}
        {abschnitte.map((a) => (
          <option key={a.abschnitt} value={a.abschnitt}>
            {a.abschnitt} ({a.anzahl})
          </option>
        ))}
      </select>

      <select
        value={parameter.get('status') ?? ''}
        onChange={(e) => setze('status', e.target.value)}
        aria-label="Status"
      >
        <option value="">Jeder Status</option>
        <option value="entwurf">Entwurf</option>
        <option value="pruefung">In Prüfung</option>
        <option value="freigegeben">Freigegeben</option>
        <option value="zurueckgezogen">Zurückgezogen</option>
      </select>

      {hatFilter ? (
        <button
          type="button"
          onClick={() => {
            setzeSuche('')
            starte(() => router.replace('/bibliothek'))
          }}
          style={{ padding: '6px 11px' }}
        >
          Zurücksetzen
        </button>
      ) : null}

      <span className="treffer-zahl">
        {laeuft ? 'sucht …' : `${trefferzahl} ${trefferzahl === 1 ? 'Eintrag' : 'Einträge'}`}
      </span>
    </div>
  )
}

function baue(aktuell: URLSearchParams, aenderungen: Record<string, string>): string {
  const neu = new URLSearchParams(aktuell.toString())
  for (const [schluessel, wert] of Object.entries(aenderungen)) {
    if (wert) neu.set(schluessel, wert)
    else neu.delete(schluessel)
  }
  return neu.toString()
}
