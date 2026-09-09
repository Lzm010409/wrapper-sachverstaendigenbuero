'use client'

import { useId, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'

/**
 * Die Filterleiste über einer Liste.
 *
 * **Der Zustand steht in der Adresse, nicht in React.** Ein gefilterter
 * Listenstand ist etwas, das man weiterschickt („schau dir die offenen
 * E-Klassen an"), das man sich als Lesezeichen legt und zu dem der
 * Zurück-Knopf zurückführen muss. Im Bauteilzustand könnte er das alles
 * nicht, und nach jedem Seitenwechsel wäre er weg.
 *
 * **Gefiltert wird auf dem Server.** Die Leiste schickt ein gewöhnliches
 * GET-Formular ab; die Seite liest die Werte aus `searchParams` und stellt
 * ihre Abfrage danach. Ein Filter, der erst im Browser greift, filtert nur
 * die Zeilen, die ohnehin schon geladen sind — bei einer Liste mit
 * Obergrenze ist das genau der falsche Ausschnitt.
 *
 * **Zwei Reihen.** Vorn steht, wonach täglich gefiltert wird; alles Weitere
 * liegt hinter „Weitere Filter". Eine Leiste mit acht Feldern nebeneinander
 * wird nicht gelesen, sondern übersprungen. Ist ein Feld aus der zweiten
 * Reihe gesetzt, klappt sie von selbst auf — sonst wirkte die Liste
 * unerklärlich kurz.
 */

export type Filterfeld =
  | { art: 'suche'; name: string; platzhalter: string }
  | { art: 'text'; name: string; beschriftung: string; platzhalter?: string }
  | { art: 'datum'; name: string; beschriftung: string }
  | {
      art: 'auswahl'
      name: string
      beschriftung: string
      werte: { wert: string; text: string }[]
      /** Was bei leerer Auswahl dasteht. */
      alle: string
    }

export interface FilterleisteEigenschaften {
  felder: Filterfeld[]
  /** Ab diesem Feld liegt alles hinter „Weitere Filter". */
  weitereAb?: number
  /** Rechts in der Leiste, z. B. „12 von 340". */
  treffer?: string
  /**
   * Parameter, die dieses Formular nicht zeigt, aber beim Abschicken
   * mitschicken muss — z. B. `sortiert`/`richtung` aus der `Sortierleiste`.
   * Ohne das würde jeder Filterwechsel die Sortierung verwerfen: `abschicken`
   * baut die neue Adresse nur aus den eigenen Formularfeldern.
   */
  zusatzParameter?: Record<string, string | undefined>
}

function beschriftungVon(feld: Filterfeld): string {
  return feld.art === 'suche' ? 'Suche' : feld.beschriftung
}

export function Filterleiste({
  felder,
  weitereAb,
  treffer,
  zusatzParameter,
}: FilterleisteEigenschaften) {
  const parameter = useSearchParams()
  const router = useRouter()
  const pfad = usePathname()
  const kennung = useId()

  const grenze = weitereAb ?? felder.length
  const vorn = felder.slice(0, grenze)
  const hinten = felder.slice(grenze)

  const wertVon = (name: string) => parameter.get(name) ?? ''
  const hintenGesetzt = hinten.some((f) => wertVon(f.name) !== '')
  const [offen, setzeOffen] = useState(hintenGesetzt)

  const gesetzte = felder.filter((f) => wertVon(f.name) !== '')

  /**
   * Schickt ab, ohne die leeren Felder mitzunehmen.
   *
   * Ein GET-Formular schickt **jedes** Feld mit, auch die leeren. Die Adresse
   * hiess dann `?suche=&zustand=&marke=BMW&modell=&baujahr=&von=&bis=` — für
   * etwas, das weitergeschickt und als Lesezeichen abgelegt wird, ist das
   * unbrauchbar. Ohne JavaScript bleibt das gewöhnliche Absenden bestehen;
   * die Seite versteht beide Formen.
   */
  function abschicken(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const gefuellt = new URLSearchParams()
    for (const [name, wert] of new FormData(e.currentTarget).entries()) {
      const text = String(wert).trim()
      if (text) gefuellt.set(name, text)
    }
    router.push(gefuellt.size > 0 ? `${pfad}?${gefuellt}` : pfad)
  }

  /** Nimmt einen einzelnen Filter heraus, ohne die übrigen anzufassen. */
  function entferne(name: string) {
    const naechste = new URLSearchParams(parameter.toString())
    naechste.delete(name)
    router.replace(naechste.size > 0 ? `${pfad}?${naechste}` : pfad)
  }

  /*
   * Auswahl- und Datumsfelder schicken beim Ändern gleich ab: dort ist die
   * Eingabe mit der Auswahl fertig, und ein Klick auf „Filtern" hinterher
   * wäre ein Handgriff, den niemand erwartet. Das Textfeld tut es nicht —
   * dort wäre nach jedem Buchstaben ein Seitenaufruf.
   */
  const gleichAbschicken = (e: React.ChangeEvent<HTMLElement>) => {
    e.currentTarget.closest('form')?.requestSubmit()
  }

  return (
    <form className="filterleiste" method="get" role="search" onSubmit={abschicken}>
      {Object.entries(zusatzParameter ?? {}).map(([name, wert]) =>
        wert ? <input key={name} type="hidden" name={name} value={wert} /> : null,
      )}

      <div className="filterleiste-reihe">
        {vorn.map((feld) => (
          <Feld key={feld.name} feld={feld} wert={wertVon(feld.name)} beiAuswahl={gleichAbschicken} />
        ))}

        {/*
          Bewusst kein blauer Hauptknopf: Auswahl- und Datumsfelder schicken
          von selbst ab, im Suchfeld tut es die Eingabetaste. Der Knopf ist
          der Rückfall — und neben dem blauen „Fall laden" darüber wären zwei
          Hauptsachen auf einer Seite, von denen eine keine ist.
        */}
        <button type="submit">Filtern</button>

        {hinten.length > 0 ? (
          <button
            type="button"
            className="knopf-schlicht"
            aria-expanded={offen}
            aria-controls={`${kennung}-weitere`}
            onClick={() => setzeOffen(!offen)}
          >
            {offen ? 'Weniger' : 'Weitere Filter'}
          </button>
        ) : null}

        {treffer ? <span className="treffer-zahl">{treffer}</span> : null}
      </div>

      {/*
        `hidden` statt bedingtem Rendern: die Felder bleiben im Formular und
        werden mitgeschickt. Sonst verlöre ein Klick auf „Weniger" die
        gesetzten Werte, ohne dass jemand danach gefragt hätte.
      */}
      <div id={`${kennung}-weitere`} className="filterleiste-reihe" hidden={!offen}>
        {hinten.map((feld) => (
          <Feld key={feld.name} feld={feld} wert={wertVon(feld.name)} beiAuswahl={gleichAbschicken} />
        ))}
      </div>

      {gesetzte.length > 0 ? (
        <div className="filtermarken">
          {gesetzte.map((feld) => (
            <button
              key={feld.name}
              type="button"
              className="filtermarke"
              onClick={() => entferne(feld.name)}
              title={`Filter „${beschriftungVon(feld)}" entfernen`}
            >
              <span>
                {beschriftungVon(feld)}: <strong>{anzeige(feld, wertVon(feld.name))}</strong>
              </span>
              <span aria-hidden="true">×</span>
              <span className="nur-vorlesen">entfernen</span>
            </button>
          ))}
          <a href={pfad} className="filter-zuruecksetzen">
            Alle zurücksetzen
          </a>
        </div>
      ) : null}
    </form>
  )
}

/** Der Wert, wie er auf der Marke steht — bei einer Auswahl deren Text. */
function anzeige(feld: Filterfeld, wert: string): string {
  if (feld.art === 'auswahl') {
    return feld.werte.find((w) => w.wert === wert)?.text ?? wert
  }
  if (feld.art === 'datum') {
    const [jahr, monat, tag] = wert.split('-')
    return jahr && monat && tag ? `${tag}.${monat}.${jahr}` : wert
  }
  return wert
}

function Feld({
  feld,
  wert,
  beiAuswahl,
}: {
  feld: Filterfeld
  wert: string
  beiAuswahl: (e: React.ChangeEvent<HTMLElement>) => void
}) {
  // `key` am Feld, damit ein Wechsel des Filterstands das Feld neu aufsetzt
  // statt den alten Wert stehen zu lassen: `defaultValue` allein wirkt nur
  // beim ersten Rendern, und nach dem Entfernen einer Marke stand der Wert
  // sonst weiterhin im Feld.
  if (feld.art === 'suche') {
    return (
      <input
        key={wert}
        type="search"
        name={feld.name}
        defaultValue={wert}
        placeholder={feld.platzhalter}
        aria-label={feld.platzhalter}
      />
    )
  }

  return (
    <div className="feld">
      <label htmlFor={`filter-${feld.name}`}>{feld.beschriftung}</label>
      {feld.art === 'auswahl' ? (
        <select
          key={wert}
          id={`filter-${feld.name}`}
          name={feld.name}
          defaultValue={wert}
          onChange={beiAuswahl}
        >
          <option value="">{feld.alle}</option>
          {feld.werte.map((w) => (
            <option key={w.wert} value={w.wert}>
              {w.text}
            </option>
          ))}
        </select>
      ) : (
        <input
          key={wert}
          id={`filter-${feld.name}`}
          type={feld.art === 'datum' ? 'date' : 'text'}
          name={feld.name}
          defaultValue={wert}
          placeholder={feld.art === 'text' ? feld.platzhalter : undefined}
          onChange={feld.art === 'datum' ? beiAuswahl : undefined}
        />
      )}
    </div>
  )
}
