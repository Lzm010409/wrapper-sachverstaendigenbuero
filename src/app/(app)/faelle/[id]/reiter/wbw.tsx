'use client'

import { useMemo, useState } from 'react'
import type { Gutachten } from '@/autoixpert/typen'
import { fehlendeAngaben, reportToWbwParams, type WbwEingaben } from '@/wbw/params'
import type { KalkulationStand } from '@/fall/kalkulation'
import type { WbwVorschlag } from '@/wbw/vorschlag'
import type { Merkmal } from '@/wbw/ausstattung'

/**
 * Der Reiter „Wiederbeschaffungswert".
 *
 * **Was sich geändert hat:** Bis hierher stammten die Fahrzeugdaten allein
 * aus dem Gutachten-Objekt, und das ist für eine Vergleichsfahrzeugsuche zu
 * dünn. Es führt als Modell die **Baureihe** (`E Limousine (BM 213)`) — eine
 * Suche danach mischt 143-kW-Diesel mit einem 320-kW-AMG. Getriebe und Türen
 * kennt es gar nicht, und für die Ausstattung hat es **kein einziges Feld**;
 * sie musste eingetippt werden.
 *
 * Die DAT-Kalkulation desselben Gutachtens hat all das. Sie wird jetzt
 * gelesen und als **Vorschlag** angeboten: Untertyp, Ausstattungslinie,
 * Getriebe, Türen und die Ausstattung, die sich aus der Fahrgestellnummer
 * ergibt (im Musterfall 66 Sonder- und 50 Serienpositionen, daraus zwölf
 * Merkmale, die das Plugin kennt).
 *
 * **Vorschlag, nicht Vorgabe.** Jede übernommene Angabe trägt sichtbar ihre
 * Herkunft, jedes Merkmal die DAT-Zeile, aus der es stammt, und alles bleibt
 * überschreibbar. Wo Gutachten und Kalkulation verschiedene Zahlen nennen,
 * steht die Abweichung da, statt sich stillschweigend für eine zu
 * entscheiden.
 */
export function WbwReiter({
  gutachten,
  vorschlag,
  kalkulationsstand,
}: {
  gutachten: Gutachten
  vorschlag: WbwVorschlag | null
  kalkulationsstand: KalkulationStand
}) {
  // Der Vorschlag ist die Voreinstellung, nicht der Wert: jedes Feld bleibt
  // ein gewöhnliches Eingabefeld, das der Sachverständige überschreibt.
  const [eingaben, setzeEingaben] = useState<WbwEingaben>(() => ausVorschlag(vorschlag))
  const [kopiert, setzeKopiert] = useState(false)

  const params = useMemo(() => reportToWbwParams(gutachten, eingaben), [gutachten, eingaben])
  const fehlt = fehlendeAngaben(params)
  const text = JSON.stringify(params, null, 2)

  function setze<K extends keyof WbwEingaben>(schluessel: K, wert: WbwEingaben[K]) {
    setzeEingaben((alt) => ({ ...alt, [schluessel]: wert }))
    setzeKopiert(false)
  }

  return (
    <div className="detail">
      <div>
        {vorschlag ? <Abweichungen vorschlag={vorschlag} /> : null}

        <div className="block">
          <div className="block-label">
            Suchparameter
            {vorschlag ? (
              <span className="marke-pille m-akzent">ergänzt aus der DAT-Kalkulation</span>
            ) : null}
          </div>
          <div className="karte">
            <div className="feld" style={{ marginBottom: 14 }}>
              <label htmlFor="wbw-modell">
                Modell — der Suchbegriff für die Portale
                <Herkunft angabe={vorschlag?.modell} />
              </label>
              <input
                id="wbw-modell"
                type="text"
                value={eingaben.modell ?? params.subject.modell}
                onChange={(e) => setze('modell', e.target.value)}
              />
              <span className="unterzeile">
                {vorschlag?.modell
                  ? `Aus der Kalkulation: „${vorschlag.modell.beleg}“. Im Gutachten steht nur die Baureihe „${gutachten.car?.model ?? '—'}“ — eine Suche danach mischt Motorvarianten.`
                  : 'Aus dem Gutachten. Steht dort die Baureihe, wird der Korb beliebig.'}
              </span>
            </div>

            <dl className="kv" style={{ gridTemplateColumns: 'minmax(140px,auto) 1fr' }}>
              <dt>Hersteller</dt>
              <dd style={{ textAlign: 'left' }}>{params.subject.marke || '—'}</dd>
              <dt>Erstzulassung</dt>
              <dd style={{ textAlign: 'left' }}>{params.subject.ez || '—'}</dd>
              <dt>Laufleistung</dt>
              <dd style={{ textAlign: 'left' }}>
                {params.subject.mileage
                  ? `${params.subject.mileage.toLocaleString('de-DE')} km`
                  : '—'}
              </dd>
              <dt>Leistung</dt>
              <dd style={{ textAlign: 'left' }}>
                {params.subject.power ? `${params.subject.power} kW` : '—'}
              </dd>
              {vorschlag?.baureihe ? (
                <>
                  <dt>Baureihe</dt>
                  <dd style={{ textAlign: 'left' }}>
                    {vorschlag.baureihe}
                    <span className="unterzeile" style={{ display: 'block' }}>
                      für Kleinanzeigen — dort gibt es keine Motorvarianten
                    </span>
                  </dd>
                </>
              ) : null}
              {vorschlag?.farbe ? (
                <>
                  <dt>Farbe</dt>
                  <dd style={{ textAlign: 'left' }}>{vorschlag.farbe}</dd>
                </>
              ) : null}
            </dl>

            <div className="feld" style={{ margin: '16px 0 14px' }}>
              <label htmlFor="wbw-variante">
                Variante / Ausstattungslinie — z. B. „2.0 TDI Highline“
                {vorschlag?.linie ? <span className="marke-pille m-akzent">DAT</span> : null}
              </label>
              <input
                id="wbw-variante"
                type="text"
                value={eingaben.variante ?? ''}
                onChange={(e) => setze('variante', e.target.value)}
              />
              <span className="unterzeile">
                Die Linie filtert den Vergleichskorb hart. Ohne sie mischt sich Basis mit
                Vollausstattung, und der Median wird wertlos.
              </span>
            </div>

            <div className="feldgruppe" style={{ marginBottom: 14 }}>
              <div className="feld" style={{ flex: 1, minWidth: 140 }}>
                <label htmlFor="wbw-plz">Zentrum-PLZ</label>
                <input
                  id="wbw-plz"
                  type="text"
                  inputMode="numeric"
                  value={eingaben.plz ?? params.plz}
                  onChange={(e) => setze('plz', e.target.value)}
                />
              </div>
              <div className="feld" style={{ flex: 1, minWidth: 140 }}>
                <label htmlFor="wbw-getriebe">
                  Getriebe
                  <Herkunft angabe={vorschlag?.getriebe} />
                </label>
                <select
                  id="wbw-getriebe"
                  value={eingaben.getriebe ?? 'egal'}
                  onChange={(e) => setze('getriebe', e.target.value as WbwEingaben['getriebe'])}
                >
                  <option value="egal">egal</option>
                  <option value="Automatik">Automatik</option>
                  <option value="Manuell">Manuell</option>
                </select>
              </div>
              <div className="feld" style={{ flex: 1, minWidth: 110 }}>
                <label htmlFor="wbw-tueren">
                  Türen
                  <Herkunft angabe={vorschlag?.tueren} />
                </label>
                <input
                  id="wbw-tueren"
                  type="number"
                  value={eingaben.tueren ?? ''}
                  onChange={(e) =>
                    setze('tueren', e.target.value ? Number(e.target.value) : undefined)
                  }
                />
              </div>
            </div>

            <div className="feld" style={{ marginBottom: 14 }}>
              <label htmlFor="wbw-ausstattung">Soll-Ausstattung, mit Komma getrennt</label>
              <textarea
                id="wbw-ausstattung"
                rows={2}
                style={{ minHeight: 62, fontFamily: 'var(--sans)', fontSize: 14 }}
                placeholder="Klimaautomatik, Sitzheizung, Panoramadach, Navigation"
                value={eingaben.sollAusstattung ?? ''}
                onChange={(e) => setze('sollAusstattung', e.target.value)}
              />
              {vorschlag ? (
                <Ausstattungsvorschlaege
                  vorschlag={vorschlag}
                  gewaehlt={eingaben.sollAusstattung ?? ''}
                  aendere={(wert) => setze('sollAusstattung', wert)}
                />
              ) : null}
            </div>

            <div className="feldgruppe">
              <div className="feld" style={{ flex: 1, minWidth: 110 }}>
                <label htmlFor="wbw-radius">Radius (km)</label>
                <input
                  id="wbw-radius"
                  type="number"
                  value={eingaben.radiusKm ?? 200}
                  onChange={(e) => setze('radiusKm', Number(e.target.value))}
                />
              </div>
              <div className="feld" style={{ flex: 1, minWidth: 110 }}>
                <label htmlFor="wbw-kmtol">km-Toleranz</label>
                <input
                  id="wbw-kmtol"
                  type="number"
                  step={1000}
                  value={eingaben.kmToleranz ?? 25000}
                  onChange={(e) => setze('kmToleranz', Number(e.target.value))}
                />
              </div>
              <div className="feld" style={{ flex: 1, minWidth: 110 }}>
                <label htmlFor="wbw-proportal">Treffer je Portal</label>
                <input
                  id="wbw-proportal"
                  type="number"
                  value={eingaben.maxItemsProPortal ?? 40}
                  onChange={(e) => setze('maxItemsProPortal', Number(e.target.value))}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      <aside className="seitenleiste">
        <div className="karte">
          <h2>Eingabedatei params.json</h2>
          {fehlt.length > 0 ? (
            <div className="hinweis warn" style={{ marginBottom: 12 }}>
              Es fehlt noch: {fehlt.join(', ')}. Ohne diese Angaben wird der Vergleichskorb
              beliebig.
            </div>
          ) : (
            <p className="unterzeile" style={{ marginTop: 0 }}>
              Alle Pflichtangaben sind gesetzt.
            </p>
          )}

          <pre
            style={{
              maxHeight: 300,
              overflow: 'auto',
              background: 'var(--surface-alt)',
              borderRadius: 'var(--radius)',
              padding: 10,
              fontSize: 11.5,
              lineHeight: 1.5,
              margin: '0 0 12px',
            }}
          >
            {text}
          </pre>

          <button
            type="button"
            onClick={() => {
              void navigator.clipboard.writeText(text).then(() => setzeKopiert(true))
            }}
          >
            {kopiert ? 'Kopiert' : 'params.json kopieren'}
          </button>
        </div>

        <Kalkulationshinweis stand={kalkulationsstand} vorschlag={vorschlag} />

        <div className="hinweis">
          Der Recherchelauf über mobile.de, AutoScout24 und Kleinanzeigen ist noch nicht
          angeschlossen — dafür fehlt der Job-Dienst. Diese Datei nimmt das Plugin
          unverändert entgegen.
        </div>
      </aside>
    </div>
  )
}

/** Die Voreinstellungen aus dem Vorschlag — einmal beim Öffnen des Reiters. */
function ausVorschlag(vorschlag: WbwVorschlag | null): WbwEingaben {
  if (!vorschlag) return {}
  const eingaben: WbwEingaben = {}
  if (vorschlag.modell) eingaben.modell = vorschlag.modell.wert
  if (vorschlag.linie) eingaben.variante = vorschlag.linie
  if (vorschlag.getriebe) eingaben.getriebe = vorschlag.getriebe.wert
  if (vorschlag.tueren) eingaben.tueren = vorschlag.tueren.wert
  // Vorbelegt wird die Sonderausstattung: was Serie ist, hat jedes Fahrzeug
  // der Baureihe und unterscheidet nichts.
  const sonder = vorschlag.ausstattung.sonder.map((m) => m.merkmal)
  if (sonder.length > 0) eingaben.sollAusstattung = sonder.join(', ')
  return eingaben
}

/** Die kleine Marke hinter einem Feldnamen: woher der Wert kommt. */
function Herkunft({ angabe }: { angabe?: { quelle: 'gutachten' | 'dat' } | null }) {
  if (!angabe || angabe.quelle !== 'dat') return null
  return <span className="marke-pille m-akzent">DAT</span>
}

/** Wo Gutachten und Kalkulation verschiedene Zahlen nennen. */
function Abweichungen({ vorschlag }: { vorschlag: WbwVorschlag }) {
  if (vorschlag.abweichungen.length === 0) return null
  return (
    <div className="hinweis warn" style={{ marginBottom: 12 }}>
      Gutachten und DAT-Kalkulation nennen verschiedene Werte. Gerechnet wird mit dem
      Gutachten — die Kalkulation kann älter sein als die Besichtigung.
      <ul style={{ margin: '8px 0 0', paddingLeft: 18 }}>
        {vorschlag.abweichungen.map((a) => (
          <li key={a.feld}>
            {a.feld}: Gutachten {a.ausGutachten}, DAT {a.ausDat}
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Die erkannten Merkmale zum Anklicken, jedes mit seiner DAT-Zeile. */
function Ausstattungsvorschlaege({
  vorschlag,
  gewaehlt,
  aendere,
}: {
  vorschlag: WbwVorschlag
  gewaehlt: string
  aendere: (wert: string) => void
}) {
  const liste = gewaehlt
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)

  function schalte(merkmal: string) {
    const drin = liste.some((t) => t.toLowerCase() === merkmal.toLowerCase())
    const neu = drin
      ? liste.filter((t) => t.toLowerCase() !== merkmal.toLowerCase())
      : [...liste, merkmal]
    aendere(neu.join(', '))
  }

  const alle = [...vorschlag.ausstattung.sonder, ...vorschlag.ausstattung.serie]
  if (alle.length === 0) {
    return (
      <span className="unterzeile">
        In der DAT-Kalkulation stehen {vorschlag.ausstattung.gelesen.sonder} Sonder- und{' '}
        {vorschlag.ausstattung.gelesen.serie} Serienpositionen, aber keine, die das Plugin
        als Merkmal kennt.
      </span>
    )
  }

  return (
    <div style={{ marginTop: 8 }}>
      <span className="unterzeile" style={{ display: 'block', marginBottom: 6 }}>
        Aus der DAT-Kalkulation ({vorschlag.ausstattung.gelesen.sonder} Sonder-,{' '}
        {vorschlag.ausstattung.gelesen.serie} Serienpositionen). Anklicken schaltet ein Merkmal
        zu oder ab.
      </span>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {alle.map((m: Merkmal) => {
          const drin = liste.some((t) => t.toLowerCase() === m.merkmal.toLowerCase())
          return (
            <button
              key={`${m.quelle}-${m.merkmal}`}
              type="button"
              onClick={() => schalte(m.merkmal)}
              title={`${m.quelle === 'sonder' ? 'Sonderausstattung' : 'Serie'}: ${m.beleg}`}
              aria-pressed={drin}
              className={drin ? 'marke-pille m-akzent' : 'marke-pille'}
              style={{ cursor: 'pointer', border: 'none', font: 'inherit' }}
            >
              {m.merkmal}
              {m.quelle === 'serie' ? ' (Serie)' : ''}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/** Warum kein Vorschlag da ist — jeder Grund mit eigener Aussage. */
function Kalkulationshinweis({
  stand,
  vorschlag,
}: {
  stand: KalkulationStand
  vorschlag: WbwVorschlag | null
}) {
  if (vorschlag) {
    return (
      <div className="karte">
        <h2>Woher die Ergänzungen kommen</h2>
        <p className="unterzeile" style={{ margin: 0 }}>
          Aus der DAT-Kalkulation des Gutachtens. Sie trägt den Untertyp, das Getriebe, die
          Türen und die Ausstattung — alles Angaben, die im Gutachten-Objekt der Schnittstelle
          nicht stehen. Jede ist überschreibbar.
        </p>
      </div>
    )
  }

  if (stand === 'nicht_eingerichtet') {
    return (
      <div className="hinweis warn">
        Ohne <code>AUTOIXPERT_API_TOKEN</code> lässt sich die DAT-Kalkulation nicht abrufen —
        Modell, Getriebe, Türen und Ausstattung müssen von Hand eingetragen werden.
      </div>
    )
  }

  if (stand === 'fehler') {
    return (
      <div className="hinweis fehler">
        Die DAT-Kalkulation war nicht abrufbar. Die Ergänzungen fehlen deshalb; die Angaben
        aus dem Gutachten stehen unverändert.
      </div>
    )
  }

  return (
    <div className="hinweis">
      Zu diesem Gutachten liegt keine DAT-Kalkulation vor. Modell, Ausstattungslinie,
      Getriebe, Türen und Ausstattung sind deshalb einzutragen — im Gutachten-Objekt stehen
      sie nicht.
    </div>
  )
}
