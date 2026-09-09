'use client'

import { useState, useTransition } from 'react'
import type { Dublettengruppe, Kontakt } from '@/kontakte/dubletten'
import { planeSchritte, type Kontaktanhaenge, type Plan } from '@/kontakte/plan'
import {
  fuehreZusammen,
  leseAnhaenge,
  loescheLeeren,
  machRueckgaengig,
  type Schrittbericht,
} from '@/kontakte/aktionen'
import { useMelder } from '@/app/teile/melder'
import { ausErgebnis, fehler as alsFehler, erfolg as alsErfolg, info } from '@/melden/typen'

/**
 * Eine Dublettengruppe mit ihren Handgriffen.
 *
 * **Drei Knöpfe, drei Zustände, in dieser Reihenfolge:** Vorschau,
 * Zusammenführen, Löschen. Kein Schritt überspringt den davor. Die Vorschau
 * ist keine Höflichkeit — sie ist die Stelle, an der jemand sieht, dass
 * gleich eine Rechnung den Kunden wechselt.
 *
 * **Warum die Oberfläche Kontakt für Kontakt fragt.** Ein einziger Aufruf
 * für die ganze Gruppe waren bei Arndt rund 68 Anfragen an sevDesk und
 * knapp eine Minute, in der nichts geschah und nichts dastand. Jetzt läuft
 * eine Anfrage je Kontakt, der Stand steht unter den Knöpfen, und den Plan
 * rechnet der Browser selbst aus — `planeSchritte` ist reine Rechnerei.
 *
 * **Was der Sieger ist.** Voreingestellt ist der älteste Eintrag: er trägt
 * die Historie, und der Rechnungsworkflow in n8n wählt ab jetzt ebenfalls
 * den ältesten. Beides in dieselbe Richtung laufen zu lassen ist mehr wert
 * als jede andere Voreinstellung.
 */

interface Lauf {
  vorgaenge: string[]
  schritte: Schrittbericht[]
  leer: string[]
  fehler?: string
}

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
  const [verlierer, setzeVerlierer] = useState<string[]>(nachAlter.slice(1).map((k) => k.id))
  const [plan, setzePlan] = useState<Plan | null>(null)
  const [lauf, setzeLauf] = useState<Lauf | null>(null)
  const [stand, setzeStand] = useState<string | null>(null)
  const [geloescht, setzeGeloescht] = useState<string[]>([])
  const [laeuft, starte] = useTransition()
  const { melde } = useMelder()

  const namen = new Map(gruppe.kontakte.map((k) => [k.id, k.anzeige]))
  const siegerAnzeige = namen.get(siegerId) ?? siegerId

  /*
    Im Fortschritt steht die Kundennummer dabei: in dieser Gruppe heissen
    sieben Kontakte gleich, und „Lese 3 von 8: Arndt Automobile GmbH" waere
    achtmal dieselbe Zeile ohne Auskunft.
  */
  const beschriftung = (id: string) => {
    const kontakt = gruppe.kontakte.find((k) => k.id === id)
    if (!kontakt) return id
    return kontakt.kundennummer ? `${kontakt.anzeige} (${kontakt.kundennummer})` : kontakt.anzeige
  }

  function waehleSieger(id: string) {
    setzeSieger(id)
    setzeVerlierer(gruppe.kontakte.filter((k) => k.id !== id).map((k) => k.id))
    setzePlan(null)
    setzeLauf(null)
  }

  function schalteVerlierer(id: string, an: boolean) {
    setzeVerlierer((alt) => (an ? [...new Set([...alt, id])] : alt.filter((v) => v !== id)))
    setzePlan(null)
  }

  function holeVorschau() {
    starte(async () => {
      setzePlan(null)
      setzeLauf(null)
      const reihe = [siegerId, ...verlierer]
      melde(info(`Vorschau für „${gruppe.anzeige}“ — ${reihe.length} Kontakte werden gelesen.`))

      const gelesen: Kontaktanhaenge[] = []
      for (const [i, id] of reihe.entries()) {
        const name = namen.get(id) ?? id
        setzeStand(`Lese ${i + 1} von ${reihe.length}: ${beschriftung(id)}`)
        const antwort = await leseAnhaenge(id, name)
        if (!antwort.anhaenge) {
          setzeStand(null)
          melde(alsFehler(antwort.fehler ?? `„${name}“ liess sich nicht lesen.`))
          return
        }
        gelesen.push(antwort.anhaenge)
      }
      setzeStand(null)

      const [sieger, ...rest] = gelesen
      if (!sieger) return
      const neu = planeSchritte(sieger, rest)
      setzePlan(neu)
      const umhaenge = neu.schritte.filter((s) => s.art === 'umhaengen').length
      melde(
        info(
          umhaenge === 0
            ? 'Nichts umzuhängen — die gewählten Kontakte sind bereits leer.'
            : `${umhaenge} ${umhaenge === 1 ? 'Umhang' : 'Umhänge'} vorbereitet. Es wurde noch nichts geändert.`,
        ),
      )
    })
  }

  function fuehreAus() {
    starte(async () => {
      setzePlan(null)
      const gesammelt: Lauf = { vorgaenge: [], schritte: [], leer: [] }
      melde(info(`Zusammenführen läuft — ${verlierer.length} Kontakte.`))

      for (const [i, id] of verlierer.entries()) {
        const name = namen.get(id) ?? id
        setzeStand(`Kontakt ${i + 1} von ${verlierer.length}: ${beschriftung(id)}`)
        const bericht = await fuehreZusammen(siegerId, siegerAnzeige, [id])
        gesammelt.schritte.push(...bericht.schritte)
        gesammelt.leer.push(...bericht.leer)
        if (bericht.vorgang) gesammelt.vorgaenge.push(bericht.vorgang)
        if (bericht.fehler) {
          gesammelt.fehler = `${name}: ${bericht.fehler}`
          break
        }
      }

      setzeStand(null)
      setzeLauf(gesammelt)
      const gut = gesammelt.schritte.filter((s) => s.erfolg).length
      if (gesammelt.fehler) melde(alsFehler(gesammelt.fehler))
      else
        melde(
          alsErfolg(
            `${gut} von ${gesammelt.schritte.length} Schritten sind durchgegangen.` +
              (gesammelt.leer.length > 0
                ? ` ${gesammelt.leer.length} ${gesammelt.leer.length === 1 ? 'Kontakt ist' : 'Kontakte sind'} jetzt leer.`
                : ''),
          ),
        )
    })
  }

  function nimmZurueck() {
    starte(async () => {
      const vorgaenge = lauf?.vorgaenge ?? []
      const schritte: Schrittbericht[] = []
      for (const [i, vorgang] of vorgaenge.entries()) {
        setzeStand(`Nehme zurück: ${i + 1} von ${vorgaenge.length}`)
        const bericht = await machRueckgaengig(vorgang)
        schritte.push(...bericht.schritte)
      }
      setzeStand(null)
      setzeLauf({ vorgaenge: [], schritte, leer: [] })
      melde(alsErfolg(`${schritte.filter((s) => s.erfolg).length} Schritte zurückgenommen.`))
    })
  }

  function loesche(kontaktId: string) {
    starte(async () => {
      setzeStand(`Lösche ${beschriftung(kontaktId)} …`)
      const ergebnis = await loescheLeeren(kontaktId)
      setzeStand(null)
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
              loeschbar={Boolean(lauf?.leer.includes(kontakt.id))}
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
        <div className="gruppenfuss">
          {/*
            Der Stand steht neben den Knöpfen und nicht in einer
            Einblendung: eine Einblendung je Kontakt wären acht davon,
            und keine davon bliebe stehen.
          */}
          <span className="unterzeile" aria-live="polite">
            {stand ?? ''}
          </span>
          <button
            type="button"
            className="knopf"
            onClick={holeVorschau}
            disabled={laeuft || verlierer.length === 0}
          >
            {laeuft && stand?.startsWith('Lese') ? 'Liest …' : 'Vorschau'}
          </button>
        </div>
      ) : null}

      {plan ? (
        <Vorschautafel
          plan={plan}
          siegerAnzeige={siegerAnzeige}
          laeuft={laeuft}
          ausfuehren={fuehreAus}
          abbrechen={() => setzePlan(null)}
        />
      ) : null}

      {lauf ? <Berichtstafel lauf={lauf} laeuft={laeuft} zurueck={nimmZurueck} /> : null}
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
  plan,
  siegerAnzeige,
  laeuft,
  ausfuehren,
  abbrechen,
}: {
  plan: Plan
  siegerAnzeige: string
  laeuft: boolean
  ausfuehren: () => void
  abbrechen: () => void
}) {
  const umhaenge = plan.schritte.filter((s) => s.art === 'umhaengen')
  const mitVorbehalt = umhaenge.filter((s) => s.vorbehalt)

  return (
    <div className="vorschau">
      <span className="hinweis-titel">
        Das geschieht gleich — {umhaenge.length} {umhaenge.length === 1 ? 'Umhang' : 'Umhänge'} auf
        „{siegerAnzeige}“
      </span>
      <ul className="vorschauliste">
        {umhaenge.map((schritt) => (
          <li
            key={`${schritt.objektArt}-${schritt.objektId}`}
            className={schritt.vorbehalt ? 'mit-vorbehalt' : undefined}
          >
            {schritt.bezeichnung}
            {schritt.vorbehalt ? <span className="unterzeile"> · {schritt.vorbehalt}</span> : null}
          </li>
        ))}
        {umhaenge.length === 0 ? (
          <li>Nichts umzuhängen — die gewählten Kontakte sind bereits leer.</li>
        ) : null}
      </ul>

      <p className="unterzeile" style={{ margin: '8px 0 0' }}>
        {plan.voraussichtlichLeer.length === 1
          ? 'Danach ist ein Kontakt voraussichtlich leer und lässt sich löschen — mit einem eigenen Klick.'
          : plan.voraussichtlichLeer.length > 1
            ? `Danach sind ${plan.voraussichtlichLeer.length} Kontakte voraussichtlich leer und lassen sich löschen — jeder mit einem eigenen Klick.`
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
  lauf,
  laeuft,
  zurueck,
}: {
  lauf: Lauf
  laeuft: boolean
  zurueck: () => void
}) {
  const gut = lauf.schritte.filter((s) => s.erfolg).length
  return (
    <div className={`vorschau ${lauf.fehler ? 'gescheitert' : ''}`}>
      <span className="hinweis-titel">
        Bericht — {gut} von {lauf.schritte.length} durchgegangen
      </span>
      {lauf.fehler ? <p style={{ margin: '4px 0 8px' }}>{lauf.fehler}</p> : null}
      <ul className="vorschauliste">
        {lauf.schritte.map((schritt, i) => (
          <li key={i} className={schritt.erfolg ? undefined : 'mit-vorbehalt'}>
            <span aria-hidden="true">{schritt.erfolg ? '✓' : '✕'}</span> {schritt.bezeichnung}
            {schritt.meldung ? <span className="unterzeile"> · {schritt.meldung}</span> : null}
          </li>
        ))}
      </ul>
      {lauf.vorgaenge.length > 0 && gut > 0 ? (
        <div className="assistent-knoepfe" style={{ marginTop: 10, justifyContent: 'flex-end' }}>
          <button type="button" className="knopf" onClick={zurueck} disabled={laeuft}>
            Zurücknehmen
          </button>
        </div>
      ) : null}
    </div>
  )
}
