'use client'

import { useMemo, useState, useTransition } from 'react'
import { ladeBelegeInGutachtenordner, uebernimmKorb } from '@/wbw/aktionen'
import { fahrzeugKennung, type Korbeintrag } from '@/wbw/ergebnis'
import { AUFFAELLIGKEITEN, vorbelegt, type Auffaelligkeit, type Pruefurteil } from '@/wbw/urteil'
import { Kreisel } from '@/app/teile/anzeigen'
import { useMelder } from '@/app/teile/melder'
import { ausErgebnis } from '@/melden/typen'
import { Spaltenkopf } from '@/app/teile/spaltenkopf'
import type { Richtung } from '@/app/teile/sortierung'

/**
 * Der Vergleichskorb: eine Zeile je Fahrzeug, mit Haken.
 *
 * **Der Haken ist die eigentliche Arbeit an dieser Tabelle.** Die Prüfung
 * schlägt vor, der Sachverständige entscheidet — ein Gutachten, dessen
 * Vergleichskorb ein Modell zusammengestellt hat, wäre im Streitfall nicht
 * zu vertreten. Vorbelegt ist alles ausser dem, was die Prüfung verwerfen
 * würde; wer nichts tut, hat damit trotzdem eine brauchbare Auswahl.
 *
 * **Gefiltert und sortiert wird hier im Browser**, nicht auf dem Server.
 * Anders als bei der Fallliste sind die Zeilen bereits vollständig geladen —
 * ein Serverabruf je Klick auf eine Spaltenüberschrift wäre Wartezeit für
 * eine Sortierung, die schon dasteht.
 *
 * **Der Filter ändert die Auswahl nicht.** Wer nach „nur mit Auffälligkeit"
 * filtert, sieht weniger Zeilen — die Haken der ausgeblendeten bleiben
 * gesetzt. Alles andere wäre ein Datenverlust durch Hinsehen.
 */

type Sortierung =
  | 'rang'
  | 'preis'
  | 'kilometerstand'
  | 'erstzulassung'
  | 'entfernung'
  | 'vergleichbarkeit'

const euro = new Intl.NumberFormat('de-DE', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
})

function betrag(wert: number | null): string {
  return wert === null ? '—' : euro.format(wert)
}

/** EZ als `MM/JJJJ` in etwas, das sich vergleichen lässt. */
function ezWert(wert: string | null): number {
  const treffer = wert?.match(/(\d{1,2})[./](\d{4})/)
  if (!treffer) return 0
  return Number(treffer[2]) * 12 + Number(treffer[1])
}

export function Korbtabelle({
  laufId,
  korb,
  urteile,
  auswahl,
  wbwVorschlag,
}: {
  laufId: string
  korb: Korbeintrag[]
  urteile: Record<string, Pruefurteil>
  auswahl: string[] | null
  /** Der Vorschlag des Laufs — entscheidet über die Einzelbelege. */
  wbwVorschlag: number | null
}) {
  const { melde } = useMelder()
  const [laeuft, starte] = useTransition()
  const [laedtHoch, starteUpload] = useTransition()
  // Erst übernehmen, dann hochladen: die Belege entstehen aus dem
  // gespeicherten Korb, nicht aus den Haken im Browser.
  const [uebernommen, setzeUebernommen] = useState(auswahl !== null)

  const zeilen = useMemo(
    () =>
      korb.map((f) => {
        const kennung = fahrzeugKennung(f.url, f.titel)
        return { ...f, kennung, urteil: urteile[kennung] }
      }),
    [korb, urteile],
  )

  const [gewaehlt, setzeGewaehlt] = useState<Set<string>>(
    () =>
      new Set(
        auswahl ?? zeilen.filter((z) => vorbelegt(z.urteil)).map((z) => z.kennung),
      ),
  )

  const [quelle, setzeQuelle] = useState('')
  const [empfehlung, setzeEmpfehlung] = useState('')
  const [nurAuffaellig, setzeNurAuffaellig] = useState(false)
  const [nurGewaehlt, setzeNurGewaehlt] = useState(false)
  const [hoechstpreis, setzeHoechstpreis] = useState('')
  const [sortierung, setzeSortierung] = useState<Sortierung>('rang')
  const [absteigend, setzeAbsteigend] = useState(false)

  const quellen = useMemo(
    () => [...new Set(zeilen.map((z) => z.quelle).filter((q): q is string => Boolean(q)))].sort(),
    [zeilen],
  )

  const sichtbar = useMemo(() => {
    const grenze = Number(hoechstpreis.replace(/[^\d]/g, ''))
    const gefiltert = zeilen.filter((z) => {
      if (quelle && z.quelle !== quelle) return false
      if (empfehlung && (z.urteil?.empfehlung ?? 'pruefen') !== empfehlung) return false
      if (nurAuffaellig && (z.urteil?.auffaelligkeiten.length ?? 0) === 0) return false
      if (nurGewaehlt && !gewaehlt.has(z.kennung)) return false
      if (grenze > 0 && (z.preis ?? 0) > grenze) return false
      return true
    })

    const richtung = absteigend ? -1 : 1
    // Fehlende Werte immer ans Ende, in beide Richtungen: ein Fahrzeug ohne
    // Preisangabe gehört weder an den Anfang der aufsteigenden noch an den
    // der absteigenden Liste.
    const zahl = (wert: number | null | undefined) =>
      wert == null ? Number.POSITIVE_INFINITY * richtung : wert

    return [...gefiltert].sort((a, b) => {
      switch (sortierung) {
        case 'preis':
          return (zahl(a.preis) - zahl(b.preis)) * richtung
        case 'kilometerstand':
          return (zahl(a.kilometerstand) - zahl(b.kilometerstand)) * richtung
        case 'erstzulassung':
          return (ezWert(a.erstzulassung) - ezWert(b.erstzulassung)) * richtung
        case 'entfernung':
          return (zahl(a.entfernungKm) - zahl(b.entfernungKm)) * richtung
        case 'vergleichbarkeit':
          return (zahl(a.urteil?.vergleichbarkeit) - zahl(b.urteil?.vergleichbarkeit)) * richtung
        default:
          return (a.rang - b.rang) * richtung
      }
    })
  }, [zeilen, quelle, empfehlung, nurAuffaellig, nurGewaehlt, hoechstpreis, sortierung, absteigend, gewaehlt])

  function schalte(kennung: string) {
    setzeGewaehlt((vorher) => {
      const naechste = new Set(vorher)
      if (naechste.has(kennung)) naechste.delete(kennung)
      else naechste.add(kennung)
      return naechste
    })
  }

  /** Der Haken in der Überschrift wirkt nur auf das, was gerade zu sehen ist. */
  function schalteAlleSichtbaren(an: boolean) {
    setzeGewaehlt((vorher) => {
      const naechste = new Set(vorher)
      for (const z of sichtbar) {
        if (an) naechste.add(z.kennung)
        else naechste.delete(z.kennung)
      }
      return naechste
    })
  }

  function sortiereNach(spalte: Sortierung) {
    if (sortierung === spalte) setzeAbsteigend(!absteigend)
    else {
      setzeSortierung(spalte)
      setzeAbsteigend(false)
    }
  }

  const alleSichtbarenGewaehlt = sichtbar.length > 0 && sichtbar.every((z) => gewaehlt.has(z.kennung))
  const gefiltert = Boolean(quelle || empfehlung || nurAuffaellig || nurGewaehlt || hoechstpreis)
  // `Spaltenkopf` (geteilt mit den serverseitig sortierten Listen) erwartet
  // die Richtung als Wort, nicht als Bool - das bleibt hier lokal, damit der
  // übrige Zustand dieser Tabelle unangetastet bleibt.
  const richtung: Richtung = absteigend ? 'absteigend' : 'aufsteigend'

  return (
    <>
      <div className="korb-filter">
        <div className="feld">
          <label htmlFor="korb-quelle">Portal</label>
          <select id="korb-quelle" value={quelle} onChange={(e) => setzeQuelle(e.target.value)}>
            <option value="">Alle Portale</option>
            {quellen.map((q) => (
              <option key={q} value={q}>
                {q}
              </option>
            ))}
          </select>
        </div>

        <div className="feld">
          <label htmlFor="korb-empfehlung">Vorschlag</label>
          <select
            id="korb-empfehlung"
            value={empfehlung}
            onChange={(e) => setzeEmpfehlung(e.target.value)}
          >
            <option value="">Alle Vorschläge</option>
            <option value="aufnehmen">aufnehmen</option>
            <option value="pruefen">prüfen</option>
            <option value="verwerfen">verwerfen</option>
          </select>
        </div>

        <div className="feld">
          <label htmlFor="korb-preis">Höchstpreis</label>
          <input
            id="korb-preis"
            type="text"
            inputMode="numeric"
            value={hoechstpreis}
            onChange={(e) => setzeHoechstpreis(e.target.value)}
            placeholder="EUR"
            style={{ width: 110 }}
          />
        </div>

        <label className="korb-schalter">
          <input
            type="checkbox"
            checked={nurAuffaellig}
            onChange={(e) => setzeNurAuffaellig(e.target.checked)}
          />
          nur mit Auffälligkeit
        </label>

        <label className="korb-schalter">
          <input
            type="checkbox"
            checked={nurGewaehlt}
            onChange={(e) => setzeNurGewaehlt(e.target.checked)}
          />
          nur gewählte
        </label>

        <span className="treffer-zahl">
          {gefiltert ? `${sichtbar.length} von ${zeilen.length} gezeigt · ` : ''}
          {gewaehlt.size} gewählt
        </span>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table className="korb-tabelle">
          <thead>
            <tr>
              <th>
                <input
                  type="checkbox"
                  checked={alleSichtbarenGewaehlt}
                  onChange={(e) => schalteAlleSichtbaren(e.target.checked)}
                  aria-label={
                    alleSichtbarenGewaehlt
                      ? 'Alle gezeigten Fahrzeuge abwählen'
                      : 'Alle gezeigten Fahrzeuge wählen'
                  }
                />
              </th>
              <Spaltenkopf spalte="rang" jetzt={sortierung} richtung={richtung} klick={sortiereNach}>
                #
              </Spaltenkopf>
              <th>Fahrzeug</th>
              <Spaltenkopf spalte="preis" jetzt={sortierung} richtung={richtung} klick={sortiereNach}>
                Preis
              </Spaltenkopf>
              <Spaltenkopf
                spalte="kilometerstand"
                jetzt={sortierung}
                richtung={richtung}
                klick={sortiereNach}
              >
                km
              </Spaltenkopf>
              <Spaltenkopf
                spalte="erstzulassung"
                jetzt={sortierung}
                richtung={richtung}
                klick={sortiereNach}
              >
                EZ
              </Spaltenkopf>
              <th>kW</th>
              <Spaltenkopf
                spalte="entfernung"
                jetzt={sortierung}
                richtung={richtung}
                klick={sortiereNach}
              >
                Ort
              </Spaltenkopf>
              <Spaltenkopf
                spalte="vergleichbarkeit"
                jetzt={sortierung}
                richtung={richtung}
                klick={sortiereNach}
              >
                Beurteilung
              </Spaltenkopf>
            </tr>
          </thead>
          <tbody>
            {sichtbar.map((f) => (
              <tr key={f.kennung} className={gewaehlt.has(f.kennung) ? 'gewaehlt' : undefined}>
                <td>
                  <input
                    type="checkbox"
                    checked={gewaehlt.has(f.kennung)}
                    onChange={() => schalte(f.kennung)}
                    aria-label={`${f.titel ?? 'Fahrzeug'} in den Korb nehmen`}
                  />
                </td>
                <td>{f.rang}</td>
                <td>
                  {f.url ? (
                    <a href={f.url} target="_blank" rel="noopener noreferrer">
                      {f.titel ?? 'ohne Titel'}
                    </a>
                  ) : (
                    (f.titel ?? 'ohne Titel')
                  )}
                  {/*
                    Die Liste des Plugins nur, solange kein Urteil vorliegt.
                    Sonst stünde dieselbe Aussage zweimal nebeneinander — das
                    Plugin zählt, was in der Ausstattungsliste des Portals
                    fehlt, die Prüfung, was im ganzen Inserat fehlt. Bei drei
                    Fahrzeugen war es dieselbe elfgliedrige Aufzählung,
                    dreimal untereinander, und die Spalte daneben sagte es
                    kürzer und richtiger.
                  */}
                  {!f.urteil && f.fehlend.length > 0 ? (
                    <span className="unterzeile" style={{ display: 'block' }}>
                      ohne Angabe zu: {f.fehlend.join(', ')}
                    </span>
                  ) : null}
                </td>
                <td className="zahl">{betrag(f.preis)}</td>
                <td className="zahl">
                  {f.kilometerstand ? f.kilometerstand.toLocaleString('de-DE') : '—'}
                </td>
                <td className="zahl">{f.erstzulassung ?? '—'}</td>
                {/*
                  Die Leistung steht bewusst mit in der Tabelle. Die
                  Toleranzprüfung des Plugins lässt unbekannte Werte durch —
                  richtig so, sonst verlöre man belastbare Fahrzeuge wegen
                  einer Lücke im Inserat. Nur fällt ein Fahrzeug ohne
                  kW-Angabe dann nicht mehr auf. Hier fällt es auf.
                */}
                <td className="zahl">
                  {f.leistungKw ?? <span style={{ color: 'var(--ink-soft)' }}>ohne Angabe</span>}
                </td>
                <td>
                  {f.ort ?? '—'}
                  {f.entfernungKm !== null ? (
                    <span className="unterzeile"> · {Math.round(f.entfernungKm)} km</span>
                  ) : null}
                  <span className="unterzeile" style={{ display: 'block' }}>
                    {f.quelle ?? '—'}
                  </span>
                </td>
                <td>
                  <Beurteilung urteil={f.urteil} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {sichtbar.length === 0 ? (
        <div className="leer" style={{ marginTop: 12 }}>
          <p style={{ margin: 0 }}>Kein Fahrzeug passt zu diesem Filter.</p>
        </div>
      ) : null}

      <div className="korb-fuss">
        <span className="unterzeile">
          {gewaehlt.size === 0
            ? 'Kein Fahrzeug gewählt — die Anlage bliebe leer.'
            : `${gewaehlt.size} von ${zeilen.length} Fahrzeugen im Korb`}
        </span>
        <button
          type="button"
          className="haupt"
          disabled={laeuft || gewaehlt.size === 0}
          onClick={() =>
            starte(async () => {
              const ergebnis = await uebernimmKorb(laufId, [...gewaehlt])
              const meldung = ausErgebnis(ergebnis)
              if (meldung) melde(meldung)
              if (!ergebnis.fehler) setzeUebernommen(true)
            })
          }
        >
          {laeuft ? <Kreisel text="Korb übernehmen" /> : 'Korb übernehmen'}
        </button>

        {/*
          Ein zweiter, bewusster Handgriff. Der Upload wirkt nach draussen
          und in ein System, aus dem das Cockpit nichts zurücknehmen kann —
          das soll kein Nebeneffekt des Übernehmens sein.
        */}
        <button
          type="button"
          disabled={laedtHoch || !uebernommen}
          title={
            uebernommen
              ? undefined
              : 'Erst den Korb übernehmen — die Belege entstehen aus der gespeicherten Auswahl.'
          }
          onClick={() =>
            starteUpload(async () => {
              const ergebnis = await ladeBelegeInGutachtenordner(laufId)
              const meldung = ausErgebnis(ergebnis)
              if (meldung) melde(meldung)
            })
          }
        >
          {laedtHoch ? (
            <Kreisel text="In den Gutachtenordner laden" />
          ) : (
            'In den Gutachtenordner laden'
          )}
        </button>
      </div>

      {/*
        Was hochgeladen wird, steht vorher da — nicht erst in der Meldung
        danach. Die Grenze von 10.000 EUR ist eine Regel des Hauses und
        sollte nicht wie eine Überraschung wirken.
      */}
      <p className="unterzeile" style={{ marginTop: 6 }}>
        {wbwVorschlag !== null && wbwVorschlag >= 10000
          ? `Beim Vorschlag von ${betrag(wbwVorschlag)} gehen die Portalpakete in den Ordner — Einzelbelege erst unter 10.000 €.`
          : 'Es gehen Einzelbelege je Fahrzeug und die Portalpakete in den Ordner.'}
      </p>
    </>
  )
}

/** Das Urteil der Prüfung, so knapp wie es tragbar ist. */
function Beurteilung({ urteil }: { urteil: Pruefurteil | undefined }) {
  if (!urteil) {
    return <span className="unterzeile">nicht geprüft</span>
  }

  const marke =
    urteil.empfehlung === 'aufnehmen'
      ? 'm-freigegeben'
      : urteil.empfehlung === 'verwerfen'
        ? 'm-zurueckgezogen'
        : 'm-entwurf'

  return (
    <div style={{ minWidth: 220, maxWidth: 380 }}>
      <span className={`marke-pille ${marke}`}>
        {urteil.empfehlung === 'aufnehmen'
          ? 'aufnehmen'
          : urteil.empfehlung === 'verwerfen'
            ? 'verwerfen'
            : 'prüfen'}
        {urteil.ungeprueft ? '' : ` · ${urteil.vergleichbarkeit}`}
      </span>
      <span className="unterzeile" style={{ display: 'block', marginTop: 3 }}>
        {urteil.begruendung}
      </span>
      {urteil.auffaelligkeiten.length > 0 ? (
        <span style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
          {urteil.auffaelligkeiten.map((a: Auffaelligkeit) => (
            <span key={a} className="marke-pille m-warn" title={AUFFAELLIGKEITEN[a]}>
              {AUFFAELLIGKEITEN[a]}
            </span>
          ))}
        </span>
      ) : null}
      {urteil.erkannteAusstattung.length > 0 || urteil.fehlendeAusstattung.length > 0 ? (
        <span className="unterzeile" style={{ display: 'block', marginTop: 3 }}>
          Ausstattung: {urteil.erkannteAusstattung.length} von{' '}
          {urteil.erkannteAusstattung.length + urteil.fehlendeAusstattung.length}
          {urteil.fehlendeAusstattung.length > 0
            ? ` — ohne ${urteil.fehlendeAusstattung.join(', ')}`
            : ''}
        </span>
      ) : null}
    </div>
  )
}
