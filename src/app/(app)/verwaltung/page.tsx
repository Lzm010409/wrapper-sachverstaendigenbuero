import Link from 'next/link'
import { verlangeAnmeldung } from '@/auth/wache'
import { darf } from '@/rechte/zugriff'
import { alleBenutzer } from '@/rechte/benutzerverwaltung'
import { BESCHREIBUNGEN, ROLLENRECHTE } from '@/rechte/katalog'
import { Meldung } from '@/app/teile/meldung'
import { Benutzerzeile } from './benutzerzeile'

/**
 * Die Benutzerverwaltung.
 *
 * Bis hierher gab es sie nicht: Rollen wurden über ein Skript im
 * Container-Terminal vergeben, und ein Konto zu sperren ging nur per SQL.
 *
 * Diese Datei **stellt nur dar**. Wer was darf, entscheidet
 * `src/rechte/`; was gespeichert wird, entscheiden die Aktionen dort.
 */
export default async function Verwaltung() {
  await verlangeAnmeldung()

  if (!(await darf('benutzer.verwalten'))) {
    return (
      <Meldung art="warnung">
        Für die Benutzerverwaltung fehlt die Berechtigung. Sie liegt bei der Administration.
      </Meldung>
    )
  }

  const benutzer = await alleBenutzer()

  return (
    <>
      <div className="seiten-kopf">
        <div>
          <h1>Benutzer</h1>
          <p className="unterzeile">
            {benutzer.length} {benutzer.length === 1 ? 'Zugang' : 'Zugänge'} · Rolle setzen, Rechte
            einzeln zu- und abschalten, sperren
          </p>
        </div>
        <Link href="/verwaltung/protokoll" className="knopf-schlicht">
          Fehlerprotokoll
        </Link>
      </div>

      <div className="karte" style={{ marginBottom: 16 }}>
        <h2>Was die Rollen mitbringen</h2>
        <p className="unterzeile" style={{ marginTop: 0 }}>
          Die Rolle ist die Voreinstellung. Einzelne Rechte lassen sich einem Zugang zusätzlich
          geben oder wegnehmen — das schlägt die Rolle in beide Richtungen.
        </p>
        <dl className="kv" style={{ gridTemplateColumns: 'minmax(120px,auto) 1fr' }}>
          {(['ersteller', 'freigeber', 'admin'] as const).map((rolle) => (
            <span key={rolle} style={{ display: 'contents' }}>
              <dt style={{ textTransform: 'capitalize' }}>{rolle}</dt>
              <dd style={{ textAlign: 'left' }}>
                {ROLLENRECHTE[rolle].length === 0
                  ? 'die tägliche Arbeit — nichts Unwiederbringliches, nichts Kostenpflichtiges'
                  : ROLLENRECHTE[rolle]
                      .map((r) => BESCHREIBUNGEN.find((b) => b.recht === r)?.name ?? r)
                      .join(', ')}
              </dd>
            </span>
          ))}
        </dl>
      </div>

      <div className="liste">
        {benutzer.map((b) => (
          <Benutzerzeile key={b.id} benutzer={b} />
        ))}
      </div>

      <div className="hinweis" style={{ marginTop: 16 }}>
        Neue Zugänge entstehen bei der Anmeldung über Microsoft — sofern{' '}
        <code>ENTRA_AUTO_ANLEGEN=true</code> gesetzt ist — oder über{' '}
        <code>pnpm benutzer:anlegen</code> im Container. Sie beginnen immer als Ersteller.
      </div>
    </>
  )
}
