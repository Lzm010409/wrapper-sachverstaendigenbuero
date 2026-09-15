import 'server-only'
import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { position, positionBaustein, stellungnahme } from '@/db/schema'
import { leseBericht } from '@/pruefbericht/einlesen'
import { extrahiereImport } from '@/stellungnahmenimport/extraktion'
import type { Import, ImportPosition } from '@/stellungnahmenimport/schema'
import { kiVerfuegbar } from '@/ki/client'
import { protokolliereFehler } from '@/protokoll'
import { MAX_BYTES } from './auswertung'

/**
 * Der Import einer bereits verfassten Stellungnahme, Schritt für Schritt.
 *
 * Dasselbe Muster wie `werteBerichtAus` in `./auswertung`: ein Ereignisstrom
 * statt eines einzelnen Aufrufs, der irgendwann zurückkommt — das Einlesen
 * des PDFs und das Auslesen durch das Modell brauchen zusammen bis zu einer
 * Minute. Was hier fehlt, ist die Prüfliste B.1–B.8: sie prüft Befunde eines
 * *ausgewerteten Prüfberichts* gegen den Fall, aber eine bereits fertige
 * Stellungnahme hat keinen solchen Befund — es gibt hier nichts zu prüfen,
 * nur zu übernehmen.
 */

export interface ImportFortschrittsmeldung {
  art: 'fortschritt'
  schritt: 'einlesen' | 'auslesen' | 'speichern'
  text: string
  /** 0 bis 1. */
  anteil: number
}

export interface ImportAbschlussmeldung {
  art: 'fertig'
  stellungnahmeId: string
  hinweis?: string
}

export interface ImportFehlermeldung {
  art: 'fehler'
  fehler: string
}

export type Importereignis = ImportFortschrittsmeldung | ImportAbschlussmeldung | ImportFehlermeldung

const ABSCHNITT = { einlesen: [0.04, 0.55], auslesen: [0.55, 0.9], speichern: 0.98 }

/** Differenz einer Position, sofern beide Beträge vorliegen — wie `differenz` in `@/pruefbericht/schema`. */
function differenz(p: ImportPosition): number | null {
  if (p.betragGutachten === null || p.betragGekuerzt === null) return null
  return Math.round((p.betragGutachten - p.betragGekuerzt) * 100) / 100
}

export async function* werteImportAus(auftrag: {
  pdf: Buffer
  dateiname: string
  fallId: string
  benutzerId: string
  /** Die Stellungnahme, die gefüllt werden soll — siehe `werteBerichtAus`. */
  stellungnahmeId?: string
}): AsyncGenerator<Importereignis> {
  if (auftrag.pdf.byteLength > MAX_BYTES) {
    yield { art: 'fehler', fehler: `Die Datei ist grösser als ${MAX_BYTES / 1024 / 1024} MB.` }
    return
  }
  if (!kiVerfuegbar()) {
    yield {
      art: 'fehler',
      fehler:
        'Die Auswertung braucht einen Zugang zum Sprachmodell. Bitte ANTHROPIC_API_KEY ' +
        'in den Umgebungsvariablen hinterlegen.',
    }
    return
  }

  yield {
    art: 'fortschritt',
    schritt: 'einlesen',
    text: 'Stellungnahme wird geöffnet …',
    anteil: ABSCHNITT.einlesen[0]!,
  }

  let bericht
  try {
    bericht = await leseBericht(auftrag.pdf)
  } catch (fehler) {
    yield {
      art: 'fehler',
      fehler: fehler instanceof Error ? fehler.message : 'Die Datei liess sich nicht einlesen.',
    }
    return
  }

  const gescannt = bericht.zusammenfassung.bild
  yield {
    art: 'fortschritt',
    schritt: 'auslesen',
    text:
      `Betreff, Anrede und Positionen werden ausgelesen — ${bericht.seitenzahl} Seiten` +
      (gescannt > 0 ? `, davon ${gescannt} gescannt` : '') +
      ' …',
    anteil: ABSCHNITT.auslesen[0]!,
  }

  let extraktion: Import
  try {
    extraktion = (await extrahiereImport(bericht)).extraktion
  } catch (fehler) {
    protokolliereFehler('stellungnahme.import', 'Der Import ist gescheitert.', fehler, {
      dienst: 'anthropic',
    })
    yield {
      art: 'fehler',
      fehler:
        fehler instanceof Error ? fehler.message : 'Die Stellungnahme konnte nicht ausgelesen werden.',
    }
    return
  }

  yield {
    art: 'fortschritt',
    schritt: 'speichern',
    text: 'Stellungnahme wird angelegt …',
    anteil: ABSCHNITT.speichern,
  }

  const felder = {
    fallId: auftrag.fallId,
    modus: 'import' as const,
    pruefberichtDateiname: auftrag.dateiname,
    pruefberichtSeiten: bericht.seitenzahl,
    betreff: extraktion.betreff,
    anrede: extraktion.anrede,
    empfaengerName: extraktion.empfaengerName,
    empfaengerStrasse: extraktion.empfaengerStrasse,
    empfaengerPlzOrt: extraktion.empfaengerPlzOrt,
    ergebnisAbsatz: extraktion.ergebnisAbsatz,
    erstelltVon: auftrag.benutzerId,
  }

  let stellungnahmeId: string
  if (auftrag.stellungnahmeId) {
    await db
      .update(stellungnahme)
      .set({ ...felder, ...(felder.betreff ? {} : { betreff: undefined }) })
      .where(eq(stellungnahme.id, auftrag.stellungnahmeId))
    stellungnahmeId = auftrag.stellungnahmeId
  } else {
    const [angelegt] = await db.insert(stellungnahme).values(felder).returning({
      id: stellungnahme.id,
    })
    stellungnahmeId = angelegt!.id
  }

  /*
    Je Position einzeln eingefügt, statt in einem einzigen Mehrzeilen-Insert:
    der Baustein danach braucht die genaue `position.id`, die `RETURNING`
    eines Mehrzeilen-Inserts zurückgibt — verlässlich einer Zeile zuordnen
    lässt sich das nur, wenn beide zusammengehören. Bei einer Handvoll
    Positionen je Stellungnahme fällt die zusätzliche Anfrage je Zeile nicht
    ins Gewicht.
  */
  for (const [i, p] of extraktion.positionen.entries()) {
    const [eingefuegt] = await db
      .insert(position)
      .values({
        stellungnahmeId,
        bezeichnung: p.bezeichnung,
        betragGutachten: p.betragGutachten?.toString() ?? null,
        betragGekuerzt: p.betragGekuerzt?.toString() ?? null,
        differenz: differenz(p)?.toString() ?? null,
        // Es gibt hier keine gesonderte Begründung des Versicherers — das
        // Schreiben trägt die eigene Argumentation, die unten als
        // Bausteintext in den Brief übernommen wird.
        begruendungVersicherer: null,
        behandlung: 'bestritten' as const,
        reihenfolge: i,
      })
      .returning({ id: position.id })

    // Der extrahierte Argumentationstext wird als Baustein abgelegt statt
    // direkt in den Dokumentbaum geschrieben: `stelleDokumentBereit` baut
    // das Dokument beim ersten Öffnen ohnehin aus genau diesen Bausteinen
    // (siehe `src/dokument/dienst.ts`) — derselbe Weg, über den auch ältere
    // Stellungnahmen aus der Zeit der Auswahlmaske ihr Dokument bekommen.
    // Eine eigene Erzeugung des Dokumentbaums an dieser Stelle wäre eine
    // zweite Quelle für dieselbe Sache.
    if (eingefuegt && p.begruendungstext?.trim()) {
      await db.insert(positionBaustein).values({
        positionId: eingefuegt.id,
        typ: 'eigener_text',
        textFinal: p.begruendungstext,
        herkunft: 'eigener_text',
        reihenfolge: 0,
      })
    }
  }

  yield { art: 'fertig', stellungnahmeId }
}

/* ------------------------------------------------------------------ *
 * Import im Hintergrund
 * ------------------------------------------------------------------ */

/** Legt die Stellungnahme an, bevor der Import beginnt — wie `legeAuswertungAn`. */
export async function legeImportAn(auftrag: {
  pdf: Buffer
  dateiname: string
  fallId: string
  benutzerId: string
}): Promise<string> {
  const [angelegt] = await db
    .insert(stellungnahme)
    .values({
      fallId: auftrag.fallId,
      modus: 'import',
      betreff: `Stellungnahme ${auftrag.dateiname}`,
      pruefberichtDateiname: auftrag.dateiname,
      pruefberichtDaten: auftrag.pdf.toString('base64'),
      auswertungsstand: 'laeuft',
      auswertungsschritt: 'Wartet auf die Verarbeitung …',
      auswertungsProzent: 0,
      auswertungAktualisiertAm: new Date(),
      erstelltVon: auftrag.benutzerId,
    })
    .returning({ id: stellungnahme.id })

  return angelegt!.id
}

/**
 * Arbeitet den Import ab und schreibt den Stand mit — wie
 * `verarbeiteImHintergrund` in `./auswertung`, nur für hochgeladene
 * Stellungnahmen statt Prüfberichte.
 */
export async function verarbeiteImportImHintergrund(stellungnahmeId: string): Promise<void> {
  const [zeile] = await db
    .select({
      pruefberichtDaten: stellungnahme.pruefberichtDaten,
      pruefberichtDateiname: stellungnahme.pruefberichtDateiname,
      fallId: stellungnahme.fallId,
      erstelltVon: stellungnahme.erstelltVon,
    })
    .from(stellungnahme)
    .where(eq(stellungnahme.id, stellungnahmeId))
    .limit(1)

  if (!zeile?.pruefberichtDaten || !zeile.fallId) {
    await schreibeStand(stellungnahmeId, {
      auswertungsstand: 'fehler',
      auswertungsfehler: !zeile?.pruefberichtDaten
        ? 'Zu dieser Stellungnahme liegt keine hochgeladene Datei mehr vor.'
        : 'Dieser Stellungnahme fehlt der Fall, dem sie zugeordnet sein muss.',
    })
    return
  }

  try {
    const lauf = werteImportAus({
      pdf: Buffer.from(zeile.pruefberichtDaten, 'base64'),
      dateiname: zeile.pruefberichtDateiname ?? 'Stellungnahme.pdf',
      fallId: zeile.fallId,
      benutzerId: zeile.erstelltVon ?? '',
      stellungnahmeId,
    })

    for await (const ereignis of lauf) {
      if (ereignis.art === 'fortschritt') {
        await schreibeStand(stellungnahmeId, {
          auswertungsschritt: ereignis.text,
          auswertungsProzent: Math.round(ereignis.anteil * 100),
        })
      } else if (ereignis.art === 'fehler') {
        await schreibeStand(stellungnahmeId, {
          auswertungsstand: 'fehler',
          auswertungsfehler: ereignis.fehler,
        })
        return
      } else {
        await schreibeStand(stellungnahmeId, {
          auswertungsstand: 'fertig',
          auswertungsProzent: 100,
          auswertungsschritt: ereignis.hinweis ?? 'Fertig.',
          auswertungsfehler: null,
        })
        return
      }
    }
  } catch (fehler) {
    protokolliereFehler(
      'stellungnahme.import.hintergrund',
      'Der Import im Hintergrund ist gescheitert.',
      fehler,
      { dienst: 'anthropic' },
    )
    await schreibeStand(stellungnahmeId, {
      auswertungsstand: 'fehler',
      auswertungsfehler:
        fehler instanceof Error ? fehler.message : 'Der Import ist unerwartet abgebrochen.',
    })
  }
}

async function schreibeStand(
  stellungnahmeId: string,
  felder: Partial<{
    auswertungsstand: string
    auswertungsschritt: string
    auswertungsProzent: number
    auswertungsfehler: string | null
  }>,
): Promise<void> {
  await db
    .update(stellungnahme)
    .set({ ...felder, auswertungAktualisiertAm: new Date() })
    .where(eq(stellungnahme.id, stellungnahmeId))
}
