/**
 * Die vollständige Bedienprobe.
 *
 *   pnpm exec tsx scripts/ui-pruefung.ts [basisUrl] [zielordner]
 *
 * Jede Schaltfläche, jedes Feld, jeder Griff wird **zweimal** betätigt: das
 * erste Mal zeigt, ob es überhaupt geht, das zweite Mal, ob es auch beim
 * Wiederholen geht — die meisten Fehler in einer Oberfläche stecken nicht im
 * ersten Klick, sondern im zweiten.
 *
 * Der Rundgang `rundgang-brief.ts` geht den Weg des Sachverständigen durch
 * ein Schreiben. Diese Probe geht statt dessen die Fläche ab und schreibt
 * am Ende einen Bericht: was schlicht nicht funktioniert, und was zwar
 * funktioniert, aber im Weg steht.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { deflateSync } from 'node:zlib'
import { chromium, type BrowserContext, type Page } from 'playwright'

const BASIS = process.argv[2] ?? 'http://localhost:3000'
const ZIEL = process.argv[3] ?? '/tmp/ui-pruefung'
const EMAIL = process.env.RUNDGANG_EMAIL ?? 'lgollenstede@gollenstede-sachverstand.de'
const PASSWORT = process.env.RUNDGANG_PASSWORT ?? 'TestNurLokal!2026'

type Art = 'fehler' | 'unschoen'

interface Befund {
  bereich: string
  titel: string
  art: Art
  text: string
}

const befunde: Befund[] = []
const geprueft: string[] = []
let bereich = '—'
let titel = '—'

function melde(art: Art, text: string): void {
  befunde.push({ bereich, titel, art, text })
  console.log(`      ${art === 'fehler' ? '✗' : '!'} ${text}`)
}

/** Führt eine Prüfung zweimal aus. Was wirft, ist ein Fehler. */
async function pruefe(name: string, lauf: (durchgang: number) => Promise<void>): Promise<void> {
  titel = name
  geprueft.push(`${bereich} · ${name}`)
  for (const durchgang of [1, 2]) {
    try {
      await lauf(durchgang)
    } catch (fehler) {
      melde('fehler', `Durchgang ${durchgang} scheiterte: ${String(fehler).split('\n')[0]}`)
      return
    }
  }
  console.log(`    ✓ ${name}`)
}

function abschnitt(name: string): void {
  bereich = name
  console.log(`\n  ── ${name} ──`)
}

/* ------------------------------------------------------------------ *
 * Zutaten
 * ------------------------------------------------------------------ */

/** Ein echtes PNG mit Farbverlauf — ohne Datei aus dem Netz. */
function baueTestPng(breite: number, hoehe: number): Buffer {
  const tabelle = Array.from({ length: 256 }, (_, n) => {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    return c >>> 0
  })
  const crc = (daten: Buffer) => {
    let c = 0xffffffff
    for (const b of daten) c = tabelle[(c ^ b) & 0xff]! ^ (c >>> 8)
    return (c ^ 0xffffffff) >>> 0
  }
  const block = (art: string, inhalt: Buffer) => {
    const kopf = Buffer.concat([Buffer.from(art, 'latin1'), inhalt])
    const laenge = Buffer.alloc(4)
    laenge.writeUInt32BE(inhalt.length)
    const summe = Buffer.alloc(4)
    summe.writeUInt32BE(crc(kopf))
    return Buffer.concat([laenge, kopf, summe])
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(breite, 0)
  ihdr.writeUInt32BE(hoehe, 4)
  ihdr[8] = 8
  ihdr[9] = 2
  const roh = Buffer.alloc(hoehe * (1 + breite * 3))
  for (let y = 0; y < hoehe; y++) {
    const zeile = y * (1 + breite * 3)
    for (let x = 0; x < breite; x++) {
      const p = zeile + 1 + x * 3
      roh[p] = Math.round((x / breite) * 255)
      roh[p + 1] = Math.round((y / hoehe) * 200)
      roh[p + 2] = 200
    }
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    block('IHDR', ihdr),
    block('IDAT', deflateSync(roh)),
    block('IEND', Buffer.alloc(0)),
  ])
}

/**
 * Zwei Wegwerf-Schreiben für die zerstörenden Handgriffe.
 *
 * Über die Datenbank statt über die Oberfläche: das Anlegen führt sonst
 * durch die Auswertung des Prüfberichts, und die braucht das Sprachmodell.
 * Ohne `DATABASE_URL` bleibt der Teil aus — dann sagt es der Bericht.
 */
async function legeWegwerfAn(): Promise<string[]> {
  if (!process.env.DATABASE_URL) return []
  const { db } = await import('../src/db/index')
  const { position, stellungnahme } = await import('../src/db/schema')

  const ids: string[] = []
  for (const nummer of [1, 2, 3]) {
    const [neu] = await db
      .insert(stellungnahme)
      .values({ betreff: `Wegwerfschreiben der Bedienprobe ${nummer}` })
      .returning({ id: stellungnahme.id })
    if (!neu) continue
    /*
      Die Begründung des Prüfdienstleisters ist der Schlüssel, über den die
      Randspalte einen Baustein vorschlägt. Ohne sie stünde in jeder
      Anmerkung „nichts gefunden", und die halbe Prüfung des Schreibtischs
      liefe ins Leere — sie prüfte dann die Abwesenheit von Daten.
    */
    await db.insert(position).values(
      [
        ['Verbringungskosten', 'Die Halterung sei zerstörungsfrei zu demontieren.'],
        ['Lackierlohn', 'Eine Beilackierung sei nicht erforderlich.'],
        ['Ersatzteilaufschlag', 'Eine Wertminderung sei nicht anzusetzen.'],
      ].map(([bezeichnung, begruendung], i) => ({
        stellungnahmeId: neu.id,
        bezeichnung: bezeichnung!,
        begruendungVersicherer: begruendung!,
        reihenfolge: i,
        differenz: String((i + 1) * 25),
      })),
    )
    ids.push(neu.id)
  }
  return ids
}

/** Räumt die übrig gebliebenen Wegwerf-Schreiben weg. */
async function raeumeWegwerfWeg(ids: string[]): Promise<void> {
  if (!process.env.DATABASE_URL || ids.length === 0) return
  const { db } = await import('../src/db/index')
  const { stellungnahme } = await import('../src/db/schema')
  const { inArray } = await import('drizzle-orm')
  await db.delete(stellungnahme).where(inArray(stellungnahme.id, ids))
}

async function anmelden(seite: Page): Promise<void> {
  await seite.goto(`${BASIS}/anmelden`, { waitUntil: 'networkidle' })
  await seite.fill('#email', EMAIL)
  await seite.fill('#passwort', PASSWORT)
  await Promise.all([
    seite.waitForURL('**/stellungnahmen', { timeout: 20000 }),
    seite.locator('form button[type=submit]').click(),
  ])
}

/* ------------------------------------------------------------------ *
 * Die Probe
 * ------------------------------------------------------------------ */

async function main() {
  mkdirSync(ZIEL, { recursive: true })
  const browser = await chromium.launch({
    executablePath:
      process.env.CHROMIUM_PFAD ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  })
  const kontext: BrowserContext = await browser.newContext({
    viewport: { width: 1600, height: 1000 },
    locale: 'de-DE',
    permissions: ['clipboard-read', 'clipboard-write'],
  })
  const seite = await kontext.newPage()

  const konsole: string[] = []
  seite.on('console', (m) => {
    if (m.type() === 'error') konsole.push(`${bereich} · ${titel}: ${m.text().slice(0, 200)}`)
  })
  seite.on('pageerror', (f) => konsole.push(`${bereich} · ${titel}: ${String(f).slice(0, 200)}`))
  seite.on('dialog', (d) => d.accept())

  const bild = join(ZIEL, 'probe.png')
  writeFileSync(bild, baueTestPng(800, 500))

  await teilAnmeldung(seite)
  await teilRahmen(seite)
  await teilBibliothek(seite)
  await teilFaelle(seite)
  await teilBilder(seite, bild)
  await teilFarben(seite)
  await teilStellungnahmenliste(seite)

  /*
    Der Schreibtisch bekommt sein eigenes, frisches Schreiben.

    Vorher griff er sich das oberste der Übersicht — also bei jedem Lauf
    ein anderes, und jedes mit den Spuren des letzten Laufs: einmal war es
    als versendet vermerkt und damit geschlossen, einmal steckten dreissig
    fremde Handgriffe darin. Die Befunde wanderten entsprechend („Baustein
    landet nicht im Brief", „Rückgängig wirkt nicht", „nach dem Neuladen
    steht etwas anderes da") und liessen sich einzeln nie nachstellen. Ein
    Prüfstand, der bei jedem Lauf etwas anderes misst, ist schlimmer als
    keiner.
  */
  const wegwerf = await legeWegwerfAn()
  await teilSchreibtisch(seite, bild, wegwerf[2] ?? null)
  await teilZerstoerend(seite, wegwerf)
  await raeumeWegwerfWeg(wegwerf.slice(2))

  await seite.screenshot({ path: `${ZIEL}/schluss.png`, fullPage: true })
  await browser.close()

  bericht(konsole)
}

/* ---------------- Anmeldung ---------------- */

async function teilAnmeldung(seite: Page) {
  abschnitt('Anmeldung')

  await pruefe('Falsches Passwort wird abgewiesen', async () => {
    await seite.goto(`${BASIS}/anmelden`, { waitUntil: 'networkidle' })
    await seite.fill('#email', EMAIL)
    await seite.fill('#passwort', 'falschesPasswort')
    await seite.locator('form button[type=submit]').click()
    await seite.waitForTimeout(900)
    const meldung = await seite.locator('.hinweis').first().innerText().catch(() => '')
    if (!meldung.trim()) melde('fehler', 'Keine Meldung nach falschem Passwort.')
    if (!seite.url().includes('/anmelden')) melde('fehler', 'Trotz falschem Passwort angemeldet.')
  })

  await pruefe('Leere Eingabe wird abgewiesen', async () => {
    await seite.goto(`${BASIS}/anmelden`, { waitUntil: 'networkidle' })
    await seite.locator('form button[type=submit]').click()
    await seite.waitForTimeout(700)
    if (!seite.url().includes('/anmelden')) melde('fehler', 'Leere Anmeldung ging durch.')
  })

  await pruefe('Anmelden und abmelden', async () => {
    await anmelden(seite)
    if (!seite.url().includes('/stellungnahmen'))
      melde('fehler', 'Anmeldung führte nicht zu den Stellungnahmen.')
    await seite.locator('button:has-text("Abmelden")').click()
    await seite.waitForURL('**/anmelden', { timeout: 15000 })
  })

  await anmelden(seite)
}

/* ---------------- Rahmen: Menü, Erscheinung ---------------- */

async function teilRahmen(seite: Page) {
  abschnitt('Rahmen')

  const punkte = [
    ['Stellungnahmen', '/stellungnahmen'],
    ['Fälle', '/faelle'],
    ['Argumentbibliothek', '/bibliothek'],
    ['Bildbibliothek', '/bilder'],
  ] as const

  for (const [name, pfad] of punkte) {
    await pruefe(`Menüpunkt „${name}"`, async () => {
      await seite.locator(`.menue-nav a:has-text("${name}")`).click()
      await seite.waitForURL(`**${pfad}`, { timeout: 15000 })
      await seite.waitForTimeout(300)
      const aktiv = await seite
        .locator(`.menue-nav a[aria-current=page]`)
        .innerText()
        .catch(() => '')
      if (!aktiv.includes(name)) {
        melde('unschoen', `Der Menüpunkt „${name}" wird nach dem Wechsel nicht als aktiv gezeigt.`)
      }
    })
  }

  await pruefe('Erscheinungsschalter geht im Kreis', async () => {
    // system → hell → dunkel → system: nach drei Klicks muss wieder der
    // Anfangszustand stehen.
    const stand = () => seite.evaluate(() => document.documentElement.dataset.theme ?? 'system')
    const anfang = await stand()
    const gesehen = [anfang]
    for (let i = 0; i < 3; i++) {
      await seite.locator('button.erscheinung').click()
      await seite.waitForTimeout(250)
      gesehen.push(await stand())
    }
    if (gesehen[3] !== anfang) {
      melde('fehler', `Nach drei Klicks steht ${gesehen[3]} statt ${anfang}.`)
    }
    if (new Set(gesehen.slice(0, 3)).size < 3) {
      melde('fehler', `Der Schalter läuft nicht durch alle drei Stände: ${gesehen.join(' → ')}.`)
    }
    const beschriftung = await seite.locator('button.erscheinung').getAttribute('aria-label')
    if (!beschriftung || !beschriftung.includes('Erscheinungsbild')) {
      melde('unschoen', 'Der Erscheinungsschalter sagt nicht, worauf er gerade steht.')
    }
  })

  await pruefe('Erscheinung überlebt das Neuladen', async () => {
    const vor = await seite.evaluate(() => document.documentElement.dataset.theme ?? 'system')
    await seite.reload({ waitUntil: 'networkidle' })
    await seite.waitForTimeout(300)
    const nach = await seite.evaluate(() => document.documentElement.dataset.theme ?? 'system')
    if (vor !== nach) melde('fehler', `Erscheinung ging beim Neuladen verloren: ${vor} → ${nach}.`)
  })

  await pruefe('Menü ein- und ausklappen', async () => {
    const schalter = seite.locator('header.topbar button.menue-schalter')
    const zu = () => seite.evaluate(() => document.body.classList.contains('menue-zu'))
    const vorher = await zu()
    await schalter.click()
    await seite.waitForTimeout(400)
    if ((await zu()) === vorher) melde('fehler', 'Der Schalter klappt das Menü nicht um.')
    const beschriftung = (await schalter.getAttribute('aria-label')) ?? ''
    if (!/(einklappen|ausklappen)/.test(beschriftung)) {
      melde('unschoen', 'Der Menüschalter sagt nicht, was er tut.')
    }
    await schalter.click()
    await seite.waitForTimeout(400)
    if ((await zu()) !== vorher) melde('fehler', 'Der zweite Klick stellt den Stand nicht her.')
  })

  await pruefe('Menüstand überlebt das Neuladen', async () => {
    const schalter = seite.locator('header.topbar button.menue-schalter')
    await schalter.click()
    await seite.waitForTimeout(300)
    const vor = await seite.evaluate(() => document.body.classList.contains('menue-zu'))
    await seite.reload({ waitUntil: 'networkidle' })
    await seite.waitForTimeout(500)
    const nach = await seite.evaluate(() => document.body.classList.contains('menue-zu'))
    if (vor !== nach) melde('unschoen', 'Der Menüstand geht beim Neuladen verloren.')
    if (nach) {
      await seite.locator('header.topbar button.menue-schalter').click()
      await seite.waitForTimeout(300)
    }
  })

  await pruefe('Marke führt zur Übersicht', async () => {
    await seite.goto(`${BASIS}/bilder`, { waitUntil: 'networkidle' })
    await seite.locator('nav.menue a.marke').click()
    await seite.waitForURL('**/stellungnahmen', { timeout: 15000 })
  })
}

/* ---------------- Argumentbibliothek ---------------- */

async function teilBibliothek(seite: Page) {
  abschnitt('Argumentbibliothek')

  const suchfeld = () => seite.locator('.werkzeugleiste input[aria-label="Bibliothek durchsuchen"]')

  await pruefe('Suche', async (durchgang) => {
    await seite.goto(`${BASIS}/bibliothek`, { waitUntil: 'networkidle' })
    const alle = await seite.locator('.zeile').count()
    await suchfeld().fill(durchgang === 1 ? 'Verbringung' : 'Referenzwerkstatt')
    await seite.waitForTimeout(1400)
    const treffer = await seite.locator('.zeile').count()
    if (treffer === 0) melde('unschoen', 'Die Suche findet zu einem gängigen Wort nichts.')
    if (treffer === alle) melde('unschoen', 'Die Suche schränkt die Liste nicht ein.')
    if (!seite.url().includes('q=')) melde('unschoen', 'Die Suche steht nicht in der Adresse.')
  })

  await pruefe('Filter Bereich, Abschnitt und Status', async (durchgang) => {
    await seite.goto(`${BASIS}/bibliothek`, { waitUntil: 'networkidle' })
    for (const feld of ['Bereich', 'Abschnitt', 'Status']) {
      const wahl = seite.locator(`select[aria-label="${feld}"]`)
      if ((await wahl.count()) === 0) {
        melde('unschoen', `Der Filter „${feld}" fehlt.`)
        continue
      }
      const werte = await wahl
        .locator('option')
        .evaluateAll((o) => (o as HTMLOptionElement[]).map((x) => x.value).filter(Boolean))
      if (werte.length === 0) continue
      await wahl.selectOption(werte[Math.min(durchgang - 1, werte.length - 1)]!)
      await seite.waitForTimeout(1200)
    }
  })

  await pruefe('Zurücksetzen', async () => {
    await seite.goto(`${BASIS}/bibliothek?q=Verbringung`, { waitUntil: 'networkidle' })
    const knopf = seite.locator('.werkzeugleiste button:has-text("Zurücksetzen")')
    if ((await knopf.count()) === 0) {
      melde('fehler', 'Bei gesetzter Suche fehlt der Knopf „Zurücksetzen".')
      return
    }
    await knopf.click()
    await seite.waitForTimeout(1200)
    if (seite.url().includes('q=')) melde('fehler', 'Zurücksetzen räumt die Suche nicht weg.')
    if ((await suchfeld().inputValue()) !== '') {
      melde('fehler', 'Zurücksetzen leert das Suchfeld nicht.')
    }
  })

  await pruefe('Eintrag öffnen und zurück', async (durchgang) => {
    await seite.goto(`${BASIS}/bibliothek`, { waitUntil: 'networkidle' })
    await seite.locator('.zeile').nth(durchgang - 1).click()
    await seite.waitForURL(/\/bibliothek\/[0-9a-f-]{36}/, { timeout: 15000 }).catch(() => {})
    if (!/\/bibliothek\/[0-9a-f-]{36}/.test(seite.url())) {
      melde('fehler', `Der Klick auf eine Zeile führte nach ${seite.url()}.`)
      return
    }
    await seite.waitForLoadState('networkidle')
    if ((await seite.locator('h1').count()) === 0) melde('fehler', 'Der Eintrag hat keine Überschrift.')
    await seite.locator('a[href="/bibliothek"]').first().click()
    await seite.waitForURL('**/bibliothek', { timeout: 15000 })
  })

  await pruefe('Status eines Eintrags wechseln', async (durchgang) => {
    await seite.goto(`${BASIS}/bibliothek?status=entwurf`, { waitUntil: 'networkidle' })
    if ((await seite.locator('.zeile').count()) === 0) return
    await seite.locator('.zeile').first().click()
    await seite.waitForURL(/\/bibliothek\/[0-9a-f-]{36}/, { timeout: 15000 }).catch(() => {})
    await seite.waitForLoadState('networkidle')

    const zurPruefung = seite.locator('button:has-text("Zur Prüfung")')
    if ((await zurPruefung.count()) === 0) {
      melde('unschoen', 'Zu einem Entwurf fehlt der Knopf „Zur Prüfung".')
      return
    }
    await zurPruefung.click()
    await seite.waitForTimeout(1600)
    const stand = await seite.locator('.marke-pille').first().innerText().catch(() => '')
    if (!/prüfung/i.test(stand)) {
      melde('fehler', `Nach „Zur Prüfung" steht der Eintrag auf „${stand}".`)
    }

    // Und zurück, damit der zweite Durchgang dieselbe Lage vorfindet.
    const zurueck = seite.locator('button:has-text("Zurückziehen")')
    if ((await zurueck.count()) > 0) {
      await zurueck.click()
      await seite.waitForTimeout(1600)
    }
    if (durchgang === 2) {
      const wieder = seite.locator('button:has-text("Freigabe zurücknehmen")')
      if ((await wieder.count()) > 0) {
        await wieder.click()
        await seite.waitForTimeout(1400)
      }
    }
  })

  await pruefe('Freigabe verlangt eine Rolle', async () => {
    await seite.goto(`${BASIS}/bibliothek`, { waitUntil: 'networkidle' })
    await seite.locator('.zeile').first().click()
    await seite.waitForURL(/\/bibliothek\/[0-9a-f-]{36}/, { timeout: 15000 }).catch(() => {})
    await seite.waitForLoadState('networkidle')
    const knopf = seite.locator('button:has-text("Freigeben")')
    if ((await knopf.count()) === 0) return
    const gesperrt = await knopf.isDisabled()
    const grund = (await knopf.getAttribute('title')) ?? ''
    if (gesperrt && !grund.trim()) {
      melde('unschoen', 'Der Freigabeknopf ist gesperrt, ohne den Grund zu nennen.')
    }
  })
}

/* ---------------- Fälle ---------------- */

async function teilFaelle(seite: Page) {
  abschnitt('Fälle')

  await pruefe('Liste und Eingabefeld', async () => {
    await seite.goto(`${BASIS}/faelle`, { waitUntil: 'networkidle' })
    const feld = seite.locator('input[aria-label="Aktenzeichen oder ID"]')
    if ((await feld.count()) === 0) {
      melde('fehler', 'Auf der Fallseite fehlt das Feld für Aktenzeichen oder ID.')
      return
    }
    const gesperrt = await feld.isDisabled()
    const hinweis = await seite.locator('.hinweis.warn').first().innerText().catch(() => '')
    if (gesperrt && !hinweis.trim()) {
      melde('unschoen', 'Der Fall-Import ist gesperrt, ohne dass ein Hinweis den Grund nennt.')
    }
  })

  await pruefe('Fall laden ohne Eingabe', async () => {
    await seite.goto(`${BASIS}/faelle`, { waitUntil: 'networkidle' })
    const knopf = seite.locator('form.werkzeugleiste button[type=submit]')
    if (await knopf.isDisabled()) return
    await knopf.click()
    await seite.waitForTimeout(900)
    const meldung = await seite.locator('.hinweis').first().innerText().catch(() => '')
    if (!meldung.trim() && (await seite.locator('input:invalid').count()) === 0) {
      melde('unschoen', 'Ein leeres Aktenzeichen wird stillschweigend hingenommen.')
    }
  })

  await pruefe('Fall öffnen und zurück', async (durchgang) => {
    await seite.goto(`${BASIS}/faelle`, { waitUntil: 'networkidle' })
    const zeilen = await seite.locator('.zeile').count()
    if (zeilen === 0) {
      melde('unschoen', 'Die Fallliste ist leer — der Fall lässt sich nicht öffnen.')
      return
    }
    await seite.locator('.zeile').nth(Math.min(durchgang - 1, zeilen - 1)).click()
    await seite.waitForURL(/\/faelle\/[0-9a-f-]{36}/, { timeout: 15000 }).catch(() => {})
    if (!/\/faelle\/[0-9a-f-]{36}/.test(seite.url())) {
      melde('fehler', `Der Klick auf einen Fall führte nach ${seite.url()}.`)
      return
    }
    await seite.waitForLoadState('networkidle')
    const zurueck = seite.locator('a[href="/faelle"]').first()
    if ((await zurueck.count()) === 0) melde('unschoen', 'Im Fall fehlt der Weg zurück zur Liste.')
    else {
      await zurueck.click()
      await seite.waitForURL('**/faelle', { timeout: 15000 })
    }
  })

  await pruefe('Fotoviewer blättert, ohne Bilder zu stapeln', async () => {
    /*
      Regressionsprobe für einen Fehler, bei dem `Buehnenbild` und
      `Beschriftung` denselben Schlüssel trugen (beide `foto.id`) — als
      Geschwister im selben Elternknoten verwechselte React die beiden beim
      Blättern, und das alte Bild blieb neben dem neuen stehen, bis zum
      Neuladen der Seite.
    */
    await seite.goto(`${BASIS}/faelle`, { waitUntil: 'networkidle' })
    if ((await seite.locator('.zeile').count()) === 0) return
    await seite.locator('.zeile').first().click()
    await seite.waitForURL(/\/faelle\/[0-9a-f-]{36}/, { timeout: 15000 }).catch(() => {})
    await seite.waitForLoadState('networkidle')

    const fotosReiter = seite.locator('.fall-reiter a:has-text("Fotos")')
    if ((await fotosReiter.count()) === 0) return
    await fotosReiter.click()
    await seite.waitForLoadState('networkidle')

    const kacheln = seite.locator('.foto-kachel')
    if ((await kacheln.count()) < 2) return // Probe braucht mindestens zwei Fotos.

    await kacheln.first().click()
    await seite.waitForSelector('.foto-buehne', { timeout: 5000 })
    const titelVorher = await seite.locator('.foto-buehne-titel').innerText()

    await seite.locator('.foto-buehne-leiste button[aria-label="Nächstes Foto"]').click()
    await seite.waitForTimeout(500)

    const bilder = await seite.locator('.foto-buehne-bild').count()
    if (bilder > 1) {
      melde('fehler', `Nach dem Blättern stehen ${bilder} Bilder gleichzeitig in der Grossansicht.`)
    }
    const titelNachher = await seite.locator('.foto-buehne-titel').innerText()
    if (titelNachher === titelVorher) {
      melde('fehler', 'Nach dem Blättern zeigt die Grossansicht noch dasselbe Foto.')
    }
    await seite.locator('.foto-buehne button[aria-label="Schliessen"]').click()
  })

  await pruefe('Fall neu laden', async () => {
    await seite.goto(`${BASIS}/faelle`, { waitUntil: 'networkidle' })
    if ((await seite.locator('.zeile').count()) === 0) return
    await seite.locator('.zeile').first().click()
    await seite.waitForURL(/\/faelle\/[0-9a-f-]{36}/, { timeout: 15000 }).catch(() => {})
    await seite.waitForLoadState('networkidle')
    const knopf = seite.locator('button:has-text("Aus autoiXpert neu laden")')
    if ((await knopf.count()) === 0) return
    await knopf.click()
    await seite.waitForTimeout(2500)
    const meldung = await seite
      .locator('[role=alert], [role=status]')
      .first()
      .innerText()
      .catch(() => '')
    if (!meldung.trim()) {
      melde('unschoen', 'Das Neuladen eines Falls endet ohne jede Rückmeldung.')
    }
  })
}

/* ---------------- Bildbibliothek ---------------- */

async function teilBilder(seite: Page, bildPfad: string) {
  abschnitt('Bildbibliothek')

  await pruefe('Bild aufnehmen', async () => {
    await seite.goto(`${BASIS}/bilder`, { waitUntil: 'networkidle' })
    const vorher = await seite.locator('.bildkarte').count()
    const wahl = seite.locator('input[aria-label="Bilder in die Bibliothek aufnehmen"]')
    if ((await wahl.count()) === 0) {
      melde('fehler', 'Auf der Bildseite gibt es kein Feld zum Aufnehmen.')
      return
    }
    await wahl.setInputFiles(bildPfad)
    await seite.waitForTimeout(3000)
    const meldung = await seite.locator('.hinweis[role=status]').first().innerText().catch(() => '')
    if (!meldung.trim()) melde('unschoen', 'Nach dem Hochladen fehlt die Rückmeldung.')
    if ((await seite.locator('.bildkarte').count()) <= vorher) {
      melde('fehler', 'Nach dem Hochladen kam kein Bild hinzu.')
    }
  })

  await pruefe('Bildsuche und Themenfilter', async (durchgang) => {
    await seite.goto(`${BASIS}/bilder`, { waitUntil: 'networkidle' })
    await seite.waitForTimeout(400)
    const alle = await seite.locator('.bildkarte').count()
    const feld = seite.locator('input[aria-label="Bildbibliothek durchsuchen"]')
    await feld.fill(durchgang === 1 ? 'probe' : 'Kalkulation')
    await seite.waitForTimeout(1400)
    if (!seite.url().includes('q=')) melde('unschoen', 'Die Bildsuche steht nicht in der Adresse.')
    const thema = seite.locator('select[aria-label="Thema"]')
    const werte = await thema
      .locator('option')
      .evaluateAll((o) => (o as HTMLOptionElement[]).map((x) => x.value).filter(Boolean))
    if (werte.length > 0) {
      await thema.selectOption(werte[0]!)
      await seite.waitForTimeout(1200)
    }
    const zuruecksetzen = seite.locator('button:has-text("Filter zurücksetzen")')
    if ((await zuruecksetzen.count()) === 0) {
      melde('fehler', 'Bei gesetztem Filter fehlt „Filter zurücksetzen".')
      return
    }
    await zuruecksetzen.click()
    await seite.waitForURL((u) => !u.search.includes('q='), { timeout: 8000 }).catch(() => {})
    await seite.waitForTimeout(1200)
    const danach = await seite.locator('.bildkarte').count()
    if (danach < alle) {
      melde('unschoen', `Nach dem Zurücksetzen stehen ${danach} statt ${alle} Bildern da.`)
    }
  })

  await pruefe('Bildkarte beschriften', async (durchgang) => {
    await seite.goto(`${BASIS}/bilder`, { waitUntil: 'networkidle' })
    const karte = seite.locator('.bildkarte').first()
    if ((await karte.count()) === 0) return
    await karte.locator('button.bildkarte-bild').click()
    await seite.waitForTimeout(400)
    const formular = karte.locator('.bildkarte-formular')
    if ((await formular.count()) === 0) {
      melde('fehler', 'Die Bildkarte klappt zum Beschriften nicht auf.')
      return
    }
    await formular.locator('input').first().fill(`Probeaufnahme ${durchgang}`)
    await formular.locator('textarea').fill(`Aus der Bedienprobe, Durchgang ${durchgang}.`)
    await formular.locator('input').last().fill('Bedienprobe, Kalkulation')
    await karte.locator('.bildkarte-knoepfe button.haupt').click()
    await seite.waitForTimeout(1800)
    const meldung = await karte.locator('.hinweis').innerText().catch(() => '')
    if (!meldung.includes('espeichert')) {
      melde('unschoen', 'Nach dem Speichern einer Bildbeschriftung fehlt die Bestätigung.')
    }
    await karte.locator('button.bildkarte-bild').click()
    await seite.waitForTimeout(400)
    if ((await karte.locator('.bildkarte-formular').count()) > 0) {
      melde('fehler', 'Die Bildkarte lässt sich nicht wieder zuklappen.')
    }
  })

  await pruefe('Bild aus der Bibliothek nehmen und zurückholen', async () => {
    /*
      An einem eigenen Bild, nicht am erstbesten.

      Achtzehn der Bibliotheksbilder stehen in Schreiben, und die lassen
      sich absichtlich nicht herausnehmen — sie fielen dort aus dem Brief.
      Griff die Prüfung eines davon, meldete sie „lässt sich nicht wieder
      aufnehmen", wo die Anwendung genau das Richtige tat.
    */
    await seite.goto(`${BASIS}/bilder?q=Probeaufnahme`, { waitUntil: 'networkidle' })
    const karte = seite.locator('.bildkarte').first()
    if ((await karte.count()) === 0) return
    await karte.locator('button.bildkarte-bild').click()
    await seite.waitForTimeout(400)
    const raus = karte.locator('button:has-text("Aus der Bibliothek nehmen")')
    if ((await raus.count()) === 0) return
    await raus.click()
    await seite.waitForTimeout(2200)

    /*
      Steht das Bild in einem Schreiben, verweigert die Anwendung das
      Herausnehmen — mit gutem Grund: es fiele dort aus dem Brief, ohne
      dass es jemand merkte. Dann ist der folgende Rückweg gegenstandslos,
      und die Prüfung hätte ihn früher als Fehler gemeldet. Sie hat es
      getan, sobald die Probe zuvor ein Bibliotheksbild in einen Brief
      gesetzt hatte.
    */
    const abgewiesen = await seite
      .locator('.hinweis.fehler, .bildkarte .hinweis')
      .first()
      .innerText()
      .catch(() => '')
    if (/Schreiben/.test(abgewiesen) || /löschen/i.test(abgewiesen)) {
      await seite.screenshot({ path: `${ZIEL}/bild-in-verwendung.png` })
      return
    }

    const zurueck = seite.locator('.bildkarte button:has-text("In die Bibliothek")').first()
    if ((await zurueck.count()) === 0) {
      melde('fehler', 'Ein herausgenommenes Bild lässt sich nicht wieder aufnehmen.')
      return
    }
    await zurueck.click()
    await seite.waitForTimeout(2200)
  })

  await pruefe('Bild löschen', async () => {
    await seite.goto(`${BASIS}/bilder?q=Probeaufnahme`, { waitUntil: 'networkidle' })
    const karte = seite.locator('.bildkarte').first()
    if ((await karte.count()) === 0) return
    const vorher = await seite.locator('.bildkarte').count()
    await karte.locator('button.bildkarte-bild').click()
    await seite.waitForTimeout(400)
    const loeschen = karte.locator('button:has-text("Löschen")')
    if ((await loeschen.count()) === 0) return
    await loeschen.click()
    await seite.waitForTimeout(2400)
    const meldung = await seite.locator('.bildkarte .hinweis').first().innerText().catch(() => '')
    if ((await seite.locator('.bildkarte').count()) === vorher && !meldung.trim()) {
      melde('fehler', 'Löschen bleibt ohne Wirkung und ohne Meldung.')
    }
  })
}

/* ---------------- Farbe der Handlungen ---------------- */

/**
 * Trägt jede Schaltfläche die Farbe ihrer Bedeutung?
 *
 * Blau führt die Arbeit voran, grün gibt frei, rot löscht endgültig, grau
 * ist alles Übrige. Geprüft wird die Klasse, nicht der Farbwert: die Farbe
 * selbst steht in den Themenblöcken und wird dort geprüft.
 */
async function teilFarben(seite: Page) {
  abschnitt('Farbe der Handlungen')

  const hatKlasse = async (wahl: string, klasse: string) =>
    seite
      .locator(wahl)
      .first()
      .evaluate((e, k) => e.classList.contains(k), klasse)
      .catch(() => false)

  await pruefe('Löschen ist rot, Speichern blau, Herausnehmen grau', async () => {
    await seite.goto(`${BASIS}/bilder`, { waitUntil: 'networkidle' })
    const karte = seite.locator('.bildkarte').first()
    if ((await karte.count()) === 0) return
    if ((await karte.locator('.bildkarte-formular').count()) === 0) {
      await karte.locator('button.bildkarte-bild').click()
      await seite.waitForTimeout(400)
    }
    if (!(await hatKlasse('.bildkarte button:has-text("Löschen")', 'gefahr'))) {
      melde('fehler', '„Löschen" an der Bildkarte trägt nicht die Farbe des Löschens.')
    }
    if (!(await hatKlasse('.bildkarte-knoepfe button:has-text("Speichern")', 'haupt'))) {
      melde('unschoen', '„Speichern" an der Bildkarte ist nicht als Hauptknopf gezeichnet.')
    }
    if (await hatKlasse('.bildkarte button:has-text("Aus der Bibliothek nehmen")', 'gefahr')) {
      melde(
        'unschoen',
        '„Aus der Bibliothek nehmen" trägt Rot, obwohl es sich zurücknehmen lässt.',
      )
    }
  })

  await pruefe('Freigeben ist grün, Zurückziehen grau', async () => {
    await seite.goto(`${BASIS}/bibliothek`, { waitUntil: 'networkidle' })
    await seite.locator('.zeile').first().click()
    await seite.waitForURL(/\/bibliothek\/[0-9a-f-]{36}/, { timeout: 15000 }).catch(() => {})
    await seite.waitForLoadState('networkidle')
    const frei = seite.locator('button:has-text("Freigeben")')
    if ((await frei.count()) > 0 && !(await hatKlasse('button:has-text("Freigeben")', 'freigabe'))) {
      melde('fehler', '„Freigeben" trägt nicht die Farbe der Freigabe.')
    }
    const zurueck = seite.locator('button:has-text("Zurückziehen")')
    if ((await zurueck.count()) > 0 && (await hatKlasse('button:has-text("Zurückziehen")', 'gefahr'))) {
      melde('unschoen', '„Zurückziehen" trägt Rot, obwohl nichts gelöscht wird.')
    }
  })

  await pruefe('Löschknopf der Liste ist rot', async () => {
    await seite.goto(`${BASIS}/stellungnahmen`, { waitUntil: 'networkidle' })
    if ((await seite.locator('.loeschknopf').count()) === 0) return
    if (!(await hatKlasse('.loeschknopf', 'gefahr'))) {
      melde('fehler', 'Der Löschknopf in der Liste trägt nicht die Farbe des Löschens.')
    }
  })
}

/* ---------------- Stellungnahmen-Liste ---------------- */

async function teilStellungnahmenliste(seite: Page) {
  abschnitt('Stellungnahmen')

  await pruefe('Liste', async () => {
    await seite.goto(`${BASIS}/stellungnahmen`, { waitUntil: 'networkidle' })
    if ((await seite.locator('.zeile').count()) === 0) {
      melde('fehler', 'Keine Stellungnahme in der Liste — die Probe braucht eine.')
    }
  })

  await pruefe('Auswerten ist ohne Zugang gesperrt und sagt warum', async () => {
    await seite.goto(`${BASIS}/stellungnahmen`, { waitUntil: 'networkidle' })
    const knopf = seite.locator('form.werkzeugleiste button[type=submit]')
    const gesperrt = await knopf.isDisabled()
    const warnung = await seite.locator('.hinweis.warn, .hinweis.fehler').first().innerText().catch(() => '')
    if (gesperrt && !warnung.trim()) {
      melde('unschoen', 'Das Auswerten ist gesperrt, ohne dass ein Hinweis den Grund nennt.')
    }
    if (!gesperrt) {
      await knopf.click()
      await seite.waitForTimeout(1000)
      const ungueltig = await seite.locator('input:invalid').count()
      const meldung = await seite.locator('.hinweis').first().innerText().catch(() => '')
      if (ungueltig === 0 && !meldung.trim()) {
        melde('unschoen', 'Auswerten ohne Datei bleibt ohne Rückmeldung.')
      }
    }
  })

  await pruefe('Fallauswahl', async (durchgang) => {
    await seite.goto(`${BASIS}/stellungnahmen`, { waitUntil: 'networkidle' })
    const auswahl = seite.locator('select[aria-label="Fall zuordnen"]')
    if ((await auswahl.count()) === 0) {
      melde('unschoen', 'Es gibt kein Feld, um den Bericht einem Fall zuzuordnen.')
      return
    }
    if (await auswahl.isDisabled()) return
    const werte = await auswahl
      .locator('option')
      .evaluateAll((o) => (o as HTMLOptionElement[]).map((x) => x.value))
    await auswahl.selectOption(werte[Math.min(durchgang, werte.length - 1)] ?? '')
    await seite.waitForTimeout(300)
  })

  await pruefe('Zeile öffnet den Schreibtisch, Rückweg führt zurück', async () => {
    await seite.goto(`${BASIS}/stellungnahmen`, { waitUntil: 'networkidle' })
    await (await offeneZeile(seite)).click()
    await seite.waitForSelector('.brief-flaeche', { timeout: 20000 })
    const zurueck = seite.locator('.brief-kopfzeile a.zurueck')
    if ((await zurueck.count()) === 0) {
      melde('unschoen', 'Im Schreibtisch fehlt der Rückweg zur Liste.')
      return
    }
    await zurueck.click()
    await seite.waitForURL('**/stellungnahmen', { timeout: 15000 })
  })

  await pruefe('Löschknopf ist erreichbar und fragt nach', async () => {
    await seite.goto(`${BASIS}/stellungnahmen`, { waitUntil: 'networkidle' })
    const knopf = seite.locator('.zeile-huelle .loeschknopf').first()
    if ((await knopf.count()) === 0) {
      melde('unschoen', 'In der Liste fehlt der Löschknopf.')
      return
    }
    const sichtbarkeit = await knopf.evaluate((e) => getComputedStyle(e).opacity)
    if (Number(sichtbarkeit) === 0) {
      melde('unschoen', 'Der Löschknopf ist unsichtbar, solange die Maus nicht darüber steht.')
    }
    const beschriftung = (await knopf.getAttribute('aria-label')) ?? ''
    if (!beschriftung.includes('löschen')) {
      melde('unschoen', 'Der Löschknopf sagt nicht, was er löscht.')
    }
  })
}

/**
 * Was in der Datenbank steht — die Gegenprobe zum Bild auf dem Schirm.
 *
 * Trennt zwei Ursachen, die gleich aussehen: nicht gespeichert (dann steht
 * in der Ablage der alte Wortlaut) oder beim Laden verändert (dann steht
 * dort der neue).
 */
async function standInDerAblage(id: string | null, merkmal: string): Promise<string> {
  if (!id || !process.env.DATABASE_URL) return '(ohne Datenbankzugang keine Gegenprobe)'
  const { db } = await import('../src/db/index')
  const { stellungnahme } = await import('../src/db/schema')
  const { eq } = await import('drizzle-orm')
  const [zeile] = await db
    .select({ dokument: stellungnahme.dokument })
    .from(stellungnahme)
    .where(eq(stellungnahme.id, id))
    .limit(1)
  const roh = JSON.stringify(zeile?.dokument ?? null)
  /*
    Gesucht wird ausdrücklich die **abweichende** Zeile. Der erste Anlauf
    nahm irgendeine lange Zeile des Briefes — und fand natürlich den
    Betreff, der sich nie geändert hatte. Die Gegenprobe meldete deshalb
    „steht schon drin", ohne etwas geprüft zu haben. Eine Prüfung, die
    immer dasselbe sagt, ist keine.
  */
  if (!merkmal || merkmal.length < 12) return '(kein Merkmal für die Gegenprobe)'
  return roh.includes(merkmal)
    ? '(in der Ablage steht der neue Wortlaut — es liegt am Laden)'
    : '(in der Ablage steht der alte Wortlaut — es liegt am Speichern)'
}

/**
 * Die erste Zeile, in der zwei Fassungen auseinandergehen — als Beleg.
 *
 * Ein Unterschied ohne Fundstelle ist eine Behauptung: er zwingt dazu, den
 * Zustand von Hand nachzubauen, und nach dreissig vorangegangenen
 * Handgriffen gelingt das nicht.
 */
function erstesAbweichen(
  vorher: string,
  nachher: string,
): { text: string; vorher: string } {
  const a = vorher.split('\n')
  const b = nachher.split('\n')
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = (a[i] ?? '').trim()
    const y = (b[i] ?? '').trim()
    if (x !== y) {
      return {
        text: `(Zeile ${i + 1}: „${x.slice(0, 90)}" wurde zu „${y.slice(0, 90)}")`,
        vorher: x,
      }
    }
  }
  return { text: '(nur Leerraum unterscheidet sich)', vorher: '' }
}

/** Was gerade offen ist — als Beleg für eine Meldung. */
async function zustandDerAnmerkung(seite: Page): Promise<string> {
  const klassen = await seite
    .locator('.blase')
    .evaluateAll((e) => e.map((x) => (x as HTMLElement).className.trim()))
  const labels = await seite.locator('.blase.auf .blase-label').allTextContents()
  return `(Anmerkungen: ${klassen.join(' | ') || 'keine'}; Abschnitte der offenen: ${labels.join(', ') || 'keine'})`
}

/**
 * Sorgt dafür, dass die Anmerkung einer bestrittenen Position offen ist.
 *
 * Zwei Stolpersteine stecken darin, beide aus Fehlmeldungen gelernt:
 *
 * Die Randspalte klappt die Anmerkung des Abschnitts auf, in dem die
 * Schreibmarke steht — ein Klick in den Brief schliesst also die vorherige.
 * Wer eine offene Anmerkung braucht, darf sich nicht darauf verlassen, dass
 * die vorige Prüfung eine offen gelassen hat.
 *
 * Und die Anmerkung einer Position, die **nicht bestritten** wird, sieht
 * anders aus: sie trägt `draussen` und bietet folgerichtig weder
 * Bibliothekssuche noch eigenen Text, sondern „Doch bestreiten" und
 * „Entfernen". Das ist richtig so — für eine Position, gegen die nichts
 * vorgebracht wird, schreibt man auch nichts. Die Probe hielt das
 * zweimal für ein fehlendes Feld.
 */
async function sorgeFuerOffeneAnmerkung(seite: Page) {
  if ((await seite.locator('.blase.auf:not(.draussen)').count()) > 0) return
  const zu = seite.locator('.blase.zu:not(.draussen)')
  if ((await zu.count()) === 0) return
  await zu.first().click()
  await seite.waitForTimeout(600)
}

/**
 * Die erste Stellungnahme, die sich am Schreibtisch prüfen lässt.
 *
 * Zwei Bedingungen, beide aus Fehlschlägen gelernt:
 *
 * Sie darf **nicht versendet** sein. Ein als versendet vermerktes
 * Schreiben ist absichtlich geschlossen — der Editor nimmt keine Eingabe
 * mehr an. Alle Handgriffe schlügen fehl und meldeten einen Fehler, wo die
 * Anwendung genau das tut, was sie soll.
 *
 * Und sie braucht **mindestens eine Position**. Ohne Kürzungsposition gibt
 * es keinen Abschnitt, in den sich schreiben liesse; die Prüfung wartete
 * dann dreissig Sekunden auf einen Absatz, den es nicht gibt.
 *
 * Die Übersicht ist nach Anlagedatum sortiert — welches Schreiben oben
 * steht, wechselt also mit dem Datenbestand. Deshalb wird gesucht statt
 * angenommen.
 */
async function offeneZeile(seite: Page) {
  const stelle = await seite.locator('.zeile').evaluateAll((zeilen) =>
    zeilen.findIndex((z) => {
      const text = (z as HTMLElement).innerText
      if (/versendet/i.test(text)) return false
      const treffer = text.match(/(\d+)\s+Position/)
      return Boolean(treffer) && Number(treffer![1]) > 0
    }),
  )
  return seite.locator('.zeile').nth(stelle >= 0 ? stelle : 0)
}

/* ---------------- Schreibtisch ---------------- */

async function teilSchreibtisch(seite: Page, bildPfad: string, prueflingId: string | null) {
  abschnitt('Schreibtisch')

  const oeffne = async () => {
    if (prueflingId) {
      await seite.goto(`${BASIS}/stellungnahmen/${prueflingId}`, { waitUntil: 'networkidle' })
    } else {
      // Ohne Datenbankzugang bleibt der alte Weg: das oberste offene
      // Schreiben mit Positionen. Dann sagt der Bericht aber auch, dass der
      // Prüfling nicht frisch ist.
      melde('unschoen', 'Ohne Datenbankzugang prüft der Schreibtisch an einem fremden Schreiben.')
      await seite.goto(`${BASIS}/stellungnahmen`, { waitUntil: 'networkidle' })
      await (await offeneZeile(seite)).click()
    }
    await seite.waitForSelector('.brief-flaeche', { timeout: 20000 })
    await seite.waitForTimeout(900)
  }
  await oeffne()

  const schreibstelle = async () => {
    await seite.locator('.brief-flaeche .d-abschnitt p').first().click()
    await seite.keyboard.press('End')
  }

  /*
    Bevor irgendetwas am Brief geprüft wird: ist er überhaupt offen?
    Ein versendetes Schreiben weist jede Eingabe ab — richtig so, aber dann
    ist jeder folgende Befund einer über den Prüfling und keiner über die
    Anwendung. Einmal sagen ist besser als zwanzigmal raten.
  */
  if ((await seite.locator('.brief-flaeche').getAttribute('contenteditable')) === 'false') {
    melde(
      'unschoen',
      'Der Prüfling ist als versendet vermerkt und deshalb geschlossen — ' +
        'alle folgenden Befunde am Brief sagen nichts über die Anwendung.',
    )
  }
  const briefText = () =>
    seite.evaluate(() => (document.querySelector('.brief-flaeche') as HTMLElement).innerText)
  const wartetAufSpeichern = async () => {
    for (let i = 0; i < 40; i++) {
      const stand = await seite.locator('.speicherstand').innerText()
      if (stand.includes('gespeichert') && !stand.includes('ungespeichert')) return true
      await seite.waitForTimeout(250)
    }
    return false
  }

  await pruefe('Stand der Wächter steht schon beim Öffnen da', async () => {
    await oeffne()
    const stand = seite.locator('.pruefstand')
    if ((await stand.count()) === 0) {
      melde(
        'unschoen',
        'Beim Öffnen sagt nichts, ob die Wächter die Ausgabe sperren — das zeigt sich erst nach der ersten Änderung.',
      )
      return
    }
    const text = (await stand.innerText()).trim()
    if (!text) melde('unschoen', 'Der Prüfstand steht leer da.')
  })

  await pruefe('Tippen wird gespeichert', async (durchgang) => {
    await schreibstelle()
    await seite.keyboard.type(`Speicherprobe ${durchgang}. `)
    if (!(await wartetAufSpeichern())) {
      melde('fehler', 'Das Getippte wird nicht gespeichert — der Stand bleibt offen.')
    }
  })

  await pruefe('Fett und Kursiv aus der Werkzeugleiste', async (durchgang) => {
    await schreibstelle()
    await seite.keyboard.type(`Auszeichnung${durchgang} `)
    for (let i = 0; i < 14; i++) await seite.keyboard.press('Shift+ArrowLeft')
    const fettVorher = await seite.locator('.brief-flaeche strong').count()
    await seite.locator('.werkzeuge button[title="Fett"]').click()
    await seite.waitForTimeout(500)
    if ((await seite.locator('.brief-flaeche strong').count()) <= fettVorher) {
      melde('fehler', 'Der Knopf „Fett" bleibt wirkungslos.')
    }
    await seite.locator('.werkzeuge button[title="Fett"]').click()
    await seite.waitForTimeout(400)
    if ((await seite.locator('.brief-flaeche strong').count()) !== fettVorher) {
      melde('fehler', 'Fett lässt sich nicht wieder abschalten.')
    }
    const kursivVorher = await seite.locator('.brief-flaeche em').count()
    await seite.locator('.werkzeuge button[title="Kursiv"]').click()
    await seite.waitForTimeout(500)
    if ((await seite.locator('.brief-flaeche em').count()) <= kursivVorher) {
      melde('fehler', 'Der Knopf „Kursiv" bleibt wirkungslos.')
    }
    await seite.locator('.werkzeuge button[title="Kursiv"]').click()
    await seite.waitForTimeout(400)
  })

  await pruefe('Aufzählung an und aus', async () => {
    await schreibstelle()
    const vorher = await seite.locator('.brief-flaeche ul').count()
    await seite.locator('.werkzeuge button:has-text("Liste")').click()
    await seite.waitForTimeout(600)
    if ((await seite.locator('.brief-flaeche ul').count()) <= vorher) {
      melde('fehler', 'Der Knopf „Liste" macht keine Aufzählung.')
    }
    await seite.locator('.werkzeuge button:has-text("Liste")').click()
    await seite.waitForTimeout(600)
    if ((await seite.locator('.brief-flaeche ul').count()) !== vorher) {
      melde('fehler', 'Die Aufzählung lässt sich nicht wieder abschalten.')
    }
  })

  await pruefe('Rückgängig und Wiederherstellen', async (durchgang) => {
    await schreibstelle()
    const wort = `Widerruf${durchgang}`
    await seite.keyboard.type(`${wort} `)
    await seite.waitForTimeout(500)
    await seite.locator('.werkzeuge button[title="Rückgängig"]').click()
    await seite.waitForTimeout(700)
    if ((await briefText()).includes(wort)) {
      melde('fehler', 'Rückgängig nimmt das Getippte nicht zurück.')
    }
    await seite.locator('.werkzeuge button[title="Wiederherstellen"]').click()
    await seite.waitForTimeout(700)
    if (!(await briefText()).includes(wort)) {
      melde('fehler', 'Wiederherstellen bringt das Zurückgenommene nicht zurück.')
    }
  })

  await pruefe('Fokusschalter', async () => {
    const knopf = seite.locator('.werkzeuge button[aria-pressed]')
    if ((await knopf.count()) === 0) {
      melde('unschoen', 'Der Fokusschalter ist nicht als Schalter ausgezeichnet.')
      return
    }
    await knopf.click()
    await seite.waitForTimeout(500)
    if (await seite.locator('.rand').isVisible()) {
      melde('fehler', 'Im Fokus bleibt die Randspalte sichtbar.')
    }
    await knopf.click()
    await seite.waitForTimeout(500)
    if (!(await seite.locator('.rand').isVisible())) {
      melde('fehler', 'Nach dem zweiten Klick kommt die Randspalte nicht zurück.')
    }
  })

  await pruefe('Marke in der Leiste öffnet die Anmerkung', async (durchgang) => {
    const marken = seite.locator('.positionsmarke')
    const anzahl = await marken.count()
    if (anzahl < 2) return
    const nr = durchgang === 1 ? 1 : anzahl - 1
    await marken.nth(nr).click()
    await seite.waitForTimeout(700)
    const aktiv = (await seite.locator('.blase.auf .blase-nummer').innerText().catch(() => '')).trim()
    if (aktiv !== String(nr + 1)) {
      melde('fehler', `Marke ${nr + 1} öffnet die Anmerkung „${aktiv}".`)
    }
  })

  await pruefe('Marke im Papierrand öffnet die Anmerkung', async (durchgang) => {
    const marken = seite.locator('.brief-flaeche .abschnittsmarke')
    const anzahl = await marken.count()
    if (anzahl < 2) return
    const nr = durchgang === 1 ? 0 : Math.min(2, anzahl - 1)
    await marken.nth(nr).click()
    await seite.waitForTimeout(700)
    const aktiv = (await seite.locator('.blase.auf .blase-nummer').innerText().catch(() => '')).trim()
    if (aktiv !== String(nr + 1)) {
      melde('fehler', `Die Marke ${nr + 1} im Brief öffnet die Anmerkung „${aktiv}".`)
    }
  })

  await pruefe('Anmerkung aufklappen', async (durchgang) => {
    // Ohne `:not(.draussen)` erwischt der Griff mal die Anmerkung einer
    // nicht bestrittenen Position — die sieht anders aus und hat weder
    // Vorschläge noch Textfelder. Die folgenden Prüfungen bauen darauf auf.
    const zu = seite.locator('.blase.zu:not(.draussen)')
    const anzahl = await zu.count()
    if (anzahl === 0) return
    await zu.nth(Math.min(durchgang - 1, anzahl - 1)).click()
    await seite.waitForTimeout(600)
    if ((await seite.locator('.blase.auf').count()) === 0) {
      melde('fehler', 'Der Klick auf eine geschlossene Anmerkung öffnet sie nicht.')
    }
  })

  await pruefe('Vorschlag wählen, bearbeiten, einfügen', async (durchgang) => {
    await sorgeFuerOffeneAnmerkung(seite)
    const kopf = seite.locator('.blase.auf:not(.draussen) .blase-vorschlag-kopf').first()
    if ((await kopf.count()) === 0) {
      /*
        Ob hier ein Vorschlag steht, hängt am Datenbestand: die Randspalte
        sucht über die typische Begründung des Prüfdienstleisters. Bei einem
        Schreiben aus `scripts/probedaten.ts` passt dazu nichts in der
        Bibliothek — dann ist das kein Befund über die Anwendung, sondern
        einer über die Probe. Deshalb der Zusatz.
      */
      melde(
        'unschoen',
        'Zur offenen Anmerkung gibt es keinen Vorschlag ' +
          '(möglich: der Prüfling ist ein Probeschreiben ohne passenden Bibliothekseintrag).',
      )
      return
    }
    await kopf.click()
    await seite.waitForTimeout(500)
    const feld = seite.locator('.blase-entwurf textarea').first()
    if ((await feld.count()) === 0) {
      melde('fehler', 'Ein gewählter Vorschlag zeigt keinen Entwurf.')
      return
    }
    await feld.click()
    await feld.press('End')
    await feld.type(` Zusatz ${durchgang}.`)
    const vorher = await seite.locator('.brief-flaeche .d-quelle').count()
    await seite.locator('.blase-entwurf button.haupt').first().click()
    await seite.waitForTimeout(1800)
    if ((await seite.locator('.brief-flaeche .d-quelle').count()) <= vorher) {
      melde('fehler', 'Der eingefügte Baustein erscheint nicht im Brief.')
    }
    if (!(await briefText()).includes(`Zusatz ${durchgang}`)) {
      melde('fehler', 'Die Änderung am Entwurf geht beim Einfügen verloren.')
    }
  })

  await pruefe('Variante wählen', async () => {
    const kopf = seite.locator('.blase.auf:not(.draussen) .blase-vorschlag-kopf').first()
    if ((await kopf.count()) === 0) return
    await kopf.click()
    await seite.waitForTimeout(500)
    const varianten = seite.locator('.blase-entwurf button.blase-variante')
    if ((await varianten.count()) === 0) return
    const vorher = await seite.locator('.blase-entwurf textarea').first().inputValue()
    await varianten.first().click()
    await seite.waitForTimeout(500)
    const nachher = await seite.locator('.blase-entwurf textarea').first().inputValue()
    if (vorher === nachher) melde('fehler', 'Der Variantenknopf ändert den Entwurf nicht.')
    await seite.locator('.blase-entwurf button:has-text("Schliessen")').first().click()
    await seite.waitForTimeout(400)
  })

  await pruefe('Bibliothekssuche in der Anmerkung', async (durchgang) => {
    await sorgeFuerOffeneAnmerkung(seite)
    const feld = seite.locator('.blase.auf:not(.draussen) input[aria-label="Bibliothek durchsuchen"]')
    if ((await feld.count()) === 0) {
      // Mit Beleg statt bloss „fehlt": ohne die Klassen und die Beschriftungen
      // der offenen Anmerkung liess sich nicht unterscheiden, ob das Feld
      // wirklich fehlt oder ob gerade gar keine Anmerkung offen war.
      melde('unschoen', `In der Anmerkung fehlt die Suche über die gesamte Bibliothek. ${await zustandDerAnmerkung(seite)}`)
      return
    }
    await feld.fill('ab')
    await seite.waitForTimeout(900)
    const beiZwei = await seite.locator('.blase.auf:not(.draussen) .blase-vorschlag-kopf').count()
    await feld.fill(durchgang === 1 ? 'Verbringung' : 'Referenz')
    await seite.waitForTimeout(1800)
    const beiVielen = await seite.locator('.blase.auf:not(.draussen) .blase-vorschlag-kopf').count()
    if (beiVielen <= beiZwei) {
      melde('unschoen', 'Die Suche in der Anmerkung findet zu einem gängigen Wort nichts.')
    }
    await feld.fill('')
    await seite.waitForTimeout(600)
  })

  await pruefe('Eigenen Text einfügen', async (durchgang) => {
    await sorgeFuerOffeneAnmerkung(seite)
    const feld = seite.locator('.blase.auf:not(.draussen) textarea[placeholder^="Eigene Argumentation"]')
    if ((await feld.count()) === 0) {
      melde('unschoen', `In der Anmerkung fehlt das Feld für eigenen Text. ${await zustandDerAnmerkung(seite)}`)
      return
    }
    const knopf = seite.locator('.blase.auf .blase-abschnitt button:has-text("In den Brief einfügen")').last()
    if (!(await knopf.isDisabled())) {
      melde('unschoen', 'Der Knopf zum Einfügen ist auch ohne Text bedienbar.')
    }
    await feld.fill(`Eigene Argumentation aus der Bedienprobe ${durchgang}.`)
    await seite.waitForTimeout(300)
    await knopf.click()
    await seite.waitForTimeout(1600)
    if (!(await briefText()).includes(`Bedienprobe ${durchgang}`)) {
      melde('fehler', 'Der eigene Text landet nicht im Brief.')
    }
    if ((await feld.inputValue()) !== '') {
      melde('unschoen', 'Das Feld für eigenen Text bleibt nach dem Einfügen gefüllt.')
    }
  })

  await pruefe('Bildbibliothek in der Anmerkung', async () => {
    const feld = seite.locator('.blase.auf input[aria-label="Bildbibliothek durchsuchen"]')
    if ((await feld.count()) === 0) return
    await feld.click()
    await seite.waitForTimeout(1500)
    const kacheln = await seite.locator('.blase.auf .blase-bild').count()
    if (kacheln === 0) {
      melde('unschoen', 'Die Bildbibliothek in der Anmerkung zeigt beim Anklicken nichts.')
      return
    }
    const vorher = await seite.locator('.brief-flaeche .d-bild').count()
    await seite.locator('.blase.auf .blase-bild').first().click()
    await seite.waitForTimeout(1800)
    if ((await seite.locator('.brief-flaeche .d-bild').count()) <= vorher) {
      melde('fehler', 'Ein Bild aus der Bibliothek landet nicht im Brief.')
    }
  })

  await pruefe('Bild über den Knopf einfügen', async () => {
    await schreibstelle()
    const vorher = await seite.locator('.brief-flaeche .d-bild').count()
    await seite.setInputFiles('input[type=file][accept*="image"]', bildPfad)
    await seite.waitForTimeout(3000)
    if ((await seite.locator('.brief-flaeche .d-bild').count()) <= vorher) {
      melde('fehler', 'Über den Knopf „Bild" kommt kein Bild in den Brief.')
    }
  })

  await pruefe('Bild in der Breite ziehen', async (durchgang) => {
    const rahmen = seite.locator('.d-bild-rahmen').first()
    if ((await rahmen.count()) === 0) return
    await rahmen.scrollIntoViewIfNeeded()
    await seite.waitForTimeout(400)
    const vorher = (await rahmen.boundingBox())?.width ?? 0
    const kasten = await seite.locator('.d-bild-griff').first().boundingBox()
    if (!kasten) return
    const weite = durchgang === 1 ? -120 : 90
    await seite.mouse.move(kasten.x + kasten.width / 2, kasten.y + kasten.height / 2)
    await seite.mouse.down()
    await seite.mouse.move(kasten.x + weite, kasten.y + kasten.height / 2, { steps: 12 })
    await seite.mouse.up()
    await seite.waitForTimeout(1300)
    const nachher = (await rahmen.boundingBox())?.width ?? 0
    if (Math.abs(nachher - vorher) < 15) {
      melde('fehler', `Das Bild lässt sich nicht ziehen (${Math.round(vorher)} → ${Math.round(nachher)} px).`)
    }
  })

  await pruefe('Bildbreite über die Tastatur', async () => {
    const rahmen = seite.locator('.d-bild-rahmen').first()
    if ((await rahmen.count()) === 0) return
    await rahmen.scrollIntoViewIfNeeded()
    const vorher = (await rahmen.boundingBox())?.width ?? 0
    await seite.locator('.d-bild-griff').first().focus()
    for (let i = 0; i < 8; i++) {
      await seite.keyboard.press('ArrowRight')
      await seite.waitForTimeout(120)
    }
    await seite.waitForTimeout(900)
    const nachher = (await rahmen.boundingBox())?.width ?? 0
    if (Math.abs(nachher - vorher) < 5) {
      melde('unschoen', 'Die Pfeiltasten am Ziehgriff ändern die Bildbreite nicht.')
    }
  })

  await pruefe('Bildbeschriftung schreiben', async (durchgang) => {
    const unterschrift = seite.locator('.d-bild-unterschrift').first()
    if ((await unterschrift.count()) === 0) return
    await unterschrift.scrollIntoViewIfNeeded()
    await unterschrift.click()
    await seite.keyboard.press('End')
    await seite.keyboard.type(` Beschriftung ${durchgang}.`)
    await seite.waitForTimeout(900)
    if (!(await unterschrift.innerText()).includes(`Beschriftung ${durchgang}`)) {
      melde('fehler', 'Die Bildbeschriftung nimmt keinen Text an.')
    }
  })

  await pruefe('Schnellauswahl über der Markierung', async (durchgang) => {
    await schreibstelle()
    await seite.keyboard.type(`Schnellauswahl${durchgang} `)
    for (let i = 0; i < 16; i++) await seite.keyboard.press('Shift+ArrowLeft')
    await seite.waitForTimeout(800)
    if (!(await seite.locator('.schnellauswahl').isVisible().catch(() => false))) {
      melde('fehler', 'Über der Markierung erscheint keine Schnellauswahl.')
      return
    }
    for (const knopf of ['Fett', 'Kursiv', 'Aufzählung', 'Nummerierte Liste']) {
      const el = seite.locator(`.schnellauswahl button[title="${knopf}"]`)
      if ((await el.count()) === 0) {
        melde('unschoen', `In der Schnellauswahl fehlt „${knopf}".`)
        continue
      }
      await el.click()
      await seite.waitForTimeout(400)
      if ((await seite.locator('.schnellauswahl').count()) > 0) {
        await el.click().catch(() => {})
        await seite.waitForTimeout(400)
      }
    }
  })

  await pruefe('Nicht bestreiten und doch bestreiten', async () => {
    const kandidat = seite.locator('.blase:not(.draussen)').first()
    if ((await kandidat.count()) === 0) return
    await kandidat.click()
    await seite.waitForTimeout(600)
    const abschnitteVorher = await seite.locator('.brief-flaeche .d-abschnitt').count()
    const raus = seite.locator('.blase.auf button:has-text("Nicht bestreiten")')
    if ((await raus.count()) === 0) {
      melde('unschoen', 'In der offenen Anmerkung fehlt „Nicht bestreiten".')
      return
    }
    await raus.click()
    await seite.waitForTimeout(1800)
    if ((await seite.locator('.positionsmarke.draussen').count()) === 0) {
      melde('fehler', '„Nicht bestreiten" wird in der Leiste nicht sichtbar.')
    }
    await seite.locator('.blase.draussen').first().click()
    await seite.waitForTimeout(600)
    await seite.locator('.blase.auf button:has-text("Doch bestreiten")').click()
    await seite.waitForTimeout(1800)
    if ((await seite.locator('.brief-flaeche .d-abschnitt').count()) !== abschnitteVorher) {
      melde('fehler', 'Nach dem Wiederaufnehmen stimmt die Zahl der Abschnitte nicht.')
    }
  })

  await pruefe('Farbe der Handlungen in der Anmerkung', async () => {
    const nichtBestreiten = seite.locator('.blase.auf button:has-text("Nicht bestreiten")')
    if ((await nichtBestreiten.count()) > 0) {
      const rot = await nichtBestreiten.evaluate((e) => e.classList.contains('gefahr'))
      if (rot) {
        melde('unschoen', '„Nicht bestreiten" trägt Rot, obwohl der Abschnitt stehen bleibt.')
      }
    }
    const entfernen = seite.locator('.blase.auf button:has-text("Position entfernen")')
    if ((await entfernen.count()) > 0) {
      const rot = await entfernen.evaluate((e) => e.classList.contains('gefahr'))
      if (!rot) melde('fehler', '„Position entfernen" trägt nicht die Farbe des Löschens.')
    }
  })

  await pruefe('Ausformulieren nennt seinen Grund, wenn es gesperrt ist', async () => {
    const knopf = seite.locator('.blase.auf button:has-text("Ausformulieren")')
    if ((await knopf.count()) === 0) return
    if (await knopf.isDisabled()) {
      const grund = (await knopf.getAttribute('title')) ?? ''
      if (!grund.trim()) melde('unschoen', '„Ausformulieren" ist gesperrt, ohne den Grund zu nennen.')
    }
  })

  await pruefe('Klappen in der Kopfzeile', async (durchgang) => {
    const klappen = seite.locator('.brief-kopf-klappen details')
    const anzahl = await klappen.count()
    if (anzahl === 0) return
    const k = klappen.nth(Math.min(durchgang - 1, anzahl - 1))
    await k.locator('summary').click()
    await seite.waitForTimeout(500)
    if (!(await k.evaluate((e) => (e as HTMLDetailsElement).open))) {
      melde('fehler', 'Eine Klappe in der Kopfzeile öffnet sich nicht.')
      return
    }
    await seite.locator('.brief-flaeche').click({ position: { x: 40, y: 40 } })
    await seite.waitForTimeout(500)
    if (await k.evaluate((e) => (e as HTMLDetailsElement).open)) {
      melde('unschoen', 'Die Klappe bleibt offen, obwohl daneben geklickt wurde.')
    }
  })

  await pruefe('Empfängerangaben speichern', async (durchgang) => {
    const klappe = seite.locator('.brief-kopf-klappen details').last()
    await klappe.locator('summary').click()
    await seite.waitForTimeout(500)
    await seite.locator('#empf').fill(`Kanzlei Bedienprobe ${durchgang}`)
    await seite.locator('#str').fill(`Musterweg ${durchgang}`)
    await seite.locator('#plz').fill('26655 Westerstede')
    await seite.locator('#dat').fill(durchgang === 1 ? '2026-08-01' : '2026-08-13')
    await seite.locator('#med').selectOption(durchgang === 1 ? 'mail' : 'schreiben')
    if ((await klappe.evaluate((e) => (e as HTMLDetailsElement).open)) === false) {
      melde('fehler', 'Der Kasten klappt beim Ausfüllen von selbst zu.')
      return
    }
    await seite.locator('.klappe-inhalt button:has-text("Speichern")').click()
    await seite.waitForTimeout(1800)
    const meldung = await seite.locator('.klappe-inhalt .unterzeile').last().innerText().catch(() => '')
    if (!meldung.includes('espeichert')) {
      melde('unschoen', 'Nach dem Speichern der Empfängerangaben fehlt die Bestätigung.')
    }
    /*
      Und sofort nachsehen, ob der nachgetragene Einleitungssatz auch in
      der Ablage steht. Er entsteht aus diesem Klick heraus, nicht aus dem
      Tippen — und genau dort ging er verloren, während die Anzeige
      „gespeichert" meldete.
    */
    await wartetAufSpeichern()
    const satz = await seite.evaluate(`(() => {
      var pm = document.querySelector('.brief-flaeche')
      var a = pm.querySelector('p[data-anrede]')
      var els = pm.querySelectorAll('p, section')
      var nach = false
      for (var i = 0; i < els.length; i++) {
        if (els[i] === a) { nach = true; continue }
        if (els[i].tagName === 'SECTION') break
        if (nach && els[i].textContent.trim()) return els[i].textContent.trim()
      }
      return ''
    })()`)
    if (typeof satz === 'string' && satz.length > 20) {
      const lage = await standInDerAblage(prueflingId, satz)
      if (lage.includes('alte Wortlaut')) {
        melde('fehler', `Der nachgetragene Einleitungssatz steht nicht in der Ablage. ${lage}`)
      }
    }

    await seite.locator('.brief-flaeche').click({ position: { x: 40, y: 40 } })
    await seite.waitForTimeout(400)
  })

  await pruefe('Ausschneiden und Einfügen des ganzen Briefes', async () => {
    const vorher = await briefText()
    const abschnitteVorher = await seite.locator('.brief-flaeche .d-abschnitt').count()
    await seite.locator('.brief-flaeche p').first().click()
    await seite.keyboard.press('Control+a')
    await seite.keyboard.press('Control+x')
    await seite.waitForTimeout(1000)
    if ((await seite.locator('.brief-flaeche .d-abschnitt').count()) !== abschnitteVorher) {
      melde('fehler', 'Das Ausschneiden nimmt Abschnitte mit.')
    }
    await seite.keyboard.press('Control+v')
    await seite.waitForTimeout(1800)
    if ((await briefText()) !== vorher) {
      melde('fehler', 'Nach Ausschneiden und Einfügen steht nicht wieder dasselbe im Brief.')
    }
  })

  await pruefe('Baustein in den Brief ziehen', async () => {
    await sorgeFuerOffeneAnmerkung(seite)
    const griff = seite.locator('.blase.auf:not(.draussen) .blase-vorschlag-kopf.ziehbar').first()
    if ((await griff.count()) === 0) {
      melde('unschoen', 'Kein ziehbarer Vorschlag in der offenen Anmerkung.')
      return
    }
    const ziel = seite.locator('.brief-flaeche .d-abschnitt p').first()
    const vorher = await seite.locator('.brief-flaeche .d-quelle').count()

    /*
      Mitschrift der Zieh-Ereignisse.

      Ohne sie war „landet nicht im Brief" nicht zu deuten: es kann am
      Ziehen liegen, am Ziel oder daran, dass der Brief gar keine Eingabe
      annimmt. Der Browser verrät es — bleibt `drop` aus, hat das Ziel den
      Wurf abgelehnt; kommt `drop` an und es passiert trotzdem nichts, liegt
      es an der Anwendung.
    */
    await seite.evaluate(`(() => {
      window.ziehspur = []
      var merke = function (name) {
        return function (e) {
          var dt = e.dataTransfer
          window.ziehspur.push(name + (dt ? '(' + dt.types.join(',') + ')' : ''))
        }
      }
      document.addEventListener('dragstart', merke('start'), true)
      document.addEventListener('dragover', merke('ueber'), true)
      document.addEventListener('drop', merke('wurf'), true)
    })()`)

    /*
      Von Hand statt mit `dragTo`.

      `dragTo` löste hier gar keinen Zug aus — die Mitschrift blieb leer,
      nicht einmal `dragstart` kam an, während derselbe Handgriff einzeln
      nachgestellt jedes Mal durchlief. Der Grund liegt in der Randspalte:
      sie zeichnet sich neu, sobald sich die Auswahl im Brief ändert, und
      der Griff verschwindet dem Zeiger unter der Hand. Mit ausdrücklichen
      Schritten und einer Pause dazwischen hält er still.
    */
    /*
      Erst in den Blick rollen, dann messen.

      `dragTo` rollt von selbst; ausdrückliche Mausschritte tun das nicht.
      Lag der Griff unterhalb des sichtbaren Bereichs, zeigten die
      gemessenen Koordinaten ins Nichts — der Zug begann gar nicht, und die
      Mitschrift blieb leer. Genau dieses Bild („Ereignisse: keine") stand
      zweimal im Bericht.
    */
    await griff.scrollIntoViewIfNeeded()
    await ziel.scrollIntoViewIfNeeded()
    await seite.waitForTimeout(300)
    const von = await griff.boundingBox()
    const nach = await ziel.boundingBox()
    if (!von || !nach) {
      melde('unschoen', 'Griff oder Ziel liegen nicht im sichtbaren Bereich.')
      return
    }
    await seite.mouse.move(von.x + von.width / 2, von.y + von.height / 2)
    await seite.mouse.down()
    await seite.waitForTimeout(150)
    await seite.mouse.move(nach.x + nach.width / 2, nach.y + nach.height / 2, { steps: 12 })
    await seite.waitForTimeout(150)
    await seite.mouse.up()
    await seite.waitForTimeout(1800)
    if ((await seite.locator('.brief-flaeche .d-quelle').count()) <= vorher) {
      const spur = ((await seite.evaluate(`window.ziehspur`)) as string[]) ?? []
      const offen = await seite.locator('.brief-flaeche').getAttribute('contenteditable')
      const unterDemPunkt = await seite.evaluate(
        `(() => {
          var el = document.elementFromPoint(${nach.x + nach.width / 2}, ${nach.y + nach.height / 2})
          if (!el) return 'nichts'
          return el.tagName + (el.className ? '.' + String(el.className).trim() : '')
        })()`,
      )
      melde(
        'fehler',
        `Ein gezogener Baustein landet nicht im Brief. (Ereignisse: ${spur.join(' → ') || 'keine'}; Brief beschreibbar: ${offen ?? '?'}; unter dem Wurfpunkt: ${unterDemPunkt})`,
      )
    }
  })

  await pruefe('Beanstandung springt an ihre Stelle', async () => {
    const befund = seite.locator('.blase.auf .befund').first()
    if ((await befund.count()) === 0) return
    await befund.click()
    await seite.waitForTimeout(900)
    const markiert = await seite.locator('.brief-flaeche .fundstelle, .brief-flaeche mark').count()
    const auswahl = await seite.evaluate(() => (window.getSelection()?.toString() ?? '').length)
    if (markiert === 0 && auswahl === 0) {
      melde('unschoen', 'Der Klick auf eine Beanstandung zeigt die Stelle im Brief nicht an.')
    }
  })

  await pruefe('Abschnitt in die Bibliothek übernehmen', async () => {
    const knopf = seite.locator('.blase.auf button:has-text("In die Bibliothek")')
    if ((await knopf.count()) === 0) return
    await knopf.click()
    await seite.waitForTimeout(2500)
    const meldung = await seite.locator('.hinweis').first().innerText().catch(() => '')
    if (!meldung.trim()) {
      melde('unschoen', '„In die Bibliothek" bleibt ohne Rückmeldung.')
    }
  })

  await pruefe('Prüfstand meldet den Stand der Wächter', async () => {
    const stand = seite.locator('.pruefstand')
    if ((await stand.count()) === 0) {
      melde('unschoen', 'Der Stand der Wächter wird nirgends angezeigt.')
      return
    }
    const text = await stand.innerText()
    if (!text.trim()) melde('unschoen', 'Der Prüfstand ist leer.')
  })

  await pruefe('Dokument erzeugen', async () => {
    const knopf = seite.locator('button:has-text("Dokument erzeugen")')
    if (await knopf.isDisabled()) {
      melde('unschoen', 'Der Knopf „Dokument erzeugen" ist gesperrt.')
      return
    }
    await knopf.click()
    // Zwei gültige Ausgänge: fertige Dateien, oder eine Sperre der Wächter.
    await Promise.race([
      seite.waitForSelector('.ausgabe-leiste', { timeout: 60000 }),
      seite.waitForSelector('.hinweis.fehler', { timeout: 60000 }),
    ]).catch(() => null)
    await seite.waitForTimeout(800)

    if ((await seite.locator('.ausgabe-leiste').count()) > 0) {
      if ((await seite.locator('.ausgabe-leiste button').count()) < 2) {
        melde('fehler', 'Die Ausgabeleiste bietet nicht beide Dateien an.')
      }
      return
    }

    const meldung = await seite
      .locator('.werkbank > .hinweis[role=status]')
      .innerText()
      .catch(() => '')
    if (!meldung.trim()) {
      melde('fehler', 'Das Erzeugen endet weder mit Dateien noch mit einer Meldung.')
      return
    }
    if (/sperren/i.test(meldung)) {
      const benannt = /R[1-4]/.test(meldung) || /Position/i.test(meldung)
      if (!benannt) {
        melde(
          'unschoen',
          `Die Sperre sagt nicht, welche Stellen sie meint: „${meldung.slice(0, 90)}"`,
        )
      }
      if ((await seite.locator('.blase .befund').count()) === 0) {
        melde('fehler', 'Die sperrenden Beanstandungen stehen an keiner Anmerkung.')
      }
    }
  })

  await pruefe('Fertige Dateien herunterladen', async (durchgang) => {
    if ((await seite.locator('.ausgabe-leiste').count()) === 0) return
    const knopf = seite.locator('.ausgabe-leiste button').nth(durchgang - 1)
    if ((await knopf.count()) === 0) return
    const [herunterladen] = await Promise.all([
      seite.waitForEvent('download', { timeout: 20000 }).catch(() => null),
      knopf.click(),
    ])
    if (!herunterladen) melde('fehler', 'Der Knopf in der Ausgabeleiste lädt nichts herunter.')
  })

  await pruefe('Neuladen bewahrt das Geschriebene', async () => {
    await wartetAufSpeichern()
    const vorher = await briefText()
    await seite.reload({ waitUntil: 'networkidle' })
    await seite.waitForSelector('.brief-flaeche', { timeout: 20000 })
    await seite.waitForTimeout(1200)
    const nachher = await briefText()
    if (nachher.replace(/\s+/g, ' ') !== vorher.replace(/\s+/g, ' ')) {
      // Mit der Stelle, an der es auseinandergeht. „Steht nicht mehr
      // dasselbe" allein zwingt zum Nachbauen von Hand — und der Nachbau
      // trifft den Zustand nach dreissig vorangegangenen Handgriffen nie.
      /*
        Und die Gegenprobe in der Datenbank: steht dort schon der alte
        Wortlaut, ist die Änderung nie gespeichert worden — dann liegt es
        am Speichern. Steht dort der neue und die Seite zeigt den alten,
        liegt es am Laden. Ohne diese Unterscheidung ist der Befund nicht
        zu verfolgen.
      */
      const stelle = erstesAbweichen(vorher, nachher)
      melde(
        'fehler',
        `Nach dem Neuladen steht nicht mehr dasselbe im Brief. ${stelle.text} ${await standInDerAblage(prueflingId, stelle.vorher)}`,
      )
    }
  })

  await pruefe('Versendet vermerken und zurücknehmen', async () => {
    const knopf = seite.locator('button:has-text("Versendet")')
    if ((await knopf.count()) === 0) return
    await knopf.click()
    await seite.waitForTimeout(2000)
    const meldung = await seite.locator('.hinweis[role=status]').first().innerText().catch(() => '')
    if (!meldung.trim()) {
      melde('unschoen', 'Der Vermerk „Versendet" bleibt ohne sichtbare Wirkung.')
    }
    await seite.reload({ waitUntil: 'networkidle' })
    await seite.waitForSelector('.brief-flaeche', { timeout: 20000 })
    await seite.waitForTimeout(600)

    // Ein versendetes Schreiben ist geschlossen — das gehört mitgeprüft.
    const beschreibbar = await seite
      .locator('.brief-flaeche')
      .getAttribute('contenteditable')
      .catch(() => null)
    if (beschreibbar !== 'false') {
      melde('fehler', 'Ein versendetes Schreiben nimmt weiterhin Eingaben an.')
    }

    /*
      Und wieder zurücknehmen. Nicht aus Höflichkeit, sondern aus Not: die
      Probe hat sich sonst ihren eigenen Prüfling verbraucht. Sie liess ihn
      als versendet zurück, der nächste Lauf griff sich denselben, und weil
      ein versendetes Schreiben keine Eingabe annimmt, meldete er „Ein
      gezogener Baustein landet nicht im Brief" — ein Befund über den
      Prüfstand, der wie einer über die Anwendung aussah. Nebenbei wird so
      auch der Rückweg geprüft, den es vorher gar nicht gab.
    */
    const zurueck = seite.locator('button:has-text("Versandvermerk zurücknehmen")')
    if ((await zurueck.count()) === 0) {
      melde('fehler', 'Aus „versendet" führt kein Weg zurück.')
      return
    }
    await zurueck.click()
    await seite.waitForTimeout(2000)
    await seite.reload({ waitUntil: 'networkidle' })
    await seite.waitForSelector('.brief-flaeche', { timeout: 20000 })
    if ((await seite.locator('.brief-flaeche').getAttribute('contenteditable')) === 'false') {
      melde('fehler', 'Nach dem Zurücknehmen bleibt das Schreiben geschlossen.')
    }
  })
}

/* ---------------- Was sich nicht rückgängig machen lässt ---------------- */

/**
 * Die zerstörenden Handgriffe an einem Wegwerf-Schreiben.
 *
 * „Position entfernen" und „Stellungnahme löschen" lassen sich nicht
 * zweimal am selben Gegenstand prüfen — deshalb legt die Probe sich zwei
 * Wegwerf-Schreiben an und räumt sie selbst wieder weg.
 */
async function teilZerstoerend(seite: Page, wegwerf: string[]) {
  abschnitt('Zerstörendes')
  if (wegwerf.length < 2) {
    melde('unschoen', 'Ohne Datenbankzugang bleiben die zerstörenden Handgriffe ungeprüft.')
    return
  }

  await pruefe('Position entfernen', async (durchgang) => {
    await seite.goto(`${BASIS}/stellungnahmen/${wegwerf[0]}`, { waitUntil: 'networkidle' })
    await seite.waitForSelector('.brief-flaeche', { timeout: 20000 })
    await seite.waitForTimeout(900)
    const vorher = await seite.locator('.positionsmarke').count()
    if (vorher === 0) return

    await seite.locator('.blase').first().click()
    await seite.waitForTimeout(600)
    const raus = seite.locator('.blase.auf button:has-text("Nicht bestreiten")')
    if ((await raus.count()) > 0) {
      await raus.click()
      await seite.waitForTimeout(1600)
    }
    const weg = seite.locator('.blase.auf button:has-text("Position entfernen")')
    if ((await weg.count()) === 0) {
      melde('fehler', 'Zu einer herausgenommenen Position fehlt „Position entfernen".')
      return
    }
    await weg.click()
    await seite.waitForTimeout(3000)
    const nachher = await seite.locator('.positionsmarke').count()
    if (nachher !== vorher - 1) {
      melde('fehler', `Nach dem Entfernen stehen ${nachher} statt ${vorher - 1} Marken da.`)
    }
    if (durchgang === 2) {
      await seite.reload({ waitUntil: 'networkidle' })
      await seite.waitForSelector('.brief-flaeche', { timeout: 20000 })
      await seite.waitForTimeout(700)
      if ((await seite.locator('.positionsmarke').count()) !== nachher) {
        melde('fehler', 'Die entfernte Position kehrt beim Neuladen zurück.')
      }
    }
  })

  await pruefe('Stellungnahme löschen', async (durchgang) => {
    const id = wegwerf[durchgang] ?? wegwerf[1]!
    await seite.goto(`${BASIS}/stellungnahmen/${id}`, { waitUntil: 'networkidle' })
    await seite.waitForSelector('.brief-flaeche', { timeout: 20000 }).catch(() => {})
    const knopf = seite.locator('.brief-kopf-klappen .loeschknopf')
    if ((await knopf.count()) === 0) {
      if (durchgang === 1) melde('fehler', 'Im Schreibtisch fehlt der Löschknopf.')
      return
    }
    await knopf.click()
    await seite.waitForURL('**/stellungnahmen', { timeout: 20000 }).catch(() => {})
    await seite.waitForTimeout(1200)
    const nochDa = await seite.locator(`.zeile[href*="${id}"]`).count()
    if (nochDa > 0) melde('fehler', 'Die gelöschte Stellungnahme steht noch in der Liste.')
  })
}

/* ------------------------------------------------------------------ *
 * Bericht
 * ------------------------------------------------------------------ */

function bericht(konsole: string[]) {
  console.log(`\n\n  ══ Bericht ══\n`)
  console.log(`  Geprüft: ${geprueft.length} Handgriffe, jeder zweimal.`)

  const fehler = befunde.filter((b) => b.art === 'fehler')
  const unschoen = befunde.filter((b) => b.art === 'unschoen')

  if (fehler.length === 0 && unschoen.length === 0 && konsole.length === 0) {
    console.log('  Nichts zu beanstanden.')
    return
  }

  if (fehler.length > 0) {
    console.log(`\n  Fehlerhaftes Verhalten (${fehler.length}):`)
    for (const b of fehler) console.log(`    • [${b.bereich} · ${b.titel}] ${b.text}`)
  }
  if (unschoen.length > 0) {
    console.log(`\n  Ungünstiges Verhalten (${unschoen.length}):`)
    for (const b of unschoen) console.log(`    • [${b.bereich} · ${b.titel}] ${b.text}`)
  }
  if (konsole.length > 0) {
    console.log(`\n  Konsolenfehler (${konsole.length}):`)
    for (const k of [...new Set(konsole)].slice(0, 15)) console.log(`    • ${k}`)
  }
  process.exitCode = 1
}

/**
 * Zum Schluss ausdrücklich aussteigen.
 *
 * Der Zugang zur Datenbank für die Wegwerf-Schreiben hält eine Verbindung
 * offen; ohne diesen Ausstieg liefe die Probe nach dem Bericht weiter und
 * gäbe ihn nie aus.
 */
main()
  .then(() => process.exit(befunde.length > 0 ? 1 : 0))
  .catch((f) => {
    console.error(f)
    process.exit(1)
  })
