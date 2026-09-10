import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ladeEintrag } from '@/bibliothek/abfragen'
import { aktuellerBenutzer } from '@/auth/sitzung'
import { setzeWerteEin } from '@/dokument/platzhalter'
import { StatusPille } from '../status-pille'
import { Freigabeleiste } from './freigabeleiste'
import { BelegPruefung } from './beleg-pruefung'
import { Textbearbeitung } from './textbearbeitung'
import { verlangeAnmeldung } from '@/auth/wache'
import { darf } from '@/rechte/zugriff'

const BEREICHSNAMEN: Record<string, string> = {
  kalkulation: 'Kalkulation',
  wertminderung: 'Wertminderung',
  wbw: 'Wiederbeschaffungswert',
  restwert: 'Restwert',
  sonderfall: 'Sonderfälle',
}

/*
  Nur `migration` war übersetzt; alles andere fiel roh aus der Datenbank in
  die Randspalte — „manuell", „ki_vorschlag", „aus_stellungnahme". Und
  „Angelegt" liest sich wie ein Datum, steht aber für die Herkunft.
*/
const HERKUNFTSNAMEN: Record<string, string> = {
  migration: 'Migration aus dem Altbestand',
  manuell: 'von Hand angelegt',
  ki_vorschlag: 'KI-Vorschlag',
  aus_stellungnahme: 'aus einer Stellungnahme übernommen',
}

/**
 * Die Kennung kommt roh aus der Adresszeile. Ohne diese Prüfung ginge ein
 * `/bibliothek/unfug` als UUID-Vergleich an Postgres und käme als
 * Serverfehler (HTTP 500) zurück — eine vertippte Adresse ist aber kein
 * Fehler der Anwendung, sondern schlicht nicht gefunden.
 */
const UUID_MUSTER = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default async function EintragSeite({ params }: { params: Promise<{ id: string }> }) {
  // Vor allem anderen: ohne Anmeldung wird hier nichts geladen und
  // nichts gerendert. Die Pruefung im Layout kam zu spaet - die Seite
  // rendert gleichzeitig mit ihm, und ihre Nutzlast ging im Rumpf der
  // Umleitung mit hinaus.
  await verlangeAnmeldung()

  const { id } = await params
  if (!UUID_MUSTER.test(id)) notFound()

  const [e, benutzer] = await Promise.all([ladeEintrag(id), aktuellerBenutzer()])
  if (!e) notFound()

  /*
    Die Anzeige fragt dasselbe wie die Aktion — über `darf()` und nicht über
    die Rolle. Sonst driften Knopf und Wirkung auseinander: ein Ersteller mit
    dem zusätzlichen Recht sähe den Knopf gesperrt, obwohl er dürfte.
  */
  const darfFreigeben = await darf('bibliothek.freigeben')
  const werte = e.platzhalter.filter((p) => p.art === 'wert')
  const regie = e.platzhalter.filter((p) => p.art === 'regieanweisung')
  const unbestaetigt = e.belege.filter((b) => !b.verifiziertAm)

  /*
    Was in eckigen Klammern im Text steht, muss vor dem Versand ersetzt
    werden — unabhängig davon, ob die Migration dafür eine Zeile in
    `eintrag_platzhalter` angelegt hat. Wird nur die Tabelle gelesen, meldet
    die Randspalte „Keine — der Text ist ohne Anpassung verwendbar", während
    zwei Klammern im Gegenargument stehen. Deshalb wird der sichtbare Text
    hier zusätzlich selbst abgesucht.
  */
  const sichtbarerText = [
    e.typischeBegruendung,
    e.gegenargument,
    e.vorgehen,
    ...e.varianten.map((v) => v.text),
    ...e.ergaenzungen.map((x) => x.text),
  ]
    .filter(Boolean)
    .join('\n')
  const bekannt = new Set(e.platzhalter.map((p) => p.schluessel))
  const nurImText = setzeWerteEin(sichtbarerText, {}).offen.filter((s) => !bekannt.has(s))

  return (
    <>
      <p style={{ margin: '0 0 14px', fontSize: 13 }}>
        <Link href="/bibliothek">← Argumentbibliothek</Link>
      </p>

      <div className="seiten-kopf">
        <div>
          <p
            style={{
              fontFamily: 'var(--mono)',
              fontSize: 12,
              color: 'var(--accent)',
              margin: '0 0 4px',
              fontWeight: 600,
            }}
          >
            {e.nummer}
          </p>
          <h1>{e.titel}</h1>
          <p className="unterzeile">
            {BEREICHSNAMEN[e.bereich] ?? e.bereich} · {e.abschnitt}
          </p>
        </div>
        <StatusPille status={e.status} />
      </div>

      <div className="detail">
        <div>
          {/*
            Lesen und Ändern an derselben Stelle. Varianten und Ergänzungen
            gehen als Kinder hinein: Sie stehen im Lesestand zwischen
            Vorgehen und internen Hinweisen und bleiben auch während der
            Bearbeitung sichtbar — geändert werden sie hier nicht.
          */}
          <Textbearbeitung
            id={e.id}
            status={e.status}
            texte={{
              typischeBegruendung: e.typischeBegruendung,
              gegenargument: e.gegenargument,
              vorgehen: e.vorgehen,
              hinweise: e.hinweise,
            }}
          >
            {e.varianten.length > 0 ? (
              <div className="block">
                <div className="block-label">Varianten ({e.varianten.length})</div>
                <div className="liste">
                  {e.varianten.map((v) => (
                    <div key={v.id} className="zeile" style={{ gridTemplateColumns: 'minmax(0,1fr)' }}>
                      <div>
                        <div className="zeile-titel">{v.bezeichnung}</div>
                        <div className="fliesstext" style={{ fontSize: 14, marginTop: 4 }}>
                          {v.text}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {e.ergaenzungen.length > 0 ? (
              <div className="block">
                <div className="block-label">Ergänzungen ({e.ergaenzungen.length})</div>
                <div className="liste">
                  {e.ergaenzungen.map((x) => (
                    <div key={x.id} className="zeile" style={{ gridTemplateColumns: 'minmax(0,1fr)' }}>
                      <div>
                        <div className="zeile-titel">{x.titel}</div>
                        <div className="fliesstext" style={{ fontSize: 14, marginTop: 4 }}>
                          {x.text}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </Textbearbeitung>
        </div>

        <aside className="seitenleiste">
          <Freigabeleiste
            id={e.id}
            status={e.status}
            darfFreigeben={darfFreigeben}
            offeneBelege={unbestaetigt.length}
          />

          <div className="karte">
            <h2>Einzusetzende Werte</h2>
            {werte.length === 0 && nurImText.length === 0 ? (
              <p className="unterzeile" style={{ margin: 0 }}>
                Keine — der Text ist ohne Anpassung verwendbar.
              </p>
            ) : (
              <>
                <div className="marker-liste">
                  {werte.map((p) => (
                    <code key={p.id}>[{p.schluessel}]</code>
                  ))}
                  {nurImText.map((s) => (
                    <code key={`text-${s}`}>[{s}]</code>
                  ))}
                </div>
                <p className="unterzeile" style={{ marginBottom: 0 }}>
                  Bleiben sie stehen, sperren sie später den Export.
                </p>
              </>
            )}
          </div>

          {regie.length > 0 ? (
            <div className="karte">
              <h2>Arbeitsaufträge</h2>
              <p className="unterzeile" style={{ marginTop: 0 }}>
                Müssen erledigt oder entfernt werden — sie dürfen nicht im Schreiben stehen bleiben.
              </p>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13.5 }}>
                {regie.map((p) => (
                  <li key={p.id} style={{ marginBottom: 6 }}>
                    {p.schluessel}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {e.vorbedingungen.length > 0 ? (
            <div className="karte">
              <h2>Vorbedingungen prüfen</h2>
              <p className="unterzeile" style={{ marginTop: 0 }}>
                Aus dem Text erkannt. Nicht als erfüllt unterstellen.
              </p>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13.5 }}>
                {e.vorbedingungen.map((v) => (
                  <li key={v.id} style={{ marginBottom: 6 }}>
                    {v.text}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <BelegPruefung eintragId={e.id} belege={e.belege} />

          <div className="karte">
            <h2>Herkunft</h2>
            <dl className="kv">
              <dt>Quelle</dt>
              <dd>{e.quelldatei ?? '—'}</dd>
              <dt>Angelegt durch</dt>
              <dd>{HERKUNFTSNAMEN[e.herkunft] ?? e.herkunft}</dd>
              <dt>Fassung</dt>
              <dd>{e.version}</dd>
              {e.haeufigkeitText ? (
                <>
                  <dt>Häufigkeit</dt>
                  <dd style={{ textAlign: 'left' }}>{e.haeufigkeitText}</dd>
                </>
              ) : null}
            </dl>
          </div>
        </aside>
      </div>
    </>
  )
}
