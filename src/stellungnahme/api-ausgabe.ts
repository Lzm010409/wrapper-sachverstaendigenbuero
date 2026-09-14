import 'server-only'
import { gutachtenSchema } from '@/autoixpert/typen'
import { leseFalldaten } from '@/autoixpert/felder'
import type { Extraktion } from '@/pruefbericht/schema'
import { alsKlartext, dateiname, type Kopfdaten } from '@/export/hausstil'
import { ladeBilder } from '@/bilder/ablage'
import { leseDokument } from '@/dokument/dienst'
import { dokumentNachAbsaetzen, leseStruktur } from '@/dokument/nach-absaetzen'
import type { Befund } from '@/export/waechter'
import { druckeStellungnahmePdf, type PdfBild } from './pdf'
import { pruefeDokument } from './editor-aktionen'
import { ladeStellungnahme } from './abfragen'

/**
 * Die Ausgabe einer Stellungnahme für `/api/v1/stellungnahmen/{id}` — Text
 * und PDF in einem Aufruf, wie in der Abstimmung mit dem Nutzer festgelegt.
 *
 * Läuft durch dieselbe Prüfung wie der bestehende Word-Export
 * (`src/stellungnahme/ausgabe.ts`): eine Stellungnahme mit sperrenden
 * Befunden darf über keinen der beiden Wege hinausgehen, sonst gäbe es zwei
 * Exportpfade mit unterschiedlichen Regeln.
 */

export type ApiAusgabeErgebnis =
  | { art: 'fertig'; klartext: string; pdfBase64: string; pdfName: string; befunde: Befund[] }
  | { art: 'gesperrt'; fehler: string; befunde: Befund[] }
  | { art: 'kein-dokument'; fehler: string }

function falldatenName(daten: unknown): string | null {
  const geprueft = gutachtenSchema.safeParse(daten)
  if (!geprueft.success) return null
  return leseFalldaten(geprueft.data).anspruchsteller?.name ?? null
}

/** `null`, wenn es die Stellungnahme nicht gibt — dann liefert die Route 404. */
export async function erzeugeApiAusgabe(stellungnahmeId: string): Promise<ApiAusgabeErgebnis | null> {
  const s = await ladeStellungnahme(stellungnahmeId)
  if (!s) return null

  const dokument = await leseDokument(stellungnahmeId)
  if (!dokument) {
    return { art: 'kein-dokument', fehler: 'Zu dieser Stellungnahme gibt es noch kein Schreiben.' }
  }

  const pruefung = await pruefeDokument(stellungnahmeId, dokument)
  if (pruefung.gesperrt) {
    const anzahl = pruefung.zusammenfassung.sperrt
    return {
      art: 'gesperrt',
      fehler:
        `${anzahl} Prüfung${anzahl === 1 ? '' : 'en'} sperr${anzahl === 1 ? 't' : 'en'} ` +
        'die Ausgabe. Die Befunde stehen im Feld "befunde".',
      befunde: pruefung.befunde,
    }
  }

  const struktur = leseStruktur(dokument)
  if (struktur.abschnitte.length === 0) {
    return {
      art: 'kein-dokument',
      fehler: 'Kein Abschnitt trägt Text — es gäbe nichts auszugeben.',
    }
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

  const bildIds = [...new Set(absaetze.filter((a) => a.bild).map((a) => a.bild!.bildId))]
  const bilder = new Map<string, PdfBild>()
  if (bildIds.length > 0) {
    for (const [id, inhalt] of await ladeBilder(stellungnahmeId, bildIds)) {
      bilder.set(id, { daten: inhalt.daten, mimetyp: inhalt.mimetyp })
    }
  }

  const pdf = await druckeStellungnahmePdf(kopf, absaetze, bilder)

  return {
    art: 'fertig',
    klartext: alsKlartext(absaetze),
    pdfBase64: pdf.toString('base64'),
    pdfName: dateiname(bezeichnung, kopf.datum, 'pdf'),
    befunde: pruefung.befunde,
  }
}
