import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { WbwReiter } from './wbw'
import { leseVxs } from '@/autoixpert/vxs'
import { vorschlagAusVxs } from '@/wbw/vorschlag'
import type { Gutachten } from '@/autoixpert/typen'

/**
 * Ein Rauchtest: der Reiter muss sich zeichnen lassen — mit Vorschlag und
 * ohne. Geprüft wird dabei, dass der Vorschlag wirklich in den Feldern
 * ankommt und nicht bloss danebensteht.
 */

const VXS = `<vxs:Dossiers>
  <vxs:SubModelName>E 53 AMG 4Matic+ (213.061)</vxs:SubModelName>
  <vxs:BaseModelName>E Limousine (BM 213)</vxs:BaseModelName>
  <vxs:GearBoxType>automatic</vxs:GearBoxType>
  <vxs:VehicleDoors>4</vxs:VehicleDoors>
  <vxs:SpecialEquipment>
    <vxs:EquipmentPosition><vxs:Description>Anhängerkupplung (Kugelkopf schwenkbar)</vxs:Description></vxs:EquipmentPosition>
    <vxs:EquipmentPosition><vxs:Description>AMG-Line Exterieur</vxs:Description></vxs:EquipmentPosition>
  </vxs:SpecialEquipment>
</vxs:Dossiers>`

const GUTACHTEN = {
  id: 'x',
  car: {
    make: 'Mercedes-Benz',
    model: 'E Limousine (BM 213)',
    shape: 'sedan',
    performance_kw: 320,
    mileage_meter: 147441,
    first_registration_date: '2018-10-12',
  },
} as unknown as Gutachten

describe('WBW-Reiter', () => {
  it('zeichnet sich ohne Kalkulation und sagt, was fehlt', () => {
    const html = renderToStaticMarkup(
      <WbwReiter gutachten={GUTACHTEN} vorschlag={null} kalkulationsstand="ohne_kalkulation" />,
    )
    expect(html).toContain('keine DAT-Kalkulation')
    // Ohne Vorschlag steht die Baureihe im Modellfeld — zu grob, aber ehrlich.
    expect(html).toContain('E Limousine (BM 213)')
  })

  it('setzt den Untertyp aus der Kalkulation ins Modellfeld', () => {
    const vorschlag = vorschlagAusVxs(GUTACHTEN, leseVxs(VXS))
    const html = renderToStaticMarkup(
      <WbwReiter gutachten={GUTACHTEN} vorschlag={vorschlag} kalkulationsstand="gefunden" />,
    )
    expect(html).toContain('value="E 53 AMG 4Matic+"')
    // Die Ausstattungslinie ebenfalls.
    expect(html).toContain('value="AMG-Line"')
    // Und die erkannte Sonderausstattung steht in der Soll-Ausstattung.
    expect(html).toContain('AHK')
  })

  it('nennt bei fehlendem Zugang den Grund', () => {
    const html = renderToStaticMarkup(
      <WbwReiter gutachten={GUTACHTEN} vorschlag={null} kalkulationsstand="nicht_eingerichtet" />,
    )
    expect(html).toContain('AUTOIXPERT_API_TOKEN')
  })
})
