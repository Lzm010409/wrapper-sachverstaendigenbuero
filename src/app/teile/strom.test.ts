import { describe, expect, it } from 'vitest'
import { alsStrom } from '@/app/api/strom'
import { leseEreignisse } from './strom'

/** Baut eine Antwort, deren Rumpf in genau diesen Stücken ankommt. */
function antwortAus(stuecke: string[]): Response {
  const geber = new TextEncoder()
  return new Response(
    new ReadableStream<Uint8Array>({
      start(steuerung) {
        for (const s of stuecke) steuerung.enqueue(geber.encode(s))
        steuerung.close()
      },
    }),
  )
}

async function sammle<T>(antwort: Response): Promise<T[]> {
  const gesammelt: T[] = []
  for await (const e of leseEreignisse<T>(antwort)) gesammelt.push(e)
  return gesammelt
}

describe('alsStrom', () => {
  it('schreibt ein Ereignis je Zeile', async () => {
    async function* ereignisse() {
      yield { art: 'fortschritt', anteil: 0.5 }
      yield { art: 'fertig' }
    }
    const text = await alsStrom(ereignisse()).text()
    expect(text.trimEnd().split('\n')).toEqual([
      '{"art":"fortschritt","anteil":0.5}',
      '{"art":"fertig"}',
    ])
  })

  it('macht aus einem Absturz mittendrin eine Fehlermeldung im Strom', async () => {
    async function* ereignisse() {
      yield { art: 'fortschritt' }
      throw new Error('Rasterung fehlgeschlagen')
    }
    const zeilen = (await alsStrom(ereignisse()).text()).trimEnd().split('\n')
    expect(JSON.parse(zeilen[1]!)).toEqual({
      art: 'fehler',
      fehler: 'Rasterung fehlgeschlagen',
    })
  })
})

describe('leseEreignisse', () => {
  it('setzt Ereignisse zusammen, die über Paketgrenzen zerrissen sind', async () => {
    // Der Schnitt liegt mitten im letzten Ereignis — genau der Fall, in dem
    // ohne Rest-Puffer die Abschlussmeldung verloren ginge.
    const ereignisse = await sammle<{ art: string; nummer?: number }>(
      antwortAus(['{"art":"a","numm', 'er":1}\n{"art":"b"', '}\n{"art":"fertig"}']),
    )
    expect(ereignisse).toEqual([{ art: 'a', nummer: 1 }, { art: 'b' }, { art: 'fertig' }])
  })

  it('überspringt eine unlesbare Zeile, statt abzubrechen', async () => {
    const ereignisse = await sammle<{ art: string }>(
      antwortAus(['{"art":"a"}\nkein json\n{"art":"b"}\n']),
    )
    expect(ereignisse.map((e) => e.art)).toEqual(['a', 'b'])
  })

  it('kommt mit einem leeren Rumpf zurecht', async () => {
    expect(await sammle(antwortAus(['']))).toEqual([])
  })
})
