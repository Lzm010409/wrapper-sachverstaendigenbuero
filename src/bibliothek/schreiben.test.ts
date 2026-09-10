import { describe, expect, it } from 'vitest'
import { entscheideUeberEintrag } from './schreiben'

describe('entscheideUeberEintrag', () => {
  it('legt neu an, wenn es die Nummer im Bereich noch nicht gibt', () => {
    expect(entscheideUeberEintrag(undefined, 'abc')).toBe('neu')
  })

  it('lässt einen unveränderten Eintrag in Ruhe', () => {
    expect(entscheideUeberEintrag({ abdruck: 'abc', herkunft: 'migration' }, 'abc')).toBe(
      'unveraendert',
    )
  })

  it('ersetzt einen geänderten Eintrag aus der Migration', () => {
    expect(entscheideUeberEintrag({ abdruck: 'alt', herkunft: 'migration' }, 'neu')).toBe('ersetzt')
  })

  it('ersetzt auch einen Eintrag ohne Fingerabdruck — den aus der Zeit davor', () => {
    expect(entscheideUeberEintrag({ abdruck: null, herkunft: 'migration' }, 'neu')).toBe('ersetzt')
  })

  it('schützt einen von Hand angelegten Eintrag vor dem Import', () => {
    // Eine von Hand vergebene Nummer kann später in einer Referenzdatei
    // auftauchen. Der Import ersetzt sonst Eintrag samt Unterdatensätzen —
    // die Handarbeit wäre ersatzlos fort, ohne dass es jemand bemerkt.
    expect(entscheideUeberEintrag({ abdruck: null, herkunft: 'manuell' }, 'neu')).toBe('geschuetzt')
  })

  it('schützt auch, was aus einer Stellungnahme übernommen wurde', () => {
    expect(
      entscheideUeberEintrag({ abdruck: null, herkunft: 'aus_stellungnahme' }, 'neu'),
    ).toBe('geschuetzt')
  })
})
