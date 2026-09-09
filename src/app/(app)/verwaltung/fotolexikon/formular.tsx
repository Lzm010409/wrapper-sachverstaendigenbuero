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
 *
 * **Warum ein bestehender Eintrag eingeklappt startet.** Mit jedem Teil
 * wächst die Liste um eine volle Maske aus Namensfeld, vier Kästchen und
 * mindestens einer Beschädigungsart-Zeile — bei einer Handvoll Teilen schon
 * unübersichtlich. Eingeklappt zeigt eine Zeile, was zum Zusammensetzen
 * gebraucht wird; aufgeklappt wird nur, was gerade bearbeitet wird. Die
 * Maske für ein neues Teil bleibt davon ausgenommen — sie ist die einzige,
 * die ohnehin leer ist und sofort ausgefüllt werden soll.
 */

interface ZeileEingabe {
  begriff: string
  hinweis: string
}

const LEERE_ZEILE: ZeileEingabe = { begriff: '', hinweis: '' }

export function TeilFormular({ teil }: { teil?: FotoTeil }) {
  const [bearbeiten, setzeBearbeiten] = useState(!teil)
  const [name, setzeName] = useState(teil?.name ?? '')
  const [erkennungsmerkmal, setzeErkennungsmerkmal] = useState(teil?.erkennungsmerkmal ?? '')
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
      const ergebnis = await speichereFotoTeil(teil?.id, {
        name,
        seiten,
        erkennungsmerkmal,
        beschaedigungsarten: zeilen,
      })
      const meldung = ausErgebnis(ergebnis)
      if (meldung) melde(meldung)
      if (!ergebnis.fehler) {
        if (!teil) {
          // Neuanlage geglückt: Maske für den nächsten Eintrag leeren.
          setzeName('')
          setzeErkennungsmerkmal('')
          setzeSeiten([])
          setzeZeilen([LEERE_ZEILE])
        } else {
          // Geänderter Eintrag: zuklappen, dieselbe Ruhe wie die übrigen Zeilen.
          setzeBearbeiten(false)
        }
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

  /** Verwirft unabgespeicherte Änderungen und klappt wieder zu. */
  function verwerfe() {
    if (!teil) return
    setzeName(teil.name)
    setzeErkennungsmerkmal(teil.erkennungsmerkmal ?? '')
    setzeSeiten(teil.seiten)
    setzeZeilen(teil.beschaedigungsarten.length > 0 ? teil.beschaedigungsarten : [LEERE_ZEILE])
    setzeBearbeiten(false)
  }

  const kannSpeichern = name.trim().length > 0 && zeilen.some((z) => z.begriff.trim())

  if (teil && !bearbeiten) {
    const seitenText = teil.seiten.length > 0 ? teil.seiten.join('/') : 'ohne Seite'
    const begriffe = teil.beschaedigungsarten.map((b) => b.begriff).join(', ') || '—'
    return (
      <div
        className="karte"
        style={{ padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 10 }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <strong>{teil.name}</strong>{' '}
          <span className="unterzeile" style={{ margin: 0 }}>
            · {seitenText} · {begriffe}
          </span>
        </div>
        <button type="button" className="knopf-schlicht" onClick={() => setzeBearbeiten(true)}>
          Bearbeiten
        </button>
      </div>
    )
  }

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
        <label htmlFor={`teil-merkmal-${teil?.id ?? 'neu'}`}>Erkennungsmerkmal</label>
        <input
          id={`teil-merkmal-${teil?.id ?? 'neu'}`}
          type="text"
          value={erkennungsmerkmal}
          disabled={laeuft}
          placeholder="Wie unterscheidet sich dieses Teil optisch von Nachbarteilen? Optional, aber hilfreich bei leicht verwechselbaren Teilen."
          onChange={(e) => setzeErkennungsmerkmal(e.target.value)}
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
          Mehrere ankreuzen, wenn beide Seiten vorkommen können — ein Eintrag „Scheinwerfer&quot;
          mit links und rechts angekreuzt reicht für beide, kein zweiter Eintrag nötig. Keine
          angekreuzt: das Teil bekommt im Satz keine Seite, z. B. „Heckverkleidung plastisch
          verformt&quot;.
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
          <>
            <button type="button" className="gefahr" disabled={laeuft} onClick={loesche}>
              Löschen
            </button>
            <button type="button" className="knopf-schlicht" disabled={laeuft} onClick={verwerfe}>
              Zuklappen
            </button>
          </>
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
