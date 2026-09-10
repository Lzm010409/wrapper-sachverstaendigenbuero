'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { speichereText, type AktionsErgebnis } from '@/bibliothek/aktionen'
import { Meldung } from '@/app/teile/meldung'
import { Kreisel } from '@/app/teile/anzeigen'

/**
 * Die Texte eines Eintrags — lesen und ändern an derselben Stelle.
 *
 * **Warum das hier steht und nicht auf einer eigenen Seite.** Wer einen
 * Baustein ändert, will vorher lesen, was dasteht, und danach sehen, was
 * daraus geworden ist. Ein Sprung auf eine Bearbeitungsseite und zurück
 * nimmt beides auseinander.
 *
 * **Was nicht hierher gehört.** Bereich, Abschnitt und Nummer sind die
 * Einordnung des Eintrags; sie im Vorbeigehen zu ändern hiesse, die
 * Gliederung der Bibliothek beiläufig umzustellen. Varianten, Ergänzungen
 * und Fundstellen haben ihre eigenen Wege — sie stehen als `children`
 * unverändert darunter.
 */

interface Texte {
  typischeBegruendung: string | null
  gegenargument: string | null
  vorgehen: string | null
  hinweise: string | null
}

export function Textbearbeitung({
  id,
  status,
  texte,
  children,
}: {
  id: string
  status: string
  texte: Texte
  children?: React.ReactNode
}) {
  const router = useRouter()
  const [bearbeitet, setzeBearbeitet] = useState(false)
  const [laeuft, starte] = useTransition()
  const [rueckmeldung, setzeRueckmeldung] = useState<AktionsErgebnis | null>(null)
  const [entwurf, setzeEntwurf] = useState(() => alsFelder(texte))

  const oeffne = () => {
    // Der Bearbeitungsstand kommt frisch aus den Eigenschaften: Nach einem
    // Speichern und einem erneuten Öffnen stünde sonst der alte Text da.
    setzeEntwurf(alsFelder(texte))
    setzeRueckmeldung(null)
    setzeBearbeitet(true)
  }

  const speichere = () => {
    starte(async () => {
      const ergebnis = await speichereText(id, entwurf)
      setzeRueckmeldung(ergebnis)
      if (!ergebnis.fehler) {
        setzeBearbeitet(false)
        // Die Seite lädt neu, weil die Änderung mehr betrifft als diese
        // Blöcke: Platzhalter, Fundstellen und womöglich der Status in der
        // Randspalte hängen am Text.
        router.refresh()
      }
    })
  }

  const aendere = (feld: keyof Felder) => (wert: string) =>
    setzeEntwurf((bisher) => ({ ...bisher, [feld]: wert }))

  if (!bearbeitet) {
    return (
      <>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
          <button type="button" onClick={oeffne}>
            Texte bearbeiten
          </button>
        </div>

        {rueckmeldung?.erfolg ? (
          <Meldung art="erfolg" style={{ marginBottom: 16 }}>
            {rueckmeldung.erfolg}
          </Meldung>
        ) : null}

        {texte.typischeBegruendung ? (
          <div className="block">
            <div className="block-label">Typische Begründung des Prüfdienstleisters</div>
            <div className="karte fliesstext" style={{ fontStyle: 'italic' }}>
              {texte.typischeBegruendung}
            </div>
          </div>
        ) : null}

        {texte.gegenargument?.trim() ? (
          <div className="block">
            <div className="block-label">Gegenargument</div>
            <div className="zitat fliesstext">{texte.gegenargument}</div>
          </div>
        ) : (
          /*
            Ein leeres Gegenargument darf nicht einfach als Lücke erscheinen:
            sonst sieht der Leser nur, dass etwas fehlt, aber nicht, ob es
            fehlt oder nie da war.
          */
          <div className="block">
            <div className="block-label">Gegenargument</div>
            <div className="hinweis warn">
              Kein ausformulierter Text hinterlegt.
              {texte.vorgehen?.trim()
                ? ' Es gibt nur das Vorgehen unten — daraus ist im Einzelfall selbst zu formulieren.'
                : ' Dieser Eintrag liefert nichts, was sich übernehmen liesse.'}
            </div>
          </div>
        )}

        {texte.vorgehen ? (
          <div className="block">
            <div className="block-label">
              Vorgehen
              <span className="marke-pille m-akzent">kein fertiger Text</span>
            </div>
            <div className="karte fliesstext">{texte.vorgehen}</div>
          </div>
        ) : null}

        {children}

        {texte.hinweise ? (
          <div className="block">
            <div className="block-label">
              Interne Hinweise
              <span className="marke-pille m-warn">nie im Schreiben</span>
            </div>
            <div className="intern fliesstext">{texte.hinweise}</div>
          </div>
        ) : null}
      </>
    )
  }

  return (
    <>
      {status === 'freigegeben' ? (
        <Meldung art="warnung" style={{ marginBottom: 16 }}>
          Dieser Eintrag ist freigegeben. Eine Textänderung setzt ihn zurück auf „Entwurf“ — die
          Freigabe bezog sich auf den bisherigen Wortlaut.
        </Meldung>
      ) : null}

      <div className="block">
        <div className="block-label">Typische Begründung des Prüfdienstleisters</div>
        <textarea
          value={entwurf.typischeBegruendung}
          onChange={(e) => aendere('typischeBegruendung')(e.target.value)}
          rows={3}
        />
      </div>

      <div className="block">
        <div className="block-label">Gegenargument</div>
        <textarea
          value={entwurf.gegenargument}
          onChange={(e) => aendere('gegenargument')(e.target.value)}
          rows={8}
          placeholder="Einzusetzende Werte in eckige Klammern: [Betrag]"
        />
      </div>

      <div className="block">
        <div className="block-label">
          Vorgehen
          <span className="marke-pille m-akzent">kein fertiger Text</span>
        </div>
        <textarea
          value={entwurf.vorgehen}
          onChange={(e) => aendere('vorgehen')(e.target.value)}
          rows={4}
        />
      </div>

      <div className="block">
        <div className="block-label">
          Interne Hinweise
          <span className="marke-pille m-warn">nie im Schreiben</span>
        </div>
        <textarea
          value={entwurf.hinweise}
          onChange={(e) => aendere('hinweise')(e.target.value)}
          rows={3}
        />
      </div>

      {rueckmeldung?.fehler ? (
        <Meldung art="fehler" style={{ marginTop: 16 }}>
          {rueckmeldung.fehler}
        </Meldung>
      ) : null}

      <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
        <button type="button" className="haupt" disabled={laeuft} onClick={speichere}>
          {laeuft ? <Kreisel text="Wird gespeichert …" /> : 'Speichern'}
        </button>
        <button type="button" disabled={laeuft} onClick={() => setzeBearbeitet(false)}>
          Abbrechen
        </button>
      </div>

      <p className="unterzeile">
        Platzhalter und Fundstellen zieht die Anwendung nach dem Speichern aus dem Text nach.
      </p>

      {children}
    </>
  )
}

interface Felder {
  typischeBegruendung: string
  gegenargument: string
  vorgehen: string
  hinweise: string
}

/** Leere Spalten sind `null`; im Formular ist die leere Zeichenkette gemeint. */
function alsFelder(texte: Texte): Felder {
  return {
    typischeBegruendung: texte.typischeBegruendung ?? '',
    gegenargument: texte.gegenargument ?? '',
    vorgehen: texte.vorgehen ?? '',
    hinweise: texte.hinweise ?? '',
  }
}
