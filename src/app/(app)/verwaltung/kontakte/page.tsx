import Link from 'next/link'
import { verlangeAnmeldung } from '@/auth/wache'
import { sevdeskEingerichtet } from '@/sevdesk/client'
import { ladeDubletten } from '@/sevdesk/kontakte'
import type { Dublettengruppe, Kontakt } from '@/kontakte/dubletten'
import { Meldung } from '@/app/teile/meldung'

/**
 * Doppelte Kontakte in sevDesk.
 *
 * **Warum es diese Seite gibt.** Der n8n-Rechnungsworkflow sucht den
 * Kontakt zur Rechnung über den exakten Namen. Trifft er nicht, legt er
 * einen neuen an — „Autohaus Meyer GmbH" und „Autohaus Meyer" sind damit
 * zwei Kunden. Am 09.09.2026 standen unter 131 Kontakten 6 solche Gruppen
 * mit 19 Einträgen; allein „Arndt Automobile GmbH" lag achtmal da, sechs
 * davon am selben Tag angelegt und ohne einen einzigen Beleg.
 *
 * **Warum hier kein Knopf steht.** Die sevDesk-Schnittstelle kennt kein
 * Zusammenführen, und Rechnungen lassen sich nicht auf einen anderen
 * Kontakt umhängen — sie sind festgeschrieben. Was sie kann, ist einen
 * Kontakt **löschen**; sinnvoll nur bei denen ohne Beleg. Ein Knopf dafür
 * greift in die Buchhaltung ein und wartet auf eine ausdrückliche
 * Freigabe.
 *
 * Diese Seite **stellt nur dar** und ruft nichts auf, was etwas ändert.
 */

export const dynamic = 'force-dynamic'

export default async function Kontaktdubletten() {
  await verlangeAnmeldung()

  if (!sevdeskEingerichtet()) {
    return (
      <>
        <Kopf gruppen={null} />
        <Meldung art="warnung">
          sevDesk ist auf diesem Server nicht eingerichtet — <code>SEVDESK_API_TOKEN</code> fehlt.
        </Meldung>
      </>
    )
  }

  let gruppen: Dublettengruppe[]
  try {
    gruppen = await ladeDubletten()
  } catch (fehler) {
    return (
      <>
        <Kopf gruppen={null} />
        <Meldung art="fehler">
          Die Kontakte liessen sich nicht laden: {fehler instanceof Error ? fehler.message : String(fehler)}
        </Meldung>
      </>
    )
  }

  const leere = gruppen.reduce((s, g) => s + g.leere.length, 0)

  return (
    <>
      <Kopf gruppen={gruppen} />

      {gruppen.length === 0 ? (
        <div className="leer">
          <p style={{ margin: 0 }}>Keine doppelten Kontakte gefunden.</p>
        </div>
      ) : (
        <>
          <div className="hinweis" style={{ marginBottom: 16 }}>
            <span className="hinweis-titel">Was sich davon aufräumen lässt</span>
            {leere > 0 ? (
              <>
                {leere} {leere === 1 ? 'Eintrag trägt' : 'Einträge tragen'} keinen einzigen Beleg —{' '}
                {leere === 1 ? 'er lässt' : 'sie lassen'} sich gefahrlos entfernen. Alles Übrige
                hängt an Rechnungen und ist nur in sevDesk selbst zusammenzuführen: die
                Schnittstelle kennt kein Zusammenführen, und festgeschriebene Rechnungen lassen
                sich nicht umhängen.
              </>
            ) : (
              <>
                Jeder Eintrag trägt Belege. Zusammengeführt werden kann hier nichts — das geht nur
                in sevDesk selbst.
              </>
            )}
          </div>

          <div className="dubletten">
            {gruppen.map((gruppe) => (
              <Gruppe key={gruppe.schluessel} gruppe={gruppe} />
            ))}
          </div>
        </>
      )}
    </>
  )
}

function Kopf({ gruppen }: { gruppen: Dublettengruppe[] | null }) {
  const betroffen = gruppen?.reduce((s, g) => s + g.kontakte.length, 0) ?? 0
  return (
    <div className="seiten-kopf">
      <div>
        <h1>Doppelte Kontakte</h1>
        <p className="unterzeile">
          {gruppen === null
            ? 'sevDesk — Kontakte, die vermutlich dieselben sind'
            : gruppen.length === 0
              ? 'sevDesk — nichts gefunden'
              : `${gruppen.length} ${gruppen.length === 1 ? 'Gruppe' : 'Gruppen'} · ${betroffen} Einträge in sevDesk`}
        </p>
      </div>
      <Link href="/verwaltung" className="knopf-schlicht">
        Zur Verwaltung
      </Link>
    </div>
  )
}

function Gruppe({ gruppe }: { gruppe: Dublettengruppe }) {
  return (
    <section className="karte dublettengruppe">
      <div className="dublettenkopf">
        <h2>{gruppe.anzeige}</h2>
        {gruppe.leere.length > 0 ? (
          <span className="marke-pille m-warn">
            {gruppe.leere.length} ohne Beleg
          </span>
        ) : null}
        {gruppe.nurInSevdesk ? (
          <span className="marke-pille m-entwurf">nur in sevDesk zusammenführbar</span>
        ) : null}
      </div>

      <table className="dublettentabelle">
        <thead>
          <tr>
            <th scope="col">Name in sevDesk</th>
            <th scope="col">Kundennummer</th>
            <th scope="col">Angelegt</th>
            <th scope="col" style={{ textAlign: 'right' }}>Belege</th>
          </tr>
        </thead>
        <tbody>
          {gruppe.kontakte.map((kontakt) => (
            <Zeile key={kontakt.id} kontakt={kontakt} />
          ))}
        </tbody>
      </table>
    </section>
  )
}

function Zeile({ kontakt }: { kontakt: Kontakt }) {
  return (
    <tr className={kontakt.belege === 0 ? 'ohne-beleg' : undefined}>
      <td>{kontakt.anzeige}</td>
      <td style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>{kontakt.kundennummer ?? '—'}</td>
      <td>{kontakt.angelegtAm ? kontakt.angelegtAm.toLocaleDateString('de-DE') : '—'}</td>
      <td style={{ textAlign: 'right' }}>
        {/*
          `-1` heisst: die Zahl liess sich nicht holen. Das als „0" zu zeigen
          wäre die gefährlichste aller Anzeigen — sie ist die Grundlage für
          „kann weg".
        */}
        {kontakt.belege < 0 ? (
          <span className="unterzeile">unbekannt</span>
        ) : kontakt.belege === 0 ? (
          <span className="unterzeile">keine</span>
        ) : (
          kontakt.belege
        )}
      </td>
    </tr>
  )
}
