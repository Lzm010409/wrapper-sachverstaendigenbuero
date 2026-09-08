import { describe, expect, it } from 'vitest'
import { hatRecht, rechteVon } from './pruefen'
import { RECHTE, ROLLENRECHTE } from './katalog'

/**
 * Der Kern des Modells: die Rolle ist die Voreinstellung, die ausdrückliche
 * Entscheidung schlägt sie — in **beide** Richtungen.
 */

describe('Rollen bringen einen Satz mit', () => {
  it('gibt dem Ersteller nichts Unwiederbringliches und nichts Kostenpflichtiges', () => {
    expect(rechteVon('ersteller').size).toBe(0)
  })

  it('gibt dem Freigeber die Freigabe, den Versand und das Löschen', () => {
    const satz = rechteVon('freigeber')
    expect(satz.has('bibliothek.freigeben')).toBe(true)
    expect(satz.has('versand.vermerken')).toBe(true)
    expect(satz.has('stellungnahme.loeschen')).toBe(true)
  })

  it('gibt dem Freigeber aber nicht die Benutzerverwaltung', () => {
    expect(rechteVon('freigeber').has('benutzer.verwalten')).toBe(false)
  })

  it('gibt der Administration alles aus dem Katalog', () => {
    expect(rechteVon('admin').size).toBe(RECHTE.length)
  })
})

describe('Abweichungen schlagen die Rolle', () => {
  it('gibt einem Ersteller ausnahmsweise die Freigabe', () => {
    const satz = rechteVon('ersteller', [{ recht: 'bibliothek.freigeben', gewaehrt: true }])
    expect(satz.has('bibliothek.freigeben')).toBe(true)
  })

  it('nimmt einem Freigeber das Löschen wieder ab', () => {
    // Der Fall, den eine reine Zuteilungsliste nicht abbilden könnte.
    const satz = rechteVon('freigeber', [{ recht: 'stellungnahme.loeschen', gewaehrt: false }])
    expect(satz.has('stellungnahme.loeschen')).toBe(false)
    expect(satz.has('bibliothek.freigeben')).toBe(true)
  })

  it('nimmt auch der Administration etwas ab, wenn es ausdrücklich dasteht', () => {
    const satz = rechteVon('admin', [{ recht: 'wbw.kostenpflichtig', gewaehrt: false }])
    expect(satz.has('wbw.kostenpflichtig')).toBe(false)
    expect(satz.has('benutzer.verwalten')).toBe(true)
  })

  it('übergeht ein Recht, das es nicht mehr gibt', () => {
    // Entsteht, wenn ein Recht aus dem Katalog verschwindet, während in der
    // Datenbank noch Zeilen dazu stehen.
    expect(() => rechteVon('ersteller', [{ recht: 'gibt.es.nicht', gewaehrt: true }])).not.toThrow()
    expect(rechteVon('ersteller', [{ recht: 'gibt.es.nicht', gewaehrt: true }]).size).toBe(0)
  })
})

describe('hatRecht', () => {
  it('antwortet für jedes Recht des Katalogs', () => {
    for (const recht of RECHTE) {
      expect(typeof hatRecht('admin', [], recht)).toBe('boolean')
    }
  })

  it('ist für den Ersteller durchweg nein', () => {
    for (const recht of RECHTE) {
      expect(hatRecht('ersteller', [], recht)).toBe(false)
    }
  })
})

describe('Der Katalog selbst', () => {
  it('führt jede Rolle', () => {
    expect(Object.keys(ROLLENRECHTE).sort()).toEqual(['admin', 'ersteller', 'freigeber'])
  })

  it('vergibt in den Rollen nur Rechte, die es gibt', () => {
    for (const [rolle, rechte] of Object.entries(ROLLENRECHTE)) {
      for (const r of rechte) {
        expect(RECHTE, `${rolle} führt ${r}`).toContain(r)
      }
    }
  })
})
