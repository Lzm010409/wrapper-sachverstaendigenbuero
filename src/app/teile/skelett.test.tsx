import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { SkelettFallseite, SkelettListe, SkelettRaster, SkelettReiter } from './skelett'

/**
 * Ein Platzhalter, den Hilfsmittel nicht als solchen erkennen, ist eine
 * Ansammlung leerer Kästen. Geprüft wird deshalb beides: dass er die Form
 * des Kommenden hat, und dass er sich als „lädt gerade" zu erkennen gibt.
 */
describe('Platzhalter', () => {
  it.each([
    ['Liste', renderToStaticMarkup(<SkelettListe />)],
    ['Reiter', renderToStaticMarkup(<SkelettReiter />)],
    ['Fallseite', renderToStaticMarkup(<SkelettFallseite />)],
    ['Raster', renderToStaticMarkup(<SkelettRaster />)],
  ])('%s gibt sich als ladend zu erkennen', (_name, html) => {
    expect(html).toContain('aria-busy="true"')
    expect(html).toContain('aria-live="polite"')
    expect(html).toContain('nur-vorlesen')
  })

  it('nennt beim Vorlesen, worauf gewartet wird', () => {
    expect(renderToStaticMarkup(<SkelettReiter was="Die Kalkulation" />)).toContain(
      'Die Kalkulation wird geladen',
    )
  })

  it('bildet die Form der Fallseite nach — Kopf, Reiterleiste, Reiter', () => {
    const html = renderToStaticMarkup(<SkelettFallseite />)
    expect(html).toContain('skelett-reiterleiste')
    expect(html).toContain('class="detail"')
    expect(html).toContain('seitenleiste')
  })

  it('gibt den Kacheln ein festes Seitenverhältnis', () => {
    // Ohne feste Höhe springt beim Erscheinen jede einzelne Kachel.
    const html = renderToStaticMarkup(<SkelettRaster kacheln={3} />)
    expect(html.match(/skelett-kachel/g)).toHaveLength(3)
  })
})
