/**
 * Bildschirmfotos im Sichtfenster — nicht als ganze Seite.
 *
 *   pnpm exec tsx scripts/ansicht.ts [basisUrl] [zielordner]
 *
 * Für die Beurteilung der Gestaltung: eine sehr lange Seite als ein Bild
 * sagt über Proportionen nichts aus. Hier wird abgelichtet, was jemand
 * tatsächlich vor sich hat.
 */
import { mkdirSync } from 'node:fs'
import { chromium, type Browser } from 'playwright'

const BASIS = process.argv[2] ?? 'http://localhost:3000'
const ZIEL = process.argv[3] ?? '/tmp/ansicht'
const EMAIL = process.env.RUNDGANG_EMAIL ?? 'lgollenstede@gollenstede-sachverstand.de'
const PASSWORT = process.env.RUNDGANG_PASSWORT ?? 'TestNurLokal!2026'

const SEITEN = [
  { pfad: '/bibliothek', name: 'bibliothek' },
  { pfad: '/stellungnahmen', name: 'stellungnahmen' },
  { pfad: '/faelle', name: 'faelle' },
]

async function lichteAb(browser: Browser, dunkel: boolean) {
  const kontext = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: 'de-DE',
    colorScheme: dunkel ? 'dark' : 'light',
  })
  const seite = await kontext.newPage()

  await seite.goto(`${BASIS}/anmelden`, { waitUntil: 'networkidle' })
  await seite.screenshot({ path: `${ZIEL}/anmelden-${dunkel ? 'dunkel' : 'hell'}.png` })
  await seite.fill('#email', EMAIL)
  await seite.fill('#passwort', PASSWORT)
  await Promise.all([
    seite.waitForURL('**/bibliothek', { timeout: 20000 }),
    seite.locator('form button[type=submit]').click(),
  ])

  for (const s of SEITEN) {
    await seite.goto(`${BASIS}${s.pfad}`, { waitUntil: 'networkidle' })
    await seite.waitForTimeout(400)
    await seite.screenshot({ path: `${ZIEL}/${s.name}-${dunkel ? 'dunkel' : 'hell'}.png` })
  }

  // Ein Eintrag der Bibliothek und der Schreibtisch.
  await seite.goto(`${BASIS}/bibliothek`, { waitUntil: 'networkidle' })
  await seite.locator('.zeile').first().click()
  await seite.waitForLoadState('networkidle')
  await seite.screenshot({ path: `${ZIEL}/eintrag-${dunkel ? 'dunkel' : 'hell'}.png` })

  await seite.goto(`${BASIS}/stellungnahmen`, { waitUntil: 'networkidle' })
  const zeile = seite.locator('.zeile').first()
  if (await zeile.count()) {
    await zeile.click()
    await seite.waitForSelector('.brief-flaeche', { timeout: 20000 })
    await seite.waitForTimeout(700)
    await seite.screenshot({ path: `${ZIEL}/schreibtisch-${dunkel ? 'dunkel' : 'hell'}.png` })
  }

  await kontext.close()
}

async function main() {
  mkdirSync(ZIEL, { recursive: true })
  const browser = await chromium.launch({
    executablePath:
      process.env.CHROMIUM_PFAD ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  })
  await lichteAb(browser, false)
  await lichteAb(browser, true)
  await browser.close()
  console.log(`  Bildschirmfotos in ${ZIEL}`)
}

main().catch((f) => {
  console.error(f)
  process.exit(1)
})
