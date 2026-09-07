'use client'

import { useMemo, useState } from 'react'
import type { Gutachten } from '@/autoixpert/typen'
import { fehlendeAngaben, reportToWbwParams, type WbwEingaben } from '@/wbw/params'

/**
 * Der Reiter „Wiederbeschaffungswert".
 *
 * Die Fahrzeugdaten kommen aus dem Gutachten; einzugeben ist nur, was
 * autoiXpert nicht kennt — die Ausstattungslinie, die Soll-Ausstattung, das
 * Suchzentrum und die Toleranzen. Bisher wurden diese Angaben im Gespräch
 * abgefragt und die Eingabedatei von Hand geschrieben.
 *
 * Der Recherchelauf über mobile.de, AutoScout24 und Kleinanzeigen ist noch
 * nicht angeschlossen: er braucht einen Job-Dienst und die Zugangsdaten der
 * Portale. Was hier entsteht, ist die fertige `params.json`, die das
 * WBW-Plugin unverändert entgegennimmt — und zwar mit einer ehrlichen
 * Ansage, welche Pflichtangabe noch fehlt, statt eines Laufs, dessen Korb
 * beliebig wird.
 */
export function WbwReiter({ gutachten }: { gutachten: Gutachten }) {
  const [eingaben, setzeEingaben] = useState<WbwEingaben>({})
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
        <div className="block">
          <div className="block-label">Suchparameter</div>
          <div className="karte">
            <dl className="kv" style={{ gridTemplateColumns: 'minmax(140px,auto) 1fr' }}>
              <dt>Hersteller / Modell</dt>
              <dd style={{ textAlign: 'left' }}>
                {[params.subject.marke, params.subject.modell].filter(Boolean).join(' ') || '—'}
              </dd>
              <dt>Erstzulassung</dt>
              <dd style={{ textAlign: 'left' }}>{params.subject.ez || '—'}</dd>
              <dt>Laufleistung</dt>
              <dd style={{ textAlign: 'left' }}>
                {params.subject.mileage ? `${params.subject.mileage.toLocaleString('de-DE')} km` : '—'}
              </dd>
              <dt>Leistung</dt>
              <dd style={{ textAlign: 'left' }}>
                {params.subject.power ? `${params.subject.power} kW` : '—'}
              </dd>
            </dl>

            <p className="unterzeile" style={{ marginBottom: 16 }}>
              Diese vier Angaben stammen aus dem Gutachten. Alles Weitere kennt autoiXpert
              nicht und muss hier ergänzt werden.
            </p>

            <div className="feld" style={{ marginBottom: 14 }}>
              <label htmlFor="wbw-variante">
                Variante / Ausstattungslinie — z. B. „2.0 TDI Highline"
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
                <label htmlFor="wbw-getriebe">Getriebe</label>
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
              Es fehlt noch: {fehlt.join(', ')}. Ohne diese Angaben wird der
              Vergleichskorb beliebig.
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

        <div className="hinweis">
          Der Recherchelauf über mobile.de, AutoScout24 und Kleinanzeigen ist noch nicht
          angeschlossen — dafür fehlen der Job-Dienst und die Zugangsdaten der Portale.
          Diese Datei nimmt das Plugin unverändert entgegen.
        </div>
      </aside>
    </div>
  )
}
