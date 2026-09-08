import { describe, expect, it } from 'vitest'
import { zuFoto } from './ansicht'
import type { Fotodaten } from '@/autoixpert/typen'

/**
 * Die Felder stammen aus der echten Antwort für den Fall 0926/2081TG
 * (08.09.2026, 67 Fotos).
 */
const ECHT: Fotodaten = {
  id: 'kUrhchWbRiCo',
  title: 'IMG_0470.jpeg',
  description: 'Ansicht vorne links',
  original_name: 'IMG_0470.jpeg',
  mimetype: 'image/jpeg',
  size: 3094363,
  height: 2250,
  width: 3000,
  included_in_report: true,
  included_in_residual_value_exchange: true,
  included_in_repair_confirmation: false,
  included_in_expert_statement: false,
  lease_return_item_id: null,
}

describe('Anzeigetitel', () => {
  it('nimmt die Beschreibung, nicht den Dateinamen', () => {
    // autoiXpert setzt als Titel oft den Dateinamen; die Beschreibung trägt
    // die eigentliche Auskunft. „IMG_0470.jpeg" sagt niemandem etwas.
    expect(zuFoto(ECHT).titel).toBe('Ansicht vorne links')
  })

  it('weicht auf den Titel aus, wenn keine Beschreibung da ist', () => {
    expect(zuFoto({ ...ECHT, description: null }).titel).toBe('IMG_0470.jpeg')
  })

  it('weicht weiter auf den Dateinamen aus', () => {
    expect(zuFoto({ ...ECHT, description: null, title: null }).titel).toBe('IMG_0470.jpeg')
  })

  it('lässt niemals einen leeren Titel stehen', () => {
    expect(zuFoto({ id: 'x' }).titel).toBe('ohne Titel')
  })

  it('übergeht Titel aus lauter Leerzeichen', () => {
    expect(zuFoto({ ...ECHT, description: '   ', title: '  ' }).titel).toBe('IMG_0470.jpeg')
  })
})

describe('Verwendung', () => {
  it('liest die vier Häkchen', () => {
    expect(zuFoto(ECHT)).toMatchObject({
      imGutachten: true,
      inRestwertboerse: true,
      inReparaturbestaetigung: false,
      inStellungnahme: false,
    })
  })

  it('nimmt die Voreinstellungen der Schnittstelle, wo nichts steht', () => {
    // Laut Dokumentation: Gutachten und Restwertbörse ja, die anderen nein.
    expect(zuFoto({ id: 'x' })).toMatchObject({
      imGutachten: true,
      inRestwertboerse: true,
      inReparaturbestaetigung: false,
      inStellungnahme: false,
    })
  })
})

describe('Masse', () => {
  it('reicht sie durch, wo sie dastehen', () => {
    expect(zuFoto(ECHT)).toMatchObject({ breite: 3000, hoehe: 2250, bytes: 3094363 })
  })

  it('bleibt bei fehlenden Massen null statt null Pixel', () => {
    // Ältere Bilder haben die Felder nicht. `0 × 0` wäre eine Behauptung.
    const ohne = zuFoto({ id: 'x' })
    expect(ohne.breite).toBeNull()
    expect(ohne.hoehe).toBeNull()
    expect(ohne.bytes).toBeNull()
  })
})
