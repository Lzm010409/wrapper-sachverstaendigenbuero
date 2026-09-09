/**
 * Befüllt das Fotolexikon mit einer Handvoll Beispielteilen — für den
 * lokalen Rechner mit direktem Datenbankzugriff.
 *
 *   pnpm fotolexikon:seed
 *
 * **In der echten Umgebung braucht es dieses Kommando nicht mehr.** Dieselben
 * Beispielteile (`scripts/fotolexikon-vorlagen.ts`) werden beim Bauen des
 * Abbilds nach `seed/fotolexikon.json` geschrieben und beim Start des
 * Containers automatisch abgeglichen (`scripts/starten.mjs`,
 * `befuelleFotolexikon`) — genau wie die Argumentbibliothek. Ein Coolify-
 * Container hat weder pnpm noch tsx, dieses Skript liesse sich dort ohnehin
 * nicht ausführen.
 *
 * Überspringt Teile, die es (nach Namen, ohne Gross-/Kleinschreibung) schon
 * gibt — ein zweiter Lauf richtet keinen Schaden an und überschreibt keine
 * Handarbeit aus der Verwaltungsseite.
 */
import { sql } from 'drizzle-orm'
import { db } from '../src/db'
import { fotoTeil } from '../src/db/schema'
import { TEILE } from './fotolexikon-vorlagen'

/** Ob der Name schon vergeben ist — ohne Rücksicht auf Gross-/Kleinschreibung. */
async function nameVergeben(name: string): Promise<boolean> {
  const [treffer] = await db
    .select({ id: fotoTeil.id })
    .from(fotoTeil)
    .where(sql`lower(${fotoTeil.name}) = lower(${name})`)
    .limit(1)
  return Boolean(treffer)
}

async function main() {
  let angelegt = 0
  let uebersprungen = 0

  for (const teil of TEILE) {
    if (await nameVergeben(teil.name)) {
      console.log(`– „${teil.name}" gibt es schon, übersprungen.`)
      uebersprungen++
      continue
    }
    await db.insert(fotoTeil).values(teil)
    console.log(`+ „${teil.name}" angelegt (${teil.beschaedigungsarten.length} Beschädigungsarten).`)
    angelegt++
  }

  console.log(`\n${angelegt} angelegt, ${uebersprungen} übersprungen.`)
  process.exit(0)
}

main().catch((fehler) => {
  console.error(fehler)
  process.exit(1)
})
