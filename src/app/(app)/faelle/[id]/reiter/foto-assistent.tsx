'use client'

import { useCallback, useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { Foto } from '@/fotos/ansicht'
import type { Fotoanalyse, Fotovorschlag } from '@/fotos/vorschlag'
import { PFLICHT, kategoriename, luecken, type Kategorie } from '@/fotos/kategorien'
import {
  frageAnalyseStandAb,
  setzeAnalyseZurueck,
  starteAnalyseLauf,
  uebernimmVorschlag,
  verwirfVorschlag,
} from '@/fotos/analyse-aktionen'
import { Meldung } from '@/app/teile/meldung'
import { useMelder } from '@/app/teile/melder'
import { ausErgebnis, fehler as alsFehler, info } from '@/melden/typen'

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
 * **Warum hier nur gefragt, nicht gewartet wird.** Der Lauf arbeitet im
 * Hintergrund weiter (siehe `analyse-aktionen.ts`, `fuehreAnalyseAus`) —
 * genau wie die WBW-Recherche. Diese Komponente fragt alle zwei Sekunden
 * nach dem Stand, solange er `laeuft`, und zeigt ihn an. Wer die Seite
 * wechselt oder schliesst, verliert damit nichts: der Lauf läuft weiter,
 * und das Cockpit meldet sich über die Glocke, wenn er fertig ist.
 */

const ABSTAND_MS = 2000

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
  const router = useRouter()
  const { melde } = useMelder()
  const [stand, setzeStand] = useState<Fotoanalyse | null>(analyse)
  const [startet, setzeStartet] = useState(false)
  const [setztZurueck, setzeSetztZurueck] = useState(false)
  const [erledigt, setzeErledigt] = useState<Erledigt>({})
  const [pruefung, setzePruefung] = useState<Fotovorschlag[] | null>(null)

  const laeuft = stand?.laufZustand === 'laeuft'

  const nachId = new Map((stand?.vorschlaege ?? []).map((v) => [v.fotoId, v]))
  const mitBild = fotos.filter((f) => nachId.has(f.id))

  // Für die Lückenmeldung zählt jede erkannte Kategorie — auch die der
  // Fotos, die längst beschriftet sind. Sonst meldete der Assistent eine
  // Lücke, die der Sachverständige selbst geschlossen hat.
  const fehlend = luecken(mitBild.map((f) => nachId.get(f.id)!.kategorie))

  const offene = mitBild
    .filter((f) => !f.beschreibung)
    .map((f) => nachId.get(f.id)!)
    .filter((v) => v.stand === 'offen' && !erledigt[v.fotoId])

  // Solange der Lauf arbeitet, alle zwei Sekunden nach seinem Stand fragen —
  // derselbe Aufbau wie bei der WBW-Recherche (`wbw-lauf.tsx`).
  useEffect(() => {
    if (!laeuft) return
    let abgebrochen = false

    const uhr = setInterval(() => {
      void frageAnalyseStandAb(fallId)
        .then((neu) => {
          if (abgebrochen) return
          setzeStand(neu)
          // Fertig oder gescheitert: die Serverdaten (Vorschläge, Pflichtsatz)
          // sind neu zu holen, nicht nur der Lauf-Zustand.
          if (neu?.laufZustand !== 'laeuft') router.refresh()
        })
        .catch(() => {
          // Ein verpasster Abruf ist kein Grund aufzugeben — beim nächsten
          // Mal steht der Stand wieder da.
        })
    }, ABSTAND_MS)

    return () => {
      abgebrochen = true
      clearInterval(uhr)
    }
  }, [laeuft, fallId, router])

  async function starte() {
    setzeStartet(true)
    try {
      const ergebnis = await starteAnalyseLauf(fallId)
      if (ergebnis.fehler) {
        melde(alsFehler(ergebnis.fehler))
        return
      }
      setzeStand(await frageAnalyseStandAb(fallId))
      melde(
        info(
          'Die Analyse läuft im Hintergrund weiter — Sie können die Seite wechseln oder ' +
            'schliessen. Das Cockpit meldet sich über die Glocke, wenn sie fertig ist.',
          'Analyse gestartet',
        ),
      )
    } catch (ausnahme) {
      melde(
        alsFehler(ausnahme instanceof Error ? ausnahme.message : 'Der Lauf liess sich nicht starten.'),
      )
    } finally {
      setzeStartet(false)
    }
  }

  async function zuruecksetzen() {
    if (
      !window.confirm(
        'Die gespeicherte Analyse dieses Falls verwerfen? Ein neuer Lauf schlägt für alle ' +
          'Fotos wieder etwas vor. Schon nach autoiXpert übernommene Beschriftungen bleiben ' +
          'davon unberührt — nur die hiesigen Vorschläge gehen verloren.',
      )
    ) {
      return
    }
    setzeSetztZurueck(true)
    try {
      const ergebnis = await setzeAnalyseZurueck(fallId)
      const meldung = ausErgebnis(ergebnis)
      if (meldung) melde(meldung)
      if (!ergebnis.fehler) {
        // Die Vorschläge, auf die sich diese Stände bezogen, gibt es nicht
        // mehr — sonst zeigte der Prüfmodus tote Einträge an.
        setzeErledigt({})
        setzePruefung(null)
        setzeStand(null)
        router.refresh()
      }
    } catch (ausnahme) {
      melde(alsFehler(ausnahme instanceof Error ? ausnahme.message : 'Das Zurücksetzen ging nicht.'))
    } finally {
      setzeSetztZurueck(false)
    }
  }

  return (
    <div className="assistent">
      <div className="assistent-kopf">
        <div>
          <strong>Fotoassistent</strong>
          <p className="unterzeile" style={{ margin: '2px 0 0' }}>
            {laeuft
              ? `Läuft im Hintergrund — ${stand?.vorschlaege.length ?? 0} von ${fotos.length} bisher beschriftet …`
              : stand
                ? `${mitBild.length} von ${fotos.length} Fotos analysiert · ${offene.length} Vorschläge offen`
                : 'Beschreibt die Fotos und prüft den Pflichtfotosatz. Übernommen wird nichts von allein.'}
          </p>
        </div>
        <div className="assistent-knoepfe">
          {offene.length > 0 ? (
            <button
              type="button"
              className="knopf haupt"
              // Die unsichersten Vorschläge zuerst — im Prüfmodus stehen sie
              // sonst am Ende, wo sie am ehesten überflogen werden.
              onClick={() => setzePruefung([...offene].sort((a, b) => a.sicherheit - b.sicherheit))}
            >
              {offene.length} Vorschläge durchgehen
            </button>
          ) : null}
          <button
            type="button"
            className="knopf"
            onClick={() => void starte()}
            disabled={laeuft || startet || setztZurueck || !kiEingerichtet}
            title={
              stand
                ? 'Ergänzt nur Fotos ohne Vorschlag. Für einen kompletten Neustart erst zurücksetzen.'
                : undefined
            }
          >
            {laeuft
              ? 'Läuft im Hintergrund …'
              : startet
                ? 'Wird gestartet …'
                : stand
                  ? 'Erneut analysieren'
                  : 'Fotos analysieren'}
          </button>
          {stand ? (
            <button
              type="button"
              className="knopf-schlicht"
              onClick={() => void zuruecksetzen()}
              disabled={laeuft || setztZurueck}
              title="Verwirft alle gespeicherten Vorschläge dieses Falls und beginnt beim nächsten Lauf neu."
            >
              {setztZurueck ? 'Wird zurückgesetzt …' : 'Zurücksetzen'}
            </button>
          ) : null}
        </div>
      </div>

      {!kiEingerichtet ? (
        <p className="unterzeile" style={{ margin: '8px 0 0' }}>
          Die KI-Funktionen sind auf diesem Server nicht eingerichtet —{' '}
          <code>ANTHROPIC_API_KEY</code> fehlt.
        </p>
      ) : null}

      {stand?.laufZustand === 'fehler' && stand.laufFehler ? (
        <Meldung art="fehler" style={{ marginTop: 10 }}>
          {stand.laufFehler}
        </Meldung>
      ) : null}

      {stand ? <Pflichtsatz fehlend={fehlend} /> : null}

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
          {/* Keine Warnfarbe mehr nötig: `assistent.ts` verwirft jeden
              Vorschlag unter 50 % Sicherheit serverseitig, ein Wert unter
              50 kommt hier also gar nicht mehr an. */}
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
