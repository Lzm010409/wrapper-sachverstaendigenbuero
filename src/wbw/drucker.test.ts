import { mkdtemp, readFile, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const { druckeHtml, druckerVorhanden, druckfehlerMeldung } = await import('./drucker')
import type { Druckversuch } from './drucker'
const { belegseite } = await import('./belegseite')
import type { Belegfahrzeug } from './belegseite'

/*
 * Diese Prüfung druckt wirklich.
 *
 * Sie ist der einzige Beleg dafür, dass am Ende ein PDF herauskommt und nicht
 * bloss eine HTML-Datei — genau der Fall, der bis zum 08.09.2026 unbemerkt
 * blieb, weil die PDF-Stufe des Plugins still aufgab. Ohne Browser wird sie
 * übersprungen statt rot; im Abbild ist einer, und dort läuft sie.
 */
const chromium = await druckerVorhanden()

const FAHRZEUG: Belegfahrzeug = {
  kennung: 'x',
  quelle: 'autoscout24',
  titel: 'Mercedes-Benz E 53 AMG T 4M *20 *Schale *Pano',
  url: 'https://www.autoscout24.de/angebote/beispiel',
  preis: 34900,
  kilometerstand: 170000,
  erstzulassung: '07/2019',
  leistungKw: 320,
  getriebe: 'Automatik',
  kraftstoff: 'Benzin',
  plz: '42855',
  ort: 'Remscheid/NRW',
  ausstattung: ['Panoramadach', 'Anhängerkupplung'],
  beschreibung: 'Scheckheftgepflegt, unfallfrei.',
  bilder: [
    'data:image/gif;base64,R0lGODlhAQABAIAAAP8AAAAAACH5BAAAAAAALAAAAAABAAEAAAICRAEAOw==',
  ],
}

const KOPF = {
  aktenzeichen: '0926/2081TG',
  subjekt: 'Mercedes-Benz E 53 AMG · EZ 10/2018 · 147.441 km',
  abgerufenAm: new Date('2026-09-08T14:30:00Z'),
}

describe.skipIf(!chromium)('Drucken', () => {
  it('macht aus der Belegseite ein PDF', async () => {
    const ordner = await mkdtemp(join(tmpdir(), 'druck-'))
    const html = join(ordner, 'beleg.html')
    const pdf = join(ordner, 'beleg.pdf')
    await writeFile(html, belegseite(KOPF, [FAHRZEUG, FAHRZEUG], 'Paket'), 'utf8')

    await druckeHtml(html, pdf)

    const inhalt = await readFile(pdf)
    expect(inhalt.subarray(0, 5).toString()).toBe('%PDF-')
    // Zwei Fahrzeuge, zwei Seiten — der Umbruch vor jedem weiteren greift.
    expect(inhalt.toString('latin1')).toContain('/Count 2')
    expect((await stat(pdf)).size).toBeGreaterThan(8000)
  }, 180_000)

  it('druckt keine fehlende Vorlage', async () => {
    // Chromium rendert für eine fehlende Datei seine eigene Fehlerseite und
    // liefert dafür rund 20 KB PDF — gross genug, um jede Grössenprüfung zu
    // bestehen. Im Gutachtenordner läge dann ein Beleg, der keiner ist.
    const ordner = await mkdtemp(join(tmpdir(), 'druck-'))
    await expect(
      druckeHtml(join(ordner, 'gibtesnicht.html'), join(ordner, 'x.pdf')),
    ).rejects.toThrow(/keine brauchbare Vorlage/)
  }, 180_000)

  it('druckt auch keine leere Vorlage', async () => {
    const ordner = await mkdtemp(join(tmpdir(), 'druck-'))
    const leer = join(ordner, 'leer.html')
    await writeFile(leer, '', 'utf8')
    await expect(druckeHtml(leer, join(ordner, 'x.pdf'))).rejects.toThrow(
      /keine brauchbare Vorlage/,
    )
  }, 180_000)
})

describe.skipIf(chromium)('Ohne Browser', () => {
  it('meldet, dass nicht gedruckt werden kann', async () => {
    expect(await druckerVorhanden()).toBe(false)
  })

  it('nennt die fehlende Installation statt eines fremden Browsernamens', async () => {
    /*
      Der echte Weg durch `druckeHtml`, nicht nur die Formatierung: bis zum
      08.09.2026 kam hier „spawn google-chrome-stable ENOENT" heraus — der
      letzte Eintrag der Kandidatenliste, von niemandem eingerichtet.
    */
    const ordner = await mkdtemp(join(tmpdir(), 'druck-'))
    const html = join(ordner, 'beleg.html')
    await writeFile(html, belegseite(KOPF, [FAHRZEUG], 'Paket'), 'utf8')

    await expect(druckeHtml(html, join(ordner, 'beleg.pdf'))).rejects.toThrow(
      /im Abbild ist kein Browser installiert/,
    )
  }, 120_000)
})

describe('Die Meldung eines Druckfehlers', () => {
  /*
    Am 08.09.2026 stand im Protokoll:

        Das PDF liess sich nicht drucken: spawn google-chrome-stable ENOENT

    `google-chrome-stable` ist der letzte Eintrag der Kandidatenliste und von
    niemandem eingerichtet. Die alte Fassung merkte sich nur den letzten
    Fehlschlag, und die ENOENT-Meldungen der Platzhalter ueberschrieben jeden
    echten Grund. Diese Meldung erschien deshalb immer — sie sagte nie, was
    wirklich los war.
  */
  const fehlt = (pfad: string): Druckversuch => ({
    pfad,
    vorhanden: false,
    grund: `spawn ${pfad} ENOENT`,
  })

  it('sagt, dass gar kein Browser da ist', () => {
    const meldung = druckfehlerMeldung([
      fehlt('/usr/bin/chromium'),
      fehlt('chromium'),
      fehlt('google-chrome-stable'),
    ])
    expect(meldung).toContain('kein Browser')
    expect(meldung).toContain('/usr/bin/chromium')
    // Der Platzhalter am Ende darf die Meldung nicht mehr anfuehren.
    expect(meldung).not.toMatch(/^Das PDF liess sich nicht drucken: spawn google-chrome-stable/)
  })

  it('nennt den vorhandenen Browser und seinen Grund', () => {
    const meldung = druckfehlerMeldung([
      { pfad: '/usr/bin/chromium', vorhanden: true, grund: 'Zeitueberschreitung nach 120 s' },
      fehlt('google-chrome-stable'),
    ])
    expect(meldung).toContain('/usr/bin/chromium')
    expect(meldung).toContain('Zeitueberschreitung')
    // Ein vorhandener Browser, der scheitert, ist etwas anderes als keiner.
    expect(meldung).not.toContain('kein Browser')
  })

  it('fuehrt den ersten vorhandenen Browser an, nicht den letzten Versuch', () => {
    const meldung = druckfehlerMeldung([
      { pfad: '/usr/bin/chromium', vorhanden: true, grund: 'schrieb nur 312 Byte' },
      { pfad: '/usr/bin/google-chrome', vorhanden: true, grund: 'Abbruch' },
    ])
    expect(meldung.indexOf('/usr/bin/chromium')).toBeLessThan(meldung.indexOf('google-chrome'))
  })

  it('kommt ohne Versuche zurecht', () => {
    expect(druckfehlerMeldung([])).toContain('kein Browser')
  })
})
