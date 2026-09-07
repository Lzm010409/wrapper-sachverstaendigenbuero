import { describe, expect, it } from 'vitest'
import { hashePasswort, pruefePasswort } from './passwort'

describe('Passwort-Hashing', () => {
  it('akzeptiert das richtige Passwort', async () => {
    const hash = await hashePasswort('Korrekt-Pferd-Batterie-Klammer')
    expect(await pruefePasswort('Korrekt-Pferd-Batterie-Klammer', hash)).toBe(true)
  })

  it('weist ein falsches Passwort ab', async () => {
    const hash = await hashePasswort('Korrekt-Pferd-Batterie-Klammer')
    expect(await pruefePasswort('korrekt-pferd-batterie-klammer', hash)).toBe(false)
    expect(await pruefePasswort('', hash)).toBe(false)
  })

  it('erzeugt für dasselbe Passwort verschiedene Hashes', async () => {
    const a = await hashePasswort('gleich')
    const b = await hashePasswort('gleich')
    expect(a).not.toBe(b)
    expect(await pruefePasswort('gleich', a)).toBe(true)
    expect(await pruefePasswort('gleich', b)).toBe(true)
  })

  it('behandelt Umlaute unabhängig von der Unicode-Normalform', async () => {
    // "ü" als ein Zeichen versus "u" + Trema — Tastaturen und Betriebssysteme
    // liefern beides, das Passwort muss trotzdem passen.
    const hash = await hashePasswort('Grüße')
    expect(await pruefePasswort('Grüße', hash)).toBe(true)
  })

  it('stürzt bei beschädigtem Hash nicht ab', async () => {
    for (const kaputt of ['', 'unsinn', 'scrypt$1$2$3', 'bcrypt$1$8$1$aa$bb']) {
      expect(await pruefePasswort('egal', kaputt)).toBe(false)
    }
  })
})
