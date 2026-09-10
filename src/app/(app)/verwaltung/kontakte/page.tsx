import Link from 'next/link'
import { verlangeAnmeldung } from '@/auth/wache'
import { darf } from '@/rechte/zugriff'
import { sevdeskEingerichtet } from '@/sevdesk/client'
import { ladeDubletten } from '@/sevdesk/kontakte'
import type { Dublettengruppe } from '@/kontakte/dubletten'
import { Gruppe } from './gruppe'
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
  const darfZusammenfuehren = await darf('sevdesk.zusammenfuehren')

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
                Nicht festgeschriebene Rechnungen, Belege, Anschriften und Kontaktwege lassen
                sich auf den bleibenden Kontakt umhängen; ist ein Eintrag danach leer, kann er
                gelöscht werden. {leere} {leere === 1 ? 'Eintrag ist' : 'Einträge sind'} schon
                jetzt ohne Beleg. Festgeschriebene Belege bleiben, wo sie sind — der Versuch wird
                unternommen, das Ergebnis steht im Bericht.
              </>
            ) : (
              <>
                Jeder Eintrag trägt Belege. Umgehängt wird trotzdem, soweit nichts festgeschrieben
                ist; was bleibt, bleibt.
              </>
            )}
          </div>

          <div className="dubletten">
            {gruppen.map((gruppe) => (
              <Gruppe
                key={gruppe.schluessel}
                gruppe={gruppe}
                darfZusammenfuehren={darfZusammenfuehren}
              />
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
