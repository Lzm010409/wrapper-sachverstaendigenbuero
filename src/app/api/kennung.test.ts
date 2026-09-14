import { describe, expect, it } from 'vitest'
import { istUuid } from './kennung'

describe('istUuid', () => {
  it('akzeptiert eine echte UUID, gross- und kleinschreibungsunabhängig', () => {
    expect(istUuid('a1b2c3d4-e5f6-4789-a123-0123456789ab')).toBe(true)
    expect(istUuid('A1B2C3D4-E5F6-4789-A123-0123456789AB')).toBe(true)
  })

  it('lehnt einen Tippfehler in der Adresse ab, statt ihn an die Datenbank zu geben', () => {
    expect(istUuid('unfug')).toBe(false)
    expect(istUuid('')).toBe(false)
    expect(istUuid('a1b2c3d4-e5f6-4789-a123-0123456789a')).toBe(false)
  })
})
