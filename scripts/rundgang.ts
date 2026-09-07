/**
 * Führt einen echten Browser durch die Anwendung und legt Bildschirmfotos ab.
 *
 *   pnpm exec tsx scripts/rundgang.ts [basisUrl] [zielordner]
 *
 * Gedacht als schneller Sichtprüfungslauf während der Entwicklung — die
 * eigentliche Absicherung leisten die Vitest-Tests.
 */
import { mkdirSync } from 'node:fs'
import { chromium } from 'playwright'

const BASIS = process.argv[2] ?? 'http://localhost:3210'
const ZIEL = process.argv[3] ?? '/tmp/rundgang'
const EMAIL = process.env.RUNDGANG_EMAIL ?? 'lgollenstede@gollenstede-sachverstand.de'
const PASSWORT = process.env.RUNDGANG_PASSWORT ?? 'TestNurLokal!2026'

async function main() {
  mkdirSync(ZIEL, { recursive: true })

  // Der vorinstallierte Browser liegt unter einer versionierten Pfadangabe;
  // PLAYWRIGHT_BROWSERS_PATH allein reicht nicht, wenn die Playwright-Version
  // eine andere Revision erwartet.
  const browser = await chromium.launch({
    executablePath:
      process.env.CHROMIUM_PFAD ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  })
  const kontext = await browser.newContext({ viewport: { width: 1360, height: 940 }, locale: 'de-DE' })
  const seite = await kontext.newPage()

  const fehler: string[] = []
  seite.on('console', (m) => {
    if (m.type() === 'error') fehler.push(m.text())
  })
  seite.on('pageerror', (f) => fehler.push(String(f)))

  const schritt = async (name: string) => {
    await seite.screenshot({ path: `${ZIEL}/${name}.png`, fullPage: true })
    console.log(`  ${name.padEnd(22)} ${seite.url()}`)
  }

  await seite.goto(`${BASIS}/anmelden`, { waitUntil: 'networkidle' })
  await schritt('1-anmelden')

  await seite.fill('#email', EMAIL)
  await seite.fill('#passwort', PASSWORT)
  await Promise.all([
    seite.waitForURL('**/bibliothek', { timeout: 20000 }),
    seite.click('button[type=submit]'),
  ])
  await seite.waitForLoadState('networkidle')
  await schritt('2-bibliothek')

  const zeilen = await seite.locator('.zeile').count()
  console.log(`  Einträge in der Liste: ${zeilen}`)

  await seite.fill('input[type=search]', 'Halterung')
  await seite.waitForTimeout(900)
  await schritt('3-suche')
  const gefiltert = await seite.locator('.zeile').count()
  console.log(`  Treffer für „Halterung": ${gefiltert}`)

  await seite.locator('.zeile').first().click()
  await seite.waitForLoadState('networkidle')
  await schritt('4-eintrag')

  const ueberschrift = await seite.locator('h1').first().innerText()
  console.log(`  Geöffneter Eintrag: ${ueberschrift}`)

  // Dunkles Erscheinungsbild gegenprüfen.
  await kontext.close()
  const dunkel = await browser.newContext({
    viewport: { width: 1360, height: 940 },
    locale: 'de-DE',
    colorScheme: 'dark',
  })
  const seite2 = await dunkel.newPage()
  await seite2.goto(`${BASIS}/anmelden`, { waitUntil: 'networkidle' })
  await seite2.fill('#email', EMAIL)
  await seite2.fill('#passwort', PASSWORT)
  await Promise.all([
    seite2.waitForURL('**/bibliothek', { timeout: 20000 }),
    seite2.click('button[type=submit]'),
  ])
  await seite2.waitForLoadState('networkidle')
  await seite2.screenshot({ path: `${ZIEL}/5-bibliothek-dunkel.png`, fullPage: true })
  console.log(`  5-bibliothek-dunkel    ${seite2.url()}`)

  await browser.close()

  if (fehler.length > 0) {
    console.log(`\n  Konsolenfehler (${fehler.length}):`)
    for (const f of fehler.slice(0, 10)) console.log(`    ${f}`)
    process.exit(1)
  }
  console.log('\n  Keine Konsolenfehler.')
}

main().catch((f) => {
  console.error(f)
  process.exit(1)
})
