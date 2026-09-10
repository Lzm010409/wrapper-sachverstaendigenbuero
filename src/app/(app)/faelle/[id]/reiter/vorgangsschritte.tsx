'use client'

import { useState } from 'react'
import type { Vorgangsschritt } from '@/fall/vorgangsschritte'
import { Kreisel } from '@/app/teile/anzeigen'
import { Meldung } from '@/app/teile/meldung'
import { Reichtext } from './reichtext'

/**
 * Der Verlauf aus Pipedrive: Notizen und zugeordnete Mails, neueste zuerst.
 *
 * **Warum eine Karte pro Klick, nicht sofort alles offen.** Bei einer langen
 * Akte wären zwanzig aufgeklappte Mails eine Bildschirmseite, durch die man
 * nur noch scrollt. Der Kopf zeigt Art, Datum und Absender — genug, um zu
 * entscheiden, ob sich das Aufklappen lohnt.
 *
 * **Warum der Mailkörper erst beim Aufklappen kommt.** Er braucht einen
 * eigenen Pipedrive-Aufruf (`holeMailBody`) und ist, anders als eine Notiz,
 * potenziell gross. Wird eine Mail einmal geladen, bleibt ihr Inhalt im
 * Zustand dieser Komponente — ein zweites Auf- und Zuklappen fragt nicht
 * erneut an.
 */

type MailZustand =
  | { status: 'laedt' }
  | { status: 'fertig'; betreff: string | null; body: string }
  | { status: 'fehler'; meldung: string }

const SCHRITT_JE_SEITE = 20

export function Vorgangsschritte({
  fallId,
  schritte,
}: {
  fallId: string
  schritte: Vorgangsschritt[]
}) {
  const [offen, setzeOffen] = useState<string | null>(null)
  const [mails, setzeMails] = useState<Record<number, MailZustand>>({})
  const [sichtbar, setzeSichtbar] = useState(SCHRITT_JE_SEITE)

  if (schritte.length === 0) {
    return (
      <p className="unterzeile" style={{ margin: 0 }}>
        Keine Notizen oder Mails zu diesem Vorgang.
      </p>
    )
  }

  function schluessel(schritt: Vorgangsschritt): string {
    return `${schritt.art}-${schritt.id}`
  }

  function toggeln(schritt: Vorgangsschritt) {
    const key = schluessel(schritt)
    setzeOffen((alt) => (alt === key ? null : key))
    if (schritt.art === 'mail' && !mails[schritt.id]) ladeMail(fallId, schritt.id, setzeMails)
  }

  const anzeigen = schritte.slice(0, sichtbar)

  return (
    <div>
      <ul className="vorgangsschritte-liste">
        {anzeigen.map((schritt) => {
          const key = schluessel(schritt)
          const istOffen = offen === key
          return (
            <li key={key} className="vorgangsschritt">
              <button
                type="button"
                className="vorgangsschritt-kopf"
                aria-expanded={istOffen}
                onClick={() => toggeln(schritt)}
              >
                <span className={`marke-pille ${schritt.art === 'mail' ? 'm-akzent' : ''}`}>
                  {schritt.art === 'mail' ? 'E-Mail' : 'Notiz'}
                </span>
                <span className="vorgangsschritt-datum">{formatiereZeitpunkt(schritt.zeitpunkt)}</span>
                <span className="vorgangsschritt-von">
                  {schritt.art === 'mail' ? (schritt.absender ?? 'Unbekannt') : (schritt.autor ?? 'Unbekannt')}
                </span>
                {schritt.art === 'mail' && schritt.betreff ? (
                  <span className="vorgangsschritt-betreff">{schritt.betreff}</span>
                ) : null}
                <span className="vorgangsschritt-pfeil" aria-hidden="true" />
              </button>

              {istOffen ? (
                <div className="vorgangsschritt-inhalt">
                  {schritt.art === 'notiz' ? (
                    <Reichtext wert={schritt.inhalt} />
                  ) : (
                    <MailInhalt zustand={mails[schritt.id]} />
                  )}
                </div>
              ) : null}
            </li>
          )
        })}
      </ul>

      {sichtbar < schritte.length ? (
        <button
          type="button"
          className="knopf-schlicht"
          style={{ marginTop: 12 }}
          onClick={() => setzeSichtbar((alt) => alt + SCHRITT_JE_SEITE)}
        >
          Mehr laden ({schritte.length - sichtbar} weitere)
        </button>
      ) : null}
    </div>
  )
}

function MailInhalt({ zustand }: { zustand: MailZustand | undefined }) {
  if (!zustand || zustand.status === 'laedt') return <Kreisel text="Mail wird geladen …" />
  if (zustand.status === 'fehler') return <Meldung art="fehler">{zustand.meldung}</Meldung>
  return <Reichtext wert={zustand.body} />
}

async function ladeMail(
  fallId: string,
  mailId: number,
  setzeMails: React.Dispatch<React.SetStateAction<Record<number, MailZustand>>>,
) {
  setzeMails((alt) => ({ ...alt, [mailId]: { status: 'laedt' } }))
  try {
    const antwort = await fetch(`/api/faelle/${fallId}/vorgangsschritte/mail/${mailId}`)
    const daten = (await antwort.json()) as {
      fehler?: string
      betreff?: string | null
      body?: string
    }
    if (!antwort.ok) {
      setzeMails((alt) => ({
        ...alt,
        [mailId]: { status: 'fehler', meldung: daten.fehler ?? 'Die Mail liess sich nicht laden.' },
      }))
      return
    }
    setzeMails((alt) => ({
      ...alt,
      [mailId]: { status: 'fertig', betreff: daten.betreff ?? null, body: daten.body ?? '' },
    }))
  } catch {
    setzeMails((alt) => ({
      ...alt,
      [mailId]: { status: 'fehler', meldung: 'Die Mail liess sich nicht laden — keine Verbindung.' },
    }))
  }
}

function formatiereZeitpunkt(zeitpunkt: string): string {
  const datum = new Date(zeitpunkt)
  if (Number.isNaN(datum.getTime())) return zeitpunkt
  return datum.toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })
}
