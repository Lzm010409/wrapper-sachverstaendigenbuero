/**
 * Erzeugt beim Container-Bau eine Startbefüllung der Argumentbibliothek.
 *
 *   pnpm exec tsx scripts/bibliothek-seed-erzeugen.ts [ziel.json]
 *
 * Der Parser läuft dabei einmalig gegen die Referenzdateien; zur Laufzeit
 * liest der Startvorgang nur noch das Ergebnis. So braucht das
 * Laufzeit-Abbild weder TypeScript-Werkzeuge noch den Parser selbst.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { erstelleAbgleichbericht, formatiereBericht, leseAlleEintraege } from '../src/bibliothek/migration'
import { fingerabdruck } from '../src/bibliothek/schreiben'

const ZIEL = process.argv[2] ?? 'seed/bibliothek.json'

const eintraege = leseAlleEintraege()
const bericht = erstelleAbgleichbericht(eintraege)

mkdirSync(dirname(ZIEL), { recursive: true })
/*
  Der Fingerabdruck wird hier mitgeschrieben und nicht beim Start berechnet:
  der Startvorgang ist bewusst ein schlichtes Skript ohne Parser und ohne
  TypeScript-Werkzeuge. Er soll vergleichen können, nicht rechnen.
*/
const mitAbdruck = eintraege.map((e) => ({ ...e, fingerabdruck: fingerabdruck(e) }))

writeFileSync(
  ZIEL,
  JSON.stringify({ erzeugtAus: 'skills/', eintraege: mitAbdruck }, null, 0),
  'utf8',
)

console.log(formatiereBericht(bericht))
console.log(`  Startbefüllung geschrieben: ${ZIEL} (${eintraege.length} Einträge)\n`)
