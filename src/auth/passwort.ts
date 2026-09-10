import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'

const scrypt = promisify(scryptCb) as (
  passwort: string | Buffer,
  salz: string | Buffer,
  laenge: number,
  optionen?: { N?: number; r?: number; p?: number; maxmem?: number },
) => Promise<Buffer>

// scrypt statt bcrypt/argon2: in Node eingebaut, also keine native
// Abhängigkeit im Container. Die Parameter folgen der OWASP-Empfehlung
// (N=2^17, r=8, p=1) und brauchen rund 128 MB Arbeitsspeicher.
const N = 2 ** 17
const R = 8
const P = 1
const LAENGE = 64
const MAXMEM = 256 * 1024 * 1024

/** Erzeugt `scrypt$N$r$p$salz$hash` — alle Parameter stehen im Ergebnis. */
export async function hashePasswort(passwort: string): Promise<string> {
  const salz = randomBytes(16)
  const hash = await scrypt(passwort.normalize('NFKC'), salz, LAENGE, {
    N,
    r: R,
    p: P,
    maxmem: MAXMEM,
  })
  return ['scrypt', N, R, P, salz.toString('base64'), hash.toString('base64')].join('$')
}

/**
 * Prüft ein Passwort gegen einen gespeicherten Hash. Die Parameter werden aus
 * dem Hash gelesen, damit alte Datensätze nach einer Parameteränderung weiter
 * funktionieren.
 */
export async function pruefePasswort(passwort: string, gespeichert: string): Promise<boolean> {
  const teile = gespeichert.split('$')
  if (teile.length !== 6 || teile[0] !== 'scrypt') return false

  const n = Number(teile[1])
  const r = Number(teile[2])
  const p = Number(teile[3])
  if (!Number.isInteger(n) || !Number.isInteger(r) || !Number.isInteger(p)) return false

  const salz = Buffer.from(teile[4]!, 'base64')
  const erwartet = Buffer.from(teile[5]!, 'base64')

  let berechnet: Buffer
  try {
    berechnet = await scrypt(passwort.normalize('NFKC'), salz, erwartet.length, {
      N: n,
      r,
      p,
      maxmem: MAXMEM,
    })
  } catch {
    return false
  }

  if (berechnet.length !== erwartet.length) return false
  return timingSafeEqual(berechnet, erwartet)
}
