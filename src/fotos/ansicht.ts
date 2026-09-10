import 'server-only'
import { clientAusUmgebung } from '@/autoixpert/client'
import { abrufregel } from '@/autoixpert/abrufregel'
import type { Fotodaten, Gutachten } from '@/autoixpert/typen'

/**
 * Die Datenschicht des Reiters „Fotos".
 *
 * Geholt werden **nur die Angaben**, nicht die Dateien. Ein Fall mit 67
 * Fotos wären sonst rund 200 MB in einem Abruf. Die Bilder holt der Browser
 * einzeln über `/api/faelle/…/fotos/…`, und zwar erst, wenn sie ins Blickfeld
 * kommen.
 *
 * Dieselben vier Ausgänge wie bei „Vorgang" und „Kalkulation": „keine Fotos"
 * und „nicht abrufbar" dürfen in der Oberfläche nicht dasselbe anzeigen.
 */

export type Fotostand = 'gefunden' | 'ohne_fotos' | 'nicht_eingerichtet' | 'fehler'

/** Wofür ein Foto vorgesehen ist — in autoiXpert die Häkchen am Bild. */
export interface Verwendung {
  imGutachten: boolean
  inRestwertboerse: boolean
  inReparaturbestaetigung: boolean
  inStellungnahme: boolean
}

export interface Foto extends Verwendung {
  id: string
  titel: string
  beschreibung: string | null
  dateiname: string | null
  breite: number | null
  hoehe: number | null
  bytes: number | null
}

export interface Fotoansicht {
  stand: Fotostand
  fotos: Foto[]
  /** Nur bei `stand === 'fehler'`. */
  meldung?: string
  /** Ob Beschriften möglich ist — hängt an der Abrufregel. */
  schreibenErlaubt: boolean
}

/**
 * Titel und Dateiname sind bei autoiXpert oft dasselbe (`IMG_0470.jpeg`), die
 * Beschreibung trägt dann die eigentliche Auskunft („Ansicht vorne links").
 * Für die Anzeige zählt, was einem Menschen etwas sagt.
 */
function anzeigetitel(foto: Fotodaten): string {
  const beschreibung = foto.description?.trim()
  if (beschreibung) return beschreibung
  const titel = foto.title?.trim()
  if (titel) return titel
  return foto.original_name?.trim() || 'ohne Titel'
}

export function zuFoto(daten: Fotodaten): Foto {
  return {
    id: daten.id,
    titel: anzeigetitel(daten),
    beschreibung: daten.description?.trim() || null,
    dateiname: daten.original_name?.trim() || null,
    breite: daten.width ?? null,
    hoehe: daten.height ?? null,
    bytes: daten.size ?? null,
    // Die Voreinstellungen der Schnittstelle: im Gutachten und in der
    // Restwertbörse ja, in Reparaturbestätigung und Stellungnahme nein.
    imGutachten: daten.included_in_report ?? true,
    inRestwertboerse: daten.included_in_residual_value_exchange ?? true,
    inReparaturbestaetigung: daten.included_in_repair_confirmation ?? false,
    inStellungnahme: daten.included_in_expert_statement ?? false,
  }
}

export async function ladeFotos(gutachten: Gutachten | null): Promise<Fotoansicht> {
  const schreibenErlaubt = abrufregel.schreibenErlaubt
  const client = clientAusUmgebung()
  if (!client) return { stand: 'nicht_eingerichtet', fotos: [], schreibenErlaubt }

  const kennung = gutachten?.id || gutachten?.external_id
  if (!kennung) return { stand: 'ohne_fotos', fotos: [], schreibenErlaubt }

  try {
    const roh = await client.holeFotos(kennung)
    const fotos = roh.map(zuFoto)
    return {
      stand: fotos.length > 0 ? 'gefunden' : 'ohne_fotos',
      fotos,
      schreibenErlaubt,
    }
  } catch (fehler) {
    return {
      stand: 'fehler',
      fotos: [],
      schreibenErlaubt,
      meldung: fehler instanceof Error ? fehler.message : String(fehler),
    }
  }
}
