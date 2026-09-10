import type { Fotodaten } from '@/autoixpert/typen'

/**
 * Ob ein Foto schon eine echte, von einem Menschen stammende Beschreibung
 * trägt — im Unterschied zu einem Wert, der zufällig nur den Dateinamen
 * wiederholt (z. B. weil ein Import ihn dort hineingeschrieben hat). Nur
 * Fotos ohne echte Beschreibung gehen überhaupt zum Modell — ein Modellaufruf
 * für ein längst beschriftetes Foto kostet Geld für einen Vorschlag, den
 * ohnehin niemand zu sehen bekommt (die Prüf-Oberfläche blendet ihn über
 * `!foto.beschreibung` ohnehin aus).
 *
 * **Eigene Datei statt in `analyse-aktionen.ts`.** Diese Datei trägt
 * `'use server'` — dort darf jeder Export nur eine asynchrone Server-Aktion
 * sein, eine reine, synchrone Hilfsfunktion liesse den Bau scheitern.
 */
export function bereitsMenschlichBeschriftet(foto: Fotodaten): boolean {
  const beschreibung = foto.description?.trim()
  if (!beschreibung) return false
  const dateiname = foto.original_name?.trim()
  if (!dateiname) return true
  const ohneEndung = (text: string) => text.replace(/\.[a-z0-9]+$/i, '').toLowerCase()
  return ohneEndung(beschreibung) !== ohneEndung(dateiname)
}
