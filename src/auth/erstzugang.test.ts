import { describe, expect, it } from 'vitest'
import { randomBytes, scrypt as scryptCb } from 'node:crypto'
import { promisify } from 'node:util'
import { pruefePasswort } from './passwort'

const scrypt = promisify(scryptCb) as (
  p: string,
  s: Buffer,
  l: number,
  o: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>

/**
 * Der Startvorgang (`scripts/starten.mjs`) legt beim ersten Start einen
 * Zugang an und muss dafür denselben Hash erzeugen wie die Anwendung.
 * Weicht das Format ab, entsteht ein Konto, mit dem sich niemand anmelden
 * kann — und der Fehler fiele erst beim ersten Anmeldeversuch auf.
 */
async function hasheWieStartvorgang(passwort: string): Promise<string> {
  const N = 2 ** 17
  const salz = randomBytes(16)
  const abgeleitet = await scrypt(passwort.normalize('NFKC'), salz, 64, {
    N,
    r: 8,
    p: 1,
    maxmem: 256 * 1024 * 1024,
  })
  return ['scrypt', N, 8, 1, salz.toString('base64'), abgeleitet.toString('base64')].join('$')
}

describe('Erstzugang aus dem Startvorgang', () => {
  it('erzeugt einen Hash, den die Anmeldung akzeptiert', async () => {
    const hash = await hasheWieStartvorgang('Erst-Zugang-2026!')
    expect(await pruefePasswort('Erst-Zugang-2026!', hash)).toBe(true)
    expect(await pruefePasswort('falsch', hash)).toBe(false)
  })
})
