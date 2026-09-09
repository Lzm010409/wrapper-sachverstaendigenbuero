'use client'

import { useState, useTransition } from 'react'
import type { Dublettengruppe, Kontakt } from '@/kontakte/dubletten'
import {
  fuehreZusammen,
  loescheLeeren,
  machRueckgaengig,
  zeigeVorschau,
  type Umhangbericht,
  type Vorschau,
} from '@/kontakte/aktionen'
import { useMelder } from '@/app/teile/melder'
import { ausErgebnis, fehler as alsFehler, erfolg as alsErfolg } from '@/melden/typen'

/**
 * Eine Dublettengruppe mit ihren Handgriffen.
 *
 * **Drei Knöpfe, drei Zustände, in dieser Reihenfolge:** Vorschau,
 * Zusammenführen, Löschen. Kein Schritt überspringt den davor. Die Vorschau
 * ist keine Höflichkeit — sie ist die Stelle, an der jemand sieht, dass
 * gleich eine Rechnung den Kunden wechselt.
 *
 * **Was der Sieger ist.** Voreingestellt ist der älteste Eintrag: er trägt
 * die Historie, und der Rechnungsworkflow in n8n wählt ab jetzt ebenfalls
 * den ältesten. Beides in dieselbe Richtung laufen zu lassen ist mehr wert
 * als jede andere Voreinstellung.
 */

export function Gruppe({
  gruppe,
  darfZusammenfuehren,
}: {
  gruppe: Dublettengruppe
  darfZusammenfuehren: boolean
}) {
  // Der älteste zuerst — das ist der Sieger, den auch n8n nimmt.
  const nachAlter = [...gruppe.kontakte].sort(
    (a, b) => (a.angelegtAm?.getTime() ?? 0) - (b.angelegtAm?.getTime() ?? 0),
  )
  const [siegerId, setzeSieger] = useState(nachAlter[0]?.id ?? '')
  const [verlierer, setzeVerlierer] = useState<string[]>(
    nachAlter.slice(1).map((k) => k.id),
  )
  const [vorschau, setzeVorschau] = useState<Vorschau | null>(null)
  const [bericht, setzeBericht] = useState<Umhangbericht | null>(null)
  const [geloescht, setzeGeloescht] = useState<string[]>([])
  const [laeuft, starte] = useTransition()
  const { melde } = useMelder()

  function waehleSieger(id: string) {
    setzeSieger(id)
    setzeVerlierer(gruppe.kontakte.filter((k) => k.id !== id).map((k) => k.id))
    setzeVorschau(null)
    setzeBericht(null)
  }

  function schalteVerlierer(id: string, an: boolean) {
    setzeVerlierer((alt) => (an ? [...new Set([...alt, id])] : alt.filter((v) => v !== id)))
    setzeVorschau(null)
  }

  function hole() {
    starte(async () => {
      try {
        setzeVorschau(await zeigeVorschau(siegerId, verlierer))
      } catch (ausnahme) {
        melde(alsFehler(ausnahme instanceof Error ? ausnahme.message : 'Die Vorschau ging nicht.'))
      }
    })
  }

  function fuehreAus() {
    starte(async () => {
      try {
        const ergebnis = await fuehreZusammen(siegerId, verlierer)
        setzeBericht(ergebnis)
        setzeVorschau(null)
        if (ergebnis.fehler) melde(alsFehler(ergebnis.fehler))
        else {
          const gut = ergebnis.schritte.filter((s) => s.erfolg).length
          melde(alsErfolg(`${gut} von ${ergebnis.schritte.length} Schritten sind durchgegangen.`))
        }
      } catch (ausnahme) {
        melde(
          alsFehler(ausnahme instanceof Error ? ausnahme.message : 'Das Zusammenführen ging nicht.'),
        )
      }
    })
  }

  function nimmZurueck(vorgang: string) {
    starte(async () => {
      const ergebnis = await machRueckgaengig(vorgang)
      setzeBericht(ergebnis)
      if (ergebnis.fehler) melde(alsFehler(ergebnis.fehler))
      else melde(alsErfolg('Zurückgenommen.'))
    })
  }

  function loesche(kontaktId: string) {
    starte(async () => {
      const ergebnis = await loescheLeeren(kontaktId)
      const meldung = ausErgebnis(ergebnis)
      if (meldung) melde(meldung)
      if (!ergebnis.fehler) setzeGeloescht((alt) => [...alt, kontaktId])
    })
  }

  return (
    <section className="karte dublettengruppe">
      <div className="dublettenkopf">
        <h2>{gruppe.anzeige}</h2>
        {gruppe.leere.length > 0 ? (
          <span className="marke-pille m-warn">{gruppe.leere.length} ohne Beleg</span>
        ) : null}
      </div>

      <table className="dublettentabelle">
        <thead>
          <tr>
            {darfZusammenfuehren ? (
              <>
                <th scope="col">Bleibt</th>
                <th scope="col">Zusammenführen</th>
              </>
            ) : null}
            <th scope="col">Name in sevDesk</th>
            <th scope="col">Kundennummer</th>
            <th scope="col">Angelegt</th>
            <th scope="col" style={{ textAlign: 'right' }}>
              Belege
            </th>
          </tr>
        </thead>
        <tbody>
          {nachAlter.map((kontakt) => (
            <Zeile
              key={kontakt.id}
              gruppe={gruppe.schluessel}
              kontakt={kontakt}
              sieger={siegerId === kontakt.id}
              gewaehlt={verlierer.includes(kontakt.id)}
              geloescht={geloescht.includes(kontakt.id)}
              loeschbar={Boolean(bericht?.leer.includes(kontakt.id))}
              laeuft={laeuft}
              darfZusammenfuehren={darfZusammenfuehren}
              waehleSieger={() => waehleSieger(kontakt.id)}
              schalte={(an) => schalteVerlierer(kontakt.id, an)}
              loesche={() => loesche(kontakt.id)}
            />
          ))}
        </tbody>
      </table>

      {darfZusammenfuehren ? (
        <div className="assistent-knoepfe" style={{ marginTop: 12, justifyContent: 'flex-end' }}>
          <button
            type="button"
            className="knopf"
            onClick={hole}
            disabled={laeuft || verlierer.length === 0}
          >
            Vorschau
          </button>
        </div>
      ) : null}

      {vorschau ? (
        <Vorschautafel
          vorschau={vorschau}
          laeuft={laeuft}
          ausfuehren={fuehreAus}
          abbrechen={() => setzeVorschau(null)}
        />
      ) : null}

      {bericht ? <Berichtstafel bericht={bericht} laeuft={laeuft} zurueck={nimmZurueck} /> : null}
    </section>
  )
}

function Zeile({
  gruppe,
  kontakt,
  sieger,
  gewaehlt,
  geloescht,
  loeschbar,
  laeuft,
  darfZusammenfuehren,
  waehleSieger,
  schalte,
  loesche,
}: {
  /** Alle Auswahlknöpfe einer Gruppe brauchen denselben Namen, sonst ist es keine Auswahl. */
  gruppe: string
  kontakt: Kontakt
  sieger: boolean
  gewaehlt: boolean
  geloescht: boolean
  loeschbar: boolean
  laeuft: boolean
  darfZusammenfuehren: boolean
  waehleSieger: () => void
  schalte: (an: boolean) => void
  loesche: () => void
}) {
  return (
    <tr className={geloescht ? 'geloescht' : kontakt.belege === 0 ? 'ohne-beleg' : undefined}>
      {darfZusammenfuehren ? (
        <>
          <td>
            <input
              type="radio"
              name={`sieger-${gruppe}`}
              checked={sieger}
              disabled={laeuft || geloescht}
              onChange={waehleSieger}
              aria-label={`${kontakt.anzeige} bleibt bestehen`}
            />
          </td>
          <td>
            {sieger ? null : (
              <input
                type="checkbox"
                checked={gewaehlt}
                disabled={laeuft || geloescht}
                onChange={(e) => schalte(e.target.checked)}
                aria-label={`${kontakt.anzeige} zusammenführen`}
              />
            )}
          </td>
        </>
      ) : null}
      <td>
        {kontakt.anzeige}
        {geloescht ? <span className="unterzeile"> · gelöscht</span> : null}
      </td>
      <td style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>{kontakt.kundennummer ?? '—'}</td>
      <td>{kontakt.angelegtAm ? kontakt.angelegtAm.toLocaleDateString('de-DE') : '—'}</td>
      <td style={{ textAlign: 'right' }}>
        {loeschbar && !geloescht ? (
          <button type="button" className="knopf gefahr" onClick={loesche} disabled={laeuft}>
            Löschen
          </button>
        ) : kontakt.belege < 0 ? (
          <span className="unterzeile">unbekannt</span>
        ) : kontakt.belege === 0 ? (
          <span className="unterzeile">keine</span>
        ) : (
          kontakt.belege
        )}
      </td>
    </tr>
  )
}

/** Was gleich geschieht — Schritt für Schritt, vor dem ersten Schreibzugriff. */
function Vorschautafel({
  vorschau,
  laeuft,
  ausfuehren,
  abbrechen,
}: {
  vorschau: Vorschau
  laeuft: boolean
  ausfuehren: () => void
  abbrechen: () => void
}) {
  if (vorschau.fehler || !vorschau.plan) {
    return (
      <div className="hinweis fehler" style={{ marginTop: 12 }}>
        {vorschau.fehler ?? 'Es liess sich kein Plan bilden.'}
      </div>
    )
  }

  const { plan } = vorschau
  const umhaenge = plan.schritte.filter((s) => s.art === 'umhaengen')
  const mitVorbehalt = umhaenge.filter((s) => s.vorbehalt)

  return (
    <div className="vorschau">
      <span className="hinweis-titel">
        Das geschieht gleich — {umhaenge.length}{' '}
        {umhaenge.length === 1 ? 'Umhang' : 'Umhänge'} auf „{vorschau.siegerAnzeige}“
      </span>
      <ul className="vorschauliste">
        {umhaenge.map((schritt) => (
          <li key={`${schritt.objektArt}-${schritt.objektId}`} className={schritt.vorbehalt ? 'mit-vorbehalt' : undefined}>
            {schritt.bezeichnung}
            {schritt.vorbehalt ? <span className="unterzeile"> · {schritt.vorbehalt}</span> : null}
          </li>
        ))}
        {umhaenge.length === 0 ? <li>Nichts umzuhängen — die Verlierer sind bereits leer.</li> : null}
      </ul>

      <p className="unterzeile" style={{ margin: '8px 0 0' }}>
        {plan.voraussichtlichLeer.length > 0
          ? plan.voraussichtlichLeer.length === 1
            ? 'Danach ist ein Kontakt voraussichtlich leer und lässt sich löschen — mit einem eigenen Klick.'
            : `Danach sind ${plan.voraussichtlichLeer.length} Kontakte voraussichtlich leer und lassen sich löschen — jeder mit einem eigenen Klick.`
          : null}
        {mitVorbehalt.length > 0
          ? ` ${mitVorbehalt.length} ${mitVorbehalt.length === 1 ? 'Beleg ist' : 'Belege sind'} festgeschrieben; wird es versucht und geht es nicht, steht das im Bericht.`
          : null}
      </p>

      <div className="assistent-knoepfe" style={{ marginTop: 10, justifyContent: 'flex-end' }}>
        <button type="button" className="knopf" onClick={abbrechen} disabled={laeuft}>
          Abbrechen
        </button>
        <button type="button" className="knopf haupt" onClick={ausfuehren} disabled={laeuft}>
          {laeuft ? 'Läuft …' : 'Zusammenführen'}
        </button>
      </div>
    </div>
  )
}

/** Was tatsächlich geschehen ist. */
function Berichtstafel({
  bericht,
  laeuft,
  zurueck,
}: {
  bericht: Umhangbericht
  laeuft: boolean
  zurueck: (vorgang: string) => void
}) {
  const gut = bericht.schritte.filter((s) => s.erfolg).length
  return (
    <div className={`vorschau ${bericht.fehler ? 'gescheitert' : ''}`}>
      <span className="hinweis-titel">
        Bericht — {gut} von {bericht.schritte.length} durchgegangen
      </span>
      {bericht.fehler ? <p style={{ margin: '4px 0 8px' }}>{bericht.fehler}</p> : null}
      <ul className="vorschauliste">
        {bericht.schritte.map((schritt, i) => (
          <li key={i} className={schritt.erfolg ? undefined : 'mit-vorbehalt'}>
            <span aria-hidden="true">{schritt.erfolg ? '✓' : '✕'}</span> {schritt.bezeichnung}
            {schritt.meldung ? <span className="unterzeile"> · {schritt.meldung}</span> : null}
          </li>
        ))}
      </ul>
      {bericht.vorgang && gut > 0 ? (
        <div className="assistent-knoepfe" style={{ marginTop: 10, justifyContent: 'flex-end' }}>
          <button
            type="button"
            className="knopf"
            onClick={() => zurueck(bericht.vorgang!)}
            disabled={laeuft}
          >
            Zurücknehmen
          </button>
        </div>
      ) : null}
    </div>
  )
}
