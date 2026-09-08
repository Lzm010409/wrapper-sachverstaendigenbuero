'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Gutachten } from '@/autoixpert/typen'
import { fehlendeAngaben, reportToWbwParams, type WbwEingaben } from '@/wbw/params'
import type { KalkulationStand } from '@/fall/kalkulation'
import { fehlendeLaufangaben, type LaufEingaben } from '@/wbw/lauf-eingaben'
import type { Laufstand } from '@/wbw/auftrag'
import type { Portal } from '@/wbw/lauf'
import { WbwLauf } from './wbw-lauf'
import type { WbwVorschlag } from '@/wbw/vorschlag'
import type { Merkmal } from '@/wbw/ausstattung'
import { pruefeModellname, type Modellpruefung } from '@/wbw/aktionen'

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
/** Voreinstellung: die beiden kostenlosen Portale. */
const PORTALE: { schluessel: Portal; name: string; hinweis: string; kostenpflichtig?: boolean }[] = [
  {
    schluessel: 'autoscout24',
    name: 'AutoScout24',
    hinweis: 'kennt Motorvarianten als eigenes Modell — der belastbarste Korb',
  },
  {
    schluessel: 'kleinanzeigen',
    name: 'Kleinanzeigen',
    hinweis: 'nur Baureihen, dafür viele private Angebote',
  },
  {
    schluessel: 'mobile.de',
    name: 'mobile.de',
    hinweis: 'nur über einen kostenpflichtigen Dienst erreichbar (Apify)',
    kostenpflichtig: true,
  },
]

export function WbwReiter({
  gutachten,
  vorschlag,
  kalkulationsstand,
  fallId,
  letzterLauf,
}: {
  gutachten: Gutachten
  vorschlag: WbwVorschlag | null
  kalkulationsstand: KalkulationStand
  fallId: string
  letzterLauf: Laufstand | null
}) {
  const [portale, setzePortale] = useState<Portal[]>(['autoscout24', 'kleinanzeigen'])
  // Der Vorschlag ist die Voreinstellung, nicht der Wert: jedes Feld bleibt
  // ein gewöhnliches Eingabefeld, das der Sachverständige überschreibt.
  const [eingaben, setzeEingaben] = useState<WbwEingaben>(() => ausVorschlag(vorschlag))
  const [kopiert, setzeKopiert] = useState(false)

  /*
    Ob AutoScout24 den Suchbegriff kennt. Bisher stand das erst im Protokoll
    eines laufenden Auftrags — nach fünf Minuten Wartezeit und zu spät, um das
    Feld noch zu ändern. Am 08.09.2026 kostete „Highline BMT" das Portal
    vollständig: unbekannter Name, Suche über die ganze Marke, null Treffer in
    beiden Zyklen.
  */
  const [modellpruefung, setzeModellpruefung] = useState<Modellpruefung | null>(null)
  const [pruefungLaeuft, setzePruefungLaeuft] = useState(false)
  const zuletztGeprueft = useRef<string>('')

  const params = useMemo(() => reportToWbwParams(gutachten, eingaben), [gutachten, eingaben])
  const modellwert = eingaben.modell ?? params.subject.modell
  const markeWert = params.subject.marke

  const baureiheWert = vorschlag?.baureihe ?? null

  const pruefeModell = useCallback(
    async (marke: string, modell: string) => {
      const schluessel = `${marke}|${modell}`.toLowerCase()
      // Der Abruf geht an das Portal und darf nicht an jedem Fokuswechsel
      // hängen. Dieselbe Frage wird nur einmal gestellt.
      if (!marke.trim() || !modell.trim() || zuletztGeprueft.current === schluessel) return
      zuletztGeprueft.current = schluessel
      setzePruefungLaeuft(true)
      try {
        const antwort = await pruefeModellname(marke, modell, baureiheWert)
        setzeModellpruefung(antwort)
        // Ein Abruffehler ist keine Antwort — beim nächsten Verlassen des
        // Feldes darf dieselbe Frage noch einmal gestellt werden.
        if (antwort.fehler) zuletztGeprueft.current = ''
      } finally {
        setzePruefungLaeuft(false)
      }
    },
    [baureiheWert],
  )

  useEffect(() => {
    // Beim Öffnen einmal fragen — der vorbelegte Wert ist der, mit dem sonst
    // gesucht würde. Nur wenn AutoScout24 überhaupt mitsucht.
    if (!portale.includes('autoscout24')) return
    void pruefeModell(markeWert, modellwert)
    // Absichtlich nur beim ersten Rendern und bei Portalwechsel: das Tippen im
    // Feld löst die Prüfung über `onBlur` aus, nicht bei jedem Zeichen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [portale.includes('autoscout24')])

  const fehlt = fehlendeAngaben(params)
  const text = JSON.stringify(params, null, 2)

  // Die Angaben für den Lauf entstehen aus denselben Feldern wie die
  // Eingabedatei — es gibt keine zweite Wahrheit über die Suche.
  const laufEingaben: LaufEingaben = useMemo(
    () => ({
      modell: params.subject.modell,
      baureihe: vorschlag?.baureihe ?? null,
      marke: params.subject.marke,
      variante: params.subject.variante,
      ez: params.subject.ez,
      laufleistung: params.subject.mileage,
      leistungKw: params.subject.power,
      bauart: vorschlag?.bauart ?? null,
      plz: params.plz,
      sollAusstattung: params.sollAusstattung,
      ...(params.getriebe ? { getriebe: params.getriebe } : {}),
      ...(params.tueren ? { tueren: params.tueren } : {}),
      radiusKm: params.radiusKm,
      kmToleranz: params.kmToleranz,
      ezToleranzJahre: params.ezToleranzJahre,
      leistungToleranzKw: params.leistungToleranzKw,
      maxItemsProPortal: params.maxItemsProPortal,
      portale,
      kostenpflichtigErlaubt: portale.includes('mobile.de'),
    }),
    [params, portale, vorschlag],
  )

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
                value={modellwert}
                onChange={(e) => setze('modell', e.target.value)}
                onBlur={() => {
                  if (portale.includes('autoscout24')) void pruefeModell(markeWert, modellwert)
                }}
              />
              <span className="unterzeile">
                {vorschlag?.modell
                  ? `Aus der Kalkulation: „${vorschlag.modell.beleg}“. Im Gutachten steht nur die Baureihe „${gutachten.car?.model ?? '—'}“ — eine Suche danach mischt Motorvarianten.`
                  : 'Aus dem Gutachten. Steht dort die Baureihe, wird der Korb beliebig.'}
              </span>
              <Modellhinweis
                pruefung={modellpruefung}
                laeuft={pruefungLaeuft}
                marke={markeWert}
                modell={modellwert}
                waehle={(name) => {
                  setze('modell', name)
                  void pruefeModell(markeWert, name)
                }}
              />
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

            <fieldset
              style={{ border: 0, padding: 0, margin: '0 0 14px' }}
            >
              <legend className="unterzeile" style={{ padding: 0, marginBottom: 6 }}>
                Portale
              </legend>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {PORTALE.map((p) => (
                  <label
                    key={p.schluessel}
                    style={{ display: 'flex', gap: 8, alignItems: 'baseline', fontSize: 13.5 }}
                  >
                    <input
                      type="checkbox"
                      checked={portale.includes(p.schluessel)}
                      onChange={(e) =>
                        setzePortale((alt) =>
                          e.target.checked
                            ? [...alt, p.schluessel]
                            : alt.filter((x) => x !== p.schluessel),
                        )
                      }
                    />
                    <span>
                      {p.name}
                      {p.kostenpflichtig ? (
                        <span className="marke-pille m-warn">kostenpflichtig</span>
                      ) : null}
                      <span className="unterzeile" style={{ display: 'block' }}>
                        {p.hinweis}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>

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
                  value={eingaben.kmToleranz ?? params.kmToleranz}
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

        {/*
          Der Knopf steht **unter** den Suchparametern, nicht darüber: erst
          prüft man, womit gesucht wird, dann sucht man. Der Fortschritt und
          das Ergebnis erscheinen dann dort, wo man gerade hingesehen hat.
        */}
        <WbwLauf
          fallId={fallId}
          eingaben={laufEingaben}
          fehlt={fehlendeLaufangaben(laufEingaben)}
          vorheriger={letzterLauf}
        />
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
          Die Datei nimmt das Plugin unverändert entgegen — für einen Lauf von Hand oder
          zum Nachvollziehen dessen, womit gesucht wurde.
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
/**
 * Was AutoScout24 zu dem Suchbegriff sagt — vor dem Lauf, nicht danach.
 *
 * Nur der unbekannte Name bekommt eine Warnung. Ein aufgelöster Name wird
 * knapp bestätigt, damit erkennbar ist, dass geprüft wurde; ein Abruffehler
 * sagt genau das und behauptet nicht, das Modell sei unbekannt.
 */
function Modellhinweis({
  pruefung,
  laeuft,
  marke,
  modell,
  waehle,
}: {
  pruefung: Modellpruefung | null
  laeuft: boolean
  marke: string
  modell: string
  waehle: (name: string) => void
}) {
  if (laeuft) {
    return (
      <span className="unterzeile" style={{ display: 'block', marginTop: 4 }}>
        AutoScout24 wird nach „{modell}“ gefragt …
      </span>
    )
  }
  if (!pruefung) return null

  if (pruefung.fehler) {
    return (
      <span className="unterzeile" style={{ display: 'block', marginTop: 4 }}>
        Die Modellliste von AutoScout24 war nicht erreichbar — der Suchbegriff bleibt ungeprüft.
      </span>
    )
  }

  if (pruefung.bekannt) {
    return (
      <span className="unterzeile" style={{ display: 'block', marginTop: 4 }}>
        {pruefung.quelle === 'baureihe'
          ? `AutoScout24 kennt „${modell}“ nicht — gesucht wird über die Baureihe „${pruefung.aufgeloest}“.`
          : `AutoScout24 führt das als „${pruefung.aufgeloest}“.`}
      </span>
    )
  }

  return (
    <div style={{ marginTop: 6 }}>
      <span className="marke-pille m-warn">
        AutoScout24 kennt „{modell}“ nicht
        {pruefung.anzahl > 0 ? ` — unter ${pruefung.anzahl} Modellen von ${marke}` : ''}
      </span>
      <span className="unterzeile" style={{ display: 'block', marginTop: 3 }}>
        Auch die Baureihe trifft keines seiner Modelle. Das Portal lässt einen unbekannten Namen
        stillschweigend fallen und sucht über die ganze Marke. Mit den engen Toleranzen des ersten
        Zyklus kommt dabei meist nichts zurück — der Korb stammt dann allein aus den übrigen
        Portalen.
      </span>
      {pruefung.vorschlaege.length > 0 ? (
        <span style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 5 }}>
          {pruefung.vorschlaege.map((name) => (
            <button
              key={name}
              type="button"
              className="marke-pille m-akzent"
              style={{ cursor: 'pointer', border: 0 }}
              onClick={() => waehle(name)}
            >
              {name}
            </button>
          ))}
        </span>
      ) : null}
    </div>
  )
}

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
