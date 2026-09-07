/**
 * Führt einen Browser durch den Fallimport.
 *
 *   pnpm exec tsx scripts/rundgang-faelle.ts [basisUrl] [zielordner]
 *
 * Setzt eine laufende Anwendung voraus, die auf die autoiXpert-Attrappe
 * (`scripts/aix-attrappe.ts`) oder die echte Schnittstelle zeigt.
 */
import { mkdirSync } from 'node:fs'
import { chromium } from 'playwright'

const BASIS = process.argv[2] ?? 'http://localhost:3210'
const ZIEL = process.argv[3] ?? '/tmp/rundgang-faelle'
/** Der Abmelden-Knopf der Kopfzeile steht im DOM vor dem Formular. */
const IMPORT_KNOPF = 'form:has(input[name=eingabe]) button[type=submit]'

const EMAIL = process.env.RUNDGANG_EMAIL ?? 'lgollenstede@gollenstede-sachverstand.de'
const PASSWORT = process.env.RUNDGANG_PASSWORT ?? 'TestNurLokal!2026'

async function main() {
  mkdirSync(ZIEL, { recursive: true })

  const browser = await chromium.launch({
    executablePath:
      process.env.CHROMIUM_PFAD ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  })
  const seite = await (
    await browser.newContext({ viewport: { width: 1360, height: 1000 }, locale: 'de-DE' })
  ).newPage()

  const fehler: string[] = []
  seite.on('console', (m) => m.type() === 'error' && fehler.push(m.text()))
  seite.on('pageerror', (f) => fehler.push(String(f)))

  await seite.goto(`${BASIS}/anmelden`, { waitUntil: 'networkidle' })
  await seite.fill('#email', EMAIL)
  await seite.fill('#passwort', PASSWORT)
  await Promise.all([
    seite.waitForURL('**/bibliothek'),
    seite.click('.anmelde-karte button[type=submit]'),
  ])

  await seite.goto(`${BASIS}/faelle`, { waitUntil: 'networkidle' })
  await seite.screenshot({ path: `${ZIEL}/1-leer.png`, fullPage: true })
  console.log('  1-leer                  Fallübersicht')

  // Fall über das Aktenzeichen laden — das ist der Weg, der eine Suche braucht.
  await seite.fill('input[name=eingabe]', 'GA-2026-0147')
  await Promise.all([
    seite.waitForURL(/\/faelle\/[0-9a-f-]{36}/, { timeout: 25000 }),
    seite.click(IMPORT_KNOPF),
  ])
  await seite.waitForLoadState('networkidle')
  await seite.screenshot({ path: `${ZIEL}/2-fall.png`, fullPage: true })
  console.log(`  2-fall                  ${await seite.locator('h1').first().innerText()}`)

  const platzhalter = await seite.locator('.seitenleiste code').count()
  console.log(`  Platzhalter aus dem Fall: ${platzhalter}`)
  const empfaenger = await seite.locator('.seitenleiste .karte').first().innerText()
  console.log(`  Empfängervorschlag:       ${empfaenger.split('\n')[2] ?? '—'}`)

  // Zweiter Fall über die technische ID — der direkte Weg.
  await seite.goto(`${BASIS}/faelle`, { waitUntil: 'networkidle' })
  await seite.fill('input[name=eingabe]', 'ZweiterFall')
  await Promise.all([
    seite.waitForURL(/\/faelle\/[0-9a-f-]{36}/, { timeout: 25000 }),
    seite.click(IMPORT_KNOPF),
  ])
  await seite.waitForLoadState('networkidle')
  console.log(`  3-zweiter               ${await seite.locator('h1').first().innerText()}`)

  // Unbekanntes Aktenzeichen muss eine verständliche Meldung liefern.
  await seite.goto(`${BASIS}/faelle`, { waitUntil: 'networkidle' })
  await seite.fill('input[name=eingabe]', 'GIBT-ES-NICHT')
  await seite.click(IMPORT_KNOPF)
  await seite.waitForSelector('.hinweis.fehler', { timeout: 25000 })
  const meldung = await seite.locator('.hinweis.fehler').innerText()
  console.log(`  4-fehlermeldung         ${meldung.slice(0, 80)}…`)

  await seite.goto(`${BASIS}/faelle`, { waitUntil: 'networkidle' })
  await seite.screenshot({ path: `${ZIEL}/5-liste.png`, fullPage: true })
  console.log(`  5-liste                 ${await seite.locator('.zeile').count()} Fälle`)

  await browser.close()

  if (fehler.length > 0) {
    console.log(`\n  Konsolenfehler (${fehler.length}):`)
    for (const f of fehler.slice(0, 8)) console.log(`    ${f}`)
    process.exit(1)
  }
  console.log('\n  Keine Konsolenfehler.')
}

main().catch((f) => {
  console.error(f)
  process.exit(1)
})
