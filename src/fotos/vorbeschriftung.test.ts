import { describe, expect, it } from 'vitest'
import { bereitsMenschlichBeschriftet } from './vorbeschriftung'

describe('bereitsMenschlichBeschriftet', () => {
  it('gibt false zurück, wenn description leer ist', () => {
    expect(bereitsMenschlichBeschriftet({ id: '1', description: null, original_name: 'IMG_1234.jpeg' })).toBe(
      false,
    )
    expect(bereitsMenschlichBeschriftet({ id: '1', description: '  ', original_name: 'IMG_1234.jpeg' })).toBe(
      false,
    )
  })

  it('gibt false zurück, wenn description dem Dateinamen entspricht', () => {
    expect(
      bereitsMenschlichBeschriftet({ id: '1', description: 'IMG_1234.jpeg', original_name: 'IMG_1234.jpeg' }),
    ).toBe(false)
  })

  it('vergleicht ohne Dateiendung und ohne Gross-/Kleinschreibung', () => {
    expect(
      bereitsMenschlichBeschriftet({ id: '1', description: 'img_1234', original_name: 'IMG_1234.JPEG' }),
    ).toBe(false)
  })

  it('gibt true zurück, wenn description wirklich vom Dateinamen abweicht', () => {
    expect(
      bereitsMenschlichBeschriftet({
        id: '1',
        description: 'Ansicht hinten links',
        original_name: 'IMG_1234.jpeg',
      }),
    ).toBe(true)
  })

  it('gibt true zurück, wenn description gesetzt ist, aber kein Dateiname vorliegt', () => {
    // Ohne Dateinamen lässt sich der Vergleich nicht führen — im Zweifel
    // gilt eine vorhandene Beschreibung als echt, statt unnötig neu zu
    // beschriften.
    expect(bereitsMenschlichBeschriftet({ id: '1', description: 'Ansicht hinten links', original_name: null })).toBe(
      true,
    )
  })
})
