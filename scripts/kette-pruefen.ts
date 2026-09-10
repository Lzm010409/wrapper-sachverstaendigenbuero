/**
 * Fährt einen echten Prüfbericht durch die gesamte Kette und zeigt, was
 * dabei herauskommt — ohne Datenbank und ohne Oberfläche.
 *
 *   pnpm exec tsx scripts/kette-pruefen.ts /pfad/zu/bericht.pdf ["Fahrzeug aus dem Fall"]
 *
 * Ist ANTHROPIC_API_KEY gesetzt, läuft die Extraktion gegen das echte
 * Modell. Ohne Schlüssel wird nur das Einlesen geprüft und die weitere
 * Kette mit einer hinterlegten Beispielauswertung durchgespielt — so lässt
 * sich Matching und Prüfliste auch ohne Modellzugang belegen.
 */
import { readFileSync } from 'node:fs'
import { leseBericht } from '../src/pruefbericht/einlesen'
import { pruefeSonderfaelle } from '../src/pruefbericht/sonderfaelle'
import { differenz, gesamtdifferenz, type Extraktion } from '../src/pruefbericht/schema'
import { BUENDEL_MIT_HONORAR } from '../src/pruefbericht/fixtures'
import { leseAlleEintraege } from '../src/bibliothek/migration'
import { findeVorschlaege, type Bibliothekseintrag } from '../src/stellungnahme/treffer'

const PFAD = process.argv[2]
const FAHRZEUG = process.argv[3] ?? null

if (!PFAD) {
  console.error('Aufruf: pnpm exec tsx scripts/kette-pruefen.ts <bericht.pdf> ["Fahrzeug"]')
  process.exit(1)
}

const euro = (n: number | null) =>
  n === null ? '—' : n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })

async function main() {
  console.log(`\n  Prüfbericht: ${PFAD}\n  ${'─'.repeat(64)}`)

  const bericht = await leseBericht(readFileSync(PFAD!))
  console.log(`  Seiten:            ${bericht.seitenzahl}`)
  console.log(
    `  davon Text:        ${bericht.zusammenfassung.text}   ` +
      `gerastert: ${bericht.zusammenfassung.bild}`,
  )
  console.log(
    `  Seitenarten:       ${bericht.seiten.map((s) => `${s.nummer}:${s.art === 'text' ? 'T' : 'B'}`).join(' ')}`,
  )

  let extraktion: Extraktion
  if (process.env.ANTHROPIC_API_KEY) {
    const { extrahierePositionen } = await import('../src/pruefbericht/extraktion')
    console.log('\n  Auswertung läuft gegen das Sprachmodell …')
    extraktion = (await extrahierePositionen(bericht)).extraktion
  } else {
    console.log('\n  Kein ANTHROPIC_API_KEY — Kette läuft mit hinterlegter Beispielauswertung.')
    extraktion = BUENDEL_MIT_HONORAR
  }

  console.log(`\n  Prüfdienstleister: ${extraktion.pruefdienstleister ?? '—'}`)
  console.log(`  Versicherer:       ${extraktion.versicherer ?? '—'}`)
  console.log(`  Fahrzeug:          ${extraktion.fahrzeug ?? '—'}`)
  console.log(
    `  Summen:            ${euro(extraktion.summeGutachten)} → ${euro(extraktion.summeGekuerzt)}`,
  )

  console.log(`\n  Abschnitte (${extraktion.abschnitte.length})`)
  for (const a of extraktion.abschnitte) {
    const marke = a.fuerStellungnahmeRelevant ? '✓' : '·'
    console.log(`    ${marke} S.${a.seiteVon}–${a.seiteBis}  ${a.bezeichnung}  [${a.typ}]`)
  }

  const befunde = pruefeSonderfaelle(extraktion, FAHRZEUG)
  console.log(`\n  Prüfliste (${befunde.length})`)
  for (const b of befunde) {
    console.log(`    [${b.dringlichkeit.toUpperCase()}] ${b.kennung} — ${b.titel}`)
    console.log(`        ${b.befund}`)
  }

  const bibliothek: Bibliothekseintrag[] = leseAlleEintraege().map((e, i) => ({
    id: `e${i}`,
    nummer: e.nummer,
    titel: e.titel,
    bereich: e.bereich,
    abschnitt: e.abschnitt,
    typischeBegruendung: e.typischeBegruendung,
    gegenargument: e.gegenargument || null,
    vorgehen: e.vorgehen,
    status: 'freigegeben',
    haeufigkeitText: e.haeufigkeitText,
    varianten: e.varianten.map((v, j) => ({ id: `e${i}v${j}`, bezeichnung: v.bezeichnung, text: v.text })),
  }))

  const unfallfremd = new Set(
    extraktion.abschnitte.filter((a) => !a.fuerStellungnahmeRelevant).map((a) => a.typ),
  )
  const relevante = extraktion.positionen.filter((p) => !unfallfremd.has(p.typ))

  console.log(
    `\n  Positionen: ${relevante.length} für die Stellungnahme, ` +
      `${extraktion.positionen.length - relevante.length} unfallfremd ausgelassen`,
  )
  console.log(`  Gesamtkürzung: ${euro(gesamtdifferenz(relevante))}\n`)

  let ohneTreffer = 0
  for (const [i, p] of relevante.entries()) {
    const liste = findeVorschlaege(p, bibliothek)
    if (liste.kandidaten.length === 0) ohneTreffer++
    console.log(`  ${i + 1}. ${p.bezeichnung}   −${euro(differenz(p))}`)
    if (liste.kandidaten.length === 0) {
      console.log('       kein Vorschlag — Suche oder eigener Text')
    }
    for (const k of liste.kandidaten.slice(0, 3)) {
      const varianten = k.passendeVarianten.length
        ? `  (Variante: ${k.passendeVarianten[0]!.bezeichnung.slice(0, 40)})`
        : ''
      console.log(
        `       ${k.guete.padEnd(10)} ${k.eintrag.nummer.padEnd(5)} ${k.eintrag.titel.slice(0, 58)}${varianten}`,
      )
    }
  }

  console.log(
    `\n  ${relevante.length - ohneTreffer} von ${relevante.length} Positionen mit Vorschlag.\n`,
  )
}

main().catch((f) => {
  console.error(f)
  process.exit(1)
})
