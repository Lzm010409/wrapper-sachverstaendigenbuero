import { describe, expect, it } from 'vitest'
import { baureiheAusVxs, leseVxs, modellVorschlagAusVxs } from './vxs'

/**
 * Nachgebaut nach der echten VXS des Falls 0926/2081TG (07.09.2026, 412 KB).
 * Die Werte sind die echten - Kennzeichen und VIN sind es nicht, denn eine
 * Fahrgestellnummer eines Unfallgeschaedigten gehoert nicht in ein
 * Repository.
 *
 * Die Ausstattungsbloecke sind gekuerzt: von den 66 Sonder- und 50
 * Serienpositionen stehen hier die, an denen sich etwas entscheidet - jede
 * Erkennungsregel und die Faelle, die NICHT ausloesen duerfen ("Armaturentafel
 * Oberteil Leder Nappa" ist keine Lederausstattung, "Kaeltemittel R 1234 YF"
 * ist kein Merkmal).
 */
const VXS = `<?xml version="1.0" encoding="utf-8"?>
<vxs:Dossiers xmlns:vxs="http://www.dat.de/vxs" source="SD3" type="VehicleRepairOnline">
<vxs:Dossier>
  <vxs:Name>0926/2081TG - 29206</vxs:Name>
  <vxs:DossierId>130655568</vxs:DossierId>
  <vxs:Vehicle>
    <vxs:ManufacturerName>Mercedes-Benz</vxs:ManufacturerName>
    <vxs:BaseModelName>E Limousine (BM 213)</vxs:BaseModelName>
    <vxs:DatBaseModelName>E Limousine (BM 213)(08.2016-&gt;)</vxs:DatBaseModelName>
    <vxs:SubModelName>E 53 AMG 4Matic+ (213.061)</vxs:SubModelName>
    <vxs:ShortName>Model: Limousine AMG E 53 4MATIC+</vxs:ShortName>
    <vxs:DatECode>015700900610001</vxs:DatECode>
    <vxs:VehicleIdentNumber>WDD0000000A000000</vxs:VehicleIdentNumber>
    <vxs:PowerKw>320.0</vxs:PowerKw>
    <vxs:Capacity>2999</vxs:Capacity>
    <vxs:MileageOdometer>147441</vxs:MileageOdometer>
    <vxs:InitialRegistration>2018-10-12+02:00</vxs:InitialRegistration>
    <vxs:GearBoxType>automatic</vxs:GearBoxType>
    <vxs:NrOfGears>9</vxs:NrOfGears>
    <vxs:VehicleDoors>4</vxs:VehicleDoors>
    <vxs:Color>SELENITGRAU - METALLICLACK</vxs:Color>
    <vxs:SpecialEquipment>
      <vxs:EquipmentPosition><vxs:DatEquipmentId>4706</vxs:DatEquipmentId><vxs:Description>Ablage-Paket</vxs:Description></vxs:EquipmentPosition>
      <vxs:EquipmentPosition><vxs:DatEquipmentId>14204</vxs:DatEquipmentId><vxs:Description>Anhängerkupplung (Kugelkopf schwenkbar)</vxs:Description></vxs:EquipmentPosition>
      <vxs:EquipmentPosition><vxs:DatEquipmentId>26088</vxs:DatEquipmentId><vxs:Description>Armaturentafel Oberteil Leder Nappa</vxs:Description></vxs:EquipmentPosition>
      <vxs:EquipmentPosition><vxs:DatEquipmentId>26011</vxs:DatEquipmentId><vxs:Description>Audio-Navigationssystem: COMAND Online</vxs:Description></vxs:EquipmentPosition>
      <vxs:EquipmentPosition><vxs:DatEquipmentId>4110</vxs:DatEquipmentId><vxs:Description>Head-up-Display (Frontsichtanzeige)</vxs:Description></vxs:EquipmentPosition>
      <vxs:EquipmentPosition><vxs:DatEquipmentId>4111</vxs:DatEquipmentId><vxs:Description>Multibeam LED</vxs:Description></vxs:EquipmentPosition>
      <vxs:EquipmentPosition><vxs:DatEquipmentId>4112</vxs:DatEquipmentId><vxs:Description>Panorama-Schiebedach elektrisch (vollverglaste Dachfläche)</vxs:Description></vxs:EquipmentPosition>
      <vxs:EquipmentPosition><vxs:DatEquipmentId>4113</vxs:DatEquipmentId><vxs:Description>Sitzheizung vorn</vxs:Description></vxs:EquipmentPosition>
      <vxs:EquipmentPosition><vxs:DatEquipmentId>4114</vxs:DatEquipmentId><vxs:Description>Sitzbezug / Polsterung: Leder</vxs:Description></vxs:EquipmentPosition>
      <vxs:EquipmentPosition><vxs:DatEquipmentId>4115</vxs:DatEquipmentId><vxs:Description>Tempomat mit Abstandsregelung / Distronic Plus mit Stop&amp;Go-Funktion</vxs:Description></vxs:EquipmentPosition>
      <vxs:EquipmentPosition><vxs:DatEquipmentId>4116</vxs:DatEquipmentId><vxs:Description>Kältemittel R 1234 YF</vxs:Description></vxs:EquipmentPosition>
      <vxs:EquipmentPosition><vxs:DatEquipmentId>4117</vxs:DatEquipmentId><vxs:Description>Lenkrad (AMG Performance, Dinamica)</vxs:Description></vxs:EquipmentPosition>
    </vxs:SpecialEquipment>
    <vxs:SeriesEquipment>
      <vxs:EquipmentPosition><vxs:DatEquipmentId>26910</vxs:DatEquipmentId><vxs:Description>Airbag Beifahrerseite abschaltbar</vxs:Description></vxs:EquipmentPosition>
      <vxs:EquipmentPosition><vxs:DatEquipmentId>26803</vxs:DatEquipmentId><vxs:Description>Klimaautomatik (Thermatic 2-Zonen)</vxs:Description></vxs:EquipmentPosition>
      <vxs:EquipmentPosition><vxs:DatEquipmentId>26804</vxs:DatEquipmentId><vxs:Description>Fahrzeuge mit 4-Matic / Allradantrieb</vxs:Description></vxs:EquipmentPosition>
      <vxs:EquipmentPosition><vxs:DatEquipmentId>26805</vxs:DatEquipmentId><vxs:Description>LM-Felgen</vxs:Description></vxs:EquipmentPosition>
      <vxs:EquipmentPosition><vxs:DatEquipmentId>26806</vxs:DatEquipmentId><vxs:Description>Fensterheber elektrisch vorn + hinten</vxs:Description></vxs:EquipmentPosition>
      <vxs:EquipmentPosition><vxs:DatEquipmentId>26807</vxs:DatEquipmentId><vxs:Description>Sitzheizung vorn</vxs:Description></vxs:EquipmentPosition>
      <vxs:EquipmentPosition><vxs:DatEquipmentId>26808</vxs:DatEquipmentId><vxs:Description>Getriebe Automatik - (9-Stufen)</vxs:Description></vxs:EquipmentPosition>
    </vxs:SeriesEquipment>
    <vxs:DeselectedSeriesEquipment>
      <vxs:EquipmentPosition><vxs:DatEquipmentId>26809</vxs:DatEquipmentId><vxs:Description>Sitz-Komfort-Paket</vxs:Description></vxs:EquipmentPosition>
    </vxs:DeselectedSeriesEquipment>
  </vxs:Vehicle>
  <vxs:Calculation>
    <vxs:TotalNetCosts>8490.71</vxs:TotalNetCosts>
    <vxs:TotalNetCorrected>8490.71</vxs:TotalNetCorrected>
    <vxs:TotalGrossCosts>10103.94</vxs:TotalGrossCosts>
    <vxs:TotalGrossCorrected>10103.94</vxs:TotalGrossCorrected>
    <vxs:TotalWages>1991.64</vxs:TotalWages>
    <vxs:SumMaterialCorrected>674.39</vxs:SumMaterialCorrected>
    <vxs:SumMiscellaneousCosts>296.47</vxs:SumMiscellaneousCosts>
    <vxs:TotalVATCorrected>1613.23</vxs:TotalVATCorrected>
  </vxs:Calculation>
</vxs:Dossier>
</vxs:Dossiers>`

describe('leseVxs', () => {
  const daten = leseVxs(VXS)

  it('liest die Fahrzeugbezeichnung, die das Gutachten-Objekt nicht hat', () => {
    expect(daten.fahrzeug.hersteller).toBe('Mercedes-Benz')
    expect(daten.fahrzeug.basismodell).toBe('E Limousine (BM 213)')
    // Genau der Wert, der ueber die Schnittstelle nicht zu bekommen ist.
    expect(daten.fahrzeug.untertyp).toBe('E 53 AMG 4Matic+ (213.061)')
    expect(daten.fahrzeug.datECode).toBe('015700900610001')
  })

  it('liest die Kalkulationssummen', () => {
    // Dieselben Zahlen wie in der autoiXpert-Maske.
    expect(daten.kalkulation.reparaturkostenNetto).toBe(8490.71)
    expect(daten.kalkulation.reparaturkostenBrutto).toBe(10103.94)
    expect(daten.kalkulation.lohn).toBe(1991.64)
    expect(daten.kalkulation.lackmaterial).toBe(674.39)
    expect(daten.kalkulation.nebenkosten).toBe(296.47)
    expect(daten.kalkulation.mehrwertsteuer).toBe(1613.23)
  })

  it('unterscheidet "nicht kalkuliert" von "null Euro"', () => {
    const leer = leseVxs('<vxs:Dossiers></vxs:Dossiers>')
    expect(leer.kalkulation.reparaturkostenNetto).toBeNull()
    expect(leer.fahrzeug.untertyp).toBeNull()
  })

  it('loest XML-Entitaeten auf', () => {
    const d = leseVxs('<vxs:BaseModelName>E Limousine (BM 213)(08.2016-&gt;)</vxs:BaseModelName>')
    expect(d.fahrzeug.basismodell).toBe('E Limousine (BM 213)(08.2016->)')
  })

  it('nimmt die korrigierte Fassung, wo sie abweicht', () => {
    const d = leseVxs(
      '<vxs:TotalNetCosts>1000.00</vxs:TotalNetCosts><vxs:TotalNetCorrected>900.00</vxs:TotalNetCorrected>',
    )
    expect(d.kalkulation.reparaturkostenNetto).toBe(900)
  })
})

describe('modellVorschlagAusVxs', () => {
  it('macht aus dem Untertyp einen Suchbegriff ohne Baumusterschluessel', () => {
    expect(modellVorschlagAusVxs(leseVxs(VXS))).toBe('E 53 AMG 4Matic+')
  })

  it('gibt nichts zurueck, wenn kein Untertyp da ist', () => {
    expect(modellVorschlagAusVxs(leseVxs('<vxs:Dossiers/>'))).toBeNull()
  })
})

describe('baureiheAusVxs', () => {
  it('macht aus der DAT-Baureihe die Baureihe der Portale', () => {
    expect(baureiheAusVxs(leseVxs(VXS))).toBe('E-Klasse')
  })

  it('erkennt auch andere Bauformen derselben Schreibweise', () => {
    const t = (name: string) =>
      baureiheAusVxs(leseVxs(`<vxs:BaseModelName>${name}</vxs:BaseModelName>`))
    expect(t('C T-Modell (BM 205)')).toBe('C-Klasse')
    expect(t('A Limousine (BM 177)')).toBe('A-Klasse')
  })

  it('raet nicht, wo das Muster nicht passt', () => {
    // "G (BM 465)" traegt keine Bauform - daraus wird keine Klasse erfunden.
    const t = baureiheAusVxs(leseVxs('<vxs:BaseModelName>G (BM 465)</vxs:BaseModelName>'))
    expect(t).toBe('G')
  })
})

describe('Fahrzeugdaten, die das Gutachten-Objekt nicht fuehrt', () => {
  const f = leseVxs(VXS).fahrzeug

  it('liest Leistung, Laufleistung und Erstzulassung', () => {
    expect(f.leistungKw).toBe(320)
    expect(f.laufleistung).toBe(147441)
    // DAT haengt den Zeitzonenversatz an: `2018-10-12+02:00`.
    expect(f.erstzulassung).toBe('2018-10-12')
  })

  it('liest Getriebe, Gaenge und Tueren - im Gutachten steht dazu nichts', () => {
    expect(f.getriebe).toBe('automatic')
    expect(f.gaenge).toBe(9)
    expect(f.tueren).toBe(4)
  })

  it('liest Farbe und Hubraum', () => {
    expect(f.farbe).toBe('SELENITGRAU - METALLICLACK')
    expect(f.hubraum).toBe(2999)
  })
})

describe('Ausstattung', () => {
  const a = leseVxs(VXS).ausstattung

  it('trennt Sonder-, Serien- und abgewaehlte Ausstattung', () => {
    expect(a.sonderausstattung).toContain('Anhängerkupplung (Kugelkopf schwenkbar)')
    expect(a.serienausstattung).toContain('Klimaautomatik (Thermatic 2-Zonen)')
    expect(a.abgewaehlt).toEqual(['Sitz-Komfort-Paket'])
  })

  it('loest Entitaeten auf', () => {
    expect(a.sonderausstattung).toContain(
      'Tempomat mit Abstandsregelung / Distronic Plus mit Stop&Go-Funktion',
    )
  })

  it('bleibt leer, wo keine Ausstattung steht', () => {
    const leer = leseVxs('<vxs:Dossiers/>').ausstattung
    expect(leer.sonderausstattung).toEqual([])
    expect(leer.serienausstattung).toEqual([])
  })
})
