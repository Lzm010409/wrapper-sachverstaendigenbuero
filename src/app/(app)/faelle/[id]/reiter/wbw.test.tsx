import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

// Die Serveraktionen ziehen die Datenbankverbindung nach sich. Im Browser ist
// davon nur ein Verweis; im Test wuerde das echte Modul geladen. Fuer einen
// Rauchtest der Darstellung braucht es beides nicht.
vi.mock('@/wbw/aktionen', () => ({
  starteRecherche: async () => ({ id: 'test' }),
  frageStandAb: async () => null,
}))

const { WbwReiter } = await import('./wbw')
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

/** Mit Anspruchsteller-PLZ - damit stehen alle Pflichtangaben. */
const MIT_PLZ = {
  id: 'x',
  claimant: { zip: '47798' },
  car: {
    make: 'Mercedes-Benz',
    model: 'E Limousine (BM 213)',
    shape: 'sedan',
    performance_kw: 320,
    mileage_meter: 147441,
    first_registration_date: '2018-10-12',
  },
} as unknown as Gutachten

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
      <WbwReiter gutachten={GUTACHTEN} vorschlag={null} kalkulationsstand="ohne_kalkulation" fallId="f1" letzterLauf={null} />,
    )
    expect(html).toContain('keine DAT-Kalkulation')
    // Ohne Vorschlag steht die Baureihe im Modellfeld — zu grob, aber ehrlich.
    expect(html).toContain('E Limousine (BM 213)')
  })

  it('setzt den Untertyp aus der Kalkulation ins Modellfeld', () => {
    const vorschlag = vorschlagAusVxs(GUTACHTEN, leseVxs(VXS))
    const html = renderToStaticMarkup(
      <WbwReiter gutachten={GUTACHTEN} vorschlag={vorschlag} kalkulationsstand="gefunden" fallId="f1" letzterLauf={null} />,
    )
    expect(html).toContain('value="E 53 AMG 4Matic+"')
    // Die Ausstattungslinie ebenfalls.
    expect(html).toContain('value="AMG-Line"')
    // Und die erkannte Sonderausstattung steht in der Soll-Ausstattung.
    expect(html).toContain('AHK')
  })

  it('nennt bei fehlendem Zugang den Grund', () => {
    const html = renderToStaticMarkup(
      <WbwReiter gutachten={GUTACHTEN} vorschlag={null} kalkulationsstand="nicht_eingerichtet" fallId="f1" letzterLauf={null} />,
    )
    expect(html).toContain('AUTOIXPERT_API_TOKEN')
  })
})

describe('Recherche-Knopf', () => {
  it('bietet ihn an, wenn die Pflichtangaben stehen', () => {
    const vorschlag = vorschlagAusVxs(MIT_PLZ, leseVxs(VXS))
    const html = renderToStaticMarkup(
      <WbwReiter
        gutachten={MIT_PLZ}
        vorschlag={vorschlag}
        kalkulationsstand="gefunden"
        fallId="f1"
        letzterLauf={null}
      />,
    )
    expect(html).toContain('Vergleichsfahrzeuge suchen')
    expect(html).toContain('AutoScout24')
    // Ein kostenpflichtiges Portal wird als solches ausgewiesen.
    expect(html).toContain('kostenpflichtig')
  })

  it('sperrt ihn, solange eine Pflichtangabe fehlt', () => {
    const html = renderToStaticMarkup(
      <WbwReiter
        gutachten={GUTACHTEN}
        vorschlag={null}
        kalkulationsstand="ohne_kalkulation"
        fallId="f1"
        letzterLauf={null}
      />,
    )
    // Ohne Anspruchsteller gibt es keine Zentrum-PLZ.
    expect(html).toContain('Zentrum-PLZ')
    expect(html).toContain('disabled')
  })

  it('zeigt den Stand eines frueheren Laufs, ohne dass man ihn neu anstossen muss', () => {
    const html = renderToStaticMarkup(
      <WbwReiter
        gutachten={MIT_PLZ}
        vorschlag={null}
        kalkulationsstand="ohne_kalkulation"
        fallId="f1"
        letzterLauf={{
          id: 'l1',
          fallId: 'f1',
          zustand: 'fertig',
          eingabe: {} as never,
          protokoll: [{ name: 'AutoScout24 durchsuchen', stand: 'fertig', text: '31 Treffer' }],
          ergebnis: {
            wbw: { vorschlagBrutto: 42500, anzahl: 9 },
            statistik: { imKorb: 9 },
            korb: [],
          },
          markenfremd: null,
          fehler: null,
          begonnenAm: '2026-09-07T18:00:00.000Z',
          beendetAm: '2026-09-07T18:06:00.000Z',
        }}
      />,
    )
    expect(html).toContain('AutoScout24 durchsuchen')
    expect(html).toContain('31 Treffer')
    expect(html).toContain('42.500')
  })

  it('nennt einen abgebrochenen Lauf beim Namen', () => {
    const html = renderToStaticMarkup(
      <WbwReiter
        gutachten={MIT_PLZ}
        vorschlag={null}
        kalkulationsstand="ohne_kalkulation"
        fallId="f1"
        letzterLauf={{
          id: 'l2',
          fallId: 'f1',
          zustand: 'fehler',
          eingabe: {} as never,
          protokoll: [],
          ergebnis: null,
          markenfremd: null,
          fehler: 'Kein Portal hat Treffer geliefert.',
          begonnenAm: '2026-09-07T18:00:00.000Z',
          beendetAm: '2026-09-07T18:01:00.000Z',
        }}
      />,
    )
    expect(html).toContain('Abgebrochen')
    expect(html).toContain('Kein Portal hat Treffer geliefert.')
  })
})
