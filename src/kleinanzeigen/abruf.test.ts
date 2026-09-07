import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { holeSeite, setzeSchlangeZurueck } from './abruf'

/**
 * Der Abruf muss die Frequenzbremse von Kleinanzeigen überstehen. Gemessen am
 * 07.09.2026: sechs Aufrufe ohne Pause ergaben `403 200 200 403 403 200`,
 * dieselbe Adresse mit vier Sekunden Abstand dreimal `200`. Eine Abweisung
 * ist also kein Ergebnis, sondern eine Aufforderung zu warten.
 */

function antwort(status: number, rumpf = '<html></html>', url = 'https://www.kleinanzeigen.de/x') {
  return new Response(rumpf, { status, headers: { 'Content-Type': 'text/html' } }) as Response & {
    url: string
  }
}

/** `Response.url` ist schreibgeschützt — für den Test wird es gesetzt. */
function mitUrl(a: Response, url: string): Response {
  Object.defineProperty(a, 'url', { value: url })
  return a
}

describe('Seitenabruf', () => {
  beforeEach(() => {
    setzeSchlangeZurueck()
    // Der Mindestabstand ist im Betrieb richtig und im Test nur Wartezeit.
    vi.stubEnv('KLEINANZEIGEN_ABSTAND_MS', '0')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  const ohneWarten = async () => {}

  it('gibt eine erfolgreiche Antwort unverändert zurück', async () => {
    const ergebnis = await holeSeite('https://www.kleinanzeigen.de/x', {
      hole: async () => mitUrl(antwort(200, '<html>gut</html>'), 'https://www.kleinanzeigen.de/x'),
      warte: ohneWarten,
    })
    expect(ergebnis.status).toBe(200)
    expect(ergebnis.html).toBe('<html>gut</html>')
    expect(ergebnis.versuche).toBe(1)
  })

  it('fragt nach einer Abweisung noch einmal', async () => {
    let aufrufe = 0
    const ergebnis = await holeSeite('https://www.kleinanzeigen.de/x', {
      hole: async () => {
        aufrufe++
        return mitUrl(
          aufrufe < 3 ? antwort(403, 'IP-Bereich gesperrt') : antwort(200, '<html>endlich</html>'),
          'https://www.kleinanzeigen.de/x',
        )
      },
      warte: ohneWarten,
    })
    expect(aufrufe).toBe(3)
    expect(ergebnis.versuche).toBe(3)
    expect(ergebnis.html).toBe('<html>endlich</html>')
  })

  it('gibt nach den Versuchen auf und sagt warum', async () => {
    await expect(
      holeSeite('https://www.kleinanzeigen.de/x', {
        hole: async () => mitUrl(antwort(403), 'https://www.kleinanzeigen.de/x'),
        versuche: 2,
        warte: ohneWarten,
      }),
    ).rejects.toThrow(/nach 2 Versuchen nicht: HTTP 403/)
  })

  it('wiederholt eine gelöschte Anzeige nicht — 404 ist ein Ergebnis', async () => {
    let aufrufe = 0
    const ergebnis = await holeSeite('https://www.kleinanzeigen.de/s-anzeige/1', {
      hole: async () => {
        aufrufe++
        return mitUrl(antwort(404, 'weg'), 'https://www.kleinanzeigen.de/s-anzeige/1')
      },
      warte: ohneWarten,
    })
    expect(aufrufe).toBe(1)
    expect(ergebnis.status).toBe(404)
  })

  it('wiederholt auch nach einem Netzfehler', async () => {
    let aufrufe = 0
    const ergebnis = await holeSeite('https://www.kleinanzeigen.de/x', {
      hole: async () => {
        aufrufe++
        if (aufrufe === 1) throw new Error('socket hang up')
        return mitUrl(antwort(200, 'da'), 'https://www.kleinanzeigen.de/x')
      },
      warte: ohneWarten,
    })
    expect(aufrufe).toBe(2)
    expect(ergebnis.html).toBe('da')
  })

  it('gibt einen Netzfehler weiter, wenn er bleibt', async () => {
    await expect(
      holeSeite('https://www.kleinanzeigen.de/x', {
        hole: async () => {
          throw new Error('socket hang up')
        },
        versuche: 2,
        warte: ohneWarten,
      }),
    ).rejects.toThrow(/socket hang up/)
  })
})
