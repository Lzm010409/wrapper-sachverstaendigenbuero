'use client'

import { useState, useTransition } from 'react'
import type { Benutzerzeile as Zeile } from '@/rechte/benutzerverwaltung'
import { BESCHREIBUNGEN, ROLLENRECHTE, type Recht } from '@/rechte/katalog'
import { aendereRecht, aendereRolle, aendereSperre } from '@/rechte/aktionen'
import { useMelder } from '@/app/teile/melder'
import { ausErgebnis, fehler as alsFehler } from '@/melden/typen'
import { Kreisel } from '@/app/teile/anzeigen'

/**
 * Ein Zugang mit seinen Rechten.
 *
 * **Der Dreizustand je Recht ist die eigentliche Aussage:** „aus der Rolle",
 * „ausdrücklich gegeben", „ausdrücklich entzogen". Ein blosses Häkchen
 * könnte den dritten Zustand nicht — und genau der kommt vor: der Freigeber,
 * dem man das Löschen abgenommen hat, ohne ihn zum Ersteller zu machen.
 *
 * Wer eine Abweichung wieder aufhebt, bekommt automatisch, was seine Rolle
 * mitbringt — auch wenn sich das später ändert.
 */
export function Benutzerzeile({ benutzer }: { benutzer: Zeile }) {
  const [offen, setzeOffen] = useState(false)
  const [laeuft, starte] = useTransition()
  const { melde } = useMelder()

  function fuehreAus(arbeit: () => Promise<{ fehler?: string; hinweis?: string }>) {
    starte(async () => {
      try {
        const meldung = ausErgebnis(await arbeit())
        if (meldung) melde(meldung)
      } catch (ausnahme) {
        melde(alsFehler(ausnahme instanceof Error ? ausnahme.message : 'Nicht gespeichert.'))
      }
    })
  }

  const ausRolle = new Set<string>(ROLLENRECHTE[benutzer.rolle])
  const abweichung = new Map(benutzer.abweichungen.map((a) => [a.recht, a.gewaehrt]))

  return (
    <div className="karte" style={{ opacity: benutzer.aktiv ? 1 : 0.6 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 220px', minWidth: 0 }}>
          <strong>{benutzer.name}</strong>
          {!benutzer.aktiv ? <span className="marke-pille m-warn">gesperrt</span> : null}
          <div className="unterzeile">
            {benutzer.email} ·{' '}
            {benutzer.ueberEntra
              ? 'Microsoft'
              : benutzer.hatPasswort
                ? 'Passwort'
                : 'noch nie angemeldet'}
            {benutzer.letzteAnmeldung
              ? ` · zuletzt ${new Date(benutzer.letzteAnmeldung).toLocaleDateString('de-DE')}`
              : null}
          </div>
        </div>

        <div className="feld" style={{ flex: '0 0 160px' }}>
          <label htmlFor={`rolle-${benutzer.id}`}>Rolle</label>
          <select
            id={`rolle-${benutzer.id}`}
            value={benutzer.rolle}
            disabled={laeuft}
            onChange={(e) => fuehreAus(() => aendereRolle(benutzer.id, e.target.value))}
          >
            <option value="ersteller">Ersteller</option>
            <option value="freigeber">Freigeber</option>
            <option value="admin">Administration</option>
          </select>
        </div>

        {/*
          Der Knopf trägt seinen Zweck im Namen, nicht nur die Zahl: für
          Screenreader steht dreimal „3 Rechte" nebeneinander, ohne zu sagen,
          zu wem sie gehören und dass sich etwas aufklappt.
        */}
        <button
          type="button"
          onClick={() => setzeOffen(!offen)}
          aria-expanded={offen}
          aria-label={`Rechte von ${benutzer.name} ${offen ? 'einklappen' : 'aufklappen'}`}
        >
          {benutzer.rechte.length} {benutzer.rechte.length === 1 ? 'Recht' : 'Rechte'}
        </button>

        <button
          type="button"
          disabled={laeuft}
          onClick={() => fuehreAus(() => aendereSperre(benutzer.id, !benutzer.aktiv))}
        >
          {laeuft ? <Kreisel /> : benutzer.aktiv ? 'Sperren' : 'Entsperren'}
        </button>
      </div>

      {offen ? (
        <div style={{ marginTop: 12, borderTop: '1px solid var(--line-soft)', paddingTop: 12 }}>
          {BESCHREIBUNGEN.map((b) => {
            const gesetzt = abweichung.get(b.recht)
            const stand = gesetzt === undefined ? 'rolle' : gesetzt ? 'gegeben' : 'entzogen'
            const hat = benutzer.rechte.includes(b.recht)
            return (
              <div key={b.recht} className="recht-zeile">
                <div style={{ flex: '1 1 260px', minWidth: 0 }}>
                  {/*
                    Der Punkt sagt, ob das Recht gilt — blau ja, blass nein.
                    Ohne die zweite Klasse trugen beide Zustände dasselbe
                    Grau, und die Zeile beantwortete die einzige Frage nicht,
                    wegen der man sie aufklappt. Für alles, was den Punkt
                    nicht sieht, steht dasselbe im Titel.
                  */}
                  <span
                    className={`marke-pille ${hat ? 'm-akzent' : 'm-entwurf'}`}
                    title={hat ? 'gilt für diesen Zugang' : 'gilt nicht'}
                  >
                    {b.name}
                    <span className="nur-vorlesen">{hat ? ' — gilt' : ' — gilt nicht'}</span>
                  </span>
                  <div className="unterzeile">{b.erklaerung}</div>
                </div>
                <div className="feld" style={{ flex: '0 0 190px' }}>
                  <label htmlFor={`recht-${benutzer.id}-${b.recht}`} className="nur-vorlesen">
                    {b.name}
                  </label>
                  <select
                    id={`recht-${benutzer.id}-${b.recht}`}
                    value={stand}
                    disabled={laeuft}
                    onChange={(e) =>
                      fuehreAus(() =>
                        aendereRecht(
                          benutzer.id,
                          b.recht,
                          e.target.value === 'rolle' ? null : e.target.value === 'gegeben',
                        ),
                      )
                    }
                  >
                    <option value="rolle">
                      aus der Rolle ({ausRolle.has(b.recht) ? 'ja' : 'nein'})
                    </option>
                    <option value="gegeben">ausdrücklich gegeben</option>
                    <option value="entzogen">ausdrücklich entzogen</option>
                  </select>
                </div>
              </div>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}

export type { Recht }
