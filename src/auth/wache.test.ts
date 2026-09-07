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
const ROUTEN = join(process.cwd(), 'src/app/api')

/**
 * Routen, die bewusst ohne Anmeldung erreichbar sind — jede mit dem Grund.
 * Wer eine neue Route hinzufuegt, muss sie entweder pruefen lassen oder hier
 * begruenden; stillschweigend offen bleibt keine.
 */
const OFFEN: Record<string, string> = {
  'api/gesundheit/route.ts': 'Zustandsauskunft fuer den Container-Healthcheck',
  'api/auth/entra/start/route.ts': 'Beginn der Anmeldung — vor der Anmeldung',
  'api/auth/entra/callback/route.ts': 'Rueckkehr von Microsoft — vor der Anmeldung',
}

/** Die Aufrufe, die als Anmeldepruefung gelten. */
const WACHEN = ['benutzerOderAntwort(', 'pruefeZugang(', 'verlangeAnmeldung(']

function dateien(ordner: string, name: string): string[] {
  const gefunden: string[] = []
  for (const eintrag of readdirSync(ordner)) {
    const pfad = join(ordner, eintrag)
    if (statSync(pfad).isDirectory()) gefunden.push(...dateien(pfad, name))
    else if (eintrag === name) gefunden.push(pfad)
  }
  return gefunden
}

function seitenDateien(ordner: string): string[] {
  return dateien(ordner, 'page.tsx')
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

/**
 * Dasselbe fuer die Routen. Eine Route hat kein Layout ueber sich, das etwas
 * auffangen koennte — sie ist genau so offen, wie sie geschrieben ist.
 */
describe('Anmeldepflicht der Routen', () => {
  const routen = dateien(ROUTEN, 'route.ts')

  it('findet ueberhaupt Routen', () => {
    expect(routen.length).toBeGreaterThan(0)
  })

  it.each(routen.map((p) => [p.replace(process.cwd() + '/src/app/', ''), p]))(
    '%s prueft die Anmeldung oder ist begruendet offen',
    (name, pfad) => {
      if (OFFEN[name]) {
        expect(OFFEN[name]).toBeTruthy()
        return
      }
      const inhalt = readFileSync(pfad, 'utf8')
      expect(WACHEN.some((w) => inhalt.includes(w))).toBe(true)
    },
  )
})
