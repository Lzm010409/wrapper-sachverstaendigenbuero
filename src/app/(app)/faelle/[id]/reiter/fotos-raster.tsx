'use client'

import { useCallback, useEffect, useState, useTransition } from 'react'
import type { Foto } from '@/fotos/ansicht'
import { beschrifteFoto } from '@/fotos/aktionen'
import type { Fotoanalyse } from '@/fotos/vorschlag'
import { Fotoassistent } from './foto-assistent'
import { useMelder } from '@/app/teile/melder'
import { ausErgebnis, fehler as alsFehler } from '@/melden/typen'

/**
 * Das Fotoraster mit Grossansicht — nach dem Vorbild des Fotos-Reiters in
 * autoiXpert.
 *
 * **Ladezeit und Speicher.** Ein Fall hat schnell 67 Fotos. Am echten Fall
 * 0926/2081TG gemessen: Original 3,0 MB, Vorschaubild 50 KB. Alle Originale
 * wären 200 MB — für ein Raster, in dem jedes Bild 220 Pixel breit ist.
 * Deshalb drei Regeln, jede mit einer eigenen Wirkung:
 *
 * 1. **Im Raster nur Vorschaubilder** (400×300). 67 davon sind 3,4 MB statt
 *    200 MB.
 * 2. **`loading="lazy"` und feste Kachelhöhe.** Der Browser holt nur, was
 *    ins Blickfeld kommt — beim Öffnen also etwa zehn Bilder, nicht 67. Die
 *    feste Höhe verhindert, dass das Raster bei jedem eintreffenden Bild
 *    springt.
 * 3. **Das Original erst in der Grossansicht**, eines zur Zeit. Der
 *    Nachbar wird vorgeladen, damit das Blättern nicht stockt — aber nur
 *    der eine, nicht alle.
 *
 * Der Server legt Vorschaubilder auf der Platte ab (siehe
 * `src/fotos/speicher.ts`); das zweite Öffnen des Reiters kommt ohne einen
 * einzigen Abruf bei autoiXpert aus.
 */

type Filter = 'alle' | 'gutachten' | 'restwert' | 'stellungnahme'

const FILTER: { schluessel: Filter; name: string; passt: (f: Foto) => boolean }[] = [
  { schluessel: 'alle', name: 'Alle', passt: () => true },
  { schluessel: 'gutachten', name: 'Im Gutachten', passt: (f) => f.imGutachten },
  { schluessel: 'restwert', name: 'Restwertbörse', passt: (f) => f.inRestwertboerse },
  { schluessel: 'stellungnahme', name: 'Stellungnahme', passt: (f) => f.inStellungnahme },
]

export function Fotoraster({
  fallId,
  fotos,
  schreibenErlaubt,
  analyse,
  kiEingerichtet,
}: {
  fallId: string
  fotos: Foto[]
  schreibenErlaubt: boolean
  analyse: Fotoanalyse | null
  kiEingerichtet: boolean
}) {
  const [filter, setzeFilter] = useState<Filter>('alle')
  const [offen, setzeOffen] = useState<number | null>(null)

  const gewaehlt = FILTER.find((f) => f.schluessel === filter) ?? FILTER[0]!
  const sichtbar = fotos.filter(gewaehlt.passt)

  const blaettere = useCallback(
    (richtung: -1 | 1) => {
      setzeOffen((alt) => {
        if (alt === null) return null
        const neu = alt + richtung
        return neu < 0 || neu >= sichtbar.length ? alt : neu
      })
    },
    [sichtbar.length],
  )

  return (
    <div>
      {/*
        Der Schlüssel hängt am Zeitpunkt des Laufs: nach einer neuen Analyse
        baut React den Assistenten neu auf, und sein innerer Stand — was
        übernommen und was verworfen wurde — beginnt von vorn. Ohne das
        stünde nach dem zweiten Lauf noch der Fortschritt des ersten da.
      */}
      <Fotoassistent
        key={analyse?.erstelltAm ?? 'ohne-analyse'}
        fallId={fallId}
        fotos={fotos}
        analyse={analyse}
        schreibenErlaubt={schreibenErlaubt}
        kiEingerichtet={kiEingerichtet}
      />

      <div className="foto-leiste">
        <div className="foto-filter" role="group" aria-label="Fotos filtern">
          {FILTER.map((f) => {
            const anzahl = fotos.filter(f.passt).length
            return (
              <button
                key={f.schluessel}
                type="button"
                className={`foto-filterknopf ${filter === f.schluessel ? 'aktiv' : ''}`}
                onClick={() => setzeFilter(f.schluessel)}
                aria-pressed={filter === f.schluessel}
              >
                {f.name}
                <span className="foto-filterzahl">{anzahl}</span>
              </button>
            )
          })}
        </div>
        <span className="unterzeile">
          {sichtbar.length} von {fotos.length} Fotos
        </span>
      </div>

      {sichtbar.length === 0 ? (
        <div className="leer">
          <p style={{ margin: 0 }}>Kein Foto mit dieser Verwendung.</p>
        </div>
      ) : (
        <ul className="foto-raster">
          {sichtbar.map((foto, i) => (
            <li key={foto.id}>
              <button
                type="button"
                className="foto-kachel"
                onClick={() => setzeOffen(i)}
                aria-label={`${foto.titel} gross anzeigen`}
              >
                {/*
                  Feste Breite und Höhe am Bild selbst: der Browser hält den
                  Platz frei, bevor das Bild da ist. Ohne das springt das
                  Raster bei jedem eintreffenden Vorschaubild.
                */}
                {/* eslint-disable-next-line @next/next/no-img-element -- das
                    Vorschaubild kommt fertig mit 400×300 von autoiXpert;
                    `next/image` skalierte ein zweites Mal. */}
                <img
                  src={`/api/faelle/${fallId}/fotos/${foto.id}?format=thumbnail`}
                  alt={foto.titel}
                  loading="lazy"
                  decoding="async"
                  width={400}
                  height={300}
                />
                <span className="foto-kachel-titel">{foto.titel}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {offen !== null && sichtbar[offen] ? (
        <Grossansicht
          fallId={fallId}
          foto={sichtbar[offen]}
          nachbar={sichtbar[offen + 1] ?? null}
          position={`${offen + 1} von ${sichtbar.length}`}
          schliesse={() => setzeOffen(null)}
          blaettere={blaettere}
          schreibenErlaubt={schreibenErlaubt}
        />
      ) : null}
    </div>
  )
}

function Grossansicht({
  fallId,
  foto,
  nachbar,
  position,
  schliesse,
  blaettere,
  schreibenErlaubt,
}: {
  fallId: string
  foto: Foto
  nachbar: Foto | null
  position: string
  schliesse: () => void
  blaettere: (richtung: -1 | 1) => void
  schreibenErlaubt: boolean
}) {
  useEffect(() => {
    function taste(e: KeyboardEvent) {
      if (e.key === 'Escape') schliesse()
      if (e.key === 'ArrowRight') blaettere(1)
      if (e.key === 'ArrowLeft') blaettere(-1)
    }
    window.addEventListener('keydown', taste)
    return () => window.removeEventListener('keydown', taste)
  }, [schliesse, blaettere])

  return (
    <div
      className="foto-buehne"
      role="dialog"
      aria-modal="true"
      aria-label={foto.titel}
      onClick={schliesse}
    >
      {/* Der Klick auf das Bild soll nicht schliessen — nur der daneben. */}
      <div className="foto-buehne-inhalt" onClick={(e) => e.stopPropagation()}>
        {/*
          Der Schlüssel setzt den Ladezustand beim Blättern zurück, ohne dass
          ein Effekt ihn von Hand zurücksetzen müsste — das wäre eine
          Kaskade aus zwei Renderdurchläufen für etwas, das React von selbst
          kann.

          Vorangestelltes Präfix, weil `Beschriftung` weiter unten denselben
          `foto.id` als Schlüssel trägt: beide sind Geschwister in
          `.foto-buehne-inhalt`, und React verlangt eindeutige Schlüssel
          unter Geschwistern — unabhängig vom Elementtyp. Mit demselben
          Schlüssel für beide geriet die Zuordnung beim Blättern durcheinander,
          und das alte Bild blieb neben dem neuen stehen, statt zu weichen.
        */}
        <Buehnenbild key={`bild-${foto.id}`} fallId={fallId} foto={foto} nachbar={nachbar} />

        <div className="foto-buehne-leiste">
          <button type="button" onClick={() => blaettere(-1)} aria-label="Vorheriges Foto">
            ‹
          </button>
          <span className="foto-buehne-position">{position}</span>
          <button type="button" onClick={() => blaettere(1)} aria-label="Nächstes Foto">
            ›
          </button>
          <span className="foto-buehne-titel">{foto.titel}</span>
          <span className="unterzeile">
            {foto.breite && foto.hoehe ? `${foto.breite} × ${foto.hoehe}` : null}
            {foto.bytes ? ` · ${(foto.bytes / 1024 / 1024).toFixed(1)} MB` : null}
          </span>
          <a
            href={`/api/faelle/${fallId}/fotos/${foto.id}?format=original`}
            download={foto.dateiname ?? undefined}
            className="knopf-schlicht"
          >
            Original
          </a>
          <button type="button" onClick={schliesse} aria-label="Schliessen">
            ✕
          </button>
        </div>

        {/* Auch hier der Schlüssel statt eines zurücksetzenden Effekts. */}
        <Beschriftung key={`beschriftung-${foto.id}`} fallId={fallId} foto={foto} erlaubt={schreibenErlaubt} />
      </div>
    </div>
  )
}

/**
 * Das grosse Bild, mit Platzhalter bis es da ist.
 *
 * Eigene Komponente, damit der Ladezustand am Schlüssel hängt: beim Blättern
 * wird sie neu aufgebaut und `geladen` steht wieder auf `false`, ohne dass
 * ein Effekt das nachziehen müsste.
 */
function Buehnenbild({
  fallId,
  foto,
  nachbar,
}: {
  fallId: string
  foto: Foto
  nachbar: Foto | null
}) {
  const [geladen, setzeGeladen] = useState(false)
  return (
    <div className="foto-buehne-bild">
      {!geladen ? <span className="skelett foto-buehne-platzhalter" /> : null}
      {/* eslint-disable-next-line @next/next/no-img-element -- das Bild kommt
          bereits fertig skaliert von autoiXpert; `next/image` legte eine
          zweite Optimierung darüber, ohne etwas zu gewinnen. */}
      <img
        src={`/api/faelle/${fallId}/fotos/${foto.id}?format=rendered`}
        alt={foto.titel}
        onLoad={() => setzeGeladen(true)}
        style={{ opacity: geladen ? 1 : 0 }}
      />
      {/*
        Der nächste Nachbar wird still vorgeladen, damit das Blättern nicht
        bei jedem Bild von vorn beginnt. Bewusst nur einer: alle vorzuladen
        wäre genau das, was das Raster vermeidet.
      */}
      {nachbar ? (
        <link
          rel="preload"
          as="image"
          href={`/api/faelle/${fallId}/fotos/${nachbar.id}?format=rendered`}
        />
      ) : null}
    </div>
  )
}

const HAEKCHEN: { schluessel: keyof Foto; name: string }[] = [
  { schluessel: 'imGutachten', name: 'Im Gutachten' },
  { schluessel: 'inRestwertboerse', name: 'Restwertbörse' },
  { schluessel: 'inReparaturbestaetigung', name: 'Reparaturbestätigung' },
  { schluessel: 'inStellungnahme', name: 'Stellungnahme' },
]

/**
 * Beschreibung und Häkchen.
 *
 * Ohne schreibende Freigabe stehen die Werte da, aber unveränderlich — das
 * ist ehrlicher als ein Feld, das sich anfassen lässt und dann eine
 * Fehlermeldung zeigt.
 */
function Beschriftung({
  fallId,
  foto,
  erlaubt,
}: {
  fallId: string
  foto: Foto
  erlaubt: boolean
}) {
  // Der Anfangswert reicht: die Komponente wird beim Blättern über ihren
  // Schlüssel neu aufgebaut.
  const [beschreibung, setzeBeschreibung] = useState(foto.beschreibung ?? '')
  const [laeuft, starte] = useTransition()
  const { melde } = useMelder()

  function sichere(aenderung: Parameters<typeof beschrifteFoto>[2]) {
    starte(async () => {
      try {
        const ergebnis = await beschrifteFoto(fallId, foto.id, aenderung)
        const meldung = ausErgebnis(ergebnis)
        if (meldung) melde(meldung)
      } catch (ausnahme) {
        melde(
          alsFehler(
            ausnahme instanceof Error ? ausnahme.message : 'Die Änderung ging nicht durch.',
          ),
        )
      }
    })
  }

  if (!erlaubt) {
    return (
      <div className="foto-beschriftung">
        <div className="foto-haekchen">
          {HAEKCHEN.map((h) => (
            <span key={h.schluessel} className={`marke-pille ${foto[h.schluessel] ? 'm-akzent' : ''}`}>
              {h.name}
            </span>
          ))}
        </div>
        <span className="unterzeile">
          Zum Ändern muss <code>AUTOIXPERT_SCHREIBEN=erlaubt</code> gesetzt sein.
        </span>
      </div>
    )
  }

  return (
    <div className="foto-beschriftung">
      <div className="feld">
        <label htmlFor={`foto-text-${foto.id}`}>Beschreibung</label>
        <input
          id={`foto-text-${foto.id}`}
          type="text"
          value={beschreibung}
          disabled={laeuft}
          onChange={(e) => setzeBeschreibung(e.target.value)}
          // Gespeichert wird beim Verlassen des Feldes, nicht bei jedem
          // Tastendruck: sonst ginge je Buchstabe eine Anfrage an autoiXpert.
          onBlur={() => {
            if (beschreibung !== (foto.beschreibung ?? '')) sichere({ beschreibung })
          }}
        />
      </div>
      <div className="foto-haekchen">
        {HAEKCHEN.map((h) => (
          <label key={h.schluessel}>
            <input
              type="checkbox"
              checked={Boolean(foto[h.schluessel])}
              disabled={laeuft}
              onChange={(e) => sichere({ [h.schluessel]: e.target.checked })}
            />
            {h.name}
          </label>
        ))}
      </div>
    </div>
  )
}
