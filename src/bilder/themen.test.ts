import { describe, expect, it } from 'vitest'
import { MAX_THEMEN, leseThemen } from './themen'

describe('leseThemen', () => {
  it('trennt an Komma, Strichpunkt und Zeilenumbruch', () => {
    expect(leseThemen('Beilackierung, Verbringung; DAT-Auszug\nHalterung')).toEqual([
      'Beilackierung',
      'Verbringung',
      'DAT-Auszug',
      'Halterung',
    ])
  })

  it('räumt Leerraum auf und lässt Leeres weg', () => {
    expect(leseThemen('  Lackierung  ,,   ,  Vergleichs   foto ')).toEqual([
      'Lackierung',
      'Vergleichs foto',
    ])
  })

  it('wirft Doppelte weg, auch bei anderer Schreibung', () => {
    expect(leseThemen('Beilackierung, beilackierung, BEILACKIERUNG')).toEqual(['Beilackierung'])
  })

  it('begrenzt die Zahl der Themen', () => {
    const viele = Array.from({ length: 30 }, (_, i) => `Thema ${i}`).join(', ')
    expect(leseThemen(viele)).toHaveLength(MAX_THEMEN)
  })

  it('kommt mit einer leeren Eingabe zurecht', () => {
    expect(leseThemen('')).toEqual([])
    expect(leseThemen('   ,  ; \n ')).toEqual([])
  })
})
