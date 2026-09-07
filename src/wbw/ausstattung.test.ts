import { describe, expect, it } from 'vitest'
import { ausstattungAusVxs } from './ausstattung'
import type { VxsDaten } from '@/autoixpert/vxs'

/**
 * Die Zeilen stammen wörtlich aus der DAT-Kalkulation des Falls 0926/2081TG.
 * Geprüft wird beides: dass die Merkmale erkannt werden — und dass die
 * Zeilen, die **keins** sind, auch keins auslösen.
 */
function daten(sonder: string[], serie: string[] = []): VxsDaten {
  return {
    bezeichnung: null,
    fahrzeug: {
      hersteller: null, basismodell: null, untertyp: null, kurzname: null,
      datECode: null, vin: null, leistungKw: null, laufleistung: null,
      erstzulassung: null, getriebe: null, gaenge: null, tueren: null,
      farbe: null, hubraum: null,
    },
    kalkulation: {
      reparaturkostenNetto: null, reparaturkostenBrutto: null, lohn: null,
      lackmaterial: null, nebenkosten: null, mehrwertsteuer: null,
    },
    ausstattung: { sonderausstattung: sonder, serienausstattung: serie, abgewaehlt: [] },
  }
}

const merkmale = (zeilen: string[]) => ausstattungAusVxs(daten(zeilen)).sonder.map((m) => m.merkmal)

describe('Merkmale aus den DAT-Zeilen', () => {
  it.each([
    ['Anhängerkupplung (Kugelkopf schwenkbar)', 'AHK'],
    ['Audio-Navigationssystem: COMAND Online', 'Navigationssystem'],
    ['Panorama-Schiebedach elektrisch (vollverglaste Dachfläche)', 'Panoramadach'],
    ['Sitzheizung vorn', 'Sitzheizung'],
    ['Sitzbezug / Polsterung: Leder', 'Lederausstattung'],
    ['Multibeam LED', 'LED-Scheinwerfer'],
    ['Head-up-Display (Frontsichtanzeige)', 'Head-Up-Display'],
    ['Tempomat mit Abstandsregelung / Distronic Plus mit Stop&Go-Funktion', 'ACC'],
    ['Fahrassistenz-System: aktiver Park-Assistent', 'Einparkhilfe'],
    ['Kamerasystem 360 Grad', 'Rückfahrkamera'],
    ['Fernbedienung für Standheizung / Zusatzheizung', 'Standheizung'],
    ['Smartphone integriert', 'CarPlay'],
    ['Klimaautomatik (Thermatic 2-Zonen)', 'Klimaautomatik'],
    ['Fahrzeuge mit 4-Matic / Allradantrieb', 'Allrad'],
    ['LM-Felgen', 'Alufelgen'],
    ['Fensterheber elektrisch vorn + hinten', 'Elektrische Fensterheber'],
    ['Isofix-Aufnahmen für Kindersitz an Rücksitz', 'Isofix'],
  ])('%s → %s', (zeile, erwartet) => {
    expect(merkmale([zeile])).toContain(erwartet)
  })
})

describe('Was kein Merkmal ist, wird auch keins', () => {
  it('erkennt Leder am Armaturenbrett nicht als Lederausstattung', () => {
    // Das Plugin schliesst aus denselben Gründen `lederlenkrad` aus.
    expect(merkmale(['Armaturentafel Oberteil Leder Nappa'])).not.toContain('Lederausstattung')
    expect(merkmale(['Lenkrad (Leder Nappa)'])).not.toContain('Lederausstattung')
  })

  it('erkennt Ledernachbildung nicht als Leder', () => {
    expect(
      merkmale(['Sitzbezug / Polsterung: Ledernachbildung Artico / Dinamica']),
    ).not.toContain('Lederausstattung')
  })

  it('lässt ein Panoramadach nicht auch als Schiebedach gelten', () => {
    const m = merkmale(['Panorama-Schiebedach elektrisch (vollverglaste Dachfläche)'])
    expect(m).toContain('Panoramadach')
    expect(m).not.toContain('Schiebedach')
  })

  it('zählt einen Abstandstempomat als ACC, nicht zusätzlich als Tempomat', () => {
    const m = merkmale(['Tempomat mit Abstandsregelung / Distronic Plus mit Stop&Go-Funktion'])
    expect(m).toContain('ACC')
    expect(m).not.toContain('Tempomat')
  })

  it('hält eine Vorrüstung für keine Ausstattung', () => {
    expect(merkmale(['Vorrüstung Entertainment-System im Fond'])).toEqual([])
    expect(merkmale(['Kommunikationsmodul (LTE) Vorbereitung Mercedes me connect'])).toEqual([])
  })

  it('erkennt LED-Ambientelicht nicht als LED-Scheinwerfer', () => {
    expect(merkmale(['Ambiente-Beleuchtung'])).not.toContain('LED-Scheinwerfer')
  })

  it('lässt belanglose Zeilen weg — der Vorschlag soll kurz sein', () => {
    expect(merkmale(['Kältemittel R 1234 YF', 'Einstiegsleisten beleuchtet', 'Ablage-Paket'])).toEqual([])
  })
})

describe('Sonder- und Serienausstattung', () => {
  it('zählt ein Merkmal, das in beiden Listen steht, nur als Sonderausstattung', () => {
    // `Sitzheizung vorn` steht im echten Fall in beiden Listen.
    const v = ausstattungAusVxs(daten(['Sitzheizung vorn'], ['Sitzheizung vorn']))
    expect(v.sonder.map((m) => m.merkmal)).toEqual(['Sitzheizung'])
    expect(v.serie.map((m) => m.merkmal)).toEqual([])
  })

  it('belegt jedes Merkmal mit der Zeile, aus der es stammt', () => {
    const v = ausstattungAusVxs(daten(['Multibeam LED']))
    expect(v.sonder[0]).toEqual({
      merkmal: 'LED-Scheinwerfer',
      quelle: 'sonder',
      beleg: 'Multibeam LED',
    })
  })

  it('nennt, wie viele Zeilen gelesen wurden', () => {
    const v = ausstattungAusVxs(daten(['a', 'b', 'c'], ['d']))
    expect(v.gelesen).toEqual({ sonder: 3, serie: 1 })
  })
})
