'use client'

import { useState, useTransition } from 'react'
import { SEITEN, type FotoTeil, type Seite } from '@/fotos/lexikon'
import { loescheFotoTeil, speichereFotoTeil } from '@/fotos/lexikon-aktionen'
import { useMelder } from '@/app/teile/melder'
import { ausErgebnis } from '@/melden/typen'

/**
 * Ein Teil anlegen oder ändern — dieselbe Maske für beide Fälle.
 *
 * **Warum eine Zeile immer stehen bleibt.** Ohne Beschädigungsart hat die KI
 * nichts zur Auswahl (`speichereFotoTeil` weist das serverseitig ab); die
 * letzte Zeile lässt sich deshalb nicht entfernen, nur leeren.
 */

interface ZeileEingabe {
  begriff: string
  hinweis: string
}

const LEERE_ZEILE: ZeileEingabe = { begriff: '', hinweis: '' }

export function TeilFormular({ teil }: { teil?: FotoTeil }) {
  const [name, setzeName] = useState(teil?.name ?? '')
  const [seiten, setzeSeiten] = useState<Seite[]>(teil?.seiten ?? [])
  const [zeilen, setzeZeilen] = useState<ZeileEingabe[]>(
    teil && teil.beschaedigungsarten.length > 0 ? teil.beschaedigungsarten : [LEERE_ZEILE],
  )
  const [laeuft, starte] = useTransition()
  const { melde } = useMelder()

  function schalteSeite(s: Seite, an: boolean) {
    setzeSeiten((alt) => (an ? [...alt, s] : alt.filter((x) => x !== s)))
  }

  function aendereZeile(index: number, feld: keyof ZeileEingabe, wert: string) {
    setzeZeilen((alt) => alt.map((z, i) => (i === index ? { ...z, [feld]: wert } : z)))
  }

  function entferneZeile(index: number) {
    setzeZeilen((alt) => (alt.length > 1 ? alt.filter((_, i) => i !== index) : alt))
  }

  function speichere() {
    starte(async () => {
      const ergebnis = await speichereFotoTeil(teil?.id, { name, seiten, beschaedigungsarten: zeilen })
      const meldung = ausErgebnis(ergebnis)
      if (meldung) melde(meldung)
      if (!ergebnis.fehler && !teil) {
        // Neuanlage geglückt: Maske für den nächsten Eintrag leeren.
        setzeName('')
        setzeSeiten([])
        setzeZeilen([LEERE_ZEILE])
      }
    })
  }

  function loesche() {
    if (!teil) return
    if (!window.confirm(`„${teil.name}" endgültig aus dem Lexikon entfernen?`)) return
    starte(async () => {
      const ergebnis = await loescheFotoTeil(teil.id)
      const meldung = ausErgebnis(ergebnis)
      if (meldung) melde(meldung)
    })
  }

  const kannSpeichern = name.trim().length > 0 && zeilen.some((z) => z.begriff.trim())

  return (
    <div className="karte">
      <div className="feld">
        <label htmlFor={`teil-name-${teil?.id ?? 'neu'}`}>Teil</label>
        <input
          id={`teil-name-${teil?.id ?? 'neu'}`}
          type="text"
          value={name}
          disabled={laeuft}
          placeholder="z. B. Seitenwand"
          onChange={(e) => setzeName(e.target.value)}
        />
      </div>

      <div className="feld" style={{ marginTop: 10 }}>
        <span style={{ fontSize: 11, color: 'var(--ink-soft)' }}>Seiten</span>
        <div className="feldgruppe">
          {SEITEN.map((s) => (
            <label key={s} style={{ fontSize: 13.5, color: 'var(--ink)', fontWeight: 400 }}>
              <input
                type="checkbox"
                checked={seiten.includes(s)}
                disabled={laeuft}
                onChange={(e) => schalteSeite(s, e.target.checked)}
              />{' '}
              {s}
            </label>
          ))}
        </div>
        <p className="unterzeile" style={{ margin: 0 }}>
          Keine angekreuzt: das Teil bekommt im Satz keine Seite, z. B. „Heckverkleidung
          plastisch verformt&quot;.
        </p>
      </div>

      <div className="feld" style={{ marginTop: 10 }}>
        <span style={{ fontSize: 11, color: 'var(--ink-soft)' }}>Beschädigungsarten</span>
        {zeilen.map((z, i) => (
          <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <input
              type="text"
              value={z.begriff}
              disabled={laeuft}
              placeholder="Wortlaut, z. B. deformiert"
              onChange={(e) => aendereZeile(i, 'begriff', e.target.value)}
              style={{ flex: '1 1 160px' }}
            />
            <input
              type="text"
              value={z.hinweis}
              disabled={laeuft}
              placeholder="Wann dieser Begriff zutrifft, für die KI"
              onChange={(e) => aendereZeile(i, 'hinweis', e.target.value)}
              style={{ flex: '2 1 260px' }}
            />
            <button
              type="button"
              className="knopf-schlicht"
              disabled={laeuft || zeilen.length === 1}
              aria-label="Diese Beschädigungsart entfernen"
              onClick={() => entferneZeile(i)}
            >
              ✕
            </button>
          </div>
        ))}
        <button
          type="button"
          className="knopf-schlicht"
          disabled={laeuft}
          style={{ alignSelf: 'flex-start' }}
          onClick={() => setzeZeilen((alt) => [...alt, LEERE_ZEILE])}
        >
          + Beschädigungsart
        </button>
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
        {teil ? (
          <button type="button" className="gefahr" disabled={laeuft} onClick={loesche}>
            Löschen
          </button>
        ) : null}
        <button
          type="button"
          className="knopf haupt"
          disabled={laeuft || !kannSpeichern}
          onClick={speichere}
        >
          {teil ? 'Speichern' : 'Anlegen'}
        </button>
      </div>
    </div>
  )
}
