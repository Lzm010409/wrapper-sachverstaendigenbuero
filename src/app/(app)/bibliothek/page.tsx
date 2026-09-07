import Link from 'next/link'
import {
  ladeAbschnitte,
  sucheEintraege,
  zaehleNachStatus,
  type Bereich,
  type EintragStatus,
} from '@/bibliothek/abfragen'
import { StatusPille } from '@/app/(app)/bibliothek/status-pille'
import { Suchleiste } from './suchleiste'
import { verlangeAnmeldung } from '@/auth/wache'

const BEREICHSNAMEN: Record<Bereich, string> = {
  kalkulation: 'Kalkulation',
  wertminderung: 'Wertminderung',
  wbw: 'Wiederbeschaffungswert',
  restwert: 'Restwert',
  sonderfall: 'Sonderfälle',
}

function istBereich(w: string | undefined): w is Bereich {
  return !!w && w in BEREICHSNAMEN
}

function istStatus(w: string | undefined): w is EintragStatus {
  return !!w && ['entwurf', 'pruefung', 'freigegeben', 'zurueckgezogen'].includes(w)
}

/** Kürzt einen Text auf ganze Wörter. */
function auszug(text: string | null, laenge = 190): string {
  if (!text) return ''
  const sauber = text.replace(/\s+/g, ' ').trim()
  if (sauber.length <= laenge) return sauber
  return sauber.slice(0, sauber.lastIndexOf(' ', laenge)) + ' …'
}

export default async function BibliothekSeite({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; bereich?: string; status?: string; abschnitt?: string }>
}) {
  // Vor allem anderen: ohne Anmeldung wird hier nichts geladen und
  // nichts gerendert. Die Pruefung im Layout kam zu spaet - die Seite
  // rendert gleichzeitig mit ihm, und ihre Nutzlast ging im Rumpf der
  // Umleitung mit hinaus.
  await verlangeAnmeldung()

  const p = await searchParams
  const filter = {
    suche: p.q,
    bereich: istBereich(p.bereich) ? p.bereich : undefined,
    status: istStatus(p.status) ? p.status : undefined,
    abschnitt: p.abschnitt,
  }

  const [eintraege, abschnitte, nachStatus] = await Promise.all([
    sucheEintraege(filter),
    // Ohne den Abschnitt selbst: sonst bliebe in der Auswahlliste nur der
    // gerade gewählte Abschnitt übrig, und ein Wechsel wäre nicht mehr
    // möglich.
    ladeAbschnitte({ suche: filter.suche, bereich: filter.bereich, status: filter.status }),
    zaehleNachStatus(),
  ])

  // Auf Freigabe warten Entwürfe *und* was schon in Prüfung liegt. Zählte man
  // nur die Entwürfe, verschwände ein Eintrag aus der Zahl, sobald ihn jemand
  // in die Prüfung schiebt — obwohl er genau dann erst recht wartet.
  const offen = (nachStatus.entwurf ?? 0) + (nachStatus.pruefung ?? 0)

  return (
    <>
      <div className="seiten-kopf">
        <div>
          <h1>Argumentbibliothek</h1>
          <p className="unterzeile">
            {offen > 0
              ? `${offen} Einträge warten auf Freigabe`
              : 'Alle Einträge sind gesichtet'}
          </p>
        </div>
      </div>

      <Suchleiste
        abschnitte={abschnitte}
        bereichsnamen={BEREICHSNAMEN}
        trefferzahl={eintraege.length}
      />

      {eintraege.length === 0 ? (
        <div className="leer">
          <p style={{ margin: 0 }}>Kein Eintrag passt zu dieser Suche.</p>
        </div>
      ) : (
        <div className="liste">
          {eintraege.map((e) => {
            // `||` statt `??`: ein Eintrag ohne Gegenargument trägt dort oft
            // eine leere Zeichenkette statt NULL. Mit `??` bliebe die Zeile
            // dann ohne Auszug, obwohl ein Vorgehen hinterlegt ist.
            const text = e.gegenargument || e.vorgehen
            return (
              <Link key={e.id} href={`/bibliothek/${e.id}`} className="zeile">
                <span className="zeile-nummer">{e.nummer}</span>
                <span>
                  <span className="zeile-titel">{e.titel}</span>
                  <span className="zeile-meta">
                    <span>{BEREICHSNAMEN[e.bereich]}</span>
                    <span>{e.abschnitt}</span>
                    {e.haeufigkeitText ? <span>· {e.haeufigkeitText}</span> : null}
                  </span>
                  {text ? <span className="zeile-auszug">{auszug(text)}</span> : null}
                </span>
                <span className="zeile-rechts">
                  <StatusPille status={e.status} />
                  <span className="marker-liste">
                    {!e.gegenargument && e.vorgehen ? (
                      <span className="marke-pille m-akzent" title="Handlungsanweisung statt fertigem Text">
                        Vorgehen
                      </span>
                    ) : null}
                    {e.platzhalterOffen > 0 ? (
                      <span
                        className="marke-pille m-entwurf"
                        title="Einzusetzende Werte und Arbeitsaufträge"
                      >
                        {e.platzhalterOffen} Platzh.
                      </span>
                    ) : null}
                    {e.vorbedingungen > 0 ? (
                      <span className="marke-pille m-warn" title="Vorbedingungen prüfen">
                        ⚠ {e.vorbedingungen}
                      </span>
                    ) : null}
                    {e.belegeUnverifiziert > 0 ? (
                      <span
                        className="marke-pille m-warn"
                        title="Fundstellen noch nicht bestätigt — sperrt die Freigabe"
                      >
                        {e.belegeUnverifiziert} Beleg{e.belegeUnverifiziert === 1 ? '' : 'e'}
                      </span>
                    ) : null}
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
