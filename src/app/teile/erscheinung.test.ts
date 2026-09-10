import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Die drei Farbblöcke müssen dieselben Namen führen.
 *
 * Es gibt sie dreifach: die helle Grundeinstellung, die dunkle über die
 * Systemvorgabe und die dunkle über den Schalter. Fehlt in einem davon ein
 * Wert, fällt stillschweigend die helle Fassung durch — und ein Element
 * leuchtet im dunklen Bild weiss auf. Genau das ist beim Umbau passiert;
 * dieser Test hält es fest.
 */

const CSS = readFileSync(join(process.cwd(), 'src', 'app', 'globals.css'), 'utf8')

function block(anfang: string): string {
  const von = CSS.indexOf(anfang)
  if (von < 0) throw new Error(`Block ${anfang} fehlt`)
  const bis = CSS.indexOf('}', von)
  return CSS.slice(von, bis)
}

function namen(inhalt: string): string[] {
  return [...inhalt.matchAll(/(--[a-z0-9-]+)\s*:/g)].map((t) => t[1]!).sort()
}

describe('Farbblöcke', () => {
  const hell = namen(block(':root {'))
  const systemDunkel = namen(block(":root:not([data-theme='light'])"))
  const schalterDunkel = namen(block(":root[data-theme='dark']"))

  it('hat überhaupt Farben', () => {
    expect(hell.length).toBeGreaterThan(15)
  })

  it('deckt in beiden dunklen Fassungen dieselben Namen ab', () => {
    expect(schalterDunkel).toEqual(systemDunkel)
  })

  it('lässt keinen Farbwert im Dunkeln ungesetzt', () => {
    // Masse und Schriften gelten für beide Erscheinungsbilder und stehen
    // deshalb nur im hellen Block.
    const nurMasse = (n: string) =>
      /^--(sans|serif|mono|radius|radius-klein|schiene-breite|menue-breite)$/.test(n)

    expect(hell.filter((n) => !nurMasse(n) && !systemDunkel.includes(n))).toEqual([])
  })
})
