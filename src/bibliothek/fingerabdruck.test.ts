import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { STANDARD_DATEIEN, parseReferenzdatei, type GeparsterEintrag } from './parser'
import { fingerabdruck } from './schreiben'

const REF = join(process.cwd(), 'skills', 'stellungnahme-erstellen', 'references')

function ladeAlle(): GeparsterEintrag[] {
  return STANDARD_DATEIEN.flatMap((k) =>
    parseReferenzdatei(readFileSync(join(REF, k.datei), 'utf8'), k),
  )
}

describe('fingerabdruck', () => {
  it('ist stabil über wiederholtes Einlesen derselben Datei', () => {
    const erste = ladeAlle().map(fingerabdruck)
    const zweite = ladeAlle().map(fingerabdruck)
    expect(zweite).toEqual(erste)
  })

  it('unterscheidet alle Einträge der Bibliothek voneinander', () => {
    const abdruecke = ladeAlle().map(fingerabdruck)
    expect(new Set(abdruecke).size).toBe(abdruecke.length)
  })

  it('ändert sich, wenn sich der Gegenargument-Text ändert', () => {
    const [eintrag] = ladeAlle()
    const vorher = fingerabdruck(eintrag!)
    const nachher = fingerabdruck({ ...eintrag!, gegenargument: eintrag!.gegenargument + ' Neu.' })
    expect(nachher).not.toBe(vorher)
  })

  it('ändert sich, wenn eine Variante hinzukommt', () => {
    const [eintrag] = ladeAlle()
    const nachher = fingerabdruck({
      ...eintrag!,
      varianten: [...eintrag!.varianten, { bezeichnung: 'Neu', text: 'Text' }],
    })
    expect(nachher).not.toBe(fingerabdruck(eintrag!))
  })

  /*
    Der Grund für die ganze Spalte: ohne sie wurde bei jedem Einlesevorgang
    jeder Eintrag gelöscht und neu angelegt — und fiel damit auf `entwurf`
    zurück. Ein einziger neuer Baustein hätte die Freigabe der gesamten
    Bibliothek gekostet.
  */
  it('bleibt gleich, wenn nur die Reihenfolge der Einträge in der Datei wechselt', () => {
    const alle = ladeAlle()
    const einzeln = alle.map(fingerabdruck)
    const umgedreht = [...alle].reverse().map(fingerabdruck)
    expect([...umgedreht].reverse()).toEqual(einzeln)
  })
})
