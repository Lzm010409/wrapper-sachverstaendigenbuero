import { describe, expect, it } from 'vitest'
import {
  adressschluessel,
  planeSchritte,
  probeschritt,
  type Anhang,
  type Kontaktanhaenge,
} from './plan'

function kontakt(id: string, mehr: Partial<Kontaktanhaenge> = {}): Kontaktanhaenge {
  return { kontaktId: id, anzeige: `Kontakt ${id}`, anhaenge: [], adressen: [], wege: [], ...mehr }
}

function rechnung(id: string, festgeschrieben = false): Anhang {
  return { art: 'Invoice', id, bezeichnung: `0926/${id}TG01`, festgeschrieben }
}

describe('planeSchritte', () => {
  it('hängt jede Rechnung um und löscht den dann leeren Verlierer', () => {
    const plan = planeSchritte(kontakt('sieger'), [
      kontakt('verlierer', { anhaenge: [rechnung('1'), rechnung('2')] }),
    ])

    expect(plan.schritte.map((s) => s.art)).toEqual(['umhaengen', 'umhaengen', 'loeschen'])
    expect(plan.voraussichtlichLeer).toEqual(['verlierer'])
    expect(plan.bleibenStehen).toEqual([])
  })

  it('löscht nicht, wenn etwas festgeschrieben ist — der Verlierer wird markiert', () => {
    const plan = planeSchritte(kontakt('sieger'), [
      kontakt('verlierer', { anhaenge: [rechnung('1'), rechnung('2', true)] }),
    ])

    expect(plan.schritte.at(-1)?.art).toBe('markieren')
    expect(plan.bleibenStehen).toEqual(['verlierer'])
    expect(plan.voraussichtlichLeer).toEqual([])
  })

  it('versucht das Umhängen auch bei einer festgeschriebenen Rechnung — mit Vorbehalt', () => {
    // Ausschliessen wäre eine Annahme; versuchen und nachsehen ist eine Auskunft.
    const plan = planeSchritte(kontakt('sieger'), [
      kontakt('verlierer', { anhaenge: [rechnung('1', true)] }),
    ])

    const umhaengen = plan.schritte.find((s) => s.art === 'umhaengen')
    expect(umhaengen).toBeDefined()
    expect(umhaengen?.vorbehalt).toContain('festgeschrieben')
  })

  it('räumt erst um und fasst den Verlierer danach an', () => {
    // Andersherum stünde am Ende eine Rechnung ohne Kontakt.
    const plan = planeSchritte(kontakt('sieger'), [
      kontakt('verlierer', { anhaenge: [rechnung('1')] }),
    ])
    const letzter = plan.schritte.length - 1
    expect(plan.schritte.findIndex((s) => s.art === 'umhaengen')).toBeLessThan(letzter)
  })

  it('hängt nur Anschriften um, die der Sieger noch nicht hat', () => {
    const plan = planeSchritte(
      kontakt('sieger', {
        adressen: [{ id: 'a', strasse: 'Ruwerstr. 7a', plz: '41464', ort: 'Neuss' }],
      }),
      [
        kontakt('verlierer', {
          adressen: [
            // Dieselbe Anschrift, anders geschrieben — beide stehen so im Konto.
            { id: 'b', strasse: 'Ruwerstraße 7a', plz: '41464', ort: 'Neuss' },
            { id: 'c', strasse: 'Lagerweg 7', plz: '41464', ort: 'Neuss' },
          ],
        }),
      ],
    )

    const adressen = plan.schritte.filter((s) => s.objektArt === 'ContactAddress')
    expect(adressen).toHaveLength(1)
    expect(adressen[0]?.bezeichnung).toContain('Lagerweg 7')
  })

  it('lässt sich von einem abgekürzten Ortsnamen nicht täuschen', () => {
    // Im Konto: „40589 Düsseldorf" beim Sieger, „40589 Ddorf" beim Verlierer.
    const plan = planeSchritte(
      kontakt('sieger', {
        adressen: [{ id: 'a', strasse: 'Henkelstr. 164', plz: '40589', ort: 'Düsseldorf' }],
      }),
      [
        kontakt('verlierer', {
          adressen: [{ id: 'b', strasse: 'Henkelstr. 164', plz: '40589', ort: 'Ddorf' }],
        }),
      ],
    )

    expect(plan.schritte.filter((s) => s.objektArt === 'ContactAddress')).toHaveLength(0)
  })

  it('lässt leere Anschriften liegen', () => {
    // Auch die stehen im Konto — als Zeile ohne Strasse, Postleitzahl und Ort.
    const plan = planeSchritte(kontakt('sieger'), [
      kontakt('verlierer', { adressen: [{ id: 'b', strasse: null, plz: null, ort: null }] }),
    ])

    expect(plan.schritte.filter((s) => s.objektArt === 'ContactAddress')).toHaveLength(0)
  })

  it('hängt keinen Kommunikationsweg um, den der Sieger schon kennt', () => {
    const plan = planeSchritte(
      kontakt('sieger', { wege: [{ id: 'a', typ: 'EMAIL', wert: 'Info@Firma.de' }] }),
      [
        kontakt('verlierer', {
          wege: [
            { id: 'b', typ: 'EMAIL', wert: 'info@firma.de' },
            { id: 'c', typ: 'PHONE', wert: '02131 12345' },
          ],
        }),
      ],
    )

    const wege = plan.schritte.filter((s) => s.objektArt === 'CommunicationWay')
    expect(wege).toHaveLength(1)
    expect(wege[0]?.bezeichnung).toContain('PHONE')
  })

  it('hängt eine Anschrift nur einmal um, auch wenn zwei Verlierer sie tragen', () => {
    const adresse = { id: 'x', strasse: 'Lagerweg 7', plz: '41464', ort: 'Neuss' }
    const plan = planeSchritte(kontakt('sieger'), [
      kontakt('v1', { adressen: [adresse] }),
      kontakt('v2', { adressen: [{ ...adresse, id: 'y' }] }),
    ])

    expect(plan.schritte.filter((s) => s.objektArt === 'ContactAddress')).toHaveLength(1)
  })

  it('kommt mit mehreren Verlierern zurecht', () => {
    const plan = planeSchritte(kontakt('sieger'), [
      kontakt('leer'),
      kontakt('voll', { anhaenge: [rechnung('1', true)] }),
    ])

    expect(plan.voraussichtlichLeer).toEqual(['leer'])
    expect(plan.bleibenStehen).toEqual(['voll'])
  })
})

describe('probeschritt', () => {
  it('nimmt die erste Rechnung ohne Vorbehalt als Probe', () => {
    const plan = planeSchritte(kontakt('sieger'), [
      kontakt('verlierer', { anhaenge: [rechnung('1', true), rechnung('2')] }),
    ])

    expect(probeschritt(plan)?.objektId).toBe('2')
  })

  it('gibt nichts zurück, wenn es nichts zu proben gibt', () => {
    const plan = planeSchritte(kontakt('sieger'), [kontakt('leer')])
    expect(probeschritt(plan)).toBeNull()
  })

  it('nimmt keine Anschrift als Probe — die Frage ist, ob ein Beleg wandert', () => {
    const plan = planeSchritte(kontakt('sieger'), [
      kontakt('verlierer', {
        adressen: [{ id: 'a', strasse: 'Lagerweg 7', plz: '41464', ort: 'Neuss' }],
      }),
    ])

    expect(probeschritt(plan)).toBeNull()
  })
})

describe('adressschluessel', () => {
  const adresse = (strasse: string, plz: string) => ({ id: 'x', strasse, plz, ort: null })

  it('schreibt die Abkürzung am Wortende aus', () => {
    // Deutsche Strassennamen sind zusammengesetzt: in „Ruwerstr." steht vor
    // dem „str" ein Buchstabe, eine Wortgrenze davor gibt es nicht.
    expect(adressschluessel(adresse('Ruwerstr. 7a', '41464'))).toBe(
      adressschluessel(adresse('Ruwerstraße 7a', '41464')),
    )
  })

  it('hält verschiedene Hausnummern auseinander', () => {
    expect(adressschluessel(adresse('Veilchenstraße 8', '41466'))).not.toBe(
      adressschluessel(adresse('Veilchenstraße 8a', '41466')),
    )
  })

  it('verträgt doppelte Leerzeichen', () => {
    expect(adressschluessel(adresse('Veilchenstraße   8', '41466'))).toBe(
      adressschluessel(adresse('Veilchenstraße 8', '41466')),
    )
  })

  it('unterscheidet nach Postleitzahl', () => {
    expect(adressschluessel(adresse('Hauptstraße 1', '41464'))).not.toBe(
      adressschluessel(adresse('Hauptstraße 1', '40219')),
    )
  })
})
