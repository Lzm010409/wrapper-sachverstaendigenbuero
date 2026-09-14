import { describe, expect, it } from 'vitest'
import { leseSeitenparameter } from './seite'

function url(query: string): URL {
  return new URL(`https://cockpit.example/api/v1/x${query}`)
}

describe('leseSeitenparameter', () => {
  it('nimmt die Standardwerte ohne Angabe', () => {
    expect(leseSeitenparameter(url(''))).toEqual({ limit: 50, versatz: 0 })
  })

  it('übernimmt gültige Angaben', () => {
    expect(leseSeitenparameter(url('?limit=10&versatz=20'))).toEqual({ limit: 10, versatz: 20 })
  })

  it('kappt ein zu grosses limit an der Obergrenze', () => {
    expect(leseSeitenparameter(url('?limit=5000'))).toEqual({ limit: 100, versatz: 0 })
  })

  it('ignoriert ein unsinniges limit statt es zu übernehmen', () => {
    expect(leseSeitenparameter(url('?limit=0'))).toEqual({ limit: 50, versatz: 0 })
    expect(leseSeitenparameter(url('?limit=-5'))).toEqual({ limit: 50, versatz: 0 })
    expect(leseSeitenparameter(url('?limit=abc'))).toEqual({ limit: 50, versatz: 0 })
  })

  it('ignoriert einen negativen oder unsinnigen versatz', () => {
    expect(leseSeitenparameter(url('?versatz=-1'))).toEqual({ limit: 50, versatz: 0 })
    expect(leseSeitenparameter(url('?versatz=abc'))).toEqual({ limit: 50, versatz: 0 })
  })

  it('respektiert eigene Vorgaben für Standard und Obergrenze', () => {
    expect(leseSeitenparameter(url(''), { standard: 20, hoechstens: 30 })).toEqual({
      limit: 20,
      versatz: 0,
    })
    expect(leseSeitenparameter(url('?limit=999'), { standard: 20, hoechstens: 30 })).toEqual({
      limit: 30,
      versatz: 0,
    })
  })
})
