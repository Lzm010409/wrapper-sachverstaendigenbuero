'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import Link from 'next/link'
import { frageMeldungenAb, markiereGelesen } from '@/melden/aktionen'
import type { Gemeldet } from '@/melden/ablage'
import { rolleZu, type Meldung, type Meldungsart } from '@/melden/typen'

/**
 * Das Meldewesen der Anwendung — Einblendung, Verlauf und Glocke.
 *
 * **Der Gedanke dahinter:** Eine Meldung gehört dorthin, wo der Benutzer
 * gerade hinsieht. Bei einem Formularfehler ist das das Feld — dafür gibt es
 * `Meldung` in `meldung.tsx`, und daran ändert sich nichts. Bei allem, was
 * **den Blick verlassen kann**, ist es der Bildschirmrand:
 *
 * | Fall | Wo |
 * | --- | --- |
 * | Eingabefehler im Formular | am Formular |
 * | Ergebnis einer Aktion, die sofort zurückkommt | dort, wo geklickt wurde |
 * | Etwas, das im Hintergrund lief | Einblendung + Verlauf |
 * | Etwas, das lief, während man woanders war | Verlauf hinter der Glocke |
 *
 * **Wie lange eine Einblendung steht:** Erfolg und Auskunft verschwinden nach
 * sechs Sekunden von selbst — sie sind eine Bestätigung, keine Aufgabe.
 * Fehler und Warnungen bleiben stehen, bis sie weggeklickt werden. Was
 * schiefging, darf nicht davonhuschen, während man gerade woanders hinsieht.
 *
 * **Was aus dem Hintergrund kommt**, holt der Zeitgeber alle zwanzig
 * Sekunden vom Server — aber nur, solange der Reiter sichtbar ist. Ein
 * Fenster im Hintergrund fragt nicht.
 */

interface Melderwerte {
  /** Zeigt eine Einblendung. Für alles, was der Benutzer sofort erfährt. */
  melde: (meldung: Meldung) => void
  /** Der Verlauf für die Glocke — sie steht in der Kopfleiste, nicht hier. */
  gemeldet: Gemeldet[]
  ungelesen: number
  verlaufOffen: boolean
  schalteVerlauf: () => void
}

const MelderKontext = createContext<Melderwerte | null>(null)

/**
 * Zugriff auf die Einblendungen.
 *
 * Ohne umgebenden `Melder` tut `melde()` nichts, statt zu werfen: eine
 * Komponente soll auch in einem Test oder einer Vorschau ohne den ganzen
 * Rahmen zu zeichnen sein.
 */
export function useMelder(): Melderwerte {
  return (
    useContext(MelderKontext) ?? {
      melde: () => {},
      gemeldet: [],
      ungelesen: 0,
      verlaufOffen: false,
      schalteVerlauf: () => {},
    }
  )
}

interface Einblendung extends Meldung {
  id: string
  /** Verweis, wenn die Meldung irgendwohin führt. */
  verweis?: string | null
}

/** Wie lange eine Einblendung steht, je Art. `null` heisst: bis zum Wegklicken. */
const VERWEILDAUER: Record<Meldungsart, number | null> = {
  erfolg: 6000,
  info: 6000,
  warnung: null,
  fehler: null,
}

const ABFRAGE_MS = 20000

export function Melder({ children }: { children: React.ReactNode }) {
  const [einblendungen, setzeEinblendungen] = useState<Einblendung[]>([])
  const [gemeldet, setzeGemeldet] = useState<Gemeldet[]>([])
  const [offen, setzeOffen] = useState(false)
  // Was schon eingeblendet wurde, wird beim nächsten Abfragen nicht erneut
  // gezeigt — sonst käme dieselbe Meldung alle zwanzig Sekunden wieder.
  const gezeigt = useRef<Set<string>>(new Set())
  const ersteAbfrage = useRef(true)

  const schliesse = useCallback((id: string) => {
    setzeEinblendungen((alt) => alt.filter((e) => e.id !== id))
  }, [])

  const melde = useCallback((meldung: Meldung) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    setzeEinblendungen((alt) => [...alt, { ...meldung, id }])
  }, [])

  /* --- Meldungen aus dem Hintergrund ------------------------------------ */

  const hole = useCallback(async () => {
    const liste = await frageMeldungenAb().catch(() => null)
    if (!liste) return
    setzeGemeldet(liste)

    // Beim ersten Mal wird nichts eingeblendet: sonst poppte beim Öffnen der
    // Anwendung alles auf, was seit gestern liegengeblieben ist. Der Zähler
    // an der Glocke sagt es leiser.
    const zeigen = !ersteAbfrage.current
    ersteAbfrage.current = false
    for (const m of liste) {
      if (gezeigt.current.has(m.id)) continue
      gezeigt.current.add(m.id)
      if (zeigen && !m.gelesen) {
        melde({ art: m.art, titel: m.titel, text: m.text })
      }
    }
  }, [melde])

  useEffect(() => {
    /*
      Der Prüfer meldet hier „setState im Effekt". Das ist genau der Fall,
      den er in seiner eigenen Begründung ausnimmt: an ein fremdes System
      anschliessen und den Stand im Rückruf setzen. `hole` setzt nichts
      synchron — die erste Anweisung ist ein `await`. Bewusst stehen
      gelassen statt umgebaut, damit der Umbau nicht die Absicht verdeckt.
    */
    void hole()
    const uhr = setInterval(() => {
      // Ein Fenster im Hintergrund fragt nicht — das spart dem Server die
      // Arbeit für Reiter, die niemand ansieht.
      if (document.visibilityState === 'visible') void hole()
    }, ABFRAGE_MS)
    return () => clearInterval(uhr)
  }, [hole])

  const ungelesen = gemeldet.filter((m) => !m.gelesen).length

  async function schalteVerlauf() {
    const jetztOffen = !offen
    setzeOffen(jetztOffen)
    if (jetztOffen && ungelesen > 0) {
      setzeGemeldet((alt) => alt.map((m) => ({ ...m, gelesen: true })))
      await markiereGelesen().catch(() => {})
    }
  }

  const werte = useMemo(
    () => ({
      melde,
      gemeldet,
      ungelesen,
      verlaufOffen: offen,
      schalteVerlauf: () => void schalteVerlauf(),
    }),
    // `schalteVerlauf` hängt an `offen` und `ungelesen` und wird ohnehin bei
    // jeder Änderung neu gebaut; die Abhängigkeitsliste bildet das ab.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [melde, gemeldet, ungelesen, offen],
  )

  return (
    <MelderKontext.Provider value={werte}>
      {children}
      <Einblendstapel einblendungen={einblendungen} schliesse={schliesse} />
    </MelderKontext.Provider>
  )
}

/* ---------------- Einblendungen ---------------- */

function Einblendstapel({
  einblendungen,
  schliesse,
}: {
  einblendungen: Einblendung[]
  schliesse: (id: string) => void
}) {
  if (einblendungen.length === 0) return null
  return (
    <div className="einblendstapel">
      {einblendungen.map((e) => (
        <Einblendkarte key={e.id} einblendung={e} schliesse={schliesse} />
      ))}
    </div>
  )
}

function Einblendkarte({
  einblendung,
  schliesse,
}: {
  einblendung: Einblendung
  schliesse: (id: string) => void
}) {
  const dauer = VERWEILDAUER[einblendung.art]

  useEffect(() => {
    if (dauer === null) return
    const uhr = setTimeout(() => schliesse(einblendung.id), dauer)
    return () => clearTimeout(uhr)
  }, [dauer, einblendung.id, schliesse])

  return (
    <div className={`einblendung e-${einblendung.art}`} role={rolleZu(einblendung.art)}>
      <span className="einblendung-punkt" aria-hidden="true" />
      <div className="einblendung-inhalt">
        {einblendung.titel ? <strong>{einblendung.titel}</strong> : null}
        <span>{einblendung.text}</span>
      </div>
      <button
        type="button"
        className="einblendung-schliessen"
        onClick={() => schliesse(einblendung.id)}
        aria-label="Meldung schliessen"
      >
        ✕
      </button>
    </div>
  )
}

/* ---------------- Glocke und Verlauf ---------------- */

/**
 * Die Glocke gehört in die Kopfleiste, neben Benutzer und
 * Erscheinungsschalter — nicht an eine feste Bildschirmecke, die mit dem
 * Benutzernamen kollidiert, sobald er lang genug ist.
 */
export function Meldungsglocke() {
  const { gemeldet, ungelesen, verlaufOffen: offen, schalteVerlauf: schalte } = useMelder()
  return (
    <div className="glocke-halter">
      <button
        type="button"
        className="glocke"
        onClick={schalte}
        aria-expanded={offen}
        aria-label={
          ungelesen > 0 ? `Meldungen, ${ungelesen} ungelesen` : 'Meldungen'
        }
      >
        <span aria-hidden="true">🔔</span>
        {ungelesen > 0 ? <span className="glocke-zahl">{ungelesen > 9 ? '9+' : ungelesen}</span> : null}
      </button>

      {offen ? (
        <div className="verlauf">
          <div className="verlauf-kopf">Meldungen</div>
          {gemeldet.length === 0 ? (
            <p className="verlauf-leer">
              Nichts vorgefallen. Hier stehen Läufe, die im Hintergrund fertig wurden oder
              gescheitert sind.
            </p>
          ) : (
            <ul className="verlauf-liste">
              {gemeldet.map((m) => (
                <li key={m.id} className={`verlauf-eintrag v-${m.art}`}>
                  <span className="verlauf-punkt" aria-hidden="true" />
                  <div>
                    <div className="verlauf-titel">
                      {m.verweis ? (
                        <Link href={m.verweis} onClick={schalte}>
                          {m.titel}
                        </Link>
                      ) : (
                        m.titel
                      )}
                    </div>
                    <div className="verlauf-text">{m.text}</div>
                    <div className="verlauf-zeit">{zeitpunkt(m.erstelltAm)}</div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  )
}

/** „vor 4 Minuten" statt eines Zeitstempels — die Frage ist, wie frisch es ist. */
function zeitpunkt(iso: string): string {
  const dann = new Date(iso).getTime()
  const sekunden = Math.max(0, Math.round((Date.now() - dann) / 1000))
  if (sekunden < 60) return 'gerade eben'
  const minuten = Math.round(sekunden / 60)
  if (minuten < 60) return `vor ${minuten} Minute${minuten === 1 ? '' : 'n'}`
  const stunden = Math.round(minuten / 60)
  if (stunden < 24) return `vor ${stunden} Stunde${stunden === 1 ? '' : 'n'}`
  return new Date(iso).toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}
