import { Suspense } from 'react'
import Link from 'next/link'
import {
  FALL_SORTIERFELDER,
  filterGesetzt,
  ladeFaelle,
  vorhandeneMarken,
  zaehleGefilterte,
  type Fallfilter,
  type FallSortierfeld,
} from '@/autoixpert/abfragen'
import { leseFalldaten } from '@/autoixpert/felder'
import { gutachtenSchema } from '@/autoixpert/typen'
import { ladePhasenFuerListe } from '@/fall/vorgang'
import { ladeAmpeln } from '@/geld/stand'
import { widerspruch } from '@/geld/ampel'
import { Geldpille } from '@/app/teile/geldpille'
import { ImportFormular } from './import-formular'
import { verlangeAnmeldung } from '@/auth/wache'
import { Filterleiste } from '@/app/teile/filterleiste'
import { Sortierleiste } from '@/app/teile/sortierleiste'
import { leseSortierung } from '@/app/teile/sortierung'
import { SkelettListe } from '@/app/teile/skelett'

/** Nimmt einen Wert aus der Adresse — mehrfach gesetzt zählt der erste. */
function wert(roh: string | string[] | undefined): string | undefined {
  const einzeln = Array.isArray(roh) ? roh[0] : roh
  return einzeln?.trim() || undefined
}

export default async function FaelleSeite({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  // Vor allem anderen: ohne Anmeldung wird hier nichts geladen und
  // nichts gerendert. Die Pruefung im Layout kam zu spaet - die Seite
  // rendert gleichzeitig mit ihm, und ihre Nutzlast ging im Rumpf der
  // Umleitung mit hinaus.
  await verlangeAnmeldung()

  const roh = await searchParams
  const filter: Fallfilter = {
    suche: wert(roh.suche),
    zustand: wert(roh.zustand),
    von: wert(roh.von),
    bis: wert(roh.bis),
    marke: wert(roh.marke),
    modell: wert(roh.modell),
    baujahr: wert(roh.baujahr),
  }
  const gefiltert = filterGesetzt(filter)
  const sortierung = leseSortierung<FallSortierfeld>(
    { sortiert: wert(roh.sortiert), richtung: wert(roh.richtung) },
    FALL_SORTIERFELDER.map((f) => f.wert),
  )

  const [faelle, gesamt, marken] = await Promise.all([
    ladeFaelle(filter, sortierung ?? undefined),
    zaehleGefilterte(filter),
    vorhandeneMarken(),
  ])
  const eingerichtet = Boolean(process.env.AUTOIXPERT_API_TOKEN)

  return (
    <>
      <div className="seiten-kopf">
        <div>
          <h1>Fälle</h1>
          {/*
            Die Zahl kommt aus einer eigenen Zählung, nicht aus der Länge der
            Liste: die schneidet bei hundert ab, und „100 Fälle" wäre unter
            einer Liste aus hundert Zeilen eine Behauptung, die schon bei
            hunderteins falsch ist.
          */}
          <p className="unterzeile">
            {gesamt === 0
              ? gefiltert
                ? 'Kein Fall passt zu diesem Filter'
                : 'Noch kein Fall importiert'
              : `${gesamt} ${gesamt === 1 ? 'Fall' : 'Fälle'}${gefiltert ? ' gefunden' : ' aus autoiXpert'}`}
          </p>
        </div>
      </div>

      {!eingerichtet ? (
        <div className="hinweis warn" style={{ marginBottom: 18 }}>
          Die autoiXpert-Schnittstelle ist auf diesem Server nicht eingerichtet. Hinterlege
          <code style={{ margin: '0 4px' }}>AUTOIXPERT_API_TOKEN</code>
          in den Umgebungsvariablen, dann lassen sich Fälle laden.
        </div>
      ) : null}

      <ImportFormular aktiv={eingerichtet} />

      <Sortierleiste felder={FALL_SORTIERFELDER} />

      <Filterleiste
        weitereAb={2}
        treffer={
          faelle.length < gesamt ? `${faelle.length} von ${gesamt} gezeigt` : undefined
        }
        zusatzParameter={{ sortiert: sortierung?.feld, richtung: sortierung?.richtung }}
        felder={[
          {
            art: 'suche',
            name: 'suche',
            platzhalter: 'Aktenzeichen, Anspruchsteller, Kennzeichen oder FIN',
          },
          {
            art: 'auswahl',
            name: 'zustand',
            beschriftung: 'Zustand',
            alle: 'Alle Zustände',
            werte: [
              { wert: 'recorded', text: 'aufgenommen' },
              { wert: 'locked', text: 'abgeschlossen' },
              { wert: 'deleted', text: 'gelöscht' },
            ],
          },
          {
            art: 'auswahl',
            name: 'marke',
            beschriftung: 'Marke',
            alle: 'Alle Marken',
            werte: marken.map((m) => ({ wert: m, text: m })),
          },
          { art: 'text', name: 'modell', beschriftung: 'Modell', platzhalter: 'z. B. E-Klasse' },
          { art: 'text', name: 'baujahr', beschriftung: 'Baujahr', platzhalter: 'JJJJ' },
          { art: 'datum', name: 'von', beschriftung: 'Abgerufen ab' },
          { art: 'datum', name: 'bis', beschriftung: 'Abgerufen bis' },
        ]}
      />

      {faelle.length === 0 ? (
        <div className="leer">
          <p style={{ margin: 0 }}>
            {gefiltert
              ? 'Kein Fall passt zu diesem Filter. Nimm eine Einschränkung heraus.'
              : 'Lade einen Fall über sein Aktenzeichen oder die technische ID.'}
          </p>
        </div>
      ) : (
        // Eigene Suspense-Grenze: die Liste selbst kommt sofort aus der
        // Datenbank, nur die Pipedrive-Phasen brauchen einen Netzaufruf.
        // Ohne diese Grenze wartet die ganze Liste auf Pipedrive — genau der
        // Fehler, den der Vorgang-Reiter schon einmal gemacht hat.
        <Suspense fallback={<SkelettListe zeilen={faelle.length} titel="Die Fälle" />}>
          <FaelleZeilen faelle={faelle} />
        </Suspense>
      )}
    </>
  )
}

async function FaelleZeilen({ faelle }: { faelle: Awaited<ReturnType<typeof ladeFaelle>> }) {
  // Beide Quellen nebeneinander: Pipedrive und sevDesk wissen nichts
  // voneinander, und nacheinander gefragt addierten sich ihre Wartezeiten.
  const [phasen, zahlung] = await Promise.all([
    ladePhasenFuerListe(faelle.map((f) => f.aktenzeichen)),
    ladeAmpeln(faelle.map((f) => f.aktenzeichen)),
  ])

  return (
    <div className="liste">
      {faelle.map((f) => {
        const geprueft = gutachtenSchema.safeParse(f.daten)
        const d = geprueft.success ? leseFalldaten(geprueft.data) : null
        const phase = f.aktenzeichen ? phasen.get(f.aktenzeichen) : undefined
        const ampel = f.aktenzeichen ? zahlung.ampeln.get(f.aktenzeichen) : undefined
        // Der Widerspruch ist das eigentliche Fundstück: eine Phase, die
        // etwas anderes behauptet als das Geld auf dem Konto.
        const streit = ampel ? widerspruch(ampel.stand, phase) : null

        return (
          <Link key={f.id} href={`/faelle/${f.id}`} className="zeile">
            <span className="zeile-nummer">{f.aktenzeichen ?? '—'}</span>
            <span>
              <span className="zeile-titel">
                {/* Bei unlesbaren Daten wäre „Ohne Anspruchsteller" eine
                    Behauptung über etwas, das gar nicht gelesen wurde. */}
                {geprueft.success
                  ? (d?.anspruchsteller?.name ?? 'Ohne Anspruchsteller')
                  : 'Falldaten nicht lesbar'}
                {d?.fahrzeug.kennzeichen ? ` · ${d.fahrzeug.kennzeichen}` : ''}
              </span>
              <span className="zeile-meta">
                {d?.gutachtenTyp ? <span>{d.gutachtenTyp}</span> : null}
                {d?.fahrzeug.hersteller ? (
                  <span>
                    {d.fahrzeug.hersteller} {d.fahrzeug.modell}
                  </span>
                ) : null}
                {d?.versicherung?.name ? <span>{d.versicherung.name}</span> : null}
              </span>
            </span>
            <span className="zeile-rechts">
              {!geprueft.success ? (
                <span className="marke-pille m-warn">unlesbar</span>
              ) : phase ? (
                <span className="marke-pille m-akzent">{phase}</span>
              ) : null}
              {ampel && ampel.stand !== 'ohne_rechnung' ? (
                <Geldpille stand={ampel.stand} offenCent={ampel.offenCent} />
              ) : null}
              {streit ? (
                <span className="marke-pille m-warn" title={streit}>
                  Widerspruch
                </span>
              ) : null}
              <span className="treffer-zahl">
                {f.abgerufenAm ? new Date(f.abgerufenAm).toLocaleDateString('de-DE') : ''}
              </span>
            </span>
          </Link>
        )
      })}
    </div>
  )
}
