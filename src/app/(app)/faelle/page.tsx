import Link from 'next/link'
import { ladeFaelle } from '@/autoixpert/aktionen'
import { leseFalldaten } from '@/autoixpert/felder'
import { gutachtenSchema } from '@/autoixpert/typen'
import { ImportFormular } from './import-formular'
import { verlangeAnmeldung } from '@/auth/wache'

export default async function FaelleSeite() {
  // Vor allem anderen: ohne Anmeldung wird hier nichts geladen und
  // nichts gerendert. Die Pruefung im Layout kam zu spaet - die Seite
  // rendert gleichzeitig mit ihm, und ihre Nutzlast ging im Rumpf der
  // Umleitung mit hinaus.
  await verlangeAnmeldung()

  const faelle = await ladeFaelle()
  const eingerichtet = Boolean(process.env.AUTOIXPERT_API_TOKEN)

  return (
    <>
      <div className="seiten-kopf">
        <div>
          <h1>Fälle</h1>
          <p className="unterzeile">
            {faelle.length === 0
              ? 'Noch kein Fall importiert'
              : `${faelle.length} ${faelle.length === 1 ? 'Fall' : 'Fälle'} aus autoiXpert`}
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

      {faelle.length === 0 ? (
        <div className="leer">
          <p style={{ margin: 0 }}>
            Lade einen Fall über sein Aktenzeichen oder die technische ID.
          </p>
        </div>
      ) : (
        <div className="liste">
          {faelle.map((f) => {
            const geprueft = gutachtenSchema.safeParse(f.daten)
            const d = geprueft.success ? leseFalldaten(geprueft.data) : null

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
                  ) : d?.zustand ? (
                    <span
                      className={`marke-pille ${
                        d.zustand === 'abgeschlossen' ? 'm-freigegeben' : 'm-entwurf'
                      }`}
                    >
                      {d.zustand}
                    </span>
                  ) : null}
                  <span className="treffer-zahl">
                    {f.abgerufenAm
                      ? new Date(f.abgerufenAm).toLocaleDateString('de-DE')
                      : ''}
                  </span>
                </span>
              </Link>
            )
          })}
        </div>
      )}
    </>
  )
}
