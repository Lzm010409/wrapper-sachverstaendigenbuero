import Link from 'next/link'
import { verlangeAnmeldung } from '@/auth/wache'
import { darf } from '@/rechte/zugriff'
import { ereignisse, type Ereigniszeile } from '@/protokoll/ablage'
import { Meldung } from '@/app/teile/meldung'

/**
 * Die Fehlerliste.
 *
 * **Wofür sie da ist:** Ein Benutzer meldet „da kam ein Fehler, Kennung
 * K7M2-QP4X". Hier wird die Kennung eingegeben und es steht genau eine
 * Zeile da — mit Stelle, Zeitpunkt, Fehlermeldung und dem Zusammenhang, in
 * dem es passiert ist.
 *
 * **Was hier nicht steht:** personenbezogene Daten. Kennzeichen,
 * Fahrgestellnummern, E-Mail-Adressen und Token sind vorher heraus (siehe
 * `src/protokoll/schwaerzen.ts`). Was bleibt, ist die Fall-ID — wer den Fall
 * sehen darf, sieht ihn in der Anwendung.
 */
export default async function Protokollseite({
  searchParams,
}: {
  searchParams: Promise<{ suche?: string; stufe?: string }>
}) {
  await verlangeAnmeldung()

  if (!(await darf('protokoll.lesen'))) {
    return (
      <Meldung art="warnung">
        Für das Fehlerprotokoll fehlt die Berechtigung. Sie liegt bei der Administration.
      </Meldung>
    )
  }

  const { suche, stufe } = await searchParams
  const zeilen = await ereignisse({
    suche,
    stufe: stufe === 'fehler' || stufe === 'warnung' ? stufe : undefined,
    tage: 30,
  })

  return (
    <>
      <div className="seiten-kopf">
        <div>
          <h1>Fehlerprotokoll</h1>
          <p className="unterzeile">
            Die letzten 30 Tage · {zeilen.length}{' '}
            {zeilen.length === 1 ? 'Eintrag' : 'Einträge'} · Auskünfte bleiben im Containerprotokoll
          </p>
        </div>
        <Link href="/verwaltung" className="knopf-schlicht">
          Benutzer
        </Link>
      </div>

      <form className="werkzeugleiste" style={{ marginBottom: 12 }}>
        <input
          type="search"
          name="suche"
          defaultValue={suche ?? ''}
          placeholder="Kennung, Stelle oder Meldung"
          aria-label="Suche"
        />
        <select name="stufe" defaultValue={stufe ?? ''} aria-label="Stufe">
          <option value="">Fehler und Warnungen</option>
          <option value="fehler">nur Fehler</option>
          <option value="warnung">nur Warnungen</option>
        </select>
        <button type="submit" className="haupt">
          Suchen
        </button>
      </form>

      {zeilen.length === 0 ? (
        <div className="leer">
          <p style={{ margin: 0 }}>
            {suche ? 'Kein Eintrag zu dieser Suche.' : 'Nichts vorgefallen.'}
          </p>
        </div>
      ) : (
        <div className="liste">
          {zeilen.map((z) => (
            <Ereigniskarte key={z.id} eintrag={z} />
          ))}
        </div>
      )}
    </>
  )
}

function Ereigniskarte({ eintrag }: { eintrag: Ereigniszeile }) {
  const zusatz = Object.entries(eintrag.zusammenhang ?? {}).filter(
    ([name]) => name !== 'kennung' && name !== 'stufe',
  )

  return (
    <div className="karte">
      <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
        {/*
          Rot für den Fehler, Gelb für die Warnung — dieselbe Zuordnung wie
          in den Meldungen an den Benutzer. Vorher trug der Fehler das Gelb
          und die Warnung gar keine Farbe; in einer Liste, die man bei einer
          Störung von oben nach unten durchgeht, war damit nicht zu sehen,
          welche Zeile die schlimmere ist.
        */}
        <span
          className={`marke-pille ${eintrag.stufe === 'fehler' ? 'm-zurueckgezogen' : 'm-warn'}`}
        >
          {eintrag.stufe === 'fehler' ? 'Fehler' : 'Warnung'}
        </span>
        <code style={{ fontSize: 12 }}>{eintrag.stelle}</code>
        {eintrag.kennung ? (
          <code style={{ fontSize: 12, fontWeight: 700 }}>{eintrag.kennung}</code>
        ) : null}
        <span className="unterzeile" style={{ marginLeft: 'auto' }}>
          {new Date(eintrag.erstelltAm).toLocaleString('de-DE')}
        </span>
      </div>

      <p style={{ margin: '8px 0 0', fontSize: 14 }}>{eintrag.meldung}</p>

      {eintrag.fehlerMeldung ? (
        <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--crit)' }}>
          {eintrag.fehlerName}: {eintrag.fehlerMeldung}
        </p>
      ) : null}

      {zusatz.length > 0 ? (
        <dl className="kv" style={{ gridTemplateColumns: 'minmax(120px,auto) 1fr', marginTop: 8 }}>
          {zusatz.map(([name, wert]) => (
            <span key={name} style={{ display: 'contents' }}>
              <dt>{name}</dt>
              <dd style={{ textAlign: 'left', fontFamily: 'var(--mono)', fontSize: 12 }}>
                {typeof wert === 'object' ? JSON.stringify(wert) : String(wert)}
              </dd>
            </span>
          ))}
        </dl>
      ) : null}

      {eintrag.spur ? (
        <details style={{ marginTop: 8 }}>
          <summary style={{ fontSize: 12.5, cursor: 'pointer', color: 'var(--ink-soft)' }}>
            Stapelspur
          </summary>
          <pre
            style={{
              margin: '6px 0 0',
              padding: 9,
              background: 'var(--surface-alt)',
              borderRadius: 'var(--radius)',
              fontSize: 11.5,
              overflowX: 'auto',
            }}
          >
            {eintrag.spur}
          </pre>
        </details>
      ) : null}
    </div>
  )
}
