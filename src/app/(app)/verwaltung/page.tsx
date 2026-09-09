import Link from 'next/link'
import { verlangeAnmeldung } from '@/auth/wache'
import { darf } from '@/rechte/zugriff'
import {
  alleBenutzer,
  BENUTZER_SORTIERFELDER,
  type BenutzerSortierfeld,
} from '@/rechte/benutzerverwaltung'
import { BESCHREIBUNGEN, ROLLENRECHTE } from '@/rechte/katalog'
import { Meldung } from '@/app/teile/meldung'
import { Benutzerzeile } from './benutzerzeile'
import { Sortierleiste } from '@/app/teile/sortierleiste'
import { leseSortierung } from '@/app/teile/sortierung'

/**
 * Die Benutzerverwaltung.
 *
 * Bis hierher gab es sie nicht: Rollen wurden über ein Skript im
 * Container-Terminal vergeben, und ein Konto zu sperren ging nur per SQL.
 *
 * Diese Datei **stellt nur dar**. Wer was darf, entscheidet
 * `src/rechte/`; was gespeichert wird, entscheiden die Aktionen dort.
 */
/** Nimmt einen Wert aus der Adresse — mehrfach gesetzt zählt der erste. */
function wert(roh: string | string[] | undefined): string | undefined {
  const einzeln = Array.isArray(roh) ? roh[0] : roh
  return einzeln?.trim() || undefined
}

export default async function Verwaltung({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await verlangeAnmeldung()

  if (!(await darf('benutzer.verwalten'))) {
    return (
      <Meldung art="warnung">
        Für die Benutzerverwaltung fehlt die Berechtigung. Sie liegt bei der Administration.
      </Meldung>
    )
  }

  const roh = await searchParams
  const sortierung = leseSortierung<BenutzerSortierfeld>(
    { sortiert: wert(roh.sortiert), richtung: wert(roh.richtung) },
    BENUTZER_SORTIERFELDER.map((f) => f.wert),
  )

  const benutzer = await alleBenutzer(sortierung ?? undefined)

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
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Link href="/verwaltung/kontakte" className="knopf-schlicht">
            Doppelte Kontakte
          </Link>
          <Link href="/verwaltung/fotolexikon" className="knopf-schlicht">
            Fotolexikon
          </Link>
          <Link href="/verwaltung/protokoll" className="knopf-schlicht">
            Fehlerprotokoll
          </Link>
        </div>
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

      <Sortierleiste felder={BENUTZER_SORTIERFELDER} />

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
