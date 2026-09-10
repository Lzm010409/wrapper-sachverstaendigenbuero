import { describe, expect, it } from 'vitest'
import { belegseite, fahrzeugabschnitt, sicher, type Belegfahrzeug } from './belegseite'

const KOPF = {
  aktenzeichen: '0926/2081TG',
  subjekt: 'Mercedes-Benz E 53 AMG · EZ 10/2018 · 147.441 km',
  abgerufenAm: new Date('2026-09-08T14:30:00Z'),
}

function fahrzeug(mehr: Partial<Belegfahrzeug> = {}): Belegfahrzeug {
  return {
    kennung: 'https://www.autoscout24.de/angebote/abc',
    quelle: 'autoscout24',
    titel: 'Mercedes-Benz E 53 AMG T 4M',
    url: 'https://www.autoscout24.de/angebote/abc',
    preis: 34900,
    kilometerstand: 170000,
    erstzulassung: '07/2019',
    leistungKw: 320,
    getriebe: 'Automatik',
    kraftstoff: 'Benzin',
    plz: '42855',
    ort: 'Remscheid',
    ausstattung: ['Panoramadach', 'AHK'],
    beschreibung: 'Scheckheftgepflegt, unfallfrei.',
    bilder: ['data:image/jpeg;base64,AAAA'],
    ...mehr,
  }
}

describe('Schutz vor fremdem Text', () => {
  it('entschärft, was aus einem Inserat kommt', () => {
    // Titel und Beschreibung schreibt ein Fremder. Ohne das stünde sein
    // Markup in unserem Beleg.
    expect(sicher('<script>alert(1)</script>')).toBe(
      '&lt;script&gt;alert(1)&lt;/script&gt;',
    )
    expect(sicher('Preis "VB" & fest')).toBe('Preis &quot;VB&quot; &amp; fest')
  })

  it('lässt einen Titel mit spitzen Klammern nicht ins Markup', () => {
    const html = fahrzeugabschnitt(fahrzeug({ titel: 'E 53 <b>TOP</b>' }))
    expect(html).not.toContain('<b>TOP</b>')
    expect(html).toContain('&lt;b&gt;TOP&lt;/b&gt;')
  })
})

describe('Ein Fahrzeugabschnitt', () => {
  it('trägt alles, was den Beleg ausmacht', () => {
    const html = fahrzeugabschnitt(fahrzeug())
    expect(html).toContain('Mercedes-Benz E 53 AMG T 4M')
    expect(html).toContain('34.900')
    expect(html).toContain('170.000 km')
    expect(html).toContain('07/2019')
    expect(html).toContain('320 kW')
    expect(html).toContain('42855 Remscheid')
    expect(html).toContain('Panoramadach')
    expect(html).toContain('Scheckheftgepflegt')
    expect(html).toContain('autoscout24.de/angebote/abc')
  })

  it('sagt, was fehlt, statt es zu verschweigen', () => {
    const html = fahrzeugabschnitt(
      fahrzeug({ leistungKw: null, beschreibung: null, bilder: [], preis: null }),
    )
    expect(html).toContain('ohne Angabe')
    expect(html).toContain('ohne Preisangabe')
    expect(html).toContain('kein Bild')
  })

  it('setzt den Umbruch vor den Abschnitt, nicht dahinter', () => {
    // Dahinter hinge am Ende jedes Pakets eine leere Seite.
    expect(fahrzeugabschnitt(fahrzeug(), false)).not.toContain('umbruch')
    expect(fahrzeugabschnitt(fahrzeug(), true)).toContain('class="fahrzeug umbruch"')
  })

  it('bettet Bilder ein, statt sie zu verlinken', () => {
    // Ein verlinktes Bild ist beim Drucken vielleicht da und vielleicht
    // nicht — und in einem Jahr sicher nicht mehr.
    const html = fahrzeugabschnitt(fahrzeug())
    expect(html).toContain('src="data:image/jpeg;base64,')
  })
})

describe('Die ganze Seite', () => {
  it('nennt Akte, Subjektfahrzeug und Abrufzeitpunkt', () => {
    const html = belegseite(KOPF, [fahrzeug()], 'Beleg')
    expect(html).toContain('0926/2081TG')
    expect(html).toContain('Mercedes-Benz E 53 AMG · EZ 10/2018')
    expect(html).toContain('08.09.2026')
  })

  it('weist darauf hin, dass Inseratspreise Angebotspreise sind', () => {
    // Ohne diesen Satz liest sich der Beleg wie ein Nachweis über einen
    // erzielten Preis.
    expect(belegseite(KOPF, [fahrzeug()], 'Beleg')).toContain('Angebots-, keine Transaktionspreise')
  })

  it('setzt jedes weitere Fahrzeug auf eine eigene Seite', () => {
    const html = belegseite(KOPF, [fahrzeug(), fahrzeug(), fahrzeug()], 'Paket')
    expect(html.match(/class="fahrzeug umbruch"/g)).toHaveLength(2)
  })

  it('kommt ohne Aktenzeichen aus', () => {
    const html = belegseite({ ...KOPF, aktenzeichen: null }, [fahrzeug()], 'Beleg')
    expect(html).not.toContain('Akte ')
    expect(html).toContain('Mercedes-Benz E 53 AMG · EZ 10/2018')
  })
})
