/**
 * Führt einen echten Browser durch den Schreibtisch.
 *
 *   pnpm exec tsx scripts/rundgang-brief.ts [basisUrl] [zielordner]
 *
 * Geprüft wird der Weg, den der Sachverständige tatsächlich geht: Brief
 * öffnen, eine Anmerkung am Rand aufklappen, einen Baustein bearbeiten und
 * einfügen, im Brief weiterschreiben, speichern lassen.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { deflateSync } from 'node:zlib'
import { chromium, type Page } from 'playwright'

/**
 * Ein echtes PNG mit Farbverlauf.
 *
 * Kein Bild aus dem Netz und keine mitgelieferte Datei: der Rundgang soll
 * ohne Zutaten laufen. Gebaut wird von Hand — Signatur, IHDR, IDAT, IEND,
 * jede Blockprüfsumme selbst gerechnet.
 */
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
  ihdr[8] = 8 // Bittiefe
  ihdr[9] = 2 // Echtfarbe
  const roh = Buffer.alloc(hoehe * (1 + breite * 3))
  for (let y = 0; y < hoehe; y++) {
    const zeile = y * (1 + breite * 3)
    for (let x = 0; x < breite; x++) {
      const p = zeile + 1 + x * 3
      roh[p] = Math.round((x / breite) * 255)
      roh[p + 1] = Math.round((y / hoehe) * 200)
      roh[p + 2] = 180
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
 * Ein winziges, gültiges PDF mit zwei Textseiten.
 *
 * Genug, damit der Weg „hochladen → einlesen → auswerten" wirklich
 * beschritten wird und der Fortschritt Seite für Seite meldet.
 */
function baueMiniPdf(): string {
  const seite = (nummer: number, inhalt: number) =>
    `${nummer} 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] ` +
    `/Resources << /Font << /F1 9 0 R >> >> /Contents ${inhalt} 0 R >>endobj\n`

  const text = (nummer: number, was: string) => {
    const zeilen = Array.from(
      { length: 6 },
      (_, i) => `BT /F1 12 Tf 72 ${760 - i * 20} Td (${was} Zeile ${i + 1}) Tj ET`,
    )
    const strom = zeilen.join('\n') + '\n'
    return `${nummer} 0 obj<< /Length ${strom.length} >>stream\n${strom}endstream\nendobj\n`
  }

  return (
    '%PDF-1.4\n' +
    '1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj\n' +
    '2 0 obj<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>endobj\n' +
    seite(3, 5) +
    seite(4, 6) +
    text(5, 'Kuerzungsbericht Musterseite eins mit Fliesstext') +
    text(6, 'Kuerzungsbericht Musterseite zwei mit Fliesstext') +
    '9 0 obj<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>endobj\n' +
    'trailer<< /Root 1 0 R /Size 10 >>\n%%EOF\n'
  )
}

const BASIS = process.argv[2] ?? 'http://localhost:3000'
const ZIEL = process.argv[3] ?? '/tmp/rundgang-brief'
const EMAIL = process.env.RUNDGANG_EMAIL ?? 'lgollenstede@gollenstede-sachverstand.de'
const PASSWORT = process.env.RUNDGANG_PASSWORT ?? 'TestNurLokal!2026'

/**
 * Dieselbe Wahl wie beim Zurücksetzen: nicht versendet, mit Positionen.
 *
 * Ein versendetes Schreiben ist geschlossen und nimmt keine Eingabe an, ein
 * Schreiben ohne Position hat keinen Abschnitt, in den sich schreiben
 * liesse. In beiden Fällen scheiterte der Rundgang an der Wahl des
 * Prüflings, nicht an der Anwendung.
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

async function anmelden(seite: Page) {
  await seite.goto(`${BASIS}/anmelden`, { waitUntil: 'networkidle' })
  await seite.fill('#email', EMAIL)
  await seite.fill('#passwort', PASSWORT)
  await Promise.all([
    seite.waitForURL('**/stellungnahmen', { timeout: 20000 }),
    seite.locator('form button[type=submit]').click(),
  ])
}

/**
 * Setzt den Prüfling auf seinen Ausgangsstand zurück.
 *
 * Der Rundgang greift sich das oberste Schreiben der Übersicht und
 * bearbeitet es — und zwar bei jedem Lauf dasselbe. Die Spuren blieben
 * darin stehen: das Bild lag schon auf der kleinsten Breite, die
 * Überschrift war vom letzten Mal gelöscht, im Brief stand die Ergänzung
 * von vorgestern. Der Lauf beanstandete dann Dinge, die er selbst
 * angerichtet hatte — „das Bild lässt sich nicht mehr schmaler ziehen"
 * stimmte, war aber keine Aussage über die Anwendung.
 *
 * Das Dokument wird deshalb vor dem Lauf entfernt. Es wird beim nächsten
 * Öffnen aus den Bausteinen der Positionen neu gebaut; die Stellungnahme
 * selbst, ihre Positionen und ihr Fall bleiben unberührt.
 *
 * Ohne Datenbankzugang wird nichts zurückgesetzt — dann läuft der Rundgang
 * wie bisher und sagt es an.
 */
async function setzePrueflingZurueck(): Promise<string> {
  if (!process.env.DATABASE_URL) {
    return 'ohne Datenbankzugang — der Prüfling behält die Spuren des letzten Laufs'
  }

  const { db } = await import('../src/db/index')
  const { stellungnahme, position } = await import('../src/db/schema')
  const { and, desc, eq, isNull, sql } = await import('drizzle-orm')

  const [ziel] = await db
    .select({ id: stellungnahme.id, betreff: stellungnahme.betreff })
    .from(stellungnahme)
    .where(
      and(
        isNull(stellungnahme.versendetAm),
        sql`exists (select 1 from ${position} p where p.stellungnahme_id = ${sql.identifier('stellungnahme')}.${sql.identifier('id')})`,
      ),
    )
    .orderBy(desc(stellungnahme.erstelltAm))
    .limit(1)

  if (!ziel) return 'kein geeigneter Prüfling gefunden'

  await db
    .update(stellungnahme)
    .set({ dokument: null, dokumentStand: 0 })
    .where(eq(stellungnahme.id, ziel.id))

  return `„${ziel.betreff ?? 'ohne Betreff'}" auf den Ausgangsstand gesetzt`
}

async function main() {
  mkdirSync(ZIEL, { recursive: true })
  console.log(`  Prüfling: ${await setzePrueflingZurueck()}`)

  const browser = await chromium.launch({
    executablePath:
      process.env.CHROMIUM_PFAD ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  })
  const kontext = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    locale: 'de-DE',
  })
  const seite = await kontext.newPage()

  const fehler: string[] = []
  // Was der Rundgang selbst beanstandet. Ohne diese Liste stünde eine
  // Rückentwicklung nur als Zahl in der Ausgabe und liefe niemandem auf.
  const maengel: string[] = []
  seite.on('console', (m) => {
    if (m.type() === 'error') fehler.push(m.text())
  })
  seite.on('pageerror', (f) => fehler.push(String(f)))

  const schritt = async (name: string) => {
    await seite.screenshot({ path: `${ZIEL}/${name}.png`, fullPage: true })
    console.log(`  ${name.padEnd(24)} ${seite.url()}`)
  }

  await anmelden(seite)
  await seite.goto(`${BASIS}/stellungnahmen`, { waitUntil: 'networkidle' })

  // Auswertung anstossen und den Fortschritt beobachten. Ohne Zugang zum
  // Sprachmodell ist der Knopf gesperrt — dann bleibt dieser Schritt aus.
  const auswerten = seite.locator('button:has-text("Prüfbericht auswerten")')
  if (await auswerten.isEnabled()) {
    const pdfPfad = join(ZIEL, 'mini.pdf')
    writeFileSync(pdfPfad, baueMiniPdf(), 'latin1')
    await seite.setInputFiles('input[type=file]', pdfPfad)
    const wartetAufAuswertung = seite
      .waitForSelector('[role=progressbar]', { timeout: 8000 })
      .catch(() => null)
    await auswerten.click()
    if (await wartetAufAuswertung) {
      console.log(`  Auswertung meldet: ${await seite.locator('.fortschritt-text').innerText()}`)
      await schritt('0-auswertung')
      // Etwas später steht der Verlauf der gelesenen Seiten im Balken.
      await seite.waitForTimeout(900)
      if (await seite.locator('[role=progressbar]').count()) {
        console.log(`  Weiter: ${await seite.locator('.fortschritt-text').innerText()}`)
        console.log(
          `  Verlauf: ${(await seite.locator('.fortschritt-verlauf li').allInnerTexts()).join(' | ')}`,
        )
        await schritt('0b-auswertung-verlauf')
      }
    } else {
      console.log('  Kein Fortschrittsbalken bei der Auswertung erschienen.')
    }
    await seite.waitForTimeout(3000)
    const ausgang = await seite.locator('.hinweis').first().innerText().catch(() => '—')
    console.log(`  Ausgang der Auswertung: ${ausgang.slice(0, 90)}`)
  } else {
    console.log('  Auswertung gesperrt (kein Zugang zum Sprachmodell) — Schritt ausgelassen.')
  }

  await seite.goto(`${BASIS}/stellungnahmen`, { waitUntil: 'networkidle' })
  await (await offeneZeile(seite)).click()
  await seite.waitForSelector('.brief-flaeche', { timeout: 20000 })
  await seite.waitForTimeout(600)
  await schritt('1-schreibtisch')

  const abschnitte = await seite.locator('.d-abschnitt').count()
  const blasen = await seite.locator('.blase').count()
  console.log(`  Abschnitte im Brief: ${abschnitte}, Anmerkungen am Rand: ${blasen}`)

  // Erste Anmerkung aufklappen.
  await seite.locator('.blase.zu').first().click()
  await seite.waitForTimeout(400)
  await schritt('2-anmerkung-offen')

  // Einen Vorschlag öffnen und bearbeiten.
  const vorschlag = seite.locator('.blase.auf .blase-vorschlag-kopf').first()
  if (await vorschlag.count()) {
    await vorschlag.click()
    await seite.waitForTimeout(300)
    const feld = seite.locator('.blase-entwurf textarea').first()
    await feld.click()
    await feld.press('End')
    await feld.type(' Ergänzung aus dem Rundgang.')
    await schritt('3-baustein-bearbeitet')

    await seite.locator('.blase-entwurf button.haupt').first().click()
    await seite.waitForTimeout(1600)
    await schritt('4-eingefuegt')

    const quellen = await seite.locator('.brief-flaeche .d-quelle').count()
    console.log(`  Markierte Textstellen im Brief: ${quellen}`)
  } else {
    console.log('  Zu dieser Position gibt es keinen Vorschlag — übersprungen.')
  }

  // Im Brief selbst weiterschreiben.
  const ersterAbsatz = seite.locator('.brief-flaeche .d-abschnitt p').first()
  if (await ersterAbsatz.count()) {
    await ersterAbsatz.click()
    await seite.keyboard.press('End')
    await seite.keyboard.type(' Im Brief selbst weitergeschrieben.')
    await seite.waitForTimeout(1800)
  }

  const stand = await seite.locator('.speicherstand').innerText()
  console.log(`  Speicherstand nach dem Tippen: ${stand}`)
  await schritt('5-im-brief-geschrieben')

  // Einen Baustein in den Brief ziehen.
  const vorher_gezogen = await seite.locator('.brief-flaeche .d-quelle').count()
  const griff = seite.locator('.blase.auf .blase-vorschlag-kopf.ziehbar').first()
  const ziel = seite.locator('.brief-flaeche .d-abschnitt').first().locator('p').first()
  if ((await griff.count()) && (await ziel.count())) {
    await griff.dragTo(ziel)
    await seite.waitForTimeout(1600)
    const nachher = await seite.locator('.brief-flaeche .d-quelle').count()
    console.log(`  Markierte Stellen vor dem Ziehen ${vorher_gezogen}, danach ${nachher}`)
    await schritt('6-gezogen')
  }

  // Die Schnellauswahl über der Markierung.
  const schreibstelle = seite.locator('.brief-flaeche .d-abschnitt p').first()
  await schreibstelle.click()
  await seite.keyboard.press('End')
  await seite.keyboard.type(' Diese Stelle wird ausgezeichnet.')
  for (let i = 0; i < 14; i++) await seite.keyboard.press('Shift+ArrowLeft')
  await seite.waitForTimeout(700)
  const schnellauswahlDa = await seite
    .locator('.schnellauswahl')
    .isVisible()
    .catch(() => false)
  console.log(`  Schnellauswahl über der Markierung: ${schnellauswahlDa}`)
  if (!schnellauswahlDa) {
    maengel.push('Über der Markierung erschien keine Schnellauswahl.')
  } else {
    const fettVorher = await seite.locator('.brief-flaeche strong').count()
    await seite.locator('.schnellauswahl button[title="Fett"]').click()
    await seite.waitForTimeout(600)
    const fettNachher = await seite.locator('.brief-flaeche strong').count()
    console.log(`  Fette Stellen vorher ${fettVorher}, danach ${fettNachher}`)
    if (fettNachher <= fettVorher) maengel.push('Fett aus der Schnellauswahl blieb wirkungslos.')
    await schritt('6a-schnellauswahl')
  }

  // Alles ausschneiden und wieder einfügen: der Rahmen muss stehen bleiben
  // und der Text vollständig zurückkommen.
  const briefText = () =>
    seite.evaluate(() => (document.querySelector('.brief-flaeche') as HTMLElement)?.innerText ?? '')
  const abschnittsZahl = () => seite.locator('.brief-flaeche .d-abschnitt').count()

  const textVorSchnitt = await briefText()
  const abschnitteVorSchnitt = await abschnittsZahl()
  await seite.keyboard.press('Control+a')
  await seite.keyboard.press('Control+x')
  await seite.waitForTimeout(900)
  const abschnitteNachSchnitt = await abschnittsZahl()
  console.log(
    `  Abschnitte vor dem Schnitt ${abschnitteVorSchnitt}, danach ${abschnitteNachSchnitt}`,
  )
  if (abschnitteNachSchnitt !== abschnitteVorSchnitt) {
    maengel.push('Das Ausschneiden hat Abschnitte mitgenommen — der Rahmen soll stehen bleiben.')
  }
  await seite.keyboard.press('Control+v')
  await seite.waitForTimeout(1600)
  const textNachEinfuegen = await briefText()
  console.log(`  Text nach dem Einfügen wiederhergestellt: ${textNachEinfuegen === textVorSchnitt}`)
  if (textNachEinfuegen !== textVorSchnitt) {
    maengel.push('Nach Ausschneiden und Einfügen stand nicht wieder dasselbe im Brief.')
  }
  await schritt('6b-schnitt-und-einfuegen')

  // Die Marken in der Leiste tragen die Zahlen des Prüfberichts — auch bei
  // einem Schreiben, in dem noch nichts steht.
  const markenzahlen = await seite.locator('.positionsmarke span').allInnerTexts()
  console.log(`  Marken in der Leiste: ${markenzahlen.join(' ')}`)
  if (markenzahlen.some((t) => !/^\d+$/.test(t.trim()))) {
    maengel.push('In der Positionsleiste stand statt einer Zahl ein Strich.')
  }

  // Die Leiste bricht um, statt waagerecht davonzulaufen.
  const rolltWeg = await seite
    .locator('.positionsleiste')
    .evaluate((e) => e.scrollWidth > e.clientWidth + 2)
  console.log(`  Positionsleiste rollt waagerecht: ${rolltWeg}`)
  if (rolltWeg) maengel.push('Die Positionsleiste rollt waagerecht — Marken stehen ausserhalb.')

  // Die Marken im Papierrand: eine je Abschnitt, und ein Klick öffnet die
  // zugehörige Anmerkung.
  const markenImBrief = await seite.locator('.brief-flaeche .abschnittsmarke').count()
  const abschnittsZahlJetzt = await seite.locator('.brief-flaeche .d-abschnitt').count()
  console.log(`  Marken im Brief: ${markenImBrief} bei ${abschnittsZahlJetzt} Abschnitten`)
  if (markenImBrief !== abschnittsZahlJetzt) {
    maengel.push('Nicht jeder Abschnitt trägt eine Marke im Papierrand.')
  }
  if (markenImBrief > 1) {
    await seite.locator('.brief-flaeche .abschnittsmarke').nth(1).click()
    await seite.waitForTimeout(700)
    const geoeffnet = await seite.locator('.blase.auf .blase-nummer').innerText()
    console.log(`  Klick auf Marke 2 öffnet Anmerkung: ${geoeffnet.trim()}`)
    if (geoeffnet.trim() !== '2') {
      maengel.push('Der Klick auf eine Marke im Brief öffnete die falsche Anmerkung.')
    }
    await schritt('6c-marken')
  }

  // Eine gelöschte Überschrift darf den Abschnitt nicht unsichtbar machen.
  const kopf = seite.locator('.brief-flaeche .d-abschnitt .d-ueberschrift').first()
  const kopfText = (await kopf.innerText()).trim()
  await kopf.click()
  await seite.keyboard.press('End')
  // Zeichenweise: eine Auswahl über Umschalt+Pos1 verhält sich je nach
  // Umgebung anders, das Löschen von hinten nicht.
  for (let i = 0; i < kopfText.length; i++) await seite.keyboard.press('Backspace')
  await seite.waitForTimeout(700)
  const schatten = await seite
    .locator('.brief-flaeche .d-ueberschrift.ueberschrift-leer')
    .first()
    .getAttribute('data-titel')
    .catch(() => null)
  console.log(`  Gelöschte Überschrift zeigt als Schatten: ${schatten ?? '— nichts —'}`)
  if (!schatten) {
    maengel.push('Eine gelöschte Überschrift liess den Abschnitt spurlos verschwinden.')
  }
  for (let i = 0; i < kopfText.length; i++) await seite.keyboard.press('Control+z')
  await seite.waitForTimeout(900)
  const zurueck = (await kopf.innerText()).trim()
  if (zurueck !== kopfText) {
    maengel.push('Rückgängig brachte die Überschrift nicht zurück.')
  }

  // Ein Bild einfügen, beschriften und in der Breite ziehen.
  const bildPfad = join(ZIEL, 'kalkulationsauszug.png')
  writeFileSync(bildPfad, baueTestPng(640, 360))
  await seite.setInputFiles('input[type=file][accept*="image"]', bildPfad)
  await seite.waitForSelector('.d-bild', { timeout: 15000 })
  await seite.waitForTimeout(900)
  console.log(`  Bilder im Brief: ${await seite.locator('.d-bild').count()}`)

  const beschriftung = seite.locator('.d-bild-unterschrift').first()
  await beschriftung.click()
  await seite.keyboard.type('Auszug aus der Kalkulation, Position 1')
  await seite.waitForTimeout(300)

  const rahmen = seite.locator('.d-bild-rahmen').first()
  // Ins Sichtfeld holen: rohe Mausbewegungen scrollen nicht von selbst, und
  // ein Griff ausserhalb des Fensters bekommt den Zeiger nie zu sehen.
  await rahmen.scrollIntoViewIfNeeded()
  await seite.waitForTimeout(300)
  const vorherBreite = (await rahmen.boundingBox())?.width ?? 0
  const bildgriff = seite.locator('.d-bild-griff').first()
  const kasten = await bildgriff.boundingBox()
  if (kasten) {
    await seite.mouse.move(kasten.x + kasten.width / 2, kasten.y + kasten.height / 2)
    await seite.mouse.down()
    await seite.mouse.move(kasten.x - 120, kasten.y + kasten.height / 2, { steps: 12 })
    // Kein Bildschirmfoto mitten im Zug: eine Ganzseitenaufnahme ändert
    // vorübergehend die Fenstergrösse und verschiebt damit den Zeiger.
    await seite.mouse.up()
    await seite.waitForTimeout(1400)
  }
  const nachherBreite = (await rahmen.boundingBox())?.width ?? 0
  console.log(
    `  Bildbreite vor dem Ziehen ${Math.round(vorherBreite)} px, danach ${Math.round(nachherBreite)} px`,
  )
  if (Math.abs(nachherBreite - vorherBreite) < 20) {
    maengel.push(
      'Das Bild liess sich nach dem Klick in die Beschriftung nicht mehr in der Breite ziehen.',
    )
  }
  await schritt('6c-bild')

  // Erscheinungsbild umschalten.
  await seite.locator('.erscheinung').click()
  await seite.waitForTimeout(200)
  const nachEinmal = await seite.evaluate(() => document.documentElement.dataset.theme ?? 'system')
  await seite.locator('.erscheinung').click()
  await seite.waitForTimeout(200)
  const nachZweimal = await seite.evaluate(() => document.documentElement.dataset.theme ?? 'system')
  console.log(`  Erscheinungsbild: ${nachEinmal} → ${nachZweimal}`)
  await schritt('7-erscheinung')
  await seite.locator('.erscheinung').click()

  // Eine Position herausnehmen und wieder aufnehmen — die Nummerierung muss
  // nachrücken und der Abschnitt an seine Stelle zurückkehren.
  const ueberschriften = () =>
    seite.locator('.brief-flaeche .d-ueberschrift').allInnerTexts()

  // Eine Position, die im Schreiben steht — aus einem früheren Durchgang
  // kann eine andere noch herausgenommen sein.
  await seite.locator('.blase:not(.draussen)').first().click()
  await seite.waitForTimeout(400)

  const vorher = await ueberschriften()
  await seite.locator('.blase.auf button:has-text("Nicht bestreiten")').click()
  await seite.waitForTimeout(1400)
  const ohne = await ueberschriften()
  console.log(`  Abschnitte vorher ${vorher.length}, nach dem Herausnehmen ${ohne.length}`)

  // Die herausgenommene Position ist die mit der Marke `draussen` — nicht
  // zwingend die erste am Rand.
  await seite.locator('.blase.draussen').first().click()
  await seite.locator('.blase.auf button:has-text("Doch bestreiten")').click()
  await seite.waitForTimeout(1400)
  const wieder = await ueberschriften()
  console.log(`  Nach dem Wiederaufnehmen ${wieder.length}`)
  console.log(`  Reihenfolge gleich wie zuvor: ${JSON.stringify(wieder) === JSON.stringify(vorher)}`)
  if (JSON.stringify(wieder) !== JSON.stringify(vorher)) {
    maengel.push('Nach dem Wiederaufnehmen stand der Abschnitt nicht mehr an seiner Stelle.')
  }
  await schritt('8-wieder-aufgenommen')

  // Prüfen und ausgeben.
  // Der Balken kann bei einem kleinen Schreiben schnell wieder weg sein —
  // deshalb wird auf ihn gewartet, bevor der Knopf gedrückt wird.
  const wartetAufBalken = seite
    .waitForSelector('[role=progressbar]', { timeout: 8000 })
    .catch(() => null)
  await seite.locator('button:has-text("Dokument erzeugen")').click()
  const balken = await wartetAufBalken
  console.log(`  Fortschrittsbalken beim Erzeugen erschienen: ${Boolean(balken)}`)
  if (balken) {
    // Bei einem kleinen Schreiben ist der Balken schon wieder weg, bevor
    // sein Text gelesen werden kann — das ist kein Mangel.
    const meldung = await seite
      .locator('.fortschritt-text')
      .innerText()
      .catch(() => '— schon durch —')
    console.log(`  Erste Meldung: ${meldung}`)
    await schritt('9-fortschritt')
  }
  // Zwei gültige Ausgänge: fertige Dateien — oder eine Sperre der Wächter,
  // wenn im Schreiben noch ein offener Platzhalter steht. Beides muss
  // sichtbar sein; stillschweigend enden darf der Vorgang nicht.
  await Promise.race([
    seite.waitForSelector('.ausgabe-leiste', { timeout: 40000 }),
    seite.waitForSelector('.hinweis.fehler', { timeout: 40000 }),
  ]).catch(() => null)
  if ((await seite.locator('.ausgabe-leiste').count()) > 0) {
    console.log('  Ausgabe: beide Dateien stehen bereit.')
  } else {
    // Genau die Meldung des Schreibtischs, nicht irgendeinen Hinweis am Rand.
    const meldung = await seite.locator('.werkbank > .hinweis[role=status]').innerText().catch(() => '')
    console.log(`  Ausgabe gesperrt: ${meldung.replace(/\n/g, ' ').slice(0, 120)}`)
    if (!meldung.trim()) {
      maengel.push('Das Erzeugen endete weder mit Dateien noch mit einer Meldung.')
    }
  }
  await schritt('9b-ausgabe')

  await kontext.close()

  const dunkel = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    locale: 'de-DE',
    colorScheme: 'dark',
  })
  const seite2 = await dunkel.newPage()
  await anmelden(seite2)
  await seite2.goto(`${BASIS}/stellungnahmen`, { waitUntil: 'networkidle' })
  await (await offeneZeile(seite2)).click()
  await seite2.waitForSelector('.brief-flaeche', { timeout: 20000 })
  await seite2.waitForTimeout(600)
  await seite2.screenshot({ path: `${ZIEL}/10-schreibtisch-dunkel.png`, fullPage: true })
  console.log(`  10-schreibtisch-dunkel   ${seite2.url()}`)

  await browser.close()

  if (maengel.length > 0) {
    console.log(`\n  Beanstandungen (${maengel.length}):`)
    for (const m of maengel) console.log(`    ${m}`)
  }
  if (fehler.length > 0) {
    console.log(`\n  Konsolenfehler (${fehler.length}):`)
    for (const f of fehler.slice(0, 10)) console.log(`    ${f}`)
  }
  if (maengel.length > 0 || fehler.length > 0) process.exit(1)
  console.log('\n  Keine Konsolenfehler, nichts zu beanstanden.')
}

main().catch((f) => {
  console.error(f)
  process.exit(1)
})
