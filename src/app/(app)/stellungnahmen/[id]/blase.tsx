'use client'

import { useState, useTransition } from 'react'
import { durchsucheBibliothek } from '@/stellungnahme/aktionen'
import { durchsucheBildbibliothek } from '@/bilder/aktionen'
import type { Bibliotheksbild } from '@/bilder/bibliothek'
import { setzeWerteEin } from '@/dokument/platzhalter'
import { MIME_BAUSTEIN, MIME_BILD, type Bildziehgut, type Ziehgut } from '@/dokument/ziehen'
import type { Herkunftsmarke } from '@/dokument/typen'
import type { Befund } from '@/export/waechter'
import { Kreisel } from '@/app/teile/anzeigen'

/**
 * Eine Anmerkung am Rand des Briefes.
 *
 * Die Blase ist kein zweiter Editor: was hier bearbeitet wird, ist der
 * Vorschlag, bevor er im Brief landet. Sobald er drin ist, wird er dort
 * weiterbearbeitet — der Brief bleibt die Hauptfläche.
 */

export interface PositionAnzeige {
  id: string
  bezeichnung: string
  betragGutachten: string | null
  betragGekuerzt: string | null
  differenz: string | null
  begruendungVersicherer: string | null
  behandlung: string
  seite: number | null
}

export interface Kandidat {
  eintragId: string
  nummer: string
  titel: string
  abschnitt: string
  status: string
  haeufigkeitText: string | null
  guete: string
  treffergruende: string[]
  passendeVarianten: { id: string; bezeichnung: string; text: string }[]
  text: string | null
  vorgehen: string | null
}

export interface Vorschlag {
  positionId: string
  besteGuete: string
  kandidaten: Kandidat[]
}

/**
 * Macht ein Element ziehbar.
 *
 * Der Knopf bleibt der verlässliche Weg — Ziehen ist die Abkürzung für die,
 * die sie mögen, und für niemanden Pflicht. Als Rückfall wandert der reine
 * Text mit, damit ein Baustein auch in einem anderen Fenster landen kann.
 */
function ziehbar(text: string, marke: Herkunftsmarke) {
  return {
    draggable: true,
    onDragStart: (e: React.DragEvent) => {
      if (!text.trim()) return
      const gut: Ziehgut = { text, marke }
      e.dataTransfer.setData(MIME_BAUSTEIN, JSON.stringify(gut))
      e.dataTransfer.setData('text/plain', text)
      e.dataTransfer.effectAllowed = 'copy'
      document.body.classList.add('zieht-baustein')
    },
    onDragEnd: () => document.body.classList.remove('zieht-baustein'),
  }
}

/** Der Griff, an dem sich ein bearbeiteter Entwurf in den Brief ziehen lässt. */
function Ziehgriff({ text, marke }: { text: string; marke: Herkunftsmarke }) {
  if (!text.trim()) return null
  return (
    <span
      className="ziehgriff"
      title="In den Brief ziehen und dort fallen lassen"
      aria-hidden="true"
      {...ziehbar(text, marke)}
    >
      ⠿ ziehen
    </span>
  )
}

const GUETE_TEXT: Record<string, string> = {
  direkt: 'Direkter Treffer',
  teilweise: 'Teiltreffer',
  kein: 'Kein Treffer',
}

function euro(wert: string | null): string {
  if (wert === null) return '—'
  const zahl = Number(wert)
  if (Number.isNaN(zahl)) return '—'
  return zahl.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })
}

export function Blase({
  position,
  ueberschrift,
  vorschlag,
  befunde,
  nummer,
  imBrief,
  hatText,
  aktiv,
  werte,
  kiAktiv,
  laeuft,
  aufAktivieren,
  aufEinfuegen,
  aufAusformulieren,
  aufHerausnehmen,
  aufAufnehmen,
  aufEntfernen,
  aufFundstelle,
  aufInBibliothek,
  aufBildEinfuegen,
}: {
  position: PositionAnzeige
  /**
   * Die Überschrift, wie sie im Brief steht.
   *
   * Sie geht dem Namen aus dem Prüfbericht vor: was der Verfasser
   * geschrieben hat, ist der Name, unter dem er die Position kennt. Der
   * Prüfbericht-Name bleibt darunter als Herkunft stehen, solange beide
   * auseinandergehen — er ist die Brücke zum Papier des Versicherers.
   */
  ueberschrift: string
  vorschlag?: Vorschlag
  befunde: Befund[]
  nummer: number | null
  imBrief: boolean
  hatText: boolean
  aktiv: boolean
  werte: Record<string, string>
  kiAktiv: boolean
  laeuft: boolean
  aufAktivieren: () => void
  aufEinfuegen: (text: string, marke: Herkunftsmarke) => void
  aufAusformulieren: () => void
  aufHerausnehmen: () => void
  aufAufnehmen: () => void
  aufEntfernen: () => void
  aufFundstelle: (befund: Befund) => void
  aufInBibliothek: () => void
  aufBildEinfuegen: (gut: Bildziehgut) => void
}) {
  const [offenerKandidat, setzeOffenenKandidaten] = useState<string | null>(null)
  const [entwurf, setzeEntwurf] = useState('')
  const [eigenerText, setzeEigenenText] = useState('')
  const [begriff, setzeBegriff] = useState('')
  const [bildbegriff, setzeBildbegriff] = useState('')
  const [bildtreffer, setzeBildtreffer] = useState<Bibliotheksbild[]>([])
  const [suchtBilder, starteBildsuche] = useTransition()
  const [treffer, setzeTreffer] = useState<
    {
      id: string
      nummer: string
      titel: string
      abschnitt: string
      /**
       * Der Stand des Eintrags gehört mit in die Trefferliste.
       *
       * Die Suche liest ihn ohnehin mit; ohne ihn liesse sich hier ein
       * Entwurf übernehmen, ohne dass es jemand sagt — während derselbe
       * Eintrag als Vorschlag darüber ausdrücklich als „noch nicht
       * freigegeben" gekennzeichnet ist. Zwei Wege in denselben Brief
       * dürfen nicht verschieden viel verschweigen.
       */
      status: string
      gegenargument: string | null
    }[]
  >([])
  const [sucht, starteSuche] = useTransition()

  const sperrend = befunde.filter((b) => b.schwere === 'sperrt').length
  const warnend = befunde.length - sperrend

  const oeffneKandidaten = (kennung: string, text: string) => {
    setzeOffenenKandidaten(kennung)
    setzeEntwurf(setzeWerteEin(text, werte).text)
  }

  const stand = entwurf ? setzeWerteEin(entwurf, werte) : null
  const offenePlatzhalter = stand?.offen ?? []

  const suche = (wert: string) => {
    setzeBegriff(wert)
    if (wert.trim().length < 3) {
      setzeTreffer([])
      return
    }
    starteSuche(async () => setzeTreffer(await durchsucheBibliothek(wert)))
  }

  const sucheBilder = (wert: string) => {
    setzeBildbegriff(wert)
    starteBildsuche(async () => setzeBildtreffer(await durchsucheBildbibliothek(wert)))
  }

  if (!aktiv) {
    return (
      <button type="button" className={`blase zu ${imBrief ? '' : 'draussen'}`} onClick={aufAktivieren}>
        <span className="blase-nummer">{nummer ?? '—'}</span>
        <span className="blase-titel">{ueberschrift || position.bezeichnung}</span>
        {/*
          Drei nackte Zahlen nebeneinander, jede in einer anderen Farbe: rot
          die sperrenden Befunde, orange die zu prüfenden, blau die Zahl der
          Vorschläge. Wer die Farben nicht auswendig kennt, liest an einer
          geschlossenen Anmerkung „4" und weiss nicht, ob vier Dinge zu tun
          sind oder vier Bausteine bereitliegen. Jede Zahl sagt jetzt, was
          sie zählt — im `title` und für die Vorlesehilfe.
        */}
        <span className="blase-marken">
          {sperrend > 0 ? (
            <span
              className="marke-pille m-zurueckgezogen"
              title={`${sperrend} sperrende${sperrend === 1 ? 'r' : ''} Befund${sperrend === 1 ? '' : 'e'} — sie halten die Ausgabe auf`}
            >
              {sperrend}
              <span className="nur-vorlesen"> sperrend</span>
            </span>
          ) : null}
          {warnend > 0 ? (
            <span
              className="marke-pille m-warn"
              title={`${warnend} Befund${warnend === 1 ? '' : 'e'} zu prüfen`}
            >
              {warnend}
              <span className="nur-vorlesen"> zu prüfen</span>
            </span>
          ) : null}
          {!imBrief ? (
            <span className="marke-pille m-entwurf">nicht im Schreiben</span>
          ) : hatText ? (
            <span className="marke-pille m-freigegeben">Text</span>
          ) : vorschlag && vorschlag.besteGuete !== 'kein' ? (
            <span
              className={`marke-pille b-${vorschlag.besteGuete}`}
              title={`${vorschlag.kandidaten.length} Vorschl${vorschlag.kandidaten.length === 1 ? 'ag' : 'äge'} aus der Bibliothek — ${GUETE_TEXT[vorschlag.besteGuete]}`}
            >
              {vorschlag.kandidaten.length}
              <span className="nur-vorlesen"> Vorschläge</span>
            </span>
          ) : (
            <span className="marke-pille m-entwurf">leer</span>
          )}
        </span>
      </button>
    )
  }

  return (
    <div className={`blase auf ${imBrief ? '' : 'draussen'}`}>
      <div className="blase-kopf">
        <span className="blase-nummer">{nummer ?? '—'}</span>
        <span className="blase-titel">{ueberschrift || position.bezeichnung}</span>
        <span className="blase-betrag">
          {position.differenz ? `−${euro(position.differenz)}` : ''}
        </span>
      </div>

      {/*
        Weicht die Überschrift im Brief vom Namen im Prüfbericht ab, steht
        beides da. Der Prüfbericht-Name ist die Brücke zum Papier des
        Versicherers: wer beim Telefonat „Position 3" nachschlägt, sucht
        dort nach dessen Wortlaut, nicht nach unserem.
      */}
      {ueberschrift && ueberschrift !== position.bezeichnung ? (
        <p className="unterzeile" style={{ margin: '0 0 8px' }}>
          Im Prüfbericht: {position.bezeichnung}
        </p>
      ) : null}

      {position.begruendungVersicherer ? (
        <div className="blase-zitat">„{position.begruendungVersicherer}"</div>
      ) : null}

      {befunde.length > 0 ? (
        <div className="blase-befunde">
          {befunde.map((b, i) => (
            <button
              key={i}
              type="button"
              className={`befund ${b.schwere}`}
              onClick={() => aufFundstelle(b)}
              title={b.fundstelle ? 'Stelle im Brief anspringen' : undefined}
            >
              <span className="marke-pille m-akzent">{b.kennung}</span>
              <span>
                <strong>{b.titel}</strong>
                <br />
                {b.text}
              </span>
            </button>
          ))}
        </div>
      ) : null}

      {!imBrief ? (
        <div className="blase-abschnitt">
          <p className="unterzeile" style={{ margin: '0 0 8px' }}>
            Diese Position wird nicht bestritten. Ihr Abschnitt steht ausgegraut im Brief und wird
            nicht mitgedruckt.
          </p>
          <div className="blase-knoepfe">
            <button type="button" className="freigabe" disabled={laeuft} onClick={aufAufnehmen}>
              Doch bestreiten
            </button>
            {/* Der Weg für eine Zeile, die gar keine Kürzung ist: dann soll
                sie nicht ausgegraut stehen bleiben, sondern verschwinden —
                aus dem Brief, aus dieser Leiste und aus dem Fall. */}
            <button
              type="button"
              className="gefahr"
              disabled={laeuft}
              title="Die Position gehört nicht in diesen Fall — sie verschwindet ganz"
              onClick={aufEntfernen}
            >
              Position entfernen
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="blase-abschnitt">
            <div className="blase-label">
              Vorschläge
              {vorschlag && vorschlag.besteGuete !== 'kein' ? (
                <span className={`marke-pille b-${vorschlag.besteGuete}`}>
                  {GUETE_TEXT[vorschlag.besteGuete]}
                </span>
              ) : (
                <span className="marke-pille m-entwurf">nichts gefunden</span>
              )}
            </div>

            {!vorschlag || vorschlag.kandidaten.length === 0 ? (
              <p className="unterzeile" style={{ margin: 0 }}>
                Die Bibliothek hat zu dieser Begründung nichts. Nimm die Suche oder schreib
                selbst — direkt im Brief.
              </p>
            ) : (
              vorschlag.kandidaten.map((k) => (
                <div key={k.eintragId} className="blase-vorschlag">
                  <button
                    type="button"
                    className={`blase-vorschlag-kopf ${k.text ? 'ziehbar' : ''}`}
                    title={k.text ? 'Anklicken zum Bearbeiten — oder in den Brief ziehen' : undefined}
                    {...(k.text
                      ? ziehbar(setzeWerteEin(k.text, werte).text, {
                          eintragId: k.eintragId,
                          nummer: k.nummer,
                          titel: k.titel,
                          herkunft: 'vorschlag',
                        })
                      : {})}
                    onClick={() =>
                      offenerKandidat === k.eintragId
                        ? setzeOffenenKandidaten(null)
                        : oeffneKandidaten(k.eintragId, k.text ?? '')
                    }
                  >
                    <span className="zeile-nummer">{k.nummer}</span>
                    <span>
                      <div className="vorschlag-titel">{k.titel}</div>
                      <div className="vorschlag-meta">
                        <span className={`marke-pille b-${k.guete}`}>{GUETE_TEXT[k.guete]}</span>
                        {k.treffergruende.length > 0
                          ? ` trifft auf ${k.treffergruende.slice(0, 3).join(', ')}`
                          : ` ${k.abschnitt}`}
                      </div>
                    </span>
                  </button>

                  {offenerKandidat === k.eintragId ? (
                    <div className="blase-entwurf">
                      {k.status !== 'freigegeben' ? (
                        <p className="hinweis warn" style={{ margin: '0 0 8px' }}>
                          Dieser Eintrag ist noch nicht freigegeben.
                        </p>
                      ) : null}
                      {!k.text && k.vorgehen ? (
                        <p className="hinweis" style={{ margin: '0 0 8px' }}>
                          Kein fertiger Text. Vorgehen: {k.vorgehen}
                        </p>
                      ) : null}

                      <textarea
                        value={entwurf}
                        onChange={(e) => setzeEntwurf(e.target.value)}
                        style={{ minHeight: 150 }}
                        aria-label="Text vor dem Einfügen bearbeiten"
                      />

                      {offenePlatzhalter.length > 0 ? (
                        <p className="hinweis warn" style={{ margin: '8px 0 0' }}>
                          Noch offen: {offenePlatzhalter.map((o) => `[${o}]`).join(', ')} — der
                          Export bleibt gesperrt, solange sie stehen.
                        </p>
                      ) : null}

                      {k.passendeVarianten.length > 0 ? (
                        <div style={{ marginTop: 8 }}>
                          <div className="blase-label">Varianten</div>
                          {k.passendeVarianten.map((v) => (
                            <button
                              key={v.id}
                              type="button"
                              className="blase-variante"
                              onClick={() => setzeEntwurf(setzeWerteEin(v.text, werte).text)}
                            >
                              {v.bezeichnung}
                            </button>
                          ))}
                        </div>
                      ) : null}

                      <div className="blase-knoepfe">
                        <button
                          type="button"
                          className="haupt"
                          disabled={!entwurf.trim()}
                          onClick={() => {
                            aufEinfuegen(entwurf, {
                              eintragId: k.eintragId,
                              nummer: k.nummer,
                              titel: k.titel,
                              herkunft: 'vorschlag',
                            })
                            setzeOffenenKandidaten(null)
                          }}
                        >
                          In den Brief einfügen
                        </button>
                        <Ziehgriff
                          text={entwurf}
                          marke={{
                            eintragId: k.eintragId,
                            nummer: k.nummer,
                            titel: k.titel,
                            herkunft: 'vorschlag',
                          }}
                        />
                        <button type="button" onClick={() => setzeOffenenKandidaten(null)}>
                          Schliessen
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>
              ))
            )}
          </div>

          <div className="blase-abschnitt">
            <div className="blase-label">Gesamte Bibliothek</div>
            <input
              type="search"
              value={begriff}
              placeholder="Bauteil, Stichwort, Textstelle …"
              aria-label="Bibliothek durchsuchen"
              onChange={(e) => suche(e.target.value)}
            />
            {sucht ? (
              <p className="unterzeile" style={{ margin: '6px 0 0' }}>
                <Kreisel text="sucht …" />
              </p>
            ) : null}
            {treffer.slice(0, 6).map((t) => (
              <div key={t.id} className="blase-vorschlag">
                <button
                  type="button"
                  className={`blase-vorschlag-kopf ${t.gegenargument ? 'ziehbar' : ''}`}
                  disabled={!t.gegenargument}
                  title={t.gegenargument ? 'Anklicken zum Bearbeiten — oder in den Brief ziehen' : undefined}
                  {...(t.gegenargument
                    ? ziehbar(setzeWerteEin(t.gegenargument, werte).text, {
                        eintragId: t.id,
                        nummer: t.nummer,
                        titel: t.titel,
                        herkunft: 'bibliothekssuche',
                      })
                    : {})}
                  onClick={() =>
                    offenerKandidat === t.id
                      ? setzeOffenenKandidaten(null)
                      : oeffneKandidaten(t.id, t.gegenargument ?? '')
                  }
                >
                  <span className="zeile-nummer">{t.nummer}</span>
                  <span>
                    <div className="vorschlag-titel">{t.titel}</div>
                    <div className="vorschlag-meta">{t.abschnitt}</div>
                  </span>
                </button>
                {offenerKandidat === t.id ? (
                  <div className="blase-entwurf">
                    {t.status !== 'freigegeben' ? (
                      <p className="hinweis warn" style={{ margin: '0 0 8px' }}>
                        Dieser Eintrag ist noch nicht freigegeben.
                      </p>
                    ) : null}
                    <textarea
                      value={entwurf}
                      onChange={(e) => setzeEntwurf(e.target.value)}
                      style={{ minHeight: 150 }}
                      aria-label="Text vor dem Einfügen bearbeiten"
                    />
                    {offenePlatzhalter.length > 0 ? (
                      <p className="hinweis warn" style={{ margin: '8px 0 0' }}>
                        Noch offen: {offenePlatzhalter.map((o) => `[${o}]`).join(', ')} — der Export
                        bleibt gesperrt, solange sie stehen.
                      </p>
                    ) : null}
                    <div className="blase-knoepfe">
                      <button
                        type="button"
                        className="haupt"
                        disabled={!entwurf.trim()}
                        onClick={() => {
                          aufEinfuegen(entwurf, {
                            eintragId: t.id,
                            nummer: t.nummer,
                            titel: t.titel,
                            herkunft: 'bibliothekssuche',
                          })
                          setzeOffenenKandidaten(null)
                        }}
                      >
                        In den Brief einfügen
                      </button>
                      <Ziehgriff
                        text={entwurf}
                        marke={{
                          eintragId: t.id,
                          nummer: t.nummer,
                          titel: t.titel,
                          herkunft: 'bibliothekssuche',
                        }}
                      />
                      <button type="button" onClick={() => setzeOffenenKandidaten(null)}>
                        Schliessen
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            ))}
          </div>

          <div className="blase-abschnitt">
            <div className="blase-label">
              Bildbibliothek
              <a href="/bilder" target="_blank" style={{ fontSize: 11 }}>
                pflegen
              </a>
            </div>
            <input
              type="search"
              value={bildbegriff}
              placeholder="Thema, Titel, Beschreibung …"
              aria-label="Bildbibliothek durchsuchen"
              onFocus={() => {
                if (bildtreffer.length === 0) sucheBilder('')
              }}
              onChange={(e) => sucheBilder(e.target.value)}
            />
            {suchtBilder ? (
              <p className="unterzeile" style={{ margin: '6px 0 0' }}>
                <Kreisel text="sucht …" />
              </p>
            ) : null}

            {bildtreffer.length > 0 ? (
              <div className="blase-bilder">
                {bildtreffer.map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    className="blase-bild"
                    title={`${b.titel ?? b.dateiname}${b.beschreibung ? ` — ${b.beschreibung}` : ''}\nAnklicken zum Einfügen oder in den Brief ziehen`}
                    draggable
                    onDragStart={(e) => {
                      const gut: Bildziehgut = {
                        bildId: b.id,
                        breitePx: b.breitePx,
                        hoehePx: b.hoehePx,
                        dateiname: b.dateiname,
                        beschriftung: b.titel ?? '',
                      }
                      e.dataTransfer.setData(MIME_BILD, JSON.stringify(gut))
                      e.dataTransfer.effectAllowed = 'copy'
                      document.body.classList.add('zieht-baustein')
                    }}
                    onDragEnd={() => document.body.classList.remove('zieht-baustein')}
                    onClick={() =>
                      aufBildEinfuegen({
                        bildId: b.id,
                        breitePx: b.breitePx,
                        hoehePx: b.hoehePx,
                        dateiname: b.dateiname,
                        beschriftung: b.titel ?? '',
                      })
                    }
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={`/api/bilder/${b.id}`} alt={b.titel ?? b.dateiname} loading="lazy" />
                    <span>{b.titel || b.dateiname}</span>
                  </button>
                ))}
              </div>
            ) : bildbegriff && !suchtBilder ? (
              <p className="unterzeile" style={{ margin: '6px 0 0' }}>
                Kein Bild passt dazu.
              </p>
            ) : null}
          </div>

          <div className="blase-abschnitt">
            <div className="blase-label">Eigener Text</div>
            <textarea
              value={eigenerText}
              onChange={(e) => setzeEigenenText(e.target.value)}
              placeholder="Eigene Argumentation — oder gleich im Brief schreiben."
              style={{ minHeight: 90 }}
            />
            <div className="blase-knoepfe">
              <button
                type="button"
                className="haupt"
                disabled={!eigenerText.trim()}
                onClick={() => {
                  aufEinfuegen(eigenerText, {
                    eintragId: null,
                    nummer: null,
                    titel: null,
                    herkunft: 'eigener_text',
                  })
                  setzeEigenenText('')
                }}
              >
                In den Brief einfügen
              </button>
              <Ziehgriff
                text={eigenerText}
                marke={{ eintragId: null, nummer: null, titel: null, herkunft: 'eigener_text' }}
              />
            </div>
          </div>

          <div className="blase-fuss">
            <button
              type="button"
              disabled={laeuft || !kiAktiv || !hatText}
              title={
                !kiAktiv
                  ? 'Dafür fehlt der Zugang zum Sprachmodell.'
                  : !hatText
                    ? 'Erst Text in den Abschnitt bringen.'
                    : 'Den Abschnitt im Hausstil zusammenziehen'
              }
              onClick={aufAusformulieren}
            >
              {laeuft ? <Kreisel text="Ausformulieren" /> : 'Ausformulieren'}
            </button>
            <button
              type="button"
              disabled={laeuft}
              title="Die Kürzung wird hingenommen. Der Abschnitt bleibt ausgegraut stehen, sein Text ist damit nicht verloren."
              onClick={aufHerausnehmen}
            >
              Nicht bestreiten
            </button>
            {hatText ? (
              <button
                type="button"
                className="freigabe"
                disabled={laeuft}
                title="Aus diesem selbst geschriebenen Abschnitt einen Bibliotheks-Entwurf machen"
                onClick={aufInBibliothek}
              >
                In die Bibliothek
              </button>
            ) : null}
          </div>
        </>
      )}
    </div>
  )
}
