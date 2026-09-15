import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { Einblendkarte } from './melder'

/**
 * Nur die Einblendkarte, nicht der ganze `Melder` — der braucht einen
 * Hintergrundabruf (`frageMeldungenAb`) und einen Kontext, den dieser Test
 * nicht aufbauen will. Geprüft wird dieselbe Sache wie bei `skelett.test.tsx`:
 * die Form der ausgegebenen Auszeichnung, nicht das Verhalten mit der Zeit
 * (`useEffect` läuft unter `renderToStaticMarkup` ohnehin nicht).
 */
describe('Einblendkarte', () => {
  it('zeigt ohne Aktion nur den Schliessen-Knopf', () => {
    const html = renderToStaticMarkup(
      <Einblendkarte
        einblendung={{ id: '1', art: 'erfolg', text: 'Gespeichert.' }}
        schliesse={() => {}}
      />,
    )
    expect(html).toContain('Gespeichert.')
    expect(html).not.toContain('einblendung-aktion')
  })

  it('zeigt den Aktions-Knopf mit seiner Beschriftung, wenn eine Aktion mitgegeben wird', () => {
    const html = renderToStaticMarkup(
      <Einblendkarte
        einblendung={{
          id: '2',
          art: 'erfolg',
          text: '3 Einträge geändert.',
          aktion: { text: 'Rückgängig', ausfuehren: () => {} },
        }}
        schliesse={() => {}}
      />,
    )
    expect(html).toContain('einblendung-aktion')
    expect(html).toContain('Rückgängig')
  })
})
