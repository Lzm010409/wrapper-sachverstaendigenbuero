import { ladeKalkulation, type KalkulationAnsicht } from '@/fall/kalkulation'
import type { Gutachten } from '@/autoixpert/typen'
import type { VxsDaten } from '@/autoixpert/vxs'
import { Zeile } from './bausteine'

/**
 * Der Reiter „Kalkulation" — die DAT-Kalkulation aus autoiXpert.
 *
 * **Diese Datei stellt nur dar.** Woher die Zahlen kommen und was passiert,
 * wenn autoiXpert schweigt, entscheidet `src/fall/kalkulation.ts`.
 *
 * Bis hierher wurde die VXS nur für die Vergleichsfahrzeugsuche gelesen — für
 * den Untertyp des Fahrzeugs. Dieselbe Datei trägt aber auch die
 * Reparaturkosten; sie standen bloss nirgends. Auf dem Reiter „Fahrzeug"
 * stand stattdessen der Hinweis, Kalkulationsbeträge seien über die
 * Schnittstelle nicht zu haben. Das galt für das Gutachten-Objekt, nicht für
 * die VXS.
 */

const euro = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' })

function betrag(wert: number | null): string | null {
  return wert === null ? null : euro.format(wert)
}

export async function KalkulationReiter({ gutachten }: { gutachten: Gutachten }) {
  const ansicht = await ladeKalkulation(gutachten)
  return <KalkulationInhalt ansicht={ansicht} />
}

export function KalkulationInhalt({ ansicht }: { ansicht: KalkulationAnsicht }) {
  if (ansicht.stand === 'nicht_eingerichtet') {
    return (
      <div className="hinweis warn">
        autoiXpert ist auf diesem Server nicht eingerichtet — <code>AUTOIXPERT_API_TOKEN</code>{' '}
        fehlt. Ohne ihn lässt sich die Kalkulation nicht abrufen.
      </div>
    )
  }

  if (ansicht.stand === 'fehler') {
    return <div className="hinweis fehler">Die Kalkulation liess sich nicht laden: {ansicht.meldung}</div>
  }

  if (ansicht.stand === 'ohne_kalkulation' || !ansicht.daten) {
    return (
      <div className="leer">
        <p style={{ margin: 0 }}>Zu diesem Gutachten liegt in autoiXpert keine DAT-Kalkulation.</p>
        <p className="unterzeile" style={{ margin: '6px 0 0' }}>
          Das ist kein Fehler: Sie entsteht erst, wenn das Fahrzeug mit DAT identifiziert und
          kalkuliert wurde.
        </p>
      </div>
    )
  }

  return <Kalkulationsblatt daten={ansicht.daten} />
}

function Kalkulationsblatt({ daten }: { daten: VxsDaten }) {
  const k = daten.kalkulation
  const f = daten.fahrzeug

  return (
    <div className="detail">
      <div>
        <div className="block">
          <div className="block-label">
            Reparaturkosten
            <span className="marke-pille m-akzent">aus der DAT-Kalkulation</span>
          </div>
          <div className="karte">
            <dl className="kv" style={{ gridTemplateColumns: 'minmax(200px,auto) 1fr' }}>
              <Zeile label="Netto" wert={betrag(k.reparaturkostenNetto)} />
              <Zeile label="Mehrwertsteuer" wert={betrag(k.mehrwertsteuer)} />
              <Zeile label="Brutto" wert={betrag(k.reparaturkostenBrutto)} />
            </dl>
          </div>
        </div>

        <div className="block">
          <div className="block-label">Zusammensetzung</div>
          <div className="karte">
            <dl className="kv" style={{ gridTemplateColumns: 'minmax(200px,auto) 1fr' }}>
              <Zeile label="Lohn" wert={betrag(k.lohn)} />
              <Zeile label="Lack- und Material" wert={betrag(k.lackmaterial)} />
              <Zeile label="Nebenkosten" wert={betrag(k.nebenkosten)} />
            </dl>
            <p className="unterzeile" style={{ margin: '10px 0 0' }}>
              Die Anteile stammen aus derselben Datei wie die Endsumme. Sie ergeben zusammen
              nicht zwingend die Netto-Summe — Ersatzteile stehen als eigener Block in der
              Kalkulation.
            </p>
          </div>
        </div>
      </div>

      <aside className="seitenleiste">
        <div className="karte">
          <h2>Fahrzeug laut DAT</h2>
          <p className="unterzeile" style={{ marginTop: 0 }}>
            Genauer als im Gutachten-Objekt — hier steht die Motorvariante.
          </p>
          <dl className="kv">
            <Zeile label="Hersteller" wert={f.hersteller} />
            <Zeile label="Baureihe" wert={f.basismodell} />
            <Zeile label="Untertyp" wert={f.untertyp} />
            <Zeile label="DAT-Code" wert={f.datECode} />
            <Zeile label="Fahrgestellnummer" wert={f.vin} />
          </dl>
        </div>

        <div className="karte">
          <h2>Woher</h2>
          <p className="unterzeile" style={{ margin: 0 }}>
            autoiXpert, <code>GET /reports/…/vxs</code> — die Kalkulation im DAT-Format.
            Dieselbe Datei liefert dem Wiederbeschaffungswert-Reiter den Untertyp für die
            Vergleichsfahrzeugsuche.
          </p>
        </div>
      </aside>
    </div>
  )
}
