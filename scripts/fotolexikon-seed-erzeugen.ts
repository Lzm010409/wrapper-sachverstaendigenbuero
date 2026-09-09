/**
 * Erzeugt beim Container-Bau eine Startbefüllung des Fotolexikons.
 *
 *   pnpm exec tsx scripts/fotolexikon-seed-erzeugen.ts [ziel.json]
 *
 * `seed/` ist gitignored — dieselbe Regel, die auch die Startbefüllung der
 * Argumentbibliothek trifft (`scripts/bibliothek-seed-erzeugen.ts`). Zur
 * Laufzeit liest der Startvorgang nur noch das Ergebnis, das Laufzeit-Abbild
 * braucht dafür weder TypeScript-Werkzeuge noch diese Datei.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { TEILE } from './fotolexikon-vorlagen'

const ZIEL = process.argv[2] ?? 'seed/fotolexikon.json'

mkdirSync(dirname(ZIEL), { recursive: true })
writeFileSync(ZIEL, JSON.stringify(TEILE, null, 0), 'utf8')

console.log(`Fotolexikon-Startbefüllung geschrieben: ${ZIEL} (${TEILE.length} Teile)`)
