/**
 * Probedaten für die Bedienproben.
 *
 *   pnpm exec tsx scripts/probedaten.ts <praefix> [--weg]
 *
 * Legt je Bereich **drei** Datensätze an, die sich absichtlich stark
 * unterscheiden: der eine ist vollständig, der andere karg, der dritte
 * schräg. Eine Oberfläche, die nur den Normalfall kennt, bricht am
 * Sonderfall — und der Sonderfall ist in diesem Haus die Regel: ein Fall
 * ohne Aktenzeichen, ein Bericht ohne Positionen, ein Eintrag ohne
 * Gegenargument.
 *
 * Jeder Prüfer bekommt seinen eigenen Präfix und rührt nur seine eigenen
 * Sätze an; so können mehrere gleichzeitig prüfen, ohne sich die Daten
 * unter den Händen wegzuziehen.
 */
import { eq, like } from 'drizzle-orm'
import { db } from '../src/db/index'
import {
  beleg,
  bild,
  eintrag,
  eintragPlatzhalter,
  eintragVariante,
  fall,
  position,
  stellungnahme,
} from '../src/db/schema'
import { erzeugeDokument } from '../src/dokument/erzeugen'
import { findePlatzhalter } from '../src/bibliothek/parser'

const praefix = process.argv[2] ?? 'PROBE'
const weg = process.argv.includes('--weg')

/** Ein winziges gültiges PNG (1×1, grau). */
const PNG_1X1 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

async function raeumeWeg(): Promise<void> {
  await db.delete(stellungnahme).where(like(stellungnahme.betreff, `${praefix}%`))
  await db.delete(fall).where(like(fall.aktenzeichen, `${praefix}%`))
  await db.delete(eintrag).where(like(eintrag.titel, `${praefix}%`))
  await db.delete(bild).where(like(bild.dateiname, `${praefix}%`))
}

async function main() {
  await raeumeWeg()
  if (weg) {
    console.log(JSON.stringify({ praefix, weggeraeumt: true }))
    process.exit(0)
  }

  /* ---------------- Fälle ---------------- */

  const faelle = [
    {
      aktenzeichen: `${praefix}-0726/2011TG`,
      /*
        Die Schlüssel folgen der Schreibweise von autoiXpert und damit dem,
        was `src/autoixpert/felder.ts` tatsächlich liest — `license_plate`,
        nicht `licensePlate`; `mileage_meter`, nicht `mileage: {value}`;
        `accident.circumstances`, nicht `accident.description`. Mit den
        vorherigen Namen fielen sechs von zehn Angaben still durch das
        `.loose()`-Schema, und die Probe zeigte einen Fall ohne Fahrzeug —
        ein Bild, das mit der Anwendung nichts zu tun hatte.

        Und: das Aktenzeichen steht in `token`.
      */
      daten: {
        id: `${praefix}-f1`,
        token: `${praefix}-0726/2011TG`,
        external_id: `${praefix}-extern-1`,
        type: 'liability',
        state: 'done',
        order_date: '2026-05-20',
        completion_date: '2026-05-28',
        car: {
          make: 'Volkswagen',
          model: 'Passat Variant 2.0 TDI',
          license_plate: 'OL-AB 1234',
          vin: 'WVWZZZ3CZME000001',
          first_registration_date: '2019-04-01',
          mileage_meter: 84000,
          mileage_unit: 'km',
          service_book_complete: true,
          last_service_date: '2025-11-03',
          repaired_previous_damage: 'Heckstossfänger 2023 fachgerecht instandgesetzt',
          damage_description: 'Beschädigung Front links, Kotflügel und Scheinwerferhalterung',
        },
        claimant: {
          organization_name: 'Autohaus Muster GmbH',
          last_name: 'Meier',
          street_and_housenumber_or_lockbox: 'Musterweg 3',
          zip: '26123',
          city: 'Oldenburg',
          email: 'kontakt@example.invalid',
          phone: '0441 000000',
        },
        insurance: {
          organization_name: 'Beispiel Versicherung AG',
          zip: '30159',
          city: 'Hannover',
          case_number: `${praefix}-SN-4711`,
        },
        garage: { organization_name: 'Karosseriewerk Beispiel', zip: '26135', city: 'Oldenburg' },
        author_of_damage: { last_name: 'Schulz', license_plate: 'WHV-XY 99', zip: '26382', city: 'Wilhelmshaven' },
        accident: {
          date: '2026-05-14',
          location: 'B401 Höhe Abfahrt Wittmund',
          circumstances: 'Auffahrunfall auf der B401',
        },
      },
    },
    {
      aktenzeichen: `${praefix}-ohne-Angaben`,
      // Nur die Kennung, sonst nichts: die Detailseite muss leere Kästen
      // erklären statt sie leer zu lassen.
      daten: { id: `${praefix}-f2`, token: `${praefix}-ohne-Angaben` },
    },
    {
      // Absichtlich unbrauchbar: die Detailseite muss das aushalten.
      aktenzeichen: `${praefix}-kaputt`,
      daten: { unfug: true, id: 12345 },
    },
  ]

  const fallIds: string[] = []
  for (const f of faelle) {
    const [neu] = await db
      .insert(fall)
      .values({ aktenzeichen: f.aktenzeichen, autoixpertId: f.aktenzeichen, daten: f.daten })
      .returning({ id: fall.id })
    fallIds.push(neu!.id)
  }

  /* ---------------- Bibliothekseinträge ---------------- */

  const eintraege = [
    {
      nummer: `${praefix}.1`,
      titel: `${praefix} Freigegeben mit Varianten und Fundstellen`,
      bereich: 'kalkulation' as const,
      abschnitt: '1. Ersatzteile-Erforderlichkeit / E-Positionen',
      status: 'freigegeben' as const,
      typischeBegruendung: 'Die Halterung sei zerstörungsfrei zu demontieren.',
      gegenargument:
        'Die Halterung ist eine E-Position und nach Demontage nicht wiederverwendbar. ' +
        'Ein Abzug ist deshalb nicht nachvollziehbar.',
      vorgehen: null,
      hinweise: 'Sehr häufige Position.',
      varianten: ['Kurzfassung für Mail', 'Ausführlich mit Rechtsprechung'],
      belege: 2,
    },
    {
      nummer: `${praefix}.2`,
      titel: `${praefix} Entwurf mit Platzhaltern`,
      bereich: 'kalkulation' as const,
      abschnitt: '2. Lackierung und Beilackierung',
      status: 'entwurf' as const,
      typischeBegruendung: 'Eine Beilackierung sei nicht erforderlich.',
      gegenargument:
        'Am Fahrzeug [Kennzeichen] ist die Beilackierung von [Bauteil] technisch erforderlich; ' +
        'ohne sie bliebe ein sichtbarer Farbunterschied.',
      vorgehen: null,
      hinweise: 'Immer mit Farbmessprotokoll arbeiten.',
      varianten: [],
      belege: 0,
    },
    {
      nummer: `${praefix}.3`,
      titel: `${praefix} Zurückgezogen ohne Gegenargument`,
      bereich: 'wertminderung' as const,
      abschnitt: '5. Wertminderung',
      status: 'zurueckgezogen' as const,
      typischeBegruendung: 'Eine Wertminderung sei nicht anzusetzen.',
      gegenargument: '',
      vorgehen: 'Marktrelevanz im Einzelfall prüfen und begründen.',
      hinweise: null,
      varianten: [],
      belege: 1,
    },
  ]

  const eintragIds: string[] = []
  for (const e of eintraege) {
    const [neu] = await db
      .insert(eintrag)
      .values({
        nummer: e.nummer,
        titel: e.titel,
        bereich: e.bereich,
        abschnitt: e.abschnitt,
        status: e.status,
        typischeBegruendung: e.typischeBegruendung,
        gegenargument: e.gegenargument,
        vorgehen: e.vorgehen,
        hinweise: e.hinweise,
        quelldatei: 'probedaten.ts',
      })
      .returning({ id: eintrag.id })
    eintragIds.push(neu!.id)

    /*
      Die Marke „N Platzh." in der Liste speist sich aus `eintrag_platzhalter`,
      und diese Tabelle füllte bisher allein der Markdown-Import. Ein über
      dieses Skript angelegter Eintrag zeigte deshalb keine Marke, obwohl
      `[Kennzeichen]` und `[Bauteil]` sichtbar im Auszug danebenstanden — die
      Probe bildete den Normalfall nicht ab. Dieselbe Erkennung wie der
      Import, damit die Marke zum Text passt.
    */
    for (const p of findePlatzhalter(e.gegenargument, e.vorgehen ?? '', e.hinweise ?? '')) {
      await db.insert(eintragPlatzhalter).values({
        eintragId: neu!.id,
        schluessel: p.schluessel,
        art: p.art,
        quelle: 'manuell',
      })
    }

    for (const [i, bezeichnung] of e.varianten.entries()) {
      await db.insert(eintragVariante).values({
        eintragId: neu!.id,
        bezeichnung,
        text: `${bezeichnung}: ${e.gegenargument.slice(0, 80)}`,
        reihenfolge: i,
      })
    }
    for (let i = 0; i < e.belege; i++) {
      await db.insert(beleg).values({
        eintragId: neu!.id,
        typ: 'urteil',
        gericht: 'LG Musterstadt',
        aktenzeichen: `1 O ${100 + i}/24`,
        datum: `0${i + 1}.03.2025`,
        fundstelle: `LG Musterstadt, Urteil vom 0${i + 1}.03.2025 – 1 O ${100 + i}/24`,
        kernaussage: 'Der Abzug war nicht gerechtfertigt.',
      })
    }
  }

  /* ---------------- Stellungnahmen ---------------- */

  const bauePositionen = (anzahl: number) =>
    Array.from({ length: anzahl }, (_, i) => ({
      bezeichnung: `${praefix} Position ${i + 1} — ${
        ['Verbringungskosten', 'Lackierlohn', 'Ersatzteilaufschlag', 'Probefahrt'][i % 4]
      }`,
      differenz: String((i + 1) * 37.5),
      betragGutachten: String((i + 1) * 100),
      betragGekuerzt: String((i + 1) * 62.5),
      /*
        Die Begründung des Prüfdienstleisters ist der Schlüssel, über den
        die Randspalte einen Baustein vorschlägt (sie sucht über
        `typischeBegruendung`). Stand hier ein Allgemeinplatz, fand sie
        nichts — und die Bedienprobe meldete „Zur offenen Anmerkung gibt es
        keinen Vorschlag", ohne dass an der Anwendung etwas fehlte. Deshalb
        die Wortlaute der eigenen Bibliothekseinträge.
      */
      begruendungVersicherer: [
        'Die Halterung sei zerstörungsfrei zu demontieren.',
        'Eine Beilackierung sei nicht erforderlich.',
        'Eine Wertminderung sei nicht anzusetzen.',
      ][i % 3]!,
      behandlung: (i % 3 === 2 ? 'nicht_bestreiten' : 'offen') as 'offen' | 'nicht_bestreiten',
      seite: (i % 4) + 1,
      reihenfolge: i,
    }))

  const schreiben = [
    {
      betreff: `${praefix} A — leer, ohne Positionen`,
      positionen: 0,
      fallId: null as string | null,
      empfaenger: null,
      versendet: false,
      extraktion: null as unknown,
      sonderfaelle: null as unknown,
    },
    {
      betreff: `${praefix} B — drei Positionen, vollständig`,
      positionen: 3,
      fallId: fallIds[0]!,
      empfaenger: {
        empfaengerName: 'Rechtsanwalt Jens Schlossmacher',
        empfaengerStrasse: 'Ebertplatz 13',
        empfaengerPlzOrt: '50668 Köln',
        einleitungDatum: '01.08.2026',
        einleitungMedium: 'schreiben',
      },
      versendet: false,
      extraktion: {
        aktenzeichen: `${praefix}-0726/2011TG`,
        pruefdienstleister: 'ControlExpert',
        versicherer: 'ERGO',
        unklarheiten: ['Seite 3 war nur als Bild lesbar.', 'Der Kürzungsbetrag ist nicht beziffert.'],
      },
      sonderfaelle: [
        {
          kennung: 'B.2',
          titel: 'Restwertangebot aus dem Sondermarkt',
          befund: 'Der Prüfbericht nennt ein Angebot ausserhalb des regionalen Marktes.',
          handlung: 'Angebot als nicht massgeblich zurückweisen.',
          dringlichkeit: 'hoch',
        },
      ],
    },
    {
      betreff: `${praefix} C — zwölf Positionen, versendet`,
      positionen: 12,
      fallId: fallIds[1]!,
      empfaenger: {
        empfaengerName: 'HUK-Coburg',
        empfaengerStrasse: 'Bahnhofsplatz',
        empfaengerPlzOrt: '96444 Coburg',
        einleitungDatum: '13.08.2026',
        einleitungMedium: 'mail',
      },
      versendet: true,
      extraktion: { pruefdienstleister: 'DEKRA', versicherer: 'HUK-Coburg', unklarheiten: [] },
      sonderfaelle: null,
    },
  ]

  const stellungnahmeIds: string[] = []
  for (const s of schreiben) {
    const [neu] = await db
      .insert(stellungnahme)
      .values({
        betreff: s.betreff,
        anrede: 'Sehr geehrte Damen und Herren,',
        fallId: s.fallId,
        extraktion: s.extraktion,
        sonderfaelle: s.sonderfaelle,
        pruefberichtDateiname: s.positionen > 0 ? `${praefix}-pruefbericht.pdf` : null,
        pruefberichtSeiten: s.positionen > 0 ? 8 : null,
        versendetAm: s.versendet ? new Date() : null,
        ...(s.empfaenger ?? {}),
      })
      .returning({ id: stellungnahme.id })

    const angaben = bauePositionen(s.positionen)
    const gespeicherte: { id: string; bezeichnung: string; behandlung: string }[] = []
    for (const p of angaben) {
      const [zeile] = await db
        .insert(position)
        .values({ stellungnahmeId: neu!.id, ...p })
        .returning({ id: position.id })
      gespeicherte.push({ id: zeile!.id, bezeichnung: p.bezeichnung, behandlung: p.behandlung })
    }

    // Das Schreiben gleich mit anlegen: sonst entsteht es erst beim Öffnen,
    // und der Prüfer misst die Ladezeit statt der Oberfläche.
    const dokument = erzeugeDokument({
      betreff: s.betreff,
      anrede: 'Sehr geehrte Damen und Herren,',
      kopf: {
        einleitungDatum: s.empfaenger?.einleitungDatum ?? null,
        einleitungMedium: (s.empfaenger?.einleitungMedium as 'schreiben' | 'mail') ?? 'schreiben',
        pruefdienstleister:
          (s.extraktion as { pruefdienstleister?: string } | null)?.pruefdienstleister ?? null,
      },
      positionen: gespeicherte.map((p) => ({
        id: p.id,
        bezeichnung: p.bezeichnung,
        behandlung: p.behandlung,
        bausteine: [],
      })),
      ergebnisAbsatz: null,
    })
    await db
      .update(stellungnahme)
      .set({ dokument, dokumentStand: 1, dokumentGeaendertAm: new Date() })
      .where(eq(stellungnahme.id, neu!.id))

    stellungnahmeIds.push(neu!.id)
  }

  /* ---------------- Bilder ---------------- */

  const bilder = [
    {
      dateiname: `${praefix}-in-bibliothek.png`,
      titel: `${praefix} Kalkulationsauszug`,
      beschreibung: 'Auszug aus dem Kalkulationsprogramm, zeigt die E-Position.',
      themen: ['Kalkulation', 'E-Position'],
      inBibliothek: true,
      stellungnahmeId: null as string | null,
    },
    {
      dateiname: `${praefix}-aus-schreiben.png`,
      titel: null,
      beschreibung: null,
      themen: [],
      inBibliothek: false,
      stellungnahmeId: stellungnahmeIds[1]!,
    },
    {
      dateiname: `${praefix}-ohne-themen.png`,
      titel: `${praefix} Ohne Themen`,
      beschreibung: null,
      themen: [],
      inBibliothek: true,
      stellungnahmeId: null,
    },
  ]

  const bildIds: string[] = []
  for (const b of bilder) {
    const [neu] = await db
      .insert(bild)
      .values({
        dateiname: b.dateiname,
        titel: b.titel,
        beschreibung: b.beschreibung,
        themen: b.themen,
        inBibliothek: b.inBibliothek,
        stellungnahmeId: b.stellungnahmeId,
        mimetyp: 'image/png',
        daten: PNG_1X1,
        breitePx: 1,
        hoehePx: 1,
        bytes: 68,
      })
      .returning({ id: bild.id })
    bildIds.push(neu!.id)
  }

  console.log(
    JSON.stringify(
      { praefix, faelle: fallIds, eintraege: eintragIds, schreiben: stellungnahmeIds, bilder: bildIds },
      null,
      2,
    ),
  )
  process.exit(0)
}

main().catch((f) => {
  console.error(f)
  process.exit(1)
})
