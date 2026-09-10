import 'server-only'
import { gutachtenSchema } from '@/autoixpert/typen'
import { leseFalldaten } from '@/autoixpert/felder'
import type { Extraktion } from '@/pruefbericht/schema'
import { alsKlartext, dateiname, type Kopfdaten } from '@/export/hausstil'
import { baueDocx, type DocxBild } from '@/export/docx'
import { ladeBilder } from '@/bilder/ablage'
import { leseDokument } from '@/dokument/dienst'
import { dokumentNachAbsaetzen, leseStruktur } from '@/dokument/nach-absaetzen'
import { istDokument, type Elementknoten } from '@/dokument/typen'
import type { Befund } from '@/export/waechter'
import { pruefeDokument } from './editor-aktionen'
import { ladeStellungnahme } from './abfragen'

/**
 * Die Ausgabe, Schritt für Schritt.
 *
 * Drei Abschnitte: prüfen, setzen, bauen. Der letzte ist der langsame — die
 * Geschäftspapier-Vorlage wird entpackt, gefüllt und wieder gepackt. Auch
 * hier gilt: der Balken zeigt, woran gearbeitet wird, statt sich selbst zu
 * beschäftigen.
 */

export interface AusgabeFortschritt {
  art: 'fortschritt'
  text: string
  anteil: number
}

export interface AusgabeFertig {
  art: 'fertig'
  klartext: string
  docxBase64: string
  docxName: string
  txtName: string
  /** Warnungen, die die Ausgabe nicht aufhalten — aber genannt gehören. */
  befunde: Befund[]
}

export interface AusgabeFehler {
  art: 'fehler'
  fehler: string
  /** Sperrende Befunde, damit die Oberfläche sie zeigen kann. */
  befunde?: Befund[]
}

export type Ausgabeereignis = AusgabeFortschritt | AusgabeFertig | AusgabeFehler

function falldatenName(daten: unknown): string | null {
  const geprueft = gutachtenSchema.safeParse(daten)
  if (!geprueft.success) return null
  return leseFalldaten(geprueft.data).anspruchsteller?.name ?? null
}

export async function* erzeugeAusgabe(
  stellungnahmeId: string,
  fassung?: unknown,
): AsyncGenerator<Ausgabeereignis> {
  const s = await ladeStellungnahme(stellungnahmeId)
  if (!s) {
    yield { art: 'fehler', fehler: 'Stellungnahme nicht gefunden.' }
    return
  }

  const dokument: Elementknoten | null = istDokument(fassung)
    ? fassung
    : await leseDokument(stellungnahmeId)
  if (!dokument) {
    yield { art: 'fehler', fehler: 'Zu dieser Stellungnahme gibt es noch kein Schreiben.' }
    return
  }

  yield { art: 'fortschritt', text: 'Die vier Wächter prüfen den Text …', anteil: 0.1 }

  const pruefung = await pruefeDokument(stellungnahmeId, dokument)
  if (pruefung.gesperrt) {
    const anzahl = pruefung.zusammenfassung.sperrt

    /**
     * Die Sperre nennt ihre Stellen.
     *
     * „Vier Prüfungen sperren die Ausgabe" ist eine Aufgabe ohne Adresse.
     * Genannt werden deshalb Kennung und Stelle der ersten drei — der Rest
     * steht als Anmerkung an seiner Position.
     */
    const stellen = [
      ...new Set(
        pruefung.befunde
          .filter((b) => b.schwere === 'sperrt')
          .map((b) => `${b.kennung} bei ${b.stelle}`),
      ),
    ]
    const genannt = stellen.slice(0, 3).join('; ')
    const rest = stellen.length > 3 ? ` und ${stellen.length - 3} weitere` : ''

    yield {
      art: 'fehler',
      befunde: pruefung.befunde,
      fehler:
        `${anzahl} Prüfung${anzahl === 1 ? '' : 'en'} sperr${anzahl === 1 ? 't' : 'en'} ` +
        `die Ausgabe: ${genannt}${rest}. Die Anmerkung am Rand führt an jede Stelle.`,
    }
    return
  }

  yield { art: 'fortschritt', text: 'Absätze werden nach dem Hausstil gesetzt …', anteil: 0.4 }

  const struktur = leseStruktur(dokument)
  if (struktur.abschnitte.length === 0) {
    yield { art: 'fehler', fehler: 'Kein Abschnitt trägt Text — es gäbe nichts auszugeben.' }
    return
  }

  const e = s.extraktion as Extraktion | null
  const bezeichnung = falldatenName(s.fall?.daten) ?? e?.aktenzeichen ?? null

  const kopf: Kopfdaten = {
    ort: 'Krefeld',
    datum: new Date(),
    empfaengerName: s.empfaengerName ?? '',
    empfaengerStrasse: s.empfaengerStrasse,
    empfaengerPlzOrt: s.empfaengerPlzOrt,
    betreff: struktur.betreff || (s.betreff ?? 'Betreff: Stellungnahme'),
    anrede: struktur.anrede || (s.anrede ?? 'Sehr geehrte Damen und Herren,'),
    einleitungDatum: s.einleitungDatum,
    einleitungMedium: s.einleitungMedium === 'mail' ? 'mail' : 'schreiben',
    pruefdienstleister: e?.pruefdienstleister ?? null,
    vorbemerkungEinfuegen: s.vorbemerkungEinfuegen,
  }

  const absaetze = dokumentNachAbsaetzen(dokument)

  // Die Bilder kommen erst hier aus der Datenbank — im Dokumentbaum steht
  // nur die Kennung, und das Speichern im Sekundentakt soll leicht bleiben.
  const bildIds = [...new Set(absaetze.filter((a) => a.bild).map((a) => a.bild!.bildId))]
  const bilder = new Map<string, DocxBild>()
  if (bildIds.length > 0) {
    yield {
      art: 'fortschritt',
      text: `${bildIds.length} ${bildIds.length === 1 ? 'Bild wird' : 'Bilder werden'} eingebettet …`,
      anteil: 0.55,
    }
    for (const [id, inhalt] of await ladeBilder(stellungnahmeId, bildIds)) {
      bilder.set(id, {
        daten: inhalt.daten,
        endung: inhalt.mimetyp === 'image/png' ? 'png' : 'jpg',
      })
    }
  }

  yield {
    art: 'fortschritt',
    text: `${struktur.abschnitte.length} Positionen — das Word-Dokument wird gebaut …`,
    anteil: 0.65,
  }

  try {
    const docx = await baueDocx({ kopf, absaetze, bilder })
    yield {
      art: 'fertig',
      klartext: alsKlartext(absaetze),
      docxBase64: Buffer.from(docx).toString('base64'),
      docxName: dateiname(bezeichnung, kopf.datum, 'docx'),
      txtName: dateiname(bezeichnung, kopf.datum, 'txt'),
      befunde: pruefung.befunde,
    }
  } catch (fehler) {
    yield {
      art: 'fehler',
      fehler: fehler instanceof Error ? fehler.message : 'Die Ausgabe ist fehlgeschlagen.',
    }
  }
}
