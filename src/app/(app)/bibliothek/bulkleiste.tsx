'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import {
  bulkExportiere,
  bulkGebeFrei,
  bulkSetzeBereich,
  bulkSetzeStatus,
  macheBulkLaufRueckgaengig,
  type BulkErgebnis,
} from '@/bibliothek/bulk-aktionen'
import { BEREICHE, type Bereich } from '@/bibliothek/eingabe'
import type { EintragListe } from '@/bibliothek/abfragen'
import { Kreisel } from '@/app/teile/anzeigen'
import { useMelder } from '@/app/teile/melder'
import { erfolg, fehler, type Meldung } from '@/melden/typen'
import { StatusPille } from './status-pille'

/**
 * Die Liste der Bibliothek, mit Mehrfachauswahl.
 *
 * **Warum die ganze Liste hier steht und nicht nur die Auswahlbox.** Die
 * Auswahl (`gewaehlt`) lebt im Zustand dieser Komponente — sie müsste sonst
 * zwischen einer Server-Komponente und einer Client-Komponente hin- und
 * herwandern, für nichts als ein paar Zeilen JSX.
 *
 * **Warum ausgewählte Kennungen mit Nummer und Titel gespeichert werden,
 * nicht als bloßes `Set<string>`.** Die Liste ist paginiert — die
 * Bestätigung soll aber auch dann Titel zeigen können, wenn eine Auswahl
 * über mehrere Seiten hinweg entstand und die vorige Seite nicht mehr im
 * Zugriff ist. Dieselbe Überlegung wie bei `korbtabelle.tsx`: „Der Filter
 * ändert die Auswahl nicht" — hier gilt das auch für die Seitenwahl.
 *
 * **Rückmeldungen laufen über das anwendungsweite Meldewesen
 * (`useMelder()`/`melde()`)**, nicht über eigene Einblendungen — dieselbe
 * Stelle, an der auch `korbtabelle.tsx` sein Ergebnis zeigt. Das Undo nach
 * einer Bulk-Aktion hängt dafür als Aktions-Knopf an der Erfolgsmeldung
 * selbst (`Meldung.aktion`, siehe `melder.tsx`).
 */

type Kandidat = { nummer: string; titel: string }

type Vorhaben =
  | { art: 'status'; ziel: 'entwurf' | 'pruefung' | 'zurueckgezogen'; beschriftung: string }
  | { art: 'freigabe'; beschriftung: string }
  | { art: 'bereich'; ziel: Bereich; beschriftung: string }

interface Eigenschaften {
  eintraege: EintragListe
  bereichsnamen: Record<Bereich, string>
  darfFreigeben: boolean
}

/** Höchstens so viele übersprungene Einträge werden in der Meldung namentlich genannt. */
const UEBERSPRUNGEN_NENNEN = 3

/**
 * Baut aus dem Ergebnis einer Bulk-Aktion die Meldung fürs Meldewesen —
 * inklusive des Rückgängig-Knopfs, sofern die Aktion etwas geändert hat.
 */
function baueErgebnisMeldung(
  antwort: BulkErgebnis,
  rueckgaengigMachen: (bulkLaufId: string) => void,
): Meldung {
  if (antwort.fehler) return fehler(antwort.fehler)

  const teile = [
    `${antwort.bearbeitet.length} Eintrag${antwort.bearbeitet.length === 1 ? '' : 'e'} geändert.`,
  ]
  if (antwort.uebersprungen.length > 0) {
    const genannt = antwort.uebersprungen
      .slice(0, UEBERSPRUNGEN_NENNEN)
      .map((u) => `${u.nummer} — ${u.titel} (${u.grund})`)
    const rest = antwort.uebersprungen.length - genannt.length
    teile.push(
      `${antwort.uebersprungen.length} übersprungen: ${genannt.join('; ')}` +
        (rest > 0 ? ` und ${rest} weitere.` : '.'),
    )
  }

  const meldung = erfolg(teile.join(' '))
  if (antwort.bulkLaufId) {
    const bulkLaufId = antwort.bulkLaufId
    meldung.aktion = { text: 'Rückgängig', ausfuehren: () => rueckgaengigMachen(bulkLaufId) }
  }
  return meldung
}

export function BibliothekListe({ eintraege, bereichsnamen, darfFreigeben }: Eigenschaften) {
  const { melde } = useMelder()
  const [gewaehlt, setzeGewaehlt] = useState<Map<string, Kandidat>>(new Map())
  const [vorhaben, setzeVorhaben] = useState<Vorhaben | null>(null)
  const [zielBereich, setzeZielBereich] = useState<Bereich>('kalkulation')
  const [laeuft, starte] = useTransition()

  function schalte(e: { id: string; nummer: string; titel: string }) {
    setzeGewaehlt((vorher) => {
      const naechste = new Map(vorher)
      if (naechste.has(e.id)) naechste.delete(e.id)
      else naechste.set(e.id, { nummer: e.nummer, titel: e.titel })
      return naechste
    })
  }

  /**
   * Wirkt nur auf die Einträge dieser (server-seitig paginierten) Seite.
   * Eine Auswahl auf anderen Seiten bleibt unangetastet — dieselbe Regel wie
   * beim einzelnen Haken.
   */
  function schalteSeite(an: boolean) {
    setzeGewaehlt((vorher) => {
      const naechste = new Map(vorher)
      for (const e of eintraege) {
        if (an) naechste.set(e.id, { nummer: e.nummer, titel: e.titel })
        else naechste.delete(e.id)
      }
      return naechste
    })
  }

  function hebeAuswahlAuf() {
    setzeGewaehlt(new Map())
    setzeVorhaben(null)
  }

  function rueckgaengigMachen(bulkLaufId: string) {
    starte(async () => {
      const antwort = await macheBulkLaufRueckgaengig(bulkLaufId)
      melde(antwort.fehler ? fehler(antwort.fehler) : erfolg(antwort.hinweis ?? 'Rückgängig gemacht.'))
    })
  }

  function fuehreAus() {
    if (!vorhaben) return
    const ids = [...gewaehlt.keys()]
    starte(async () => {
      const antwort =
        vorhaben.art === 'status'
          ? await bulkSetzeStatus(ids, vorhaben.ziel)
          : vorhaben.art === 'freigabe'
            ? await bulkGebeFrei(ids)
            : await bulkSetzeBereich(ids, vorhaben.ziel)

      setzeVorhaben(null)
      melde(baueErgebnisMeldung(antwort, rueckgaengigMachen))

      // Erfolgreich bearbeitete Einträge fallen aus der Auswahl — was
      // übersprungen wurde, bleibt gewählt, damit es sich sofort erneut
      // angehen oder einzeln nachschlagen lässt.
      if (antwort.bearbeitet.length > 0) {
        setzeGewaehlt((vorher) => {
          const naechste = new Map(vorher)
          for (const b of antwort.bearbeitet) naechste.delete(b.id)
          return naechste
        })
      }
    })
  }

  function exportiere() {
    const ids = [...gewaehlt.keys()]
    starte(async () => {
      const antwort = await bulkExportiere(ids)
      if (antwort.fehler || !antwort.datenBase64) {
        melde(fehler(antwort.fehler ?? 'Der Export ist fehlgeschlagen.'))
        return
      }
      const bytes = Uint8Array.from(atob(antwort.datenBase64), (z) => z.charCodeAt(0))
      const blob = new Blob([bytes], { type: 'application/zip' })
      const url = URL.createObjectURL(blob)
      const anker = document.createElement('a')
      anker.href = url
      anker.download = antwort.dateiname ?? 'bibliothek-export.zip'
      document.body.appendChild(anker)
      anker.click()
      anker.remove()
      URL.revokeObjectURL(url)
    })
  }

  const alleAufSeiteGewaehlt = eintraege.length > 0 && eintraege.every((e) => gewaehlt.has(e.id))

  return (
    <>
      {eintraege.length === 0 ? (
        <div className="leer">
          <p style={{ margin: 0 }}>Kein Eintrag passt zu dieser Suche.</p>
        </div>
      ) : (
        <>
          <label className="korb-schalter bulk-seiten-auswahl">
            <input
              type="checkbox"
              checked={alleAufSeiteGewaehlt}
              onChange={(ev) => schalteSeite(ev.target.checked)}
            />
            {alleAufSeiteGewaehlt
              ? 'Auswahl auf dieser Seite aufheben'
              : `Alle ${eintraege.length} auf dieser Seite auswählen`}
          </label>

          <div className="liste">
            {eintraege.map((e) => {
              const text = e.gegenargument || e.vorgehen
              const istGewaehlt = gewaehlt.has(e.id)
              return (
                <div key={e.id} className={`zeile-mit-auswahl${istGewaehlt ? ' gewaehlt' : ''}`}>
                  <span className="auswahlkasten">
                    <input
                      type="checkbox"
                      checked={istGewaehlt}
                      onChange={() => schalte(e)}
                      aria-label={`„${e.titel}" auswählen`}
                    />
                  </span>
                  <Link href={`/bibliothek/${e.id}`} className="zeile">
                    <span className="zeile-nummer">{e.nummer}</span>
                    <span>
                      <span className="zeile-titel">{e.titel}</span>
                      <span className="zeile-meta">
                        <span>{bereichsnamen[e.bereich]}</span>
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
                          <span className="marke-pille m-entwurf" title="Einzusetzende Werte und Arbeitsaufträge">
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
                </div>
              )
            })}
          </div>
        </>
      )}

      {gewaehlt.size > 0 ? (
        <div className="bulk-leiste">
          <span className="treffer-zahl">{gewaehlt.size} ausgewählt</span>

          <button type="button" disabled={laeuft} onClick={hebeAuswahlAuf}>
            Auswahl aufheben
          </button>
          <button
            type="button"
            disabled={laeuft}
            onClick={() => setzeVorhaben({ art: 'status', ziel: 'pruefung', beschriftung: 'in die Prüfung stellen' })}
          >
            Zur Prüfung
          </button>
          <button
            type="button"
            className="freigabe"
            disabled={laeuft || !darfFreigeben}
            title={darfFreigeben ? undefined : 'Dafür fehlt die Rolle „Freigeber" oder „Administrator".'}
            onClick={() => setzeVorhaben({ art: 'freigabe', beschriftung: 'freigeben' })}
          >
            Freigeben
          </button>
          <button
            type="button"
            disabled={laeuft}
            onClick={() => setzeVorhaben({ art: 'status', ziel: 'entwurf', beschriftung: 'auf Entwurf zurücksetzen' })}
          >
            Zurück auf Entwurf
          </button>
          <button
            type="button"
            disabled={laeuft}
            onClick={() => setzeVorhaben({ art: 'status', ziel: 'zurueckgezogen', beschriftung: 'zurückziehen' })}
          >
            Zurückziehen
          </button>

          <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
            <select
              value={zielBereich}
              onChange={(ev) => setzeZielBereich(ev.target.value as Bereich)}
              disabled={laeuft}
              aria-label="Zielbereich für den Bereichswechsel"
            >
              {BEREICHE.map((b) => (
                <option key={b} value={b}>
                  {bereichsnamen[b]}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={laeuft}
              onClick={() =>
                setzeVorhaben({
                  art: 'bereich',
                  ziel: zielBereich,
                  beschriftung: `in den Bereich „${bereichsnamen[zielBereich]}" verschieben`,
                })
              }
            >
              Verschieben
            </button>
          </span>

          <button type="button" disabled={laeuft} onClick={exportiere}>
            {laeuft ? <Kreisel text="Als ZIP exportieren" /> : 'Als ZIP exportieren'}
          </button>

          {vorhaben ? (
            <div className="bulk-bestaetigung">
              <p style={{ margin: '0 0 8px' }}>
                {gewaehlt.size} Eintrag{gewaehlt.size === 1 ? '' : 'e'} {vorhaben.beschriftung}:
              </p>
              <ul>
                {[...gewaehlt.entries()].map(([id, k]) => (
                  <li key={id}>
                    {k.nummer} — {k.titel}
                  </li>
                ))}
              </ul>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" className="haupt" disabled={laeuft} onClick={fuehreAus}>
                  {laeuft ? <Kreisel text="Bestätigen" /> : 'Bestätigen'}
                </button>
                <button type="button" disabled={laeuft} onClick={() => setzeVorhaben(null)}>
                  Abbrechen
                </button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </>
  )
}

/** Kürzt einen Text auf ganze Wörter. Dieselbe Regel wie in `page.tsx`. */
function auszug(text: string | null, laenge = 190): string {
  if (!text) return ''
  const sauber = text.replace(/\s+/g, ' ').trim()
  if (sauber.length <= laenge) return sauber
  return sauber.slice(0, sauber.lastIndexOf(' ', laenge)) + ' …'
}
