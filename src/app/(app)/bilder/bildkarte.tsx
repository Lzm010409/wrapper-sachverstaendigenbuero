'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  ausBibliothekNehmen,
  beschrifteBild,
  loescheBild,
  uebernehmeInBildbibliothek,
} from '@/bilder/aktionen'
import type { Bibliotheksbild } from '@/bilder/bibliothek'
import { Kreisel } from '@/app/teile/anzeigen'

/**
 * Eine Karte je Bild: sehen, beschriften, übernehmen, löschen.
 *
 * Die Beschriftung steht aufgeklappt unter dem Bild und nicht in einem
 * eigenen Fenster — sie ist der eigentliche Wert der Bibliothek, nicht
 * eine Nebensache, die man noch irgendwo pflegt.
 */
export function Bildkarte({ bild }: { bild: Bibliotheksbild }) {
  const router = useRouter()
  const [offen, setzeOffen] = useState(false)
  const [laeuft, starte] = useTransition()
  const [meldung, setzeMeldung] = useState<{ text: string; fehler: boolean } | null>(null)
  const bildknopf = useRef<HTMLButtonElement | null>(null)

  const gespeichert = {
    titel: bild.titel ?? '',
    beschreibung: bild.beschreibung ?? '',
    themen: bild.themen.join(', '),
  }
  const [werte, setzeWerte] = useState(gespeichert)

  /**
   * Was in den Feldern steht, ist nicht, was in der Datenbank steht: die
   * Karte klappt zu, ohne zu speichern, und beim nächsten Aufklappen sieht
   * die ungespeicherte Eingabe wie der gespeicherte Stand aus. Deshalb wird
   * der Unterschied benannt — und es gibt einen Weg zurück.
   */
  const geaendert =
    werte.titel !== gespeichert.titel ||
    werte.beschreibung !== gespeichert.beschreibung ||
    werte.themen !== gespeichert.themen

  /** Jede Eingabe macht die vorige Meldung ungültig — „Gespeichert." über einem
   *  bereits wieder geänderten Feld ist eine Zusage, die nicht mehr gilt. */
  const aendere = (teil: Partial<typeof werte>) => {
    setzeWerte((w) => ({ ...w, ...teil }))
    setzeMeldung(null)
  }

  const verwirf = () => {
    setzeWerte(gespeichert)
    setzeMeldung(null)
    setzeOffen(false)
    bildknopf.current?.focus()
  }

  const fuehreAus = (arbeit: () => Promise<{ fehler?: string; hinweis?: string }>) =>
    starte(async () => {
      const e = await arbeit()
      setzeMeldung(
        e.fehler
          ? { text: e.fehler, fehler: true }
          : e.hinweis
            ? { text: e.hinweis, fehler: false }
            : null,
      )
      router.refresh()
    })

  return (
    <article
      className={`bildkarte ${bild.inBibliothek ? '' : 'offen-uebernahme'}`}
      onKeyDown={(e) => {
        // Aufgeklapptes schliesst sich mit Esc — sonst führt kein Weg
        // heraus ausser einem Klick auf das Bild.
        if (e.key === 'Escape' && offen) {
          e.stopPropagation()
          setzeOffen(false)
          bildknopf.current?.focus()
        }
      }}
    >
      <button
        ref={bildknopf}
        type="button"
        className="bildkarte-bild"
        onClick={() => setzeOffen((o) => !o)}
        aria-expanded={offen}
        title={offen ? 'Beschriftung schliessen' : 'Beschriften'}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`/api/bilder/${bild.id}`} alt={bild.titel ?? bild.dateiname} loading="lazy" />
      </button>

      <div className="bildkarte-kopf">
        <span className="bildkarte-titel">{bild.titel || bild.dateiname}</span>
        <span className="treffer-zahl">
          {bild.breitePx}×{bild.hoehePx} · {groesse(bild.bytes)}
        </span>
      </div>

      {bild.beschreibung && !offen ? (
        <p className="bildkarte-text">{bild.beschreibung}</p>
      ) : null}

      {bild.themen.length > 0 && !offen ? (
        <div className="bildkarte-themen">
          {bild.themen.map((t) => (
            <span key={t} className="marke-pille m-akzent">
              {t}
            </span>
          ))}
        </div>
      ) : null}

      {!bild.inBibliothek ? (
        <div className="bildkarte-fuss">
          <span className="unterzeile" style={{ margin: 0 }}>
            aus {bild.herkunft ?? 'einer Stellungnahme'}
          </span>
          <button
            type="button"
            className="haupt"
            disabled={laeuft}
            onClick={() => fuehreAus(() => uebernehmeInBildbibliothek(bild.id))}
          >
            {laeuft ? <Kreisel text="Übernehmen" /> : 'In die Bibliothek'}
          </button>
        </div>
      ) : null}

      {offen ? (
        <div className="bildkarte-formular">
          <div className="feld">
            <label htmlFor={`titel-${bild.id}`}>Titel</label>
            <input
              id={`titel-${bild.id}`}
              value={werte.titel}
              placeholder={bild.dateiname}
              onChange={(e) => aendere({ titel: e.target.value })}
            />
          </div>
          <div className="feld">
            <label htmlFor={`besch-${bild.id}`}>Beschreibung</label>
            <textarea
              id={`besch-${bild.id}`}
              value={werte.beschreibung}
              placeholder="Was zeigt das Bild, und wofür taugt es als Beleg?"
              style={{ minHeight: 80 }}
              onChange={(e) => aendere({ beschreibung: e.target.value })}
            />
          </div>
          <div className="feld">
            <label htmlFor={`themen-${bild.id}`}>Themen, durch Komma getrennt</label>
            <input
              id={`themen-${bild.id}`}
              value={werte.themen}
              placeholder="Beilackierung, DAT-Auszug, Verbringung"
              onChange={(e) => aendere({ themen: e.target.value })}
            />
          </div>

          <div className="bildkarte-knoepfe">
            <button
              type="button"
              className="haupt"
              disabled={laeuft}
              onClick={() => fuehreAus(() => beschrifteBild(bild.id, werte))}
            >
              {laeuft ? <Kreisel text="Speichern" /> : 'Speichern'}
            </button>
            <button type="button" disabled={laeuft} onClick={verwirf}>
              {geaendert ? 'Verwerfen' : 'Schliessen'}
            </button>
            {bild.inBibliothek ? (
              <button
                type="button"
                disabled={laeuft}
                title={
                  bild.stellungnahmeId
                    ? 'Das Bild bleibt erhalten und erscheint wieder unter „Aus Schreiben“.'
                    : 'Das Bild bleibt in der Datenbank, ist danach aber über diese Seite nicht mehr erreichbar.'
                }
                onClick={() => {
                  // Anders als beim Löschen prüft die Aktion nicht, ob das
                  // Bild in einem Schreiben steht — es fiele dort stumm
                  // heraus. Bis das behoben ist, fragt wenigstens die Karte.
                  const folge = bild.stellungnahmeId
                    ? 'Das Bild erscheint danach wieder unter „Aus Schreiben — noch nicht übernommen“.'
                    : 'Dieses Bild wurde direkt hochgeladen. Es ist danach über diese Seite nicht mehr zu finden, und es lässt sich auch nicht zurückholen.'
                  if (
                    confirm(
                      `Bild aus der Bibliothek nehmen?\n\n${folge}\n\nSteht es bereits in einem Schreiben, fehlt es dort im Word-Dokument.`,
                    )
                  ) {
                    fuehreAus(() => ausBibliothekNehmen(bild.id))
                  }
                }}
              >
                Aus der Bibliothek nehmen
              </button>
            ) : null}
            <button
              type="button"
              className="gefahr"
              disabled={laeuft}
              onClick={() => {
                if (confirm('Dieses Bild endgültig löschen?')) {
                  fuehreAus(() => loescheBild(bild.id))
                }
              }}
            >
              Löschen
            </button>
          </div>

          {geaendert ? (
            <span className="treffer-zahl">
              Ungespeicherte Änderung — „Speichern“ übernimmt sie, „Verwerfen“ nimmt sie zurück.
            </span>
          ) : null}

          {meldung ? (
            <div className={`hinweis ${meldung.fehler ? 'fehler' : ''}`} role="status">
              {meldung.text}
            </div>
          ) : null}
        </div>
      ) : null}
    </article>
  )
}

/**
 * „0 KB" für ein Bild von 68 Bytes liest sich wie „hier ist nichts drin".
 * Unter einem Kilobyte steht darum die Byte-Zahl.
 */
function groesse(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  return `${Math.round(bytes / 1024)} KB`
}

/** Bilder direkt in die Bibliothek hochladen. */
export function Bildaufnahme() {
  const router = useRouter()
  const [laeuft, setzeLaeuft] = useState(false)
  const [meldung, setzeMeldung] = useState<string | null>(null)
  const wahl = useRef<HTMLInputElement | null>(null)

  const lade = async (dateien: FileList) => {
    setzeLaeuft(true)
    setzeMeldung(null)
    try {
      const formular = new FormData()
      for (const d of Array.from(dateien)) formular.append('bild', d)

      const antwort = await fetch('/api/bilder', { method: 'POST', body: formular })

      // Nicht jede Antwort ist JSON: fällt etwas vor der Route aus (Anmeldung
      // abgelaufen, Vorschaltserver), kommt Text oder HTML. Das blind durch
      // `json()` zu schicken landete im `catch` — und dort stand dann
      // „Die Verbindung ist abgerissen.", obwohl die Verbindung stand.
      const ergebnis = await antwort
        .json()
        .then((e) => e as { angelegt?: string[]; fehler?: string })
        .catch(() => null)

      if (!ergebnis) {
        setzeMeldung(
          antwort.status === 401
            ? 'Die Anmeldung ist abgelaufen. Melde Dich neu an, dann noch einmal hochladen.'
            : `Der Server hat mit ${antwort.status} geantwortet und nichts Lesbares mitgeschickt. Das Bild wurde nicht aufgenommen.`,
        )
      } else {
        const anzahl = ergebnis.angelegt?.length ?? 0
        if (ergebnis.fehler) {
          // Bei mehreren Dateien kann die eine durchgehen und die andere
          // scheitern. Wer nur den Fehler liest, lädt die erste ein zweites
          // Mal hoch und hat sie doppelt.
          setzeMeldung(
            anzahl > 0
              ? `${anzahl} Bild(er) aufgenommen, der Rest nicht: ${ergebnis.fehler}`
              : ergebnis.fehler,
          )
        } else {
          setzeMeldung(`${anzahl} Bild(er) aufgenommen — jetzt beschriften.`)
        }
      }
      router.refresh()
    } catch {
      setzeMeldung('Die Verbindung ist abgerissen. Das Bild wurde nicht aufgenommen.')
    } finally {
      setzeLaeuft(false)
    }
  }

  return (
    <>
      <div className="werkzeugleiste">
        <input
          ref={wahl}
          type="file"
          accept="image/png,image/jpeg"
          multiple
          disabled={laeuft}
          aria-label="Bilder in die Bibliothek aufnehmen"
          style={{ flex: 1, minWidth: 240 }}
          onChange={(e) => {
            if (e.target.files?.length) void lade(e.target.files)
            e.target.value = ''
          }}
        />
        {laeuft ? <Kreisel text="lädt hoch …" /> : null}
        <span className="treffer-zahl">PNG und JPEG, bis 8 MB</span>
      </div>

      {meldung ? (
        <div className="hinweis" style={{ marginBottom: 16 }} role="status">
          {meldung}
        </div>
      ) : null}
    </>
  )
}
