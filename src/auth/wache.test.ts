import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Struktureller Test: **jede** Seite im angemeldeten Bereich muss die
 * Anmeldung selbst verlangen.
 *
 * Hintergrund: die Pruefung stand nur im Layout. Im App Router rendert die
 * Seite gleichzeitig mit dem Layout - sie lud und rendert ihre Daten,
 * bevor die Umleitung griff, und die RSC-Nutzlast ging im Rumpf der
 * 307-Antwort mit hinaus. Am 07.09.2026 liessen sich so ohne jedes Cookie
 * Aktenzeichen, Anspruchsteller und Kennzeichen auslesen.
 *
 * Der wahrscheinlichste Rueckfall ist nicht, dass jemand die Pruefung
 * entfernt - sondern dass eine neue Seite dazukommt und sie vergisst.
 * Genau das faengt dieser Test.
 */

const BEREICH = join(process.cwd(), 'src/app/(app)')

function seitenDateien(ordner: string): string[] {
  const gefunden: string[] = []
  for (const eintrag of readdirSync(ordner)) {
    const pfad = join(ordner, eintrag)
    if (statSync(pfad).isDirectory()) gefunden.push(...seitenDateien(pfad))
    else if (eintrag === 'page.tsx') gefunden.push(pfad)
  }
  return gefunden
}

describe('Anmeldepflicht im geschuetzten Bereich', () => {
  const seiten = seitenDateien(BEREICH)

  it('findet ueberhaupt Seiten', () => {
    expect(seiten.length).toBeGreaterThan(0)
  })

  it.each(seiten.map((p) => [p.replace(process.cwd() + '/', ''), p]))(
    '%s verlangt die Anmeldung',
    (_name, pfad) => {
      expect(readFileSync(pfad, 'utf8')).toContain('verlangeAnmeldung()')
    },
  )

  it.each(seiten.map((p) => [p.replace(process.cwd() + '/', ''), p]))(
    '%s prueft vor dem ersten await',
    (_name, pfad) => {
      const inhalt = readFileSync(pfad, 'utf8')
      const start = inhalt.indexOf('export default async function')
      const rumpf = inhalt.slice(start)
      const ersteWache = rumpf.indexOf('await verlangeAnmeldung()')
      const ersterLadevorgang = rumpf.search(/await\s+(?!verlangeAnmeldung)/)
      // Steht ein anderes `await` davor, koennte es bereits Daten holen.
      expect(ersteWache).toBeGreaterThanOrEqual(0)
      expect(ersteWache).toBeLessThan(ersterLadevorgang === -1 ? Infinity : ersterLadevorgang)
    },
  )
})
