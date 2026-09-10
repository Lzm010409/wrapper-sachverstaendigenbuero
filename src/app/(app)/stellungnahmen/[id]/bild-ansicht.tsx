'use client'

import { useCallback, useRef, useState } from 'react'
import { NodeViewContent, NodeViewWrapper, type NodeViewProps } from '@tiptap/react'
import { SATZSPIEGEL_CM } from '@/bilder/lesen'

/**
 * Ein Bild im Brief.
 *
 * Drei Dinge macht diese Ansicht: sie zeigt das Bild in der eingestellten
 * Breite, sie lässt es am Griff stufenlos ziehen, und sie hält darunter die
 * Beschriftung als gewöhnlichen Text des Dokuments bereit.
 *
 * Die Breite ist ein **Anteil des Satzspiegels**, keine Pixelzahl. Nur so
 * bedeutet sie im Word-Dokument dasselbe wie auf dem Schirm — dort zählen
 * Zentimeter, hier Bildpunkte, und der Anteil ist die gemeinsame Sprache.
 */
export function BildAnsicht({ node, updateAttributes, selected, editor }: NodeViewProps) {
  const bildId = String(node.attrs.bildId ?? '')
  const dateiname = String(node.attrs.dateiname ?? 'Bild')
  const gespeichert = Number(node.attrs.breite) || 0.68

  const [zieht, setzeZieht] = useState(false)
  const [breite, setzeBreite] = useState(gespeichert)
  const rahmen = useRef<HTMLDivElement | null>(null)

  // Während des Ziehens gilt der örtliche Wert, sonst der aus dem Dokument.
  // Ohne diese Trennung entstünde bei jeder Mausbewegung ein Schritt in der
  // Rückgängig-Kette; mit ihr genau einer je Zug.
  const wirksam = zieht ? breite : gespeichert

  const beginneZug = useCallback(
    (start: React.PointerEvent) => {
      if (!editor.isEditable) return
      start.preventDefault()
      start.stopPropagation()

      const flaeche = rahmen.current?.closest('.brief-flaeche') as HTMLElement | null
      const volleBreite = flaeche?.clientWidth ?? 700
      const anfangsBreite = (rahmen.current?.offsetWidth ?? volleBreite * gespeichert) / volleBreite
      const anfangsX = start.clientX

      let letzter = anfangsBreite
      setzeBreite(anfangsBreite)
      setzeZieht(true)

      const bewege = (e: PointerEvent) => {
        letzter = Math.min(1, Math.max(0.15, anfangsBreite + (e.clientX - anfangsX) / volleBreite))
        setzeBreite(letzter)
      }

      const beende = () => {
        window.removeEventListener('pointermove', bewege)
        window.removeEventListener('pointerup', beende)
        window.removeEventListener('pointercancel', beende)
        setzeZieht(false)
        updateAttributes({ breite: Number(letzter.toFixed(4)) })
      }

      /**
       * Die Zuhörer hängen am Fenster, nicht am Griff.
       *
       * Der Griff ist ein React-Element: sobald der Editor aus anderem
       * Grund neu zeichnet — etwa weil die Schreibmarke vorher in der
       * Beschriftung stand —, wird er ersetzt und nähme die an ihm
       * hängenden Zuhörer mit. Der Zug bräche mitten in der Bewegung ab,
       * ohne dass etwas passiert. Am Fenster überlebt er jedes Neuzeichnen.
       */
      window.addEventListener('pointermove', bewege)
      window.addEventListener('pointerup', beende)
      window.addEventListener('pointercancel', beende)
    },
    [editor.isEditable, gespeichert, updateAttributes],
  )

  const zentimeter = (wirksam * SATZSPIEGEL_CM).toFixed(1).replace('.', ',')

  return (
    <NodeViewWrapper
      as="figure"
      className={`d-bild ${selected ? 'gewaehlt' : ''} ${zieht ? 'zieht' : ''}`}
      data-bild-id={bildId}
    >
      <div className="d-bild-rahmen" ref={rahmen} style={{ width: `${wirksam * 100}%` }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`/api/bilder/${bildId}`} alt={dateiname} draggable={false} />

        <span
          className="d-bild-griff"
          onPointerDown={beginneZug}
          role="slider"
          tabIndex={0}
          aria-label={`Breite des Bildes: ${zentimeter} Zentimeter`}
          aria-valuemin={15}
          aria-valuemax={100}
          aria-valuenow={Math.round(wirksam * 100)}
          onKeyDown={(e) => {
            // Ohne Maus: Pfeiltasten in Schritten von einem Prozent.
            const schritt = e.key === 'ArrowRight' ? 0.01 : e.key === 'ArrowLeft' ? -0.01 : 0
            if (!schritt) return
            e.preventDefault()
            updateAttributes({
              breite: Number(Math.min(1, Math.max(0.15, gespeichert + schritt)).toFixed(4)),
            })
          }}
        />

        <span className="d-bild-mass" aria-hidden="true">
          {zentimeter} cm
        </span>
      </div>

      {/* `as` ist in den Typen auf wenige Elemente eingeschränkt; die
          Beschriftung gehört semantisch in ein figcaption. */}
      <NodeViewContent
        as={'figcaption' as 'div'}
        className="d-bild-unterschrift"
      />
    </NodeViewWrapper>
  )
}
