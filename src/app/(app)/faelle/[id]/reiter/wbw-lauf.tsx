'use client'

import { useEffect, useRef, useState } from 'react'
import { frageStandAb, starteRecherche } from '@/wbw/aktionen'
import type { LaufEingaben, Laufstand } from '@/wbw/auftrag'
import type { Portal, Schritt } from '@/wbw/lauf'
import { leseErgebnis, trichterzeilen, type Korbeintrag, type Laufergebnis } from '@/wbw/ergebnis'
import type { Pruefurteil } from '@/wbw/urteil'
import { Korbtabelle } from './korbtabelle'
import { Meldung } from '@/app/teile/meldung'
import { useMelder } from '@/app/teile/melder'
import { fehler as alsFehler, info } from '@/melden/typen'

/**
 * Der Knopf, der die Recherche anstösst — und alles, was danach kommt.
 *
 * **Warum nicht einfach warten:** Ein Lauf dauert Minuten. AutoScout24 und
 * Kleinanzeigen werden nacheinander abgefragt, zwischen den Abrufen wird
 * bewusst pausiert, und zu jedem Kleinanzeigen-Inserat kommt eine
 * Detailseite. Der Lauf arbeitet deshalb im Hintergrund weiter; hier wird nur
 * alle zwei Sekunden nach seinem Stand gefragt.
 *
 * **Was der Fortschritt zeigt, ist der echte Ablauf** — Suchzentrum,
 * Modellauflösung, jedes Portal einzeln, dann Auswertung. Ein Balken, der
 * nichts weiss, wäre hier das Falsche: wenn Kleinanzeigen vier Minuten
 * braucht, soll dastehen, dass Kleinanzeigen läuft.
 */

const ABSTAND_MS = 2000

export function WbwLauf({
  fallId,
  eingaben,
  fehlt,
  vorheriger,
}: {
  fallId: string
  /** Die Suchangaben, wie der Reiter sie gerade zusammenhat. */
  eingaben: LaufEingaben
  /** Pflichtangaben, die noch fehlen. Ist die Liste voll, bleibt der Knopf aus. */
  fehlt: string[]
  /** Der jüngste Lauf dieses Falls, beim Öffnen der Seite geladen. */
  vorheriger: Laufstand | null
}) {
  const [stand, setzeStand] = useState<Laufstand | null>(vorheriger)
  const [fehler, setzeFehler] = useState<string | null>(null)
  const [startet, setzeStartet] = useState(false)
  const { melde } = useMelder()
  const laeuft = stand?.zustand === 'laeuft'

  // Solange gefragt wird, bis der Lauf zu Ende ist. Der Verweis auf die
  // Kennung verhindert, dass eine alte Abfrage einen neuen Lauf überschreibt.
  const aktuelleId = useRef<string | null>(vorheriger?.id ?? null)
  useEffect(() => {
    if (!laeuft || !stand) return
    const id = stand.id
    aktuelleId.current = id
    let abgebrochen = false

    const uhr = setInterval(() => {
      void frageStandAb(id)
        .then((neu) => {
          if (abgebrochen || !neu || aktuelleId.current !== id) return
          setzeStand(neu)
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
  }, [laeuft, stand])

  async function starte() {
    setzeFehler(null)
    setzeStartet(true)
    try {
      const antwort = await starteRecherche(fallId, eingaben)
      if (antwort.fehler) {
        setzeFehler(antwort.fehler)
        return
      }
      if (antwort.id) {
        const frisch = await frageStandAb(antwort.id)
        aktuelleId.current = antwort.id
        setzeStand(frisch)
        // Der Lauf dauert Minuten, und man darf inzwischen weggehen. Die
        // Einblendung sagt das, statt es den Benutzer herausfinden zu lassen.
        melde(
          info(
            'Der Lauf dauert einige Minuten. Du kannst weiterarbeiten — ' +
              'wenn er fertig ist, meldet sich das Cockpit.',
            'Recherche gestartet',
          ),
        )
      }
    } catch (ausnahme) {
      const text =
        ausnahme instanceof Error ? ausnahme.message : 'Der Lauf liess sich nicht starten.'
      setzeFehler(text)
      melde(alsFehler(text, 'Recherche nicht gestartet'))
    } finally {
      setzeStartet(false)
    }
  }

  const ergebnis = stand?.zustand === 'fertig' ? leseErgebnis(stand.ergebnis) : null

  return (
    <div className="block">
      <div className="block-label">Vergleichsfahrzeuge suchen</div>
      <div className="karte">
        {fehlt.length > 0 ? (
          <Meldung art="warnung" style={{ marginBottom: 12 }}>
            Es fehlt noch: {fehlt.join(', ')}. Ohne diese Angaben wird der Vergleichskorb
            beliebig.
          </Meldung>
        ) : null}

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <button
            type="button"
            disabled={fehlt.length > 0 || laeuft || startet}
            onClick={() => void starte()}
          >
            {laeuft ? 'Recherche läuft …' : startet ? 'Wird gestartet …' : 'Vergleichsfahrzeuge suchen'}
          </button>
          <span className="unterzeile">
            {eingaben.portale.length > 0
              ? `${eingaben.portale.join(', ')} — dauert einige Minuten`
              : 'Kein Portal ausgewählt'}
          </span>
        </div>

        {fehler ? (
          <Meldung art="fehler" style={{ marginTop: 12 }}>
            {fehler}
          </Meldung>
        ) : null}

        {stand ? <Fortschritt stand={stand} /> : null}
        {ergebnis && stand ? (
          <Ergebnis
            ergebnis={ergebnis}
            laufId={stand.id}
            urteile={stand.urteile}
            auswahl={stand.auswahl}
          />
        ) : null}
      </div>
    </div>
  )
}

const ZEICHEN: Record<Schritt['stand'], string> = {
  laeuft: '…',
  fertig: '✓',
  leer: '–',
  fehler: '✕',
}

/*
  Die Tokens heissen `--good` und `--accent`. Hier stand `var(--ok,
  var(--akzent))` — beide Namen gibt es nicht, der Haken erbte deshalb
  stillschweigend die Textfarbe statt grün zu sein. Ein Fehler, den man nur
  sieht, wenn man weiss, wie er aussehen sollte.
*/
const FARBE: Record<Schritt['stand'], string> = {
  laeuft: 'var(--ink-soft)',
  fertig: 'var(--good)',
  leer: 'var(--ink-soft)',
  fehler: 'var(--crit)',
}

function Fortschritt({ stand }: { stand: Laufstand }) {
  return (
    <div style={{ marginTop: 16 }}>
      <div className="block-label" style={{ justifyContent: 'flex-start', marginBottom: 6 }}>
        {stand.zustand === 'laeuft'
          ? 'Läuft'
          : stand.zustand === 'fertig'
            ? 'Abgeschlossen'
            : 'Abgebrochen'}
        <span className="unterzeile" style={{ marginLeft: 8 }}>
          seit {new Date(stand.begonnenAm).toLocaleTimeString('de-DE')}
        </span>
      </div>

      {stand.protokoll.length === 0 ? (
        <p className="unterzeile" style={{ margin: 0 }}>
          Der Lauf ist angelegt und beginnt gleich.
        </p>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, fontSize: 13.5 }}>
          {/*
            Der Schlüssel enthält die Position, nicht nur den Namen: ein
            Protokoll aus einem älteren Lauf kann denselben Namen zweimal
            tragen (das Plugin hängt „läuft" und „fertig" getrennt an). Mit
            dem Namen allein hat React die Zeilen eines vorherigen Laufs
            weiterverwendet und die Marken eines neuen darübergelegt.
          */}
          {stand.protokoll.map((schritt, i) => (
            <li
              key={`${i}-${schritt.name}`}
              style={{ display: 'flex', gap: 8, padding: '3px 0', alignItems: 'baseline' }}
            >
              <span aria-hidden style={{ color: FARBE[schritt.stand], width: 14 }}>
                {ZEICHEN[schritt.stand]}
              </span>
              <span>
                {schritt.name}
                {schritt.text ? (
                  <span className="unterzeile" style={{ display: 'block' }}>
                    {schritt.text}
                  </span>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      )}

      {stand.zustand === 'fehler' && stand.fehler ? (
        <Meldung art="fehler" style={{ marginTop: 10 }}>
          {stand.fehler}
        </Meldung>
      ) : null}
    </div>
  )
}

/**
 * Warnt vor Fahrzeugen ohne Leistungsangabe.
 *
 * Die Toleranzprüfung des Plugins lässt unbekannte Werte durch. Das ist
 * richtig — sonst verlöre man belastbare Vergleichsfahrzeuge wegen einer
 * Lücke im Inserat. Nur fällt damit die letzte Sperre weg: im Lauf vom
 * 07.09.2026 stand eine E-Klasse Diesel für 26.000 EUR ohne kW-Angabe im
 * Korb einer 320-kW-AMG-Suche und zog den Median um rund 1.400 EUR nach
 * unten. Aussortiert wird sie hier nicht — das ist die Entscheidung des
 * Sachverständigen. Unbemerkt bleiben soll sie aber auch nicht.
 */
function OhneLeistung({ korb }: { korb: Korbeintrag[] }) {
  const betroffen = korb.filter((f) => f.leistungKw === null)
  if (betroffen.length === 0) return null
  return (
    <Meldung art="warnung" style={{ marginBottom: 8 }}>
      {betroffen.length === 1
        ? 'Ein Fahrzeug im Korb macht keine Angabe zur Leistung'
        : `${betroffen.length} Fahrzeuge im Korb machen keine Angabe zur Leistung`}{' '}
      (Rang {betroffen.map((f) => f.rang).join(', ')}). Die Toleranzprüfung lässt unbekannte
      Werte bewusst durch — bitte prüfen, ob sie zum Subjektfahrzeug passen.
    </Meldung>
  )
}

const euro = new Intl.NumberFormat('de-DE', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
})

function betrag(wert: number | null): string {
  return wert === null ? '—' : euro.format(wert)
}

function Ergebnis({
  ergebnis,
  laufId,
  urteile,
  auswahl,
}: {
  ergebnis: Laufergebnis
  laufId: string
  urteile: Record<string, Pruefurteil>
  auswahl: string[] | null
}) {
  const zeilen = trichterzeilen(ergebnis.trichter)

  return (
    <div style={{ marginTop: 18 }}>
      <div className="block-label" style={{ justifyContent: 'flex-start', marginBottom: 8 }}>
        Wiederbeschaffungswert
      </div>

      <div
        style={{
          display: 'flex',
          gap: 20,
          flexWrap: 'wrap',
          alignItems: 'baseline',
          marginBottom: 4,
        }}
      >
        <div>
          <div style={{ fontSize: 26, fontWeight: 650 }}>
            {betrag(ergebnis.wert.vorschlagBrutto)}
          </div>
          <span className="unterzeile">
            Vorschlag brutto — Median der um Laufleistung und Alter bereinigten Preise
          </span>
        </div>
        <dl className="kv" style={{ gridTemplateColumns: 'auto 1fr', gap: '2px 12px', margin: 0 }}>
          <dt>Fahrzeuge im Korb</dt>
          <dd style={{ textAlign: 'left' }}>{ergebnis.wert.anzahl ?? '—'}</dd>
          <dt>Median roh</dt>
          <dd style={{ textAlign: 'left' }}>{betrag(ergebnis.wert.medianRoh)}</dd>
          <dt>Spanne</dt>
          <dd style={{ textAlign: 'left' }}>
            {betrag(ergebnis.wert.min)} – {betrag(ergebnis.wert.max)}
          </dd>
        </dl>
      </div>

      <p className="unterzeile" style={{ margin: '10px 0 4px' }}>
        Der Vorschlag ist eine Rechengrösse, kein Ergebnis: Zu- und Abschläge für Zustand,
        Vorschäden und Marktlage bleiben Sache des Sachverständigen.
      </p>

      {zeilen.length > 0 ? (
        <>
          <div className="block-label" style={{ justifyContent: 'flex-start', margin: '16px 0 6px' }}>
            Wie der Korb zustande kam
          </div>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13.5 }}>
            {zeilen.map((z) => (
              <li key={z.name}>
                {z.wert} {z.name}
              </li>
            ))}
          </ul>
        </>
      ) : null}

      {ergebnis.korb.length > 0 ? (
        <>
          <div className="block-label" style={{ justifyContent: 'flex-start', margin: '16px 0 6px' }}>
            Vergleichsfahrzeuge
          </div>
          <OhneLeistung korb={ergebnis.korb} />
          <Korbtabelle
            laufId={laufId}
            korb={ergebnis.korb}
            urteile={urteile}
            auswahl={auswahl}
          />
        </>
      ) : null}
    </div>
  )
}
