'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Fortschritt } from '@/app/teile/anzeigen'
import { holeAuswertungsstand, starteAuswertungNeu } from '@/stellungnahme/export-aktionen'

/**
 * Der Stand einer Auswertung, die im Hintergrund läuft.
 *
 * Die Seite fragt regelmässig nach statt an einem offenen Strom zu hängen.
 * Das ist hier die richtige Wahl: der Stand steht in der Datenbank, also
 * überlebt er den Weg auf eine andere Seite und zurück, das Schliessen des
 * Fensters und den Neustart des Behälters. Ein Strom hätte nichts davon —
 * und genau daran ist die alte Fassung gescheitert.
 *
 * Zwei Sekunden Abstand: der Vorgang meldet je gelesener Seite, häufiger
 * gibt es nichts Neues zu sehen.
 */
export function Auswertungslauf({
  stellungnahmeId,
  schritt,
  prozent,
  fehler,
  stand,
  dateiname,
  aktualisiertAm,
}: {
  stellungnahmeId: string
  schritt: string | null
  prozent: number
  fehler: string | null
  stand: string
  dateiname: string | null
  aktualisiertAm: Date | null
}) {
  const router = useRouter()
  const [jetzt, setzeJetzt] = useState({ schritt, prozent, fehler, stand })
  const [verlauf, setzeVerlauf] = useState<string[]>(schritt ? [schritt] : [])
  const [neustart, setzeNeustart] = useState(false)
  /*
    Die verstrichene Zeit.

    Das Auslesen der Positionen ist **ein** Aufruf an das Sprachmodell und
    meldet dazwischen nichts — der Balken steht dort minutenlang still. Ohne
    eine laufende Zahl daneben sieht das aus wie ein Stillstand, und genau
    diesen Eindruck sollte der Umbau beseitigen. Die Uhr sagt: es läuft.
  */
  const [sekunden, setzeSekunden] = useState(0)

  useEffect(() => {
    if (jetzt.stand !== 'laeuft') return
    const uhr = setInterval(() => setzeSekunden((s) => s + 1), 1000)
    return () => clearInterval(uhr)
  }, [jetzt.stand])

  useEffect(() => {
    if (jetzt.stand !== 'laeuft') return
    let abgebrochen = false

    const frage = async () => {
      const antwort = await holeAuswertungsstand(stellungnahmeId)
      if (abgebrochen || !antwort) return

      setzeJetzt(antwort)
      if (antwort.schritt) {
        setzeVerlauf((v) => (v.at(-1) === antwort.schritt ? v : [...v, antwort.schritt!]))
      }
      // Fertig heisst: die Seite zeigt jetzt etwas ganz anderes — den
      // Schreibtisch mit den ausgelesenen Positionen.
      if (antwort.stand !== 'laeuft') router.refresh()
    }

    const takt = setInterval(() => void frage(), 2000)
    return () => {
      abgebrochen = true
      clearInterval(takt)
    }
  }, [jetzt.stand, stellungnahmeId, router])

  /*
    Der Behälter kann mitten im Lauf neu starten — dann bleibt die Zeile auf
    „läuft" stehen, ohne dass sich noch etwas rührt. Statt das zu verschweigen,
    wird es nach fünf Minuten ohne Regung angesagt: der Prüfbericht liegt bei
    der Stellungnahme, ein neuer Anlauf kostet nichts als Zeit.
  */
  const stillstand =
    jetzt.stand === 'laeuft' &&
    aktualisiertAm !== null &&
    Date.now() - new Date(aktualisiertAm).getTime() > 5 * 60 * 1000

  if (jetzt.stand === 'fehler' || jetzt.fehler) {
    return (
      <div className="karte">
        <h2>Die Auswertung ist gescheitert</h2>
        <div className="hinweis fehler" role="alert" style={{ marginBottom: 12 }}>
          {jetzt.fehler ?? 'Der Prüfbericht konnte nicht ausgewertet werden.'}
        </div>
        <p className="unterzeile">
          Der Prüfbericht {dateiname ? `„${dateiname}" ` : ''}liegt weiterhin bei dieser
          Stellungnahme. Ein neuer Anlauf ist deshalb jederzeit möglich.
        </p>
        <NeuKnopf
          stellungnahmeId={stellungnahmeId}
          laeuft={neustart}
          setzeLaeuft={setzeNeustart}
          router={router}
        />
      </div>
    )
  }

  return (
    <div className="karte">
      <h2>Der Prüfbericht wird ausgewertet</h2>
      <Fortschritt
        stand={{
          anteil: Math.max(0.02, jetzt.prozent / 100),
          text: jetzt.schritt ?? 'Wartet auf die Verarbeitung …',
          verlauf: verlauf.slice(-4),
        }}
      />
      <p className="unterzeile" style={{ margin: '8px 0 0' }}>
        Läuft seit {Math.floor(sekunden / 60)}:{String(sekunden % 60).padStart(2, '0')} — das
        Auslesen der Positionen ist ein einziger langer Schritt und meldet dazwischen nichts.
      </p>
      <p className="unterzeile" style={{ marginBottom: 0 }}>
        Das läuft im Hintergrund weiter — auch wenn Sie diese Seite verlassen oder das Fenster
        schliessen. Die Stellungnahme steht schon in der Übersicht; sobald die Positionen
        ausgelesen sind, öffnet sich hier der Schreibtisch.
      </p>

      {stillstand ? (
        <>
          <div className="hinweis warn" style={{ marginTop: 12 }}>
            Seit mehr als fünf Minuten hat sich nichts gerührt. Das kann an einem sehr grossen
            Bericht liegen — oder daran, dass die Verarbeitung abgebrochen ist, ohne es sagen zu
            können.
          </div>
          <NeuKnopf
            stellungnahmeId={stellungnahmeId}
            laeuft={neustart}
            setzeLaeuft={setzeNeustart}
            router={router}
          />
        </>
      ) : null}
    </div>
  )
}

function NeuKnopf({
  stellungnahmeId,
  laeuft,
  setzeLaeuft,
  router,
}: {
  stellungnahmeId: string
  laeuft: boolean
  setzeLaeuft: (w: boolean) => void
  router: ReturnType<typeof useRouter>
}) {
  return (
    <button
      type="button"
      className="haupt"
      disabled={laeuft}
      style={{ marginTop: 12 }}
      onClick={() => {
        setzeLaeuft(true)
        void starteAuswertungNeu(stellungnahmeId).then(() => router.refresh())
      }}
    >
      {laeuft ? 'Wird angestossen …' : 'Auswertung erneut versuchen'}
    </button>
  )
}
