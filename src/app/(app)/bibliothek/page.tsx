import Link from 'next/link'
import {
  EINTRAG_SORTIERFELDER,
  ladeAbschnitte,
  sucheEintraege,
  zaehleEintraege,
  zaehleNachStatus,
  type Bereich,
  type EintragSortierfeld,
  type EintragStatus,
} from '@/bibliothek/abfragen'
import { Suchleiste } from './suchleiste'
import { BibliothekListe } from './bulkleiste'
import { verlangeAnmeldung } from '@/auth/wache'
import { darf } from '@/rechte/zugriff'
import { Pagination } from '@/app/teile/pagination'
import { leseSeite } from '@/app/teile/seitenwahl'
import { Sortierleiste } from '@/app/teile/sortierleiste'
import { leseSortierung } from '@/app/teile/sortierung'

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

export default async function BibliothekSeite({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string
    bereich?: string
    status?: string
    abschnitt?: string
    seite?: string
    groesse?: string
    sortiert?: string
    richtung?: string
  }>
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
  const { seite, groesse, versatz } = leseSeite(p.seite, p.groesse)
  const sortierung = leseSortierung<EintragSortierfeld>(
    { sortiert: p.sortiert, richtung: p.richtung },
    EINTRAG_SORTIERFELDER.map((f) => f.wert),
  )

  const [eintraege, gesamt, abschnitte, nachStatus, darfFreigeben] = await Promise.all([
    sucheEintraege(filter, sortierung ?? undefined, groesse, versatz),
    zaehleEintraege(filter),
    // Ohne den Abschnitt selbst: sonst bliebe in der Auswahlliste nur der
    // gerade gewählte Abschnitt übrig, und ein Wechsel wäre nicht mehr
    // möglich.
    ladeAbschnitte({ suche: filter.suche, bereich: filter.bereich, status: filter.status }),
    zaehleNachStatus(),
    // Dieselbe Frage wie auf der Detailseite, über `darf()` und nicht über
    // die Rolle — sonst driften Knopf und Wirkung der Bulk-Freigabe
    // auseinander.
    darf('bibliothek.freigeben'),
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
        <Link href="/bibliothek/neu" className="knopf haupt">
          Neuer Eintrag
        </Link>
      </div>

      <Sortierleiste felder={EINTRAG_SORTIERFELDER} />

      <Suchleiste
        abschnitte={abschnitte}
        bereichsnamen={BEREICHSNAMEN}
        trefferzahl={gesamt}
      />

      <BibliothekListe eintraege={eintraege} bereichsnamen={BEREICHSNAMEN} darfFreigeben={darfFreigeben} />

      <Pagination seite={seite} groesse={groesse} gesamt={gesamt} />
    </>
  )
}
