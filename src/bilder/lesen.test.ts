import { describe, expect, it } from 'vitest'
import { Bildfehler, bildmasseInEmu, leseBildmasse } from './lesen'

/** Ein PNG mit erfundenen Massen — mehr als den Kopf liest die Prüfung nicht. */
function png(breite: number, hoehe: number): Uint8Array {
  const daten = new Uint8Array(33)
  daten.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0)
  const sicht = new DataView(daten.buffer)
  sicht.setUint32(8, 13, false)
  daten.set([0x49, 0x48, 0x44, 0x52], 12) // IHDR
  sicht.setUint32(16, breite, false)
  sicht.setUint32(20, hoehe, false)
  return daten
}

/**
 * Ein JPEG mit einem vorgeschalteten Segment.
 *
 * Das Segment davor ist Absicht: es muss übersprungen werden, sonst liest
 * die Prüfung dessen Inhalt als Bildmasse.
 */
function jpeg(breite: number, hoehe: number, marke = 0xc0): Uint8Array {
  const vorsegment = [0xff, 0xe0, 0x00, 0x10, ...new Array(14).fill(0x20)]
  const rahmen = [0xff, marke, 0x00, 0x11, 0x08]
  const daten = new Uint8Array([0xff, 0xd8, ...vorsegment, ...rahmen, 0, 0, 0, 0, 0, 0, 0, 0])
  const sicht = new DataView(daten.buffer)
  const stelle = 2 + vorsegment.length
  sicht.setUint16(stelle + 5, hoehe, false)
  sicht.setUint16(stelle + 7, breite, false)
  return daten
}

describe('leseBildmasse', () => {
  it('liest die Masse eines PNG', () => {
    expect(leseBildmasse(png(1280, 720))).toEqual({
      format: 'image/png',
      endung: 'png',
      breite: 1280,
      hoehe: 720,
    })
  })

  it('liest die Masse eines JPEG und überspringt vorgeschaltete Segmente', () => {
    expect(leseBildmasse(jpeg(800, 600))).toEqual({
      format: 'image/jpeg',
      endung: 'jpg',
      breite: 800,
      hoehe: 600,
    })
  })

  it('erkennt auch die fortschrittliche Rahmenmarke', () => {
    expect(leseBildmasse(jpeg(400, 300, 0xc2)).breite).toBe(400)
  })

  it('hält eine Huffman-Tabelle nicht für einen Bildrahmen', () => {
    // 0xC4 sieht wie eine Rahmenmarke aus, trägt aber Tabellendaten. Wer sie
    // mitnimmt, liest irgendwann Unsinn als Bildmasse.
    const mitTabelle = new Uint8Array([
      0xff, 0xd8,
      0xff, 0xc4, 0x00, 0x06, 0x11, 0x22, 0x33, 0x44,
      0xff, 0xc0, 0x00, 0x11, 0x08, 0x02, 0x58, 0x03, 0x20,
      0, 0, 0, 0,
    ])
    const masse = leseBildmasse(mitTabelle)
    expect(masse.hoehe).toBe(600)
    expect(masse.breite).toBe(800)
  })

  it('lehnt ab, was weder PNG noch JPEG ist', () => {
    expect(() => leseBildmasse(new TextEncoder().encode('GIF89a nope'))).toThrow(Bildfehler)
  })

  it('lehnt eine leere Datei ab', () => {
    expect(() => leseBildmasse(new Uint8Array(0))).toThrow(Bildfehler)
  })
})

describe('bildmasseInEmu', () => {
  it('rechnet den Anteil des Satzspiegels in Zentimeter um', () => {
    // Voreinstellung 68 % von 17,5 cm sind rund 11,9 cm — der Hausstil
    // nennt 10 bis 12 cm als angemessene Breite.
    const { cx } = bildmasseInEmu(0.68, 1600, 900)
    expect(cx / (914400 / 2.54)).toBeCloseTo(11.9, 1)
  })

  it('hält das Seitenverhältnis ein', () => {
    const { cx, cy } = bildmasseInEmu(0.5, 1600, 900)
    expect(cy / cx).toBeCloseTo(900 / 1600, 4)
  })

  it('begrenzt unsinnige Anteile', () => {
    expect(bildmasseInEmu(5, 100, 100).cx).toBe(bildmasseInEmu(1, 100, 100).cx)
    expect(bildmasseInEmu(0, 100, 100).cx).toBe(bildmasseInEmu(0.1, 100, 100).cx)
  })
})
