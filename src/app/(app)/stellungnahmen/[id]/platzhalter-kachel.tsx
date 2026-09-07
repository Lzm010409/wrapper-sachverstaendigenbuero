'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react'

/**
 * Ein Platzhalter im Brief.
 *
 * Vorher stand hier gewöhnlicher Text in eckigen Klammern. Das las sich
 * nicht nur schlecht, es war auch brüchig: wer die schliessende Klammer
 * mitlöschte, hatte `[Kennzeichen` im Brief stehen — und Wächter R1, der
 * über die Klammern sucht, schwieg. Eine offene Angabe kam so bis in die
 * Word-Datei. Als Knoten lässt sich der Platzhalter nur ganz löschen.
 *
 * Zwei Arten, zwei Farben, zwei Handgriffe:
 *
 * - Ein **Wert** (`[Kennzeichen]`) wird eingesetzt. Was der Fall dazu
 *   hergibt, steht schon im Auswahlfeld — ein Klick, und der Platzhalter
 *   ist Text. Genau das ist der Punkt: danach gibt es ihn nicht mehr, und
 *   R1 hat nichts mehr zu melden.
 * - Eine **Regieanweisung** („Mit Screenshots belegen") wird *getan*, nicht
 *   eingesetzt. Sie kann nur bestätigt und entfernt werden.
 *
 * Der Kasten öffnet sich beim Klick und schliesst mit Esc, mit einem Klick
 * daneben oder nach dem Einsetzen. Die Werte des Falls kommen über die
 * Angaben der Erweiterung herein; sie stehen im Schreibtisch ohnehin bereit.
 */
export function PlatzhalterKachel({ node, editor, getPos, extension }: NodeViewProps) {
  const schluessel = String(node.attrs.schluessel ?? '')
  const art = node.attrs.art === 'regieanweisung' ? 'regieanweisung' : 'wert'

  const werte = (extension.options as { werte?: Record<string, string> }).werte ?? {}
  const vorschlag = findeWert(werte, schluessel)

  const [offen, setzeOffen] = useState(false)
  const [eingabe, setzeEingabe] = useState('')
  const huelle = useRef<HTMLSpanElement>(null)
  const feld = useRef<HTMLInputElement>(null)

  useLayoutEffect(() => {
    if (offen) feld.current?.focus()
  }, [offen])

  /*
    Schliessen bei einem Klick daneben und bei Esc. Beides hängt am
    Dokument, nicht am Kasten: ein Klick trifft sonst den Brief, der Kasten
    bliebe offen und verdeckte die Stelle, an der weitergeschrieben wird.
  */
  useEffect(() => {
    if (!offen) return
    const daneben = (e: MouseEvent) => {
      if (!huelle.current?.contains(e.target as Node)) setzeOffen(false)
    }
    const taste = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        setzeOffen(false)
        editor.commands.focus()
      }
    }
    document.addEventListener('mousedown', daneben)
    document.addEventListener('keydown', taste, true)
    return () => {
      document.removeEventListener('mousedown', daneben)
      document.removeEventListener('keydown', taste, true)
    }
  }, [offen, editor])

  /** Ersetzt den Knoten durch den Wert — danach ist es gewöhnlicher Text. */
  const setzeEin = (wert: string) => {
    const text = wert.trim()
    if (!text) return
    const stelle = typeof getPos === 'function' ? getPos() : null
    if (stelle === null || stelle === undefined) return
    /*
      Ausdrücklich als Textknoten und nicht als Zeichenkette: `insertContentAt`
      liest eine Zeichenkette als HTML. Ein Wert aus den Falldaten oder aus
      dem Eingabefeld — „Kotflügel <vorn>" etwa — käme sonst als Markup in
      den Brief statt als das, was dasteht.
    */
    editor
      .chain()
      .focus()
      .insertContentAt({ from: stelle, to: stelle + node.nodeSize }, { type: 'text', text })
      .run()
  }

  /** Entfernt den Knoten ersatzlos — für die erledigte Regieanweisung. */
  const entferne = () => {
    const stelle = typeof getPos === 'function' ? getPos() : null
    if (stelle === null || stelle === undefined) return
    editor.chain().focus().deleteRange({ from: stelle, to: stelle + node.nodeSize }).run()
  }

  return (
    <NodeViewWrapper as="span" className="platzhalter-huelle" ref={huelle}>
      <span
        className={`platzhalter ${art === 'regieanweisung' ? 'anweisung' : 'wert'} ${offen ? 'auf' : ''}`}
        role="button"
        tabIndex={0}
        title={
          art === 'regieanweisung'
            ? 'Arbeitsauftrag — gehört nicht in den Brief'
            : vorschlag
              ? `Aus dem Fall: ${vorschlag}`
              : 'Offene Angabe — der Fall gibt dazu nichts her'
        }
        onMouseDown={(e) => {
          e.preventDefault()
          setzeEingabe(vorschlag ?? '')
          setzeOffen((o) => !o)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            setzeEingabe(vorschlag ?? '')
            setzeOffen(true)
          }
        }}
      >
        {art === 'regieanweisung' ? '✎ ' : ''}
        {schluessel}
        {art === 'wert' && vorschlag ? <span className="platzhalter-punkt" aria-hidden /> : null}
      </span>

      {offen ? (
        <span className="platzhalter-kasten" contentEditable={false}>
          {art === 'regieanweisung' ? (
            <>
              <span className="platzhalter-titel">Arbeitsauftrag</span>
              <span className="platzhalter-text">{schluessel}</span>
              <span className="platzhalter-text unterzeile">
                Kein einzusetzender Wert, sondern etwas zu Tun. Er darf im versandten Schreiben
                nicht stehen bleiben.
              </span>
              <span className="platzhalter-knoepfe">
                <button type="button" className="haupt" onMouseDown={(e) => e.preventDefault()} onClick={entferne}>
                  Erledigt — entfernen
                </button>
              </span>
            </>
          ) : (
            <>
              <span className="platzhalter-titel">{schluessel}</span>
              {vorschlag ? (
                <button
                  type="button"
                  className="platzhalter-vorschlag"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => setzeEin(vorschlag)}
                >
                  <span className="unterzeile">Aus dem Fall</span>
                  <strong>{vorschlag}</strong>
                </button>
              ) : (
                <span className="platzhalter-text unterzeile">
                  Der Fall gibt zu dieser Angabe nichts her — bitte von Hand eintragen.
                </span>
              )}
              <span className="platzhalter-knoepfe">
                <input
                  ref={feld}
                  type="text"
                  value={eingabe}
                  placeholder="Wert eintragen"
                  onChange={(e) => setzeEingabe(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      setzeEin(eingabe)
                    }
                  }}
                />
                <button
                  type="button"
                  className="haupt"
                  disabled={!eingabe.trim()}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => setzeEin(eingabe)}
                >
                  Einsetzen
                </button>
              </span>
            </>
          )}
        </span>
      ) : null}
    </NodeViewWrapper>
  )
}

/**
 * Der Wert des Falls zu diesem Schlüssel.
 *
 * Gross- und Kleinschreibung wird ausdrücklich übergangen: die Bibliothek
 * schreibt `[Kennzeichen]`, die Falldaten liefern `Kennzeichen` — aber eben
 * auch mal `[kennzeichen]`. Dieselbe Nachsicht wie in `setzeWerteEin`.
 */
function findeWert(werte: Record<string, string>, schluessel: string): string | null {
  const direkt = werte[schluessel]
  if (direkt) return direkt
  const klein = schluessel.toLowerCase()
  for (const [k, v] of Object.entries(werte)) {
    if (k.toLowerCase() === klein) return v
  }
  return null
}
