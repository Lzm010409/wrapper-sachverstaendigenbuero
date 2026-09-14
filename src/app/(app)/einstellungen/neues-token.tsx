'use client'

import { useState, useTransition } from 'react'
import { erzeugeMeinApiToken } from '@/einstellungen/aktionen'
import { API_TOKEN_ABLAEUFE, type ApiTokenAblauf } from '@/auth/api-token-typen'
import { useMelder } from '@/app/teile/melder'
import { fehler as alsFehler } from '@/melden/typen'
import { Kreisel } from '@/app/teile/anzeigen'

/**
 * Ein Token erzeugen — und den Klartext genau einmal zeigen.
 *
 * Danach steht in der Datenbank nur noch der Hash; wer das Fenster schliesst,
 * ohne zu kopieren, muss ein neues Token erzeugen. Das ist Absicht: ein
 * Token, das sich später wieder anzeigen liesse, wäre in der Datenbank im
 * Klartext gespeichert.
 */
export function NeuesApiToken() {
  const [name, setzeName] = useState('')
  const [ablauf, setzeAblauf] = useState<ApiTokenAblauf>('90-tage')
  const [klartext, setzeKlartext] = useState<string | null>(null)
  const [laeuft, starte] = useTransition()
  const { melde } = useMelder()

  function erzeuge() {
    starte(async () => {
      const ergebnis = await erzeugeMeinApiToken(name, ablauf)
      if (ergebnis.fehler) {
        melde(alsFehler(ergebnis.fehler))
        return
      }
      setzeKlartext(ergebnis.klartext ?? null)
      setzeName('')
    })
  }

  if (klartext) {
    return (
      <div className="hinweis warn">
        <p>
          <strong>Token erzeugt — es wird jetzt nur dieses eine Mal angezeigt:</strong>
        </p>
        <pre style={{ userSelect: 'all', overflowX: 'auto', margin: '8px 0' }}>{klartext}</pre>
        <p className="unterzeile" style={{ margin: 0 }}>
          Jetzt kopieren und sicher ablegen — danach lässt es sich nicht wieder anzeigen.
        </p>
        <button
          type="button"
          className="knopf-schlicht"
          style={{ marginTop: 8 }}
          onClick={() => setzeKlartext(null)}
        >
          Verstanden
        </button>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
      <div className="feld" style={{ flex: '1 1 220px' }}>
        <label htmlFor="token-name">Name</label>
        <input
          id="token-name"
          type="text"
          value={name}
          disabled={laeuft}
          placeholder="z. B. n8n Sync"
          onChange={(e) => setzeName(e.target.value)}
        />
      </div>
      <div className="feld" style={{ flex: '0 0 160px' }}>
        <label htmlFor="token-ablauf">Läuft ab</label>
        <select
          id="token-ablauf"
          value={ablauf}
          disabled={laeuft}
          onChange={(e) => setzeAblauf(e.target.value as ApiTokenAblauf)}
        >
          {API_TOKEN_ABLAEUFE.map((a) => (
            <option key={a.wert} value={a.wert}>
              {a.text}
            </option>
          ))}
        </select>
      </div>
      <button
        type="button"
        className="knopf haupt"
        disabled={laeuft || !name.trim()}
        onClick={erzeuge}
      >
        {laeuft ? <Kreisel /> : 'Erzeugen'}
      </button>
    </div>
  )
}
