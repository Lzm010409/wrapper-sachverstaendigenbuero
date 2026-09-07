import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ladeFall } from '@/autoixpert/aktionen'
import {
  formatiereDatum,
  leseFalldaten,
  platzhalterWerte,
  schlageEmpfaengerVor,
} from '@/autoixpert/felder'
import { gutachtenSchema } from '@/autoixpert/typen'
import { ladeStellungnahmenZumFall } from '@/stellungnahme/abfragen'
import { werkzeugeVorhanden } from '@/pruefbericht/einlesen'
import { kiVerfuegbar } from '@/ki/client'
import { dealFelder, monetaerWert, phasenNamen, pipedrive } from '@/pipedrive/client'
import { BerichtFormular } from '../../stellungnahmen/bericht-formular'
import { Aktualisieren } from './aktualisieren'
import { Reiterleiste, leseReiter } from './reiter/reiterleiste'
import { WbwReiter } from './reiter/wbw'
import { BeteiligtenZeile, Ohne, SchreibenZeile, Zeile } from './reiter/bausteine'

const HERKUNFT: Record<string, string> = {
  anwalt: 'Rechtsanwalt aus dem Gutachten',
  versicherung: 'Versicherung aus dem Gutachten',
  werkstatt: 'Werkstatt aus dem Gutachten',
}

/** Nur eine UUID kann eine Fall-Id sein; alles andere ist eine tote Adresse. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Die Fallseite — der Anker der Anwendung.
 *
 * Alles, was zu einem Vorgang gehört, liegt in ihren Reitern: Beteiligte,
 * Fahrzeug, Wiederbeschaffungswert, Stellungnahmen, Vorgang. Das folgt
 * autoiXpert, wo ein Gutachten seine Reiter trägt und man den Fall nicht
 * verlässt, um an ihm zu arbeiten.
 *
 * Vorher war die Seite eine einzige lange Spalte mit Seitenleiste, und die
 * Stellungnahmen waren eine Karte darin. Die Reiter sind nicht nur Ordnung:
 * sie machen sichtbar, was es zu einem Fall überhaupt gibt.
 */
export default async function FallSeite({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ reiter?: string }>
}) {
  const { id } = await params
  // Ohne diese Prüfung ginge eine Adresse wie /faelle/unfug als Abfrage an die
  // Datenbank und endete in einer Serverfehlerseite statt in „nicht gefunden".
  if (!UUID.test(id)) notFound()

  const [f, { reiter: reiterWunsch }] = await Promise.all([ladeFall(id), searchParams])
  if (!f) notFound()

  const aktiv = leseReiter(reiterWunsch)
  const schreiben = await ladeStellungnahmenZumFall(f.id)
  const geprueft = gutachtenSchema.safeParse(f.daten)
  const d = geprueft.success ? leseFalldaten(geprueft.data) : null

  const aktenzeichen = d?.aktenzeichen ?? f.aktenzeichen ?? null
  const titel = geprueft.success
    ? (d?.anspruchsteller?.name ?? 'Fall ohne Anspruchsteller')
    : 'Falldaten nicht lesbar'

  return (
    <>
      <p style={{ margin: '0 0 14px', fontSize: 13 }}>
        <Link href="/faelle">← Fälle</Link>
      </p>

      <div className="seiten-kopf">
        <div className="fall-titel">
          {/* Aktenzeichen als Marke neben dem Namen — wie in autoiXpert, wo
              beides in einer Zeile über den Reitern steht. */}
          <span className="fall-marke">{aktenzeichen ?? 'ohne Aktenzeichen'}</span>
          <div>
            <h1>{titel}</h1>
            <p className="unterzeile">
              {[d?.gutachtenTyp, d?.zustand].filter(Boolean).join(' · ')}
              {f.abgerufenAm
                ? `${d?.gutachtenTyp || d?.zustand ? ' · ' : ''}abgerufen ${new Date(
                    f.abgerufenAm,
                  ).toLocaleString('de-DE')}`
                : ''}
            </p>
          </div>
        </div>
        <Aktualisieren fallId={f.id} />
      </div>

      <Reiterleiste
        fallId={f.id}
        aktiv={aktiv}
        zaehler={{ stellungnahmen: schreiben.length }}
      />

      {!geprueft.success ? (
        <div className="hinweis fehler">
          Die gespeicherten Falldaten haben nicht die Form, die autoiXpert liefert — sie
          lassen sich deshalb nicht anzeigen. Mit „Aus autoiXpert neu laden" oben rechts
          lässt sich der Fall erneut holen. Bleibt der Fehler, stimmt etwas mit dem
          Gutachten in autoiXpert nicht; dann bitte den Fall dort prüfen.
        </div>
      ) : null}

      {/*
        Auch bei unlesbaren Falldaten bleibt der Reiter „Stellungnahmen"
        benutzbar: die Schreiben hängen an der Fall-Id, nicht an den Daten aus
        autoiXpert. Wer hier landet, weil ein Import schiefging, kommt trotzdem
        an sein Schreiben.
      */}
      {aktiv === 'stellungnahmen' ? (
        <StellungnahmenReiter fall={f} bezeichnung={aktenzeichen ?? titel} schreiben={schreiben} />
      ) : null}

      {geprueft.success && d ? (
        <>
          {aktiv === 'beteiligte' ? <BeteiligteReiter d={d} /> : null}
          {aktiv === 'fahrzeug' ? <FahrzeugReiter d={d} /> : null}
          {aktiv === 'wbw' ? <WbwReiter gutachten={geprueft.data} /> : null}
          {aktiv === 'vorgang' ? <VorgangReiter d={d} aktenzeichen={aktenzeichen} /> : null}
        </>
      ) : null}
    </>
  )
}

type Falldaten = NonNullable<ReturnType<typeof leseFalldaten>>

/* ---------------- Reiter: Unfall & Beteiligte ---------------- */

function BeteiligteReiter({ d }: { d: Falldaten }) {
  const unfallLeer = ![
    d.unfall.datum,
    d.unfall.ort,
    d.unfall.hergang,
    d.fahrzeug.schadenbeschreibung,
  ].some(Boolean)

  return (
    <div className="detail">
      <div>
        <div className="block">
          <div className="block-label">Unfall und Schaden</div>
          <div className="karte">
            <dl className="kv" style={{ gridTemplateColumns: 'minmax(140px,auto) 1fr' }}>
              <Zeile label="Unfalltag" wert={formatiereDatum(d.unfall.datum)} />
              <Zeile label="Ort" wert={d.unfall.ort} />
            </dl>
            {d.unfall.hergang ? (
              <p className="fliesstext" style={{ fontSize: 14.5, marginTop: 12, marginBottom: 0 }}>
                {d.unfall.hergang}
              </p>
            ) : null}
            {d.fahrzeug.schadenbeschreibung ? (
              <p className="fliesstext" style={{ fontSize: 14.5, marginTop: 10, marginBottom: 0 }}>
                {d.fahrzeug.schadenbeschreibung}
              </p>
            ) : null}
            {unfallLeer ? <Ohne was="Angaben zum Unfall" /> : null}
          </div>
        </div>

        <div className="block">
          <div className="block-label">Beteiligte</div>
          <div className="liste">
            <BeteiligtenZeile rolle="Anspruchsteller" b={d.anspruchsteller} />
            <BeteiligtenZeile rolle="Rechtsanwalt" b={d.anwalt} />
            <BeteiligtenZeile
              rolle="Versicherung"
              b={d.versicherung}
              zusatz={
                d.versicherung?.schadennummer ? `Schaden-Nr. ${d.versicherung.schadennummer}` : null
              }
            />
            <BeteiligtenZeile rolle="Werkstatt" b={d.werkstatt} />
            <BeteiligtenZeile
              rolle="Unfallgegner"
              b={d.unfallgegner}
              zusatz={d.unfallgegner?.kennzeichen}
            />
          </div>
        </div>
      </div>

      <aside className="seitenleiste">
        <div className="karte">
          <h2>Kurzübersicht</h2>
          <dl className="kv">
            <Zeile
              label="Fahrzeug"
              wert={[d.fahrzeug.hersteller, d.fahrzeug.modell].filter(Boolean).join(' ')}
            />
            <Zeile label="Kennzeichen" wert={d.fahrzeug.kennzeichen} />
            <Zeile label="Auftragsdatum" wert={formatiereDatum(d.auftragsdatum)} />
          </dl>
        </div>
      </aside>
    </div>
  )
}

/* ---------------- Reiter: Fahrzeug ---------------- */

function FahrzeugReiter({ d }: { d: Falldaten }) {
  const fahrzeugLeer =
    ![
      d.fahrzeug.hersteller,
      d.fahrzeug.modell,
      d.fahrzeug.kennzeichen,
      d.fahrzeug.vin,
      d.fahrzeug.erstzulassung,
      d.fahrzeug.laufleistung,
      d.fahrzeug.letzterService,
    ].some(Boolean) && d.fahrzeug.scheckheftGepflegt === null

  return (
    <div className="detail">
      <div>
        <div className="block">
          <div className="block-label">Basisdaten</div>
          <div className="karte">
            <dl className="kv" style={{ gridTemplateColumns: 'minmax(140px,auto) 1fr' }}>
              <Zeile
                label="Hersteller / Modell"
                wert={[d.fahrzeug.hersteller, d.fahrzeug.modell].filter(Boolean).join(' ')}
              />
              <Zeile label="Kennzeichen" wert={d.fahrzeug.kennzeichen} />
              <Zeile label="Fahrgestellnummer" wert={d.fahrzeug.vin} />
              <Zeile label="Erstzulassung" wert={formatiereDatum(d.fahrzeug.erstzulassung)} />
              <Zeile
                label="Laufleistung"
                wert={
                  d.fahrzeug.laufleistung
                    ? // Eine leere Einheit ergäbe eine nackte Zahl — bei
                      // Laufleistungen ist das nicht harmlos.
                      `${d.fahrzeug.laufleistung.toLocaleString('de-DE')} ${
                        d.fahrzeug.laufleistungEinheit || 'km'
                      }`
                    : null
                }
              />
              <Zeile
                label="Scheckheft"
                wert={
                  d.fahrzeug.scheckheftGepflegt === null
                    ? null
                    : d.fahrzeug.scheckheftGepflegt
                      ? 'gepflegt'
                      : 'nicht gepflegt'
                }
              />
              <Zeile label="Letzter Service" wert={formatiereDatum(d.fahrzeug.letzterService)} />
            </dl>
            {fahrzeugLeer ? <Ohne was="Fahrzeugangaben" /> : null}
          </div>
        </div>

        {d.fahrzeug.vorschaedenRepariert || d.fahrzeug.vorschaedenUnrepariert ? (
          <div className="block">
            <div className="block-label">
              Vorschäden
              <span className="marke-pille m-warn">für Abgrenzung relevant</span>
            </div>
            <div className="karte fliesstext" style={{ fontSize: 14.5 }}>
              {d.fahrzeug.vorschaedenRepariert ? (
                <p style={{ margin: '0 0 8px' }}>
                  <strong>Repariert:</strong> {d.fahrzeug.vorschaedenRepariert}
                </p>
              ) : null}
              {d.fahrzeug.vorschaedenUnrepariert ? (
                <p style={{ margin: 0 }}>
                  <strong>Unrepariert:</strong> {d.fahrzeug.vorschaedenUnrepariert}
                </p>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>

      <aside className="seitenleiste">
        <div className="hinweis warn">
          Kalkulationsbeträge liefert die autoiXpert-Schnittstelle noch nicht. Die
          Kürzungspositionen kommen deshalb aus dem Prüfbericht.
        </div>
      </aside>
    </div>
  )
}

/* ---------------- Reiter: Stellungnahmen ---------------- */

async function StellungnahmenReiter({
  fall,
  bezeichnung,
  schreiben,
}: {
  fall: { id: string }
  bezeichnung: string
  schreiben: {
    id: string
    betreff: string | null
    erstelltAm: Date | null
    versendetAm: Date | null
    positionen: number
  }[]
}) {
  const [werkzeuge, ki] = await Promise.all([werkzeugeVorhanden(), kiVerfuegbar()])
  const bereit = werkzeuge.ok && ki

  return (
    <>
      {!ki ? (
        <div className="hinweis warn" style={{ marginBottom: 12 }}>
          Die Auswertung der Prüfberichte braucht einen Zugang zum Sprachmodell. Hinterlege{' '}
          <code>ANTHROPIC_API_KEY</code> in den Umgebungsvariablen.
        </div>
      ) : null}
      {!werkzeuge.ok ? (
        <div className="hinweis warn" style={{ marginBottom: 12 }}>
          Zum Einlesen fehlen auf diesem Server: {werkzeuge.fehlend.join(', ')}. Sie stecken
          im Paket <code>poppler-utils</code>.
        </div>
      ) : null}

      <div className="karte" style={{ marginBottom: 16 }}>
        <h2>Prüfbericht auswerten</h2>
        <p className="unterzeile" style={{ marginTop: 0 }}>
          Der Fall steht fest — das Schreiben wird ihm zugeordnet.
        </p>
        <BerichtFormular
          faelle={[]}
          aktiv={bereit}
          festerFall={{ id: fall.id, bezeichnung }}
        />
      </div>

      {schreiben.length === 0 ? (
        <div className="leer">
          <p style={{ margin: 0 }}>Zu diesem Fall ist noch kein Schreiben angelegt.</p>
        </div>
      ) : (
        <div className="liste">
          {schreiben.map((s) => (
            <SchreibenZeile key={s.id} s={s} />
          ))}
        </div>
      )}
    </>
  )
}

/* ---------------- Reiter: Vorgang ---------------- */

async function VorgangReiter({
  d,
  aktenzeichen,
}: {
  d: Falldaten
  aktenzeichen: string | null
}) {
  const werte = platzhalterWerte(d)
  const vorschlag = schlageEmpfaengerVor(d)

  // Pipedrive ist Beiwerk: fällt es aus, bleibt der Reiter benutzbar.
  const deal = await pipedrive.findeDeal(aktenzeichen ?? '').catch(() => undefined)

  return (
    <div className="detail">
      <div>
        <div className="block">
          <div className="block-label">Pipedrive</div>
          <div className="karte">
            {deal ? (
              <dl className="kv" style={{ gridTemplateColumns: 'minmax(160px,auto) 1fr' }}>
                <dt>Phase</dt>
                <dd style={{ textAlign: 'left' }}>
                  <span className="marke-pille m-akzent">
                    {phasenNamen[deal.stage_id ?? -1] ?? 'unbekannt'}
                  </span>
                </dd>
                <Zeile label="Deal" wert={deal.title} />
                <Zeile
                  label="Schadenhöhe brutto"
                  wert={euro(monetaerWert(deal.custom_fields?.[dealFelder.schadenhoeheBrutto]))}
                />
                <Zeile
                  label="Ausgebuchter Betrag"
                  wert={euro(monetaerWert(deal.custom_fields?.[dealFelder.ausgebuchterBetrag]))}
                />
                <Zeile
                  label="Rechnung (sevDesk)"
                  wert={textWert(deal.custom_fields?.[dealFelder.sevdeskRechnungId])}
                />
              </dl>
            ) : (
              <p className="unterzeile" style={{ margin: 0 }}>
                {process.env.PIPEDRIVE_API_TOKEN
                  ? 'Zu diesem Aktenzeichen wurde kein Deal gefunden.'
                  : 'Pipedrive ist auf diesem Server nicht eingerichtet — PIPEDRIVE_API_TOKEN fehlt.'}
              </p>
            )}
          </div>
        </div>

        <div className="block">
          <div className="block-label">Herkunft</div>
          <div className="karte">
            <dl className="kv" style={{ gridTemplateColumns: 'minmax(160px,auto) 1fr' }}>
              <dt>autoiXpert-ID</dt>
              <dd style={{ textAlign: 'left', fontFamily: 'var(--mono)', fontSize: 12 }}>
                {d.autoixpertId}
              </dd>
              {d.externeId ? (
                <>
                  <dt>Externe ID</dt>
                  <dd style={{ textAlign: 'left', fontFamily: 'var(--mono)', fontSize: 12 }}>
                    {d.externeId}
                  </dd>
                </>
              ) : null}
              <dt>Auftragsdatum</dt>
              <dd style={{ textAlign: 'left' }}>{formatiereDatum(d.auftragsdatum) ?? '—'}</dd>
              <dt>Fertigstellung</dt>
              <dd style={{ textAlign: 'left' }}>{formatiereDatum(d.fertigstellung) ?? '—'}</dd>
            </dl>
          </div>
        </div>
      </div>

      <aside className="seitenleiste">
        <div className="karte">
          <h2>Vorschlag für die Stellungnahme</h2>
          {vorschlag.empfaenger ? (
            <>
              <p className="unterzeile" style={{ marginTop: 0 }}>
                {HERKUNFT[vorschlag.herkunft ?? ''] ?? 'aus dem Gutachten'}
              </p>
              <p style={{ margin: '0 0 4px', fontWeight: 600, fontSize: 14 }}>
                {vorschlag.empfaenger.name}
              </p>
              <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-mid)' }}>
                {vorschlag.empfaenger.strasse}
                {vorschlag.empfaenger.strasse ? <br /> : null}
                {vorschlag.empfaenger.plzOrt}
              </p>
              {vorschlag.betreff ? (
                <p style={{ margin: '12px 0 0', fontSize: 13 }}>
                  <span style={{ color: 'var(--ink-soft)' }}>Betreff: </span>
                  {vorschlag.betreff}
                </p>
              ) : null}
            </>
          ) : (
            <p className="unterzeile" style={{ margin: 0 }}>
              Kein Empfänger im Gutachten hinterlegt — er wird beim Erstellen abgefragt.
            </p>
          )}
        </div>

        <div className="karte">
          <h2>Verfügbare Platzhalter</h2>
          <p className="unterzeile" style={{ marginTop: 0 }}>
            Werden beim Einfügen eines Bibliothekstexts automatisch gesetzt.
          </p>
          {Object.keys(werte).length === 0 ? (
            <p className="unterzeile" style={{ margin: 0 }}>
              Keine — die Falldaten sind zu dünn.
            </p>
          ) : (
            <dl className="kv">
              {Object.entries(werte).map(([schluessel, wert]) => (
                <span key={schluessel} style={{ display: 'contents' }}>
                  <dt>
                    <code style={{ fontSize: 11 }}>[{schluessel}]</code>
                  </dt>
                  <dd style={{ textAlign: 'left', fontSize: 12.5 }}>{wert}</dd>
                </span>
              ))}
            </dl>
          )}
        </div>
      </aside>
    </div>
  )
}

function euro(wert: number | undefined): string | null {
  if (wert === undefined) return null
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(wert)
}

function textWert(wert: unknown): string | null {
  return typeof wert === 'string' && wert.trim() ? wert : null
}
