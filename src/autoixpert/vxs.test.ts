import { describe, expect, it } from 'vitest'
import { baureiheAusVxs, leseVxs, modellVorschlagAusVxs } from './vxs'

/**
 * Nachgebaut nach der echten VXS des Falls 0926/2081TG (07.09.2026, 412 KB).
 * Die Werte sind die echten - Kennzeichen und VIN sind es nicht, denn eine
 * Fahrgestellnummer eines Unfallgeschaedigten gehoert nicht in ein
 * Repository.
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
