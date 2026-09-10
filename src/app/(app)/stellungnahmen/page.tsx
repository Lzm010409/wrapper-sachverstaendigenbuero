import Link from 'next/link'
import {
  ladeStellungnahmen,
  STELLUNGNAHME_SORTIERFELDER,
  stellungnahmenfilterGesetzt,
  zaehleStellungnahmen,
  type Stellungnahmenfilter,
  type StellungnahmeSortierfeld,
} from '@/stellungnahme/abfragen'
import { ladeFaelle } from '@/autoixpert/abfragen'
import { kiVerfuegbar } from '@/ki/client'
import { werkzeugeVorhanden } from '@/pruefbericht/einlesen'
import { gutachtenSchema } from '@/autoixpert/typen'
import { leseFalldaten } from '@/autoixpert/felder'
import { BerichtFormular } from './bericht-formular'
import { Loeschknopf } from './loeschknopf'
import { verlangeAnmeldung } from '@/auth/wache'
import { darf } from '@/rechte/zugriff'
import { Filterleiste } from '@/app/teile/filterleiste'
import { Pagination } from '@/app/teile/pagination'
import { leseSeite } from '@/app/teile/seitenwahl'
import { Sortierleiste } from '@/app/teile/sortierleiste'
import { leseSortierung } from '@/app/teile/sortierung'

/**
 * Die Beschriftung einer Zeile.
 *
 * `betreff` ist in der Datenbank frei: fehlend, leer oder nur aus
 * Leerzeichen — alles drei kommt vor, sobald jemand das Betrefffeld im
 * Schreibtisch leerräumt. `betreff ?? 'Ohne Betreff'` fing nur den ersten
 * Fall ab; bei einem Betreff aus Leerzeichen stand die Zeile ohne jede
 * sichtbare Beschriftung da, und die Löschrückfrage fragte nach „   ".
 */
function beschriftung(betreff: string | null): string {
  return betreff?.trim() || 'Ohne Betreff'
}

/**
 * Datum als TT.MM.JJJJ.
 *
 * `toLocaleDateString('de-DE')` allein liefert „14.8.2026" — einstellige
 * Tage und Monate ohne führende Null. Der Rest des Hauses schreibt
 * zweistellig (`formatiereDatum` in src/autoixpert/felder.ts, und so steht
 * es auch in den Briefen selbst); zwei Schreibweisen nebeneinander lesen
 * sich wie zwei verschiedene Anwendungen.
 */
function tagesdatum(wert: Date | string): string {
  return new Date(wert).toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

/** Nimmt einen Wert aus der Adresse — mehrfach gesetzt zählt der erste. */
function wert(roh: string | string[] | undefined): string | undefined {
  const einzeln = Array.isArray(roh) ? roh[0] : roh
  return einzeln?.trim() || undefined
}

export default async function StellungnahmenSeite({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  // Vor allem anderen: ohne Anmeldung wird hier nichts geladen und
  // nichts gerendert. Die Pruefung im Layout kam zu spaet - die Seite
  // rendert gleichzeitig mit ihm, und ihre Nutzlast ging im Rumpf der
  // Umleitung mit hinaus.
  await verlangeAnmeldung()
  // Einen Knopf gar nicht erst zeigen ist freundlicher, als ihn nach dem
  // Klick abzuweisen. Die Aktion prüft trotzdem — das hier ist Anzeige.
  const darfLoeschen = await darf('stellungnahme.loeschen')

  const roh = await searchParams
  const filter: Stellungnahmenfilter = {
    suche: wert(roh.suche),
    stand: wert(roh.stand),
    von: wert(roh.von),
    bis: wert(roh.bis),
  }
  const gefiltert = stellungnahmenfilterGesetzt(filter)
  const { seite, groesse, versatz } = leseSeite(roh.seite, roh.groesse)
  const sortierung = leseSortierung<StellungnahmeSortierfeld>(
    { sortiert: wert(roh.sortiert), richtung: wert(roh.richtung) },
    STELLUNGNAHME_SORTIERFELDER.map((f) => f.wert),
  )

  const [liste, gesamt, faelle, werkzeuge] = await Promise.all([
    ladeStellungnahmen(filter, sortierung ?? undefined, groesse, versatz),
    zaehleStellungnahmen(filter),
    ladeFaelle(),
    werkzeugeVorhanden(),
  ])

  const fallAuswahl = faelle.map((f) => {
    const geprueft = gutachtenSchema.safeParse(f.daten)
    const d = geprueft.success ? leseFalldaten(geprueft.data) : null
    // Ein Fall ohne Aktenzeichen und mit unlesbaren Falldaten trägt sonst
    // gar keine Beschriftung — im Auswahlfeld stünde eine leere Zeile, die
    // sich anwählen lässt und nichts über sich sagt.
    const teile = [f.aktenzeichen, d?.anspruchsteller?.name, d?.fahrzeug.kennzeichen].filter(Boolean)
    return {
      id: f.id,
      bezeichnung: teile.length > 0 ? teile.join(' · ') : 'Fall ohne Aktenzeichen',
    }
  })

  return (
    <>
      <div className="seiten-kopf">
        <div>
          <h1>Stellungnahmen</h1>
          {/*
            Die Zahl kommt aus einer eigenen Zählung. Vorher stand hier die
            Länge der Liste, und die schneidet bei hundert ab — „Die 100
            neuesten" war der Notbehelf dafür.
          */}
          <p className="unterzeile">
            {gesamt === 0
              ? gefiltert
                ? 'Keine Stellungnahme passt zu diesem Filter'
                : 'Noch keine Stellungnahme begonnen'
              : `${gesamt} ${gesamt === 1 ? 'Stellungnahme' : 'Stellungnahmen'}${gefiltert ? ' gefunden' : ''}`}
          </p>
        </div>
      </div>

      {!werkzeuge.ok ? (
        <div className="hinweis fehler" style={{ marginBottom: 18 }}>
          Zum Einlesen der Prüfberichte fehlen auf diesem Server: {werkzeuge.fehlend.join(', ')}.
          Sie kommen aus dem Paket <code>poppler-utils</code>.
        </div>
      ) : null}

      {!kiVerfuegbar() ? (
        <div className="hinweis warn" style={{ marginBottom: 18 }}>
          Die Auswertung der Prüfberichte braucht einen Zugang zum Sprachmodell. Hinterlege
          <code style={{ margin: '0 4px' }}>ANTHROPIC_API_KEY</code>
          in den Umgebungsvariablen.
        </div>
      ) : null}

      <BerichtFormular faelle={fallAuswahl} aktiv={kiVerfuegbar() && werkzeuge.ok} />

      <Sortierleiste felder={STELLUNGNAHME_SORTIERFELDER} />

      <Filterleiste
        weitereAb={2}
        zusatzParameter={{ sortiert: sortierung?.feld, richtung: sortierung?.richtung }}
        felder={[
          { art: 'suche', name: 'suche', platzhalter: 'Betreff, Empfänger oder Aktenzeichen' },
          {
            art: 'auswahl',
            name: 'stand',
            beschriftung: 'Stand',
            alle: 'Jeder Stand',
            werte: [
              { wert: 'offen', text: 'in Arbeit' },
              { wert: 'versendet', text: 'versendet' },
              { wert: 'laeuft', text: 'wird ausgewertet' },
              { wert: 'fehler', text: 'Auswertung gescheitert' },
            ],
          },
          { art: 'datum', name: 'von', beschriftung: 'Angelegt ab' },
          { art: 'datum', name: 'bis', beschriftung: 'Angelegt bis' },
        ]}
      />

      {liste.length === 0 ? (
        <div className="leer">
          <p style={{ margin: 0 }}>
            {gefiltert
              ? 'Keine Stellungnahme passt zu diesem Filter. Nimm eine Einschränkung heraus.'
              : 'Lade einen Prüfbericht hoch — die Kürzungspositionen werden daraus ausgelesen.'}
          </p>
        </div>
      ) : (
        <div className="liste">
          {liste.map((s) => (
            /* Der Löschknopf steht neben der Zeile, nicht in ihr: ein Knopf
               innerhalb eines Verweises ist weder gültiges HTML noch mit der
               Tastatur sauber zu bedienen. */
            <div key={s.id} className="zeile-huelle">
              <Link href={`/stellungnahmen/${s.id}`} className="zeile">
                {/* Der Strich steht für „kein Fall zugeordnet"; allein
                    sagt er das niemandem, deshalb der Titel dazu. */}
                <span
                  className="zeile-nummer"
                  title={s.fallAktenzeichen ?? 'Kein Fall zugeordnet'}
                >
                  {s.fallAktenzeichen ?? '—'}
                </span>
                <span>
                  <span className="zeile-titel">{beschriftung(s.betreff)}</span>
                  <span className="zeile-meta">
                    <span>
                      {s.positionen} {s.positionen === 1 ? 'Position' : 'Positionen'}
                    </span>
                    {s.pruefberichtDateiname ? <span>{s.pruefberichtDateiname}</span> : null}
                    {/*
                      Das Datum braucht sein Wort dazu: neben der Pille
                      „versendet" liest sich eine nackte Zahl als
                      Versanddatum, gemeint war aber immer der Tag, an dem
                      das Schreiben angelegt wurde.
                    */}
                    <span>angelegt {tagesdatum(s.erstelltAm)}</span>
                    {s.auswertungsstand === 'laeuft' && s.auswertungsschritt ? (
                      <span>{s.auswertungsschritt}</span>
                    ) : null}
                    {s.versendetAm ? <span>versendet {tagesdatum(s.versendetAm)}</span> : null}
                  </span>
                </span>
                <span className="zeile-rechts">
                  {/*
                    Drei Zustände statt zwei. „wird ausgewertet" ist neu und
                    nötig, seit die Auswertung im Hintergrund läuft: die
                    Zeile steht sofort in der Übersicht, hat aber noch keine
                    Positionen. Ohne dieses Wort sähe sie aus wie ein leeres
                    Schreiben, das jemand vergessen hat.
                  */}
                  <span
                    className={`marke-pille ${
                      s.auswertungsstand === 'laeuft'
                        ? 'm-akzent'
                        : s.auswertungsstand === 'fehler'
                          ? 'm-warn'
                          : s.versendetAm
                            ? 'm-freigegeben'
                            : 'm-entwurf'
                    }`}
                  >
                    {s.auswertungsstand === 'laeuft'
                      ? `wird ausgewertet · ${s.auswertungsProzent} %`
                      : s.auswertungsstand === 'fehler'
                        ? 'Auswertung gescheitert'
                        : s.versendetAm
                          ? 'versendet'
                          : 'in Arbeit'}
                  </span>
                </span>
              </Link>
              {/*
                Während der Auswertung nicht löschen: die Verarbeitung läuft
                noch und schriebe gleich in eine Zeile, die es nicht mehr
                gibt. Gescheitert darf gelöscht werden — dort ist nichts mehr
                unterwegs.
              */}
              {!s.versendetAm && s.auswertungsstand !== 'laeuft' && darfLoeschen ? (
                <Loeschknopf stellungnahmeId={s.id} betreff={beschriftung(s.betreff)} />
              ) : null}
            </div>
          ))}
        </div>
      )}

      <Pagination seite={seite} groesse={groesse} gesamt={gesamt} />
    </>
  )
}
