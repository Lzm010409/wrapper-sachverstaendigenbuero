import { Suspense } from 'react'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { formatiereDatum } from '@/autoixpert/felder'
import {
  ladeAuswertungsbereitschaft,
  ladeFallAnsicht,
  type Falldaten,
  type FallAnsicht,
  type Schreiben,
} from '@/fall/ansicht'
import { ladeVorgang, type VorgangAnsicht } from '@/fall/vorgang'
import { ladeAmpel } from '@/geld/stand'
import { widerspruch } from '@/geld/ampel'
import { Geldpille, euroAusCent } from '@/app/teile/geldpille'
import { ladeVorgangsschritte } from '@/fall/vorgangsschritte'
import { BerichtFormular } from '../../stellungnahmen/bericht-formular'
import { Aktualisieren } from './aktualisieren'
import { Reiterleiste, leseReiter } from './reiter/reiterleiste'
import { FotoReiter } from './reiter/fotos'
import { KalkulationReiter } from './reiter/kalkulation'
import { WbwReiterMitVorschlag } from './reiter/wbw-laden'
import { BeteiligtenZeile, Ohne, SchreibenZeile, Zeile } from './reiter/bausteine'
import { Reichtext } from './reiter/reichtext'
import { Vorgangsschritte } from './reiter/vorgangsschritte'
import { verlangeAnmeldung } from '@/auth/wache'
import { Balken, SkelettRaster, SkelettReiter } from '@/app/teile/skelett'
import { Meldung } from '@/app/teile/meldung'

/** Nur eine UUID kann eine Fall-Id sein; alles andere ist eine tote Adresse. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Die Fallseite — der Anker der Anwendung.
 *
 * Alles, was zu einem Vorgang gehört, liegt in ihren Reitern. Das folgt
 * autoiXpert, wo ein Gutachten seine Reiter trägt und man den Fall nicht
 * verlässt, um an ihm zu arbeiten.
 *
 * Diese Datei **stellt nur dar**. Woher die Angaben kommen — Datenbank,
 * autoiXpert, Pipedrive — und was passiert, wenn eine Quelle ausfällt,
 * entscheidet die Datenschicht unter `src/fall/`. Hier steht kein Drizzle,
 * kein Zod, kein `fetch` und kein Feldpfad der Schnittstelle.
 */
export default async function FallSeite({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ reiter?: string }>
}) {
  // Vor allem anderen: ohne Anmeldung wird hier nichts geladen und
  // nichts gerendert. Die Pruefung im Layout kam zu spaet - die Seite
  // rendert gleichzeitig mit ihm, und ihre Nutzlast ging im Rumpf der
  // Umleitung mit hinaus.
  await verlangeAnmeldung()

  const { id } = await params
  // Ohne diese Prüfung ginge eine Adresse wie /faelle/unfug als Abfrage an die
  // Datenbank und endete in einer Serverfehlerseite statt in „nicht gefunden".
  if (!UUID.test(id)) notFound()

  const [fall, { reiter: reiterWunsch }] = await Promise.all([ladeFallAnsicht(id), searchParams])
  if (!fall) notFound()

  const aktiv = leseReiter(reiterWunsch)

  return (
    <>
      <p style={{ margin: '0 0 14px', fontSize: 13 }}>
        <Link href="/faelle">← Fälle</Link>
      </p>

      <div className="seiten-kopf">
        <div className="fall-titel">
          {/* Aktenzeichen als Marke neben dem Namen — wie in autoiXpert, wo
              beides in einer Zeile über den Reitern steht. */}
          <span className="fall-marke">{fall.aktenzeichen ?? 'ohne Aktenzeichen'}</span>
          <div>
            <h1>{fall.titel}</h1>
            <p className="unterzeile">{fall.untertitel}</p>
          </div>
        </div>
        <Aktualisieren fallId={fall.id} />
      </div>

      <Reiterleiste
        fallId={fall.id}
        aktiv={aktiv}
        zaehler={{ stellungnahmen: fall.schreiben.length }}
      />

      {!fall.lesbar ? (
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
        <Suspense fallback={<SkelettReiter was="Die Stellungnahmen" />}>
          <StellungnahmenReiter fall={fall} />
        </Suspense>
      ) : null}

      {fall.daten && fall.gutachten ? (
        <>
          {/*
            „Unfall & Beteiligte" und „Fahrzeug" stehen sofort da — ihre
            Angaben liegen bereits in `fall.daten`.
          */}
          {aktiv === 'beteiligte' ? <BeteiligteReiter d={fall.daten} /> : null}
          {aktiv === 'fahrzeug' ? <FahrzeugReiter d={fall.daten} /> : null}

          {/*
            Die drei übrigen holen etwas über das Netz: die DAT-Kalkulation
            aus autoiXpert, den Deal aus Pipedrive. Ohne die Grenze hier
            wartete die **ganze** Seite darauf — Kopf, Reiterleiste und alles
            —, und der Klick auf den Reiter sah aus, als wäre nichts passiert.
            Mit ihr steht der Rahmen sofort, und nur der Inhalt hat einen
            Platzhalter.
          */}
          {aktiv === 'fotos' ? (
            <Suspense fallback={<SkelettRaster />}>
              <FotoReiter gutachten={fall.gutachten} fallId={fall.id} />
            </Suspense>
          ) : null}
          {aktiv === 'kalkulation' ? (
            <Suspense fallback={<SkelettReiter was="Die Kalkulation" />}>
              <KalkulationReiter gutachten={fall.gutachten} />
            </Suspense>
          ) : null}
          {aktiv === 'wbw' ? (
            <Suspense fallback={<SkelettReiter was="Der Wiederbeschaffungswert" />}>
              <WbwReiterMitVorschlag gutachten={fall.gutachten} fallId={fall.id} />
            </Suspense>
          ) : null}
          {aktiv === 'vorgang' ? (
            <Suspense fallback={<SkelettReiter was="Der Vorgang" />}>
              <VorgangReiter d={fall.daten} aktenzeichen={fall.aktenzeichen} fallId={fall.id} />
            </Suspense>
          ) : null}
        </>
      ) : null}
    </>
  )
}

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
            {/* Beide Felder kommen aus autoiXpert als HTML. */}
            <div style={{ marginTop: 12, fontSize: 14.5 }}>
              <Reichtext wert={d.unfall.hergang} />
            </div>
            <div style={{ marginTop: 10, fontSize: 14.5 }}>
              <Reichtext wert={d.fahrzeug.schadenbeschreibung} />
            </div>
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
                <div style={{ marginBottom: 10 }}>
                  <div className="block-label" style={{ justifyContent: 'flex-start', marginBottom: 4 }}>
                    Repariert
                  </div>
                  <Reichtext wert={d.fahrzeug.vorschaedenRepariert} />
                </div>
              ) : null}
              {d.fahrzeug.vorschaedenUnrepariert ? (
                <div>
                  <div className="block-label" style={{ justifyContent: 'flex-start', marginBottom: 4 }}>
                    Unrepariert
                  </div>
                  <Reichtext wert={d.fahrzeug.vorschaedenUnrepariert} />
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>

      <aside className="seitenleiste">
        <div className="karte">
          <h2>Kalkulation</h2>
          <p className="unterzeile" style={{ margin: 0 }}>
            Die Reparaturkosten stehen im Reiter „Kalkulation" — sie kommen aus der
            DAT-Datei des Gutachtens, nicht aus dem Gutachten-Objekt. Die
            Kürzungspositionen stammen weiterhin aus dem Prüfbericht.
          </p>
        </div>
      </aside>
    </div>
  )
}

/* ---------------- Reiter: Stellungnahmen ---------------- */

async function StellungnahmenReiter({ fall }: { fall: FallAnsicht }) {
  const bereitschaft = await ladeAuswertungsbereitschaft()

  return (
    <>
      {bereitschaft.kiFehlt ? (
        <div className="hinweis warn" style={{ marginBottom: 12 }}>
          Die Auswertung der Prüfberichte braucht einen Zugang zum Sprachmodell. Hinterlege{' '}
          <code>ANTHROPIC_API_KEY</code> in den Umgebungsvariablen.
        </div>
      ) : null}
      {bereitschaft.fehlendeWerkzeuge.length > 0 ? (
        <div className="hinweis warn" style={{ marginBottom: 12 }}>
          Zum Einlesen fehlen auf diesem Server: {bereitschaft.fehlendeWerkzeuge.join(', ')}. Sie
          stecken im Paket <code>poppler-utils</code>.
        </div>
      ) : null}

      <div className="karte" style={{ marginBottom: 16 }}>
        <h2>Prüfbericht auswerten</h2>
        <p className="unterzeile" style={{ marginTop: 0 }}>
          Der Fall steht fest — das Schreiben wird ihm zugeordnet.
        </p>
        <BerichtFormular
          faelle={[]}
          aktiv={bereitschaft.bereit}
          festerFall={{
            id: fall.id,
            bezeichnung: fall.aktenzeichen ?? fall.titel,
          }}
        />
      </div>

      {fall.schreiben.length === 0 ? (
        <div className="leer">
          <p style={{ margin: 0 }}>Zu diesem Fall ist noch kein Schreiben angelegt.</p>
        </div>
      ) : (
        <div className="liste">
          {fall.schreiben.map((s: Schreiben) => (
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
  fallId,
}: {
  d: Falldaten
  aktenzeichen: string | null
  fallId: string
}) {
  const vorgang = await ladeVorgang(aktenzeichen)

  const pipedriveLink =
    vorgang.stand === 'gefunden' && process.env.PIPEDRIVE_COMPANY_DOMAIN
      ? `https://${process.env.PIPEDRIVE_COMPANY_DOMAIN}.pipedrive.com/deal/${vorgang.deal!.dealId}`
      : null
  const sevdeskLink = vorgang.stand === 'gefunden' ? vorgang.deal!.sevdeskRechnungLink : null
  const autoixpertLink = d.autoixpertId
    ? `https://app.autoixpert.de/Gutachten/${encodeURIComponent(d.autoixpertId)}`
    : null

  return (
    <div className="detail">
      <div>
        {vorgang.stand === 'gefunden' ? (
          <div className="block">
            <div className="block-label">Vorgangsschritte</div>
            <div className="karte">
              <Suspense fallback={<VorgangsschritteSkelett />}>
                <VorgangsschritteKarte fallId={fallId} dealId={vorgang.deal!.dealId} />
              </Suspense>
            </div>
          </div>
        ) : null}
      </div>

      <aside className="seitenleiste">
        <div className="block">
          <div className="block-label">Pipedrive</div>
          <div className="karte">
            <PipedriveInhalt vorgang={vorgang} link={pipedriveLink} />
          </div>
        </div>

        <div className="block">
          <div className="block-label">Rechnung</div>
          <div className="karte">
            {/*
              Eigene Suspense-Grenze wie bei Pipedrive: der erste Abgleich
              mit sevDesk holt 1444 Rechnungen und dauert Sekunden. Ohne die
              Grenze wartete der ganze Reiter darauf.
            */}
            <Suspense fallback={<Balken breite={60} />}>
              <Zahlungskarte
                aktenzeichen={aktenzeichen}
                phase={phaseVon(vorgang)}
                sevdeskLink={sevdeskLink}
              />
            </Suspense>
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
            {autoixpertLink ? (
              <a
                href={autoixpertLink}
                target="_blank"
                rel="noreferrer noopener"
                className="knopf"
                style={{ marginTop: 12 }}
              >
                autoiXpert öffnen ↗
              </a>
            ) : null}
          </div>
        </div>
      </aside>
    </div>
  )
}

/**
 * Die fünf Ausgänge des Pipedrive-Abrufs, jeder mit eigener Aussage.
 * „Kein Deal gefunden" für alle fünf wäre die gefährlichste davon: wer das
 * liest, legt den Vorgang womöglich ein zweites Mal in Pipedrive an.
 */
function PipedriveInhalt({ vorgang, link }: { vorgang: VorgangAnsicht; link: string | null }) {
  if (vorgang.stand === 'nicht_eingerichtet') {
    return (
      <p className="unterzeile" style={{ margin: 0 }}>
        Pipedrive ist auf diesem Server nicht eingerichtet — <code>PIPEDRIVE_API_TOKEN</code>{' '}
        fehlt.
      </p>
    )
  }

  if (vorgang.stand === 'fehler') {
    return (
      <div className="hinweis fehler" style={{ margin: 0 }}>
        Pipedrive war nicht erreichbar: {vorgang.meldung}
      </div>
    )
  }

  if (vorgang.stand === 'mehrdeutig') {
    return (
      <div className="hinweis warn" style={{ margin: 0 }}>
        <strong className="hinweis-titel">Mehrere Deals tragen dieses Aktenzeichen als Titel.</strong>
        Das muss in Pipedrive geprüft werden, bevor eine Phase verlässlich stimmt: Deal-IDs{' '}
        {vorgang.treffer?.map((t) => t.id).join(', ')}.
      </div>
    )
  }

  if (vorgang.stand === 'ohne_treffer' || !vorgang.deal) {
    return (
      <p className="unterzeile" style={{ margin: 0 }}>
        Pipedrive kennt zu diesem Aktenzeichen keinen Deal.
      </p>
    )
  }

  const d = vorgang.deal
  return (
    <>
      <dl className="kv" style={{ gridTemplateColumns: 'minmax(160px,auto) 1fr' }}>
        <dt>Phase</dt>
        <dd style={{ textAlign: 'left' }}>
          <span className="marke-pille m-akzent">{d.phase}</span>
        </dd>
        <dt>Status</dt>
        <dd style={{ textAlign: 'left' }}>
          <span className={`marke-pille ${d.dealStatusKlasse}`}>{d.dealStatus}</span>
        </dd>
        <Zeile label="Deal" wert={d.titel} />
        <Zeile label="Schadenhöhe brutto" wert={euro(d.schadenhoeheBrutto)} />
        <Zeile label="Ausgebuchter Betrag" wert={euro(d.ausgebuchterBetrag)} />
        <Zeile label="Rechnung (sevDesk)" wert={d.sevdeskRechnungId} />
      </dl>
      {link ? (
        <a href={link} target="_blank" rel="noreferrer noopener" className="knopf" style={{ marginTop: 12 }}>
          Pipedrive öffnen ↗
        </a>
      ) : null}
    </>
  )
}

function euro(wert: number | undefined): string | null {
  if (wert === undefined) return null
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(wert)
}

/**
 * Eigene Suspense-Grenze für Notizen und Mails, getrennt von der Deal-Karte
 * darüber: zwei zusätzliche Pipedrive-Aufrufe (Notizen, Mail-Metadaten)
 * sollen die bereits geladene Phase nicht mit ausbremsen.
 */
async function VorgangsschritteKarte({ fallId, dealId }: { fallId: string; dealId: number }) {
  const { schritte, notizenFehler, mailsFehler } = await ladeVorgangsschritte(dealId)

  return (
    <>
      {notizenFehler ? (
        <Meldung art="warnung" style={{ marginBottom: 12 }}>
          {notizenFehler}
        </Meldung>
      ) : null}
      {mailsFehler ? (
        <Meldung art="warnung" style={{ marginBottom: 12 }}>
          {mailsFehler}
        </Meldung>
      ) : null}
      <Vorgangsschritte fallId={fallId} schritte={schritte} />
    </>
  )
}

function VorgangsschritteSkelett() {
  return (
    <div aria-busy="true" aria-live="polite">
      <span className="nur-vorlesen">Die Vorgangsschritte werden geladen …</span>
      <Balken breite={70} />
      <div style={{ marginTop: 8 }}>
        <Balken breite={55} />
      </div>
      <div style={{ marginTop: 8 }}>
        <Balken breite={62} />
      </div>
    </div>
  )
}

/* ---------------- Der Zahlungsstand aus sevDesk ---------------- */

function phaseVon(vorgang: VorgangAnsicht): string | undefined {
  return vorgang.stand === 'gefunden' ? vorgang.deal?.phase : undefined
}

/**
 * Was in sevDesk zu diesem Aktenzeichen an Rechnungen liegt.
 *
 * Gefunden werden sie über die Rechnungsnummer: sie ist das Aktenzeichen
 * mit einer laufenden Nummer dahinter. Der Umweg über den Pipedrive-Deal
 * entfällt damit — und mit ihm die Fälle, die keinen Deal haben und sonst
 * unbeobachtet blieben.
 */
async function Zahlungskarte({
  aktenzeichen,
  phase,
  sevdeskLink,
}: {
  aktenzeichen: string | null
  phase: string | undefined
  sevdeskLink: string | null
}) {
  const { eingerichtet, ampel, spiegel } = await ladeAmpel(aktenzeichen)

  if (!eingerichtet) {
    return (
      <p className="unterzeile" style={{ margin: 0 }}>
        sevDesk ist auf diesem Server nicht eingerichtet — <code>SEVDESK_API_TOKEN</code> fehlt.
      </p>
    )
  }
  if (!ampel || ampel.stand === 'ohne_rechnung') {
    return (
      <>
        <p style={{ margin: 0 }}>Zu diesem Aktenzeichen liegt in sevDesk keine Rechnung.</p>
        <Streitfall text={widerspruch('ohne_rechnung', phase)} />
        <Abgleichstand abgeglichenAm={spiegel.abgeglichenAm} />
      </>
    )
  }

  return (
    <>
      <div style={{ marginBottom: 10 }}>
        <Geldpille stand={ampel.stand} offenCent={ampel.offenCent} />
      </div>
      {sevdeskLink ? (
        <a
          href={sevdeskLink}
          target="_blank"
          rel="noreferrer noopener"
          className="knopf"
          style={{ marginBottom: 12 }}
        >
          Rechnung in sevDesk öffnen ↗
        </a>
      ) : null}
      <dl className="kv" style={{ gridTemplateColumns: 'minmax(160px,auto) 1fr' }}>
        <dt>Rechnungsbetrag</dt>
        <dd style={{ textAlign: 'left' }}>{euroAusCent(ampel.bruttoCent)}</dd>
        <dt>Davon bezahlt</dt>
        <dd style={{ textAlign: 'left' }}>{euroAusCent(ampel.bezahltCent)}</dd>
        {/*
          Bei „bezahlt" bleibt der Restbetrag weg. sevDesk bucht mitunter
          einen Cent weniger als die Rechnung ausweist (855,49 zu 855,50);
          „Noch offen 0,01 €" unter der Marke „Bezahlt" ist kein Hinweis,
          sondern Rauschen.
        */}
        {ampel.offenCent > 0 && ampel.stand !== 'bezahlt' ? (
          <>
            <dt>Noch offen</dt>
            <dd style={{ textAlign: 'left' }}>{euroAusCent(ampel.offenCent)}</dd>
          </>
        ) : null}
        {ampel.faelligAm && ampel.stand !== 'bezahlt' ? (
          <>
            <dt>Fällig am</dt>
            <dd style={{ textAlign: 'left' }}>
              {ampel.faelligAm.toLocaleDateString('de-DE')}
            </dd>
          </>
        ) : null}
        {ampel.zahldatum ? (
          <>
            <dt>Bezahlt am</dt>
            <dd style={{ textAlign: 'left' }}>{ampel.zahldatum.toLocaleDateString('de-DE')}</dd>
          </>
        ) : null}
        {ampel.mahnstufe ? (
          <>
            <dt>Mahnstufe</dt>
            <dd style={{ textAlign: 'left' }}>{ampel.mahnstufe}</dd>
          </>
        ) : null}
        <dt>{ampel.nummern.length === 1 ? 'Rechnungsnummer' : 'Rechnungsnummern'}</dt>
        <dd style={{ textAlign: 'left', fontFamily: 'var(--mono)', fontSize: 12 }}>
          {ampel.nummern.join(', ')}
        </dd>
      </dl>
      <Streitfall text={widerspruch(ampel.stand, phase)} />
      {ampel.doppelt.length > 0 ? (
        <Streitfall
          text={`In sevDesk liegt ${ampel.doppelt.length === 1 ? 'die Rechnungsnummer' : 'die Rechnungsnummern'} ${ampel.doppelt.join(', ')} mehrfach. Gezählt wurde sie nur einmal — bitte in sevDesk aufräumen.`}
        />
      ) : null}
      <Abgleichstand abgeglichenAm={spiegel.abgeglichenAm} />
    </>
  )
}

function Streitfall({ text }: { text: string | null }) {
  if (!text) return null
  return (
    <div style={{ marginTop: 10 }}>
      <Meldung art="warnung">{text}</Meldung>
    </div>
  )
}

/**
 * Wann zuletzt mit sevDesk gesprochen wurde.
 *
 * Eine Aussage über Geld ohne ihr Alter ist eine halbe Aussage — wer sie
 * liest, soll sehen, ob sie von heute früh oder von letzter Woche ist.
 */
function Abgleichstand({ abgeglichenAm }: { abgeglichenAm: Date | null }) {
  if (!abgeglichenAm) return null
  return (
    <p className="unterzeile" style={{ margin: '10px 0 0' }}>
      Stand: {abgeglichenAm.toLocaleString('de-DE')}
    </p>
  )
}
