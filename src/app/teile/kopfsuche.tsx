'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { sucheGlobal } from '@/suche/aktionen'
import { MINDESTLAENGE, type Suchergebnis, type Trefferart } from '@/suche/typen'

/**
 * Ein Feld für alles.
 *
 * **Warum in der Kopfleiste und nicht auf einer Seite.** Man sucht mitten in
 * einer anderen Tätigkeit: „wie hiess der Fall zu dem Kennzeichen noch mal".
 * Eine Suchseite, zu der man erst navigieren muss, unterbricht genau das,
 * wofür man sucht.
 *
 * **Getippt wird schneller, als die Datenbank antwortet.** Jede Eingabe
 * sofort abzuschicken hiesse bei „Krilavicius" zwölf Abfragen über vier
 * Tabellen, von denen elf schon veraltet sind, wenn sie ankommen. Deshalb
 * 250 ms Ruhe vor der Abfrage — und eine Zählung, die späte Antworten auf
 * ältere Eingaben verwirft.
 *
 * **Bedienbar ohne Maus:** Strg+K oder das Schrägstrich-Zeichen öffnet,
 * Pfeiltasten wählen, Eingabetaste springt hin, Escape schliesst.
 */

const BESCHRIFTUNG: Record<Trefferart, string> = {
  fall: 'Fälle',
  stellungnahme: 'Stellungnahmen',
  eintrag: 'Argumentbibliothek',
  bild: 'Bildbibliothek',
}

const LEER: Suchergebnis = { begriff: '', treffer: [], mehr: false }

export function Kopfsuche() {
  const router = useRouter()
  const [begriff, setzeBegriff] = useState('')
  const [ergebnis, setzeErgebnis] = useState<Suchergebnis>(LEER)
  const [offen, setzeOffen] = useState(false)
  const [markiert, setzeMarkiert] = useState(0)
  const [laeuft, starte] = useTransition()

  const feld = useRef<HTMLInputElement>(null)
  const huelle = useRef<HTMLDivElement>(null)
  // Zählt die Anfragen. Eine Antwort auf eine ältere Eingabe wird verworfen —
  // sonst überschreibt die langsame Abfrage zu „Kri" die schnelle zu
  // „Krilavicius", und in der Liste steht das Falsche.
  const laufendeNummer = useRef(0)

  useEffect(() => {
    const gesucht = begriff.trim()
    // Kein Zurücksetzen des Ergebnisses: welcher Eingabe es gehört, steht in
    // `ergebnis.begriff`, und daran entscheidet sich weiter unten, ob es
    // gezeigt wird. Ein `setState` an dieser Stelle wäre ein Renderlauf mehr
    // für einen Zustand, der ohnehin abgeleitet ist.
    if (gesucht.length < MINDESTLAENGE) return

    const nummer = ++laufendeNummer.current
    const uhr = setTimeout(() => {
      starte(async () => {
        const antwort = await sucheGlobal(gesucht)
        if (nummer === laufendeNummer.current) {
          setzeErgebnis(antwort)
          setzeMarkiert(0)
        }
      })
    }, 250)

    return () => clearTimeout(uhr)
  }, [begriff])

  // Tastenkürzel und Klick daneben. Beide hängen am Dokument, nicht am Feld:
  // das Kürzel soll von überall greifen, und ein Klick daneben ist per
  // Definition ausserhalb.
  useEffect(() => {
    function beiTaste(e: KeyboardEvent) {
      const ziel = e.target as HTMLElement | null
      const tippt =
        ziel?.tagName === 'INPUT' || ziel?.tagName === 'TEXTAREA' || ziel?.isContentEditable
      if (((e.ctrlKey || e.metaKey) && e.key === 'k') || (e.key === '/' && !tippt)) {
        e.preventDefault()
        feld.current?.focus()
        feld.current?.select()
      }
    }
    function beiKlick(e: MouseEvent) {
      if (!huelle.current?.contains(e.target as Node)) setzeOffen(false)
    }
    document.addEventListener('keydown', beiTaste)
    document.addEventListener('mousedown', beiKlick)
    return () => {
      document.removeEventListener('keydown', beiTaste)
      document.removeEventListener('mousedown', beiKlick)
    }
  }, [])

  const gesucht = begriff.trim()
  // Nur zeigen, was zur aktuellen Eingabe gehört. Sonst stünden für die
  // 250 ms bis zur nächsten Antwort die Treffer der vorigen Eingabe da — und
  // die sehen richtig aus.
  const aktuell = ergebnis.begriff === gesucht
  const treffer = aktuell ? ergebnis.treffer : []
  const zeigen = offen && gesucht.length >= MINDESTLAENGE

  function springe(index: number) {
    const ziel = treffer[index]
    if (!ziel) return
    setzeOffen(false)
    setzeBegriff('')
    router.push(ziel.pfad)
  }

  function beiTastendruck(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') {
      setzeOffen(false)
      feld.current?.blur()
      return
    }
    if (treffer.length === 0) return

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setzeMarkiert((m) => (m + 1) % treffer.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setzeMarkiert((m) => (m - 1 + treffer.length) % treffer.length)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      springe(markiert)
    }
  }

  /*
   * Die Gruppenüberschriften vorab bestimmen, statt beim Rendern eine
   * Variable fortzuschreiben. Eine Zuweisung mitten im JSX überlebt den
   * nächsten Durchlauf nicht verlässlich — React darf eine Liste teilweise
   * neu rendern, und dann steht die Überschrift an der falschen Stelle oder
   * gar nicht mehr da.
   */
  const zeilen = treffer.map((t, i) => ({
    treffer: t,
    index: i,
    neueArt: i === 0 || treffer[i - 1]?.art !== t.art,
  }))

  return (
    <div className="kopfsuche" ref={huelle}>
      <input
        ref={feld}
        type="search"
        value={begriff}
        onChange={(e) => {
          setzeBegriff(e.target.value)
          setzeOffen(true)
        }}
        onFocus={() => setzeOffen(true)}
        onKeyDown={beiTastendruck}
        placeholder="Suchen …"
        aria-label="Über alles suchen"
        // Ein Eingabefeld mit Vorschlagsliste ist eine `combobox`; auf einem
        // nackten `textbox` hat `aria-expanded` keine Bedeutung, und die
        // Vorleseprogramme kündigen die Liste gar nicht erst an.
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={zeigen}
        aria-controls="kopfsuche-liste"
        aria-activedescendant={
          zeigen && treffer[markiert] ? `treffer-${markiert}` : undefined
        }
        autoComplete="off"
      />

      {zeigen ? (
        <div className="kopfsuche-liste" id="kopfsuche-liste" role="listbox">
          {treffer.length === 0 ? (
            <p className="kopfsuche-leer">
              {laeuft || !aktuell ? 'Wird gesucht …' : `Nichts zu „${gesucht}" gefunden.`}
            </p>
          ) : (
            <>
              {zeilen.map(({ treffer: t, index, neueArt }) => (
                <div key={`${t.art}-${t.id}`}>
                  {neueArt ? <div className="kopfsuche-gruppe">{BESCHRIFTUNG[t.art]}</div> : null}
                  <button
                    type="button"
                    id={`treffer-${index}`}
                    role="option"
                    aria-selected={index === markiert}
                    className={`kopfsuche-treffer${index === markiert ? ' markiert' : ''}`}
                    onMouseEnter={() => setzeMarkiert(index)}
                    onClick={() => springe(index)}
                  >
                    <span className="kopfsuche-titel">{t.titel}</span>
                    {t.unterzeile ? (
                      <span className="kopfsuche-unterzeile">{t.unterzeile}</span>
                    ) : null}
                  </button>
                </div>
              ))}
              {ergebnis.mehr ? (
                <p className="kopfsuche-leer">
                  Es gibt mehr — such in der jeweiligen Liste weiter.
                </p>
              ) : null}
            </>
          )}
        </div>
      ) : null}
    </div>
  )
}
