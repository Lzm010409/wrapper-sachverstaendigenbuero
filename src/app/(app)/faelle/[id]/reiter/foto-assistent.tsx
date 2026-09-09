'use client'

import { useCallback, useEffect, useRef, useState, useTransition } from 'react'
import type { Foto } from '@/fotos/ansicht'
import type { Fotoanalyse, Fotovorschlag } from '@/fotos/vorschlag'
import { PFLICHT, kategoriename, luecken, type Kategorie } from '@/fotos/kategorien'
import { analysiereFotos, uebernimmVorschlag, verwirfVorschlag } from '@/fotos/analyse-aktionen'
import { useMelder } from '@/app/teile/melder'
import { ausErgebnis, fehler as alsFehler, erfolg } from '@/melden/typen'

/**
 * Der Fotoassistent im Reiter „Fotos".
 *
 * **Was er ist:** ein Vorschlag. Geschrieben wird nach autoiXpert erst,
 * wenn der Sachverständige übernimmt — Bild für Bild, im Prüfmodus.
 *
 * **Warum ein eigener Durchgang und keine Marken im Raster.** Ein Fall hat
 * 67 Fotos. Im Raster wären das 67 Mal öffnen, lesen, bestätigen, schliessen.
 * Der Prüfmodus zeigt ein Bild gross, den Vorschlag darunter und geht mit
 * der Pfeiltaste weiter; ein Durchgang statt 67 Umwege.
 *
 * **Warum der Lauf in Paketen und nicht in einem Aufruf.** Siehe
 * `src/fotos/analyse-aktionen.ts`: eine Anfrage über eine Minute überlebt
 * kein Proxy zuverlässig. Diese Schleife holt ein Paket nach dem anderen
 * und zeigt den echten Fortschritt statt eines Kreisels.
 */

/** Sicherung gegen eine Schleife, die nicht endet, wenn der Server nie `fertig` meldet. */
const HOECHSTENS_RUNDEN = 40

type Erledigt = Record<string, 'uebernommen' | 'verworfen'>

export function Fotoassistent({
  fallId,
  fotos,
  analyse,
  schreibenErlaubt,
  kiEingerichtet,
}: {
  fallId: string
  fotos: Foto[]
  analyse: Fotoanalyse | null
  schreibenErlaubt: boolean
  kiEingerichtet: boolean
}) {
  const { melde } = useMelder()
  const [laeuft, setzeLaeuft] = useState(false)
  const [stand, setzeStand] = useState<{ beschriftet: number; gesamt: number } | null>(null)
  const [erledigt, setzeErledigt] = useState<Erledigt>({})
  const [pruefung, setzePruefung] = useState<Fotovorschlag[] | null>(null)

  const nachId = new Map((analyse?.vorschlaege ?? []).map((v) => [v.fotoId, v]))
  const mitBild = fotos.filter((f) => nachId.has(f.id))

  // Für die Lückenmeldung zählt jede erkannte Kategorie — auch die der
  // Fotos, die längst beschriftet sind. Sonst meldete der Assistent eine
  // Lücke, die der Sachverständige selbst geschlossen hat.
  const fehlend = luecken(mitBild.map((f) => nachId.get(f.id)!.kategorie))

  const offene = mitBild
    .filter((f) => !f.beschreibung)
    .map((f) => nachId.get(f.id)!)
    .filter((v) => v.stand === 'offen' && !erledigt[v.fotoId])

  async function starte() {
    setzeLaeuft(true)
    try {
      for (let runde = 0; runde < HOECHSTENS_RUNDEN; runde += 1) {
        const fortschritt = await analysiereFotos(fallId)
        setzeStand({ beschriftet: fortschritt.beschriftet, gesamt: fortschritt.gesamt })
        if (fortschritt.fehler) {
          melde(alsFehler(fortschritt.fehler))
          break
        }
        if (fortschritt.fertig) {
          melde(erfolg(`${fortschritt.beschriftet} von ${fortschritt.gesamt} Fotos beschriftet.`))
          break
        }
      }
    } catch (ausnahme) {
      melde(alsFehler(ausnahme instanceof Error ? ausnahme.message : 'Der Lauf ist gescheitert.'))
    } finally {
      setzeLaeuft(false)
    }
  }

  return (
    <div className="assistent">
      <div className="assistent-kopf">
        <div>
          <strong>Fotoassistent</strong>
          <p className="unterzeile" style={{ margin: '2px 0 0' }}>
            {analyse
              ? `${mitBild.length} von ${fotos.length} Fotos analysiert · ${offene.length} Vorschläge offen`
              : 'Beschreibt die Fotos und prüft den Pflichtfotosatz. Übernommen wird nichts von allein.'}
          </p>
        </div>
        <div className="assistent-knoepfe">
          {offene.length > 0 ? (
            <button type="button" className="knopf haupt" onClick={() => setzePruefung(offene)}>
              {offene.length} Vorschläge durchgehen
            </button>
          ) : null}
          <button type="button" className="knopf" onClick={starte} disabled={laeuft || !kiEingerichtet}>
            {laeuft
              ? stand
                ? `Beschriftet ${stand.beschriftet} von ${stand.gesamt} …`
                : 'Läuft …'
              : analyse
                ? 'Erneut analysieren'
                : 'Fotos analysieren'}
          </button>
        </div>
      </div>

      {!kiEingerichtet ? (
        <p className="unterzeile" style={{ margin: '8px 0 0' }}>
          Die KI-Funktionen sind auf diesem Server nicht eingerichtet —{' '}
          <code>ANTHROPIC_API_KEY</code> fehlt.
        </p>
      ) : null}

      {analyse ? <Pflichtsatz fehlend={fehlend} /> : null}

      {pruefung ? (
        <Pruefmodus
          fallId={fallId}
          fotos={fotos}
          vorschlaege={pruefung}
          erledigt={erledigt}
          schreibenErlaubt={schreibenErlaubt}
          vermerke={(fotoId, wie) => setzeErledigt((alt) => ({ ...alt, [fotoId]: wie }))}
          schliesse={() => setzePruefung(null)}
        />
      ) : null}
    </div>
  )
}

/** Der Pflichtfotosatz als Liste — was da ist, was fehlt. */
function Pflichtsatz({ fehlend }: { fehlend: Kategorie[] }) {
  return (
    <ul className="pflichtsatz" aria-label="Pflichtfotosatz">
      {PFLICHT.map((k) => {
        const fehlt = fehlend.includes(k)
        return (
          <li key={k} className={fehlt ? 'fehlt' : 'da'}>
            <span aria-hidden="true">{fehlt ? '✕' : '✓'}</span>
            {kategoriename(k)}
            <span className="nur-vorlesen">{fehlt ? ' fehlt' : ' vorhanden'}</span>
          </li>
        )
      })}
    </ul>
  )
}

/**
 * Ein Bild, ein Vorschlag, weiter.
 *
 * Die Liste wird beim Öffnen eingefroren: würde sie mitwandern, sobald ein
 * Vorschlag übernommen ist, spränge der Index und man übersähe Bilder.
 * Erledigtes bleibt sichtbar und ist als solches gekennzeichnet.
 */
function Pruefmodus({
  fallId,
  fotos,
  vorschlaege,
  erledigt,
  schreibenErlaubt,
  vermerke,
  schliesse,
}: {
  fallId: string
  fotos: Foto[]
  vorschlaege: Fotovorschlag[]
  erledigt: Erledigt
  schreibenErlaubt: boolean
  vermerke: (fotoId: string, wie: 'uebernommen' | 'verworfen') => void
  schliesse: () => void
}) {
  const [stelle, setzeStelle] = useState(0)
  const vorschlag = vorschlaege[stelle]
  const foto = fotos.find((f) => f.id === vorschlag?.fotoId) ?? null

  const weiter = useCallback(
    (richtung: -1 | 1) => {
      setzeStelle((alt) => Math.min(Math.max(alt + richtung, 0), vorschlaege.length - 1))
    },
    [vorschlaege.length],
  )

  useEffect(() => {
    function taste(e: KeyboardEvent) {
      if (e.key === 'Escape') schliesse()
      if (e.key === 'ArrowRight') weiter(1)
      if (e.key === 'ArrowLeft') weiter(-1)
    }
    window.addEventListener('keydown', taste)
    return () => window.removeEventListener('keydown', taste)
  }, [schliesse, weiter])

  if (!vorschlag || !foto) return null

  return (
    <div className="foto-buehne" role="dialog" aria-modal="true" aria-label="Vorschläge durchgehen">
      <div className="foto-buehne-inhalt" onClick={(e) => e.stopPropagation()}>
        <div className="foto-buehne-bild">
          {/* eslint-disable-next-line @next/next/no-img-element -- das Bild
              kommt fertig skaliert von autoiXpert; `next/image` legte eine
              zweite Optimierung darüber, ohne etwas zu gewinnen. */}
          <img
            key={foto.id}
            src={`/api/faelle/${fallId}/fotos/${foto.id}?format=rendered`}
            alt={foto.titel}
          />
        </div>

        <div className="foto-buehne-leiste">
          <button type="button" onClick={() => weiter(-1)} aria-label="Vorheriger Vorschlag">
            ‹
          </button>
          <span className="foto-buehne-position">
            {stelle + 1} von {vorschlaege.length}
          </span>
          <button type="button" onClick={() => weiter(1)} aria-label="Nächster Vorschlag">
            ›
          </button>
          <span className="foto-buehne-titel">{kategoriename(vorschlag.kategorie)}</span>
          <span className="unterzeile">Sicherheit {vorschlag.sicherheit} %</span>
          <button type="button" onClick={schliesse} aria-label="Schliessen">
            ✕
          </button>
        </div>

        {/* Der Schlüssel setzt das Formular beim Blättern zurück — ohne
            Effekt, der die Felder von Hand nachzieht. */}
        <Vorschlagsformular
          key={vorschlag.fotoId}
          fallId={fallId}
          vorschlag={vorschlag}
          stand={erledigt[vorschlag.fotoId]}
          schreibenErlaubt={schreibenErlaubt}
          fertig={(wie) => {
            vermerke(vorschlag.fotoId, wie)
            if (stelle < vorschlaege.length - 1) weiter(1)
          }}
        />
      </div>
    </div>
  )
}

const HAEKCHEN: { schluessel: keyof Fotovorschlag['verwendung']; name: string }[] = [
  { schluessel: 'imGutachten', name: 'Im Gutachten' },
  { schluessel: 'inRestwertboerse', name: 'Restwertbörse' },
  { schluessel: 'inReparaturbestaetigung', name: 'Reparaturbestätigung' },
  { schluessel: 'inStellungnahme', name: 'Stellungnahme' },
]

function Vorschlagsformular({
  fallId,
  vorschlag,
  stand,
  schreibenErlaubt,
  fertig,
}: {
  fallId: string
  vorschlag: Fotovorschlag
  stand: 'uebernommen' | 'verworfen' | undefined
  schreibenErlaubt: boolean
  fertig: (wie: 'uebernommen' | 'verworfen') => void
}) {
  const [beschreibung, setzeBeschreibung] = useState(vorschlag.beschreibung)
  const [verwendung, setzeVerwendung] = useState(vorschlag.verwendung)
  const [laeuft, starte] = useTransition()
  const { melde } = useMelder()
  const feld = useRef<HTMLInputElement>(null)

  function uebernimm() {
    starte(async () => {
      try {
        const ergebnis = await uebernimmVorschlag(fallId, vorschlag.fotoId, beschreibung, verwendung)
        const meldung = ausErgebnis(ergebnis)
        if (meldung) melde(meldung)
        if (!ergebnis.fehler) fertig('uebernommen')
      } catch (ausnahme) {
        melde(
          alsFehler(ausnahme instanceof Error ? ausnahme.message : 'Die Übernahme ging nicht durch.'),
        )
      }
    })
  }

  function verwirf() {
    starte(async () => {
      await verwirfVorschlag(fallId, vorschlag.fotoId).catch(() => {})
      fertig('verworfen')
    })
  }

  return (
    <div className="foto-beschriftung assistent-formular">
      {/*
        Kein `flex: 1 1 320px` hier: `.assistent-formular` ist eine Spalte,
        und eine Flex-Basis von 320px wäre dort die **Höhe** — das Feld wuchs
        auf 320 Pixel und drückte das Bild aus der Bühne.
      */}
      <div className="feld">
        <label htmlFor={`vorschlag-${vorschlag.fotoId}`}>Beschreibung</label>
        <input
          id={`vorschlag-${vorschlag.fotoId}`}
          ref={feld}
          type="text"
          value={beschreibung}
          disabled={laeuft || !schreibenErlaubt}
          onChange={(e) => setzeBeschreibung(e.target.value)}
          // Die Eingabetaste übernimmt — sie ist im Feld die naheliegende
          // Geste, und der Durchgang lebt davon, dass man die Hand nicht
          // zwischen Tastatur und Maus wechseln muss.
          onKeyDown={(e) => {
            if (e.key === 'Enter' && schreibenErlaubt && beschreibung.trim()) {
              e.preventDefault()
              uebernimm()
            }
          }}
        />
      </div>

      <div className="foto-haekchen">
        {HAEKCHEN.map((h) => (
          <label key={h.schluessel}>
            <input
              type="checkbox"
              checked={verwendung[h.schluessel]}
              disabled={laeuft || !schreibenErlaubt}
              onChange={(e) => setzeVerwendung((alt) => ({ ...alt, [h.schluessel]: e.target.checked }))}
            />
            {h.name}
          </label>
        ))}
      </div>

      <div className="assistent-knoepfe">
        {stand ? (
          <span className="marke-pille m-akzent">
            {stand === 'uebernommen' ? 'Übernommen' : 'Verworfen'}
          </span>
        ) : null}
        <button type="button" className="knopf" onClick={verwirf} disabled={laeuft}>
          Verwerfen
        </button>
        <button
          type="button"
          className="knopf haupt"
          onClick={uebernimm}
          disabled={laeuft || !schreibenErlaubt || !beschreibung.trim()}
        >
          Übernehmen
        </button>
      </div>

      {!schreibenErlaubt ? (
        <p className="unterzeile" style={{ flexBasis: '100%', margin: 0 }}>
          Zum Übernehmen muss <code>AUTOIXPERT_SCHREIBEN=erlaubt</code> gesetzt und das Recht
          „Nach autoiXpert zurückschreiben“ vergeben sein.
        </p>
      ) : null}
    </div>
  )
}
