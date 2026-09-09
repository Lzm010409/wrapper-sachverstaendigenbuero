import { describe, expect, it } from 'vitest'
import { getriebeAusDat, vorschlagAusVxs } from './vorschlag'
import { leseVxs } from '@/autoixpert/vxs'
import type { Gutachten } from '@/autoixpert/typen'

const VXS = `<vxs:Dossiers>
  <vxs:ManufacturerName>Mercedes-Benz</vxs:ManufacturerName>
  <vxs:BaseModelName>E Limousine (BM 213)</vxs:BaseModelName>
  <vxs:SubModelName>E 53 AMG 4Matic+ (213.061)</vxs:SubModelName>
  <vxs:PowerKw>320.0</vxs:PowerKw>
  <vxs:MileageOdometer>147441</vxs:MileageOdometer>
  <vxs:InitialRegistration>2018-10-12+02:00</vxs:InitialRegistration>
  <vxs:GearBoxType>automatic</vxs:GearBoxType>
  <vxs:VehicleDoors>4</vxs:VehicleDoors>
  <vxs:Color>SELENITGRAU - METALLICLACK</vxs:Color>
  <vxs:SpecialEquipment>
    <vxs:EquipmentPosition><vxs:Description>Anhängerkupplung (Kugelkopf schwenkbar)</vxs:Description></vxs:EquipmentPosition>
  </vxs:SpecialEquipment>
</vxs:Dossiers>`

function gutachten(car: Record<string, unknown>): Gutachten {
  return { id: 'x', car } as unknown as Gutachten
}

const ECHT = {
  make: 'Mercedes-Benz',
  model: 'E Limousine (BM 213)',
  shape: 'sedan',
  performance_kw: 320,
  mileage_meter: 147441,
  first_registration_date: '2018-10-12',
}

describe('vorschlagAusVxs', () => {
  const v = vorschlagAusVxs(gutachten(ECHT), leseVxs(VXS))

  it('nimmt das Modell aus der DAT — das Gutachten führt nur die Baureihe', () => {
    // `E Limousine (BM 213)` als Suchbegriff mischt 143-kW-Diesel mit einem
    // 320-kW-AMG. Genau das soll der Untertyp verhindern.
    expect(v.modell).toEqual({
      wert: 'E 53 AMG 4Matic+',
      quelle: 'dat',
      beleg: 'E 53 AMG 4Matic+ (213.061)',
    })
  })

  it('liefert daneben die Baureihe für Portale ohne Motorvarianten', () => {
    expect(v.baureihe).toBe('E-Klasse')
  })

  it('nimmt Getriebe und Türen aus der DAT — dazu schweigt das Gutachten', () => {
    expect(v.getriebe).toEqual({ wert: 'Automatik', quelle: 'dat', beleg: 'automatic' })
    expect(v.tueren?.wert).toBe(4)
  })

  it('lässt dem Gutachten den Vorrang, wo es etwas weiss', () => {
    expect(v.leistungKw).toEqual({ wert: 320, quelle: 'gutachten' })
    expect(v.laufleistung?.quelle).toBe('gutachten')
    expect(v.ez).toEqual({ wert: '10/2018', quelle: 'gutachten' })
  })

  it('nimmt die Bauart aus dem Gutachten, nicht aus der Kalkulation', () => {
    expect(v.bauart).toBe('Limousine')
  })

  it('schlägt die Ausstattung vor', () => {
    expect(v.ausstattung.sonder.map((m) => m.merkmal)).toEqual(['AHK'])
  })

  it('meldet keine Abweichung, wo beide dasselbe sagen', () => {
    expect(v.abweichungen).toEqual([])
  })
})

describe('Abweichungen', () => {
  it('nennt sie, statt sich für eine Zahl zu entscheiden', () => {
    // Die Kalkulation kann aelter sein als die Besichtigung.
    const v = vorschlagAusVxs(gutachten({ ...ECHT, mileage_meter: 151000 }), leseVxs(VXS))
    expect(v.abweichungen).toEqual([
      { feld: 'Laufleistung', ausGutachten: '151.000 km', ausDat: '147.441 km' },
    ])
    // Der Wert des Gutachtens gilt trotzdem.
    expect(v.laufleistung).toEqual({ wert: 151000, quelle: 'gutachten' })
  })

  it('weicht auf die DAT aus, wo das Gutachten schweigt', () => {
    const v = vorschlagAusVxs(gutachten({ make: 'Mercedes-Benz' }), leseVxs(VXS))
    expect(v.leistungKw).toEqual({ wert: 320, quelle: 'dat', beleg: '320 kW' })
    expect(v.laufleistung?.quelle).toBe('dat')
    expect(v.ez).toEqual({ wert: '10/2018', quelle: 'dat', beleg: '10/2018' })
    expect(v.abweichungen).toEqual([])
  })
})

describe('getriebeAusDat', () => {
  it('übersetzt die Schreibweisen der DAT', () => {
    expect(getriebeAusDat('automatic')).toBe('Automatik')
    expect(getriebeAusDat('manual')).toBe('Manuell')
  })

  it('rät nicht', () => {
    expect(getriebeAusDat('cvt')).toBeNull()
    expect(getriebeAusDat(null)).toBeNull()
  })
})

/*
  Der Sharan-Fall vom 08.09.2026. Die DAT lieferte als Untertyp „Highline BMT"
  — die Ausstattungslinie samt Effizienzzusatz, kein Fahrzeug. Als Suchbegriff
  kostete das AutoScout24 vollständig: unbekannter Name, Suche über die ganze
  Marke, null Treffer in beiden Zyklen.
*/
const VXS_SHARAN = `<vxs:Dossiers>
  <vxs:ManufacturerName>Volkswagen</vxs:ManufacturerName>
  <vxs:BaseModelName>Sharan (7N1)(05.2010->2015)</vxs:BaseModelName>
  <vxs:SubModelName>Highline BMT</vxs:SubModelName>
  <vxs:PowerKw>110.0</vxs:PowerKw>
  <vxs:MileageOdometer>162390</vxs:MileageOdometer>
  <vxs:InitialRegistration>2010-12-01+01:00</vxs:InitialRegistration>
  <vxs:GearBoxType>manual</vxs:GearBoxType>
  <vxs:VehicleDoors>5</vxs:VehicleDoors>
  <vxs:Color>Toffeebraun Metallic</vxs:Color>
</vxs:Dossiers>`

describe('vorschlagAusVxs — Linie statt Modell im Untertyp', () => {
  const v = vorschlagAusVxs(
    gutachten({
      make: 'Volkswagen',
      model: 'Sharan (7N1)(05.2010->2015)',
      shape: 'van',
      performance_kw: 110,
      mileage_meter: 162390,
      first_registration_date: '2010-12-01',
    }),
    leseVxs(VXS_SHARAN),
  )

  it('fällt auf die Baureihe zurück, wenn nur eine Linie im Untertyp steht', () => {
    // „Sharan (7N1)" löst AutoScout24 über den längsten Wortpräfix zu „Sharan"
    // auf — „Highline BMT" liess es unter 119 VW-Modellen fallen.
    expect(v.modell?.wert).toBe('Sharan (7N1)')
    expect(v.baureihe).toBe('Sharan (7N1)')
  })

  it('zeigt weiter, was die DAT geschrieben hat', () => {
    // Sonst sähe niemand, dass der Suchbegriff nicht aus der Kalkulation kommt.
    expect(v.modell?.beleg).toBe('Highline BMT')
  })

  it('schreibt die Linie ins Variantenfeld, wo sie den Korb filtert', () => {
    expect(v.linie).toBe('Highline')
  })

  it('behält die Bauart aus dem Gutachten', () => {
    expect(v.bauart).toBe('Van')
  })
})
