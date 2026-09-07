/**
 * Überführt die Markdown-Referenzdateien in die Datenbank.
 *
 *   pnpm bibliothek:import --bericht    nur den Abgleichbericht zeigen
 *   pnpm bibliothek:import              importieren (bestehende Einträge
 *                                       derselben Nummer werden ersetzt)
 *
 * Importierte Einträge erhalten den Status `entwurf`. Die Freigabe erfolgt
 * ausschließlich über die Oberfläche (Konzept E5) — auch bei der Migration,
 * damit jeder Eintrag einmal gesichtet wurde.
 */
import {
  erstelleAbgleichbericht,
  formatiereBericht,
  leseAlleEintraege,
} from '../src/bibliothek/migration'

async function main() {
  const nurBericht = process.argv.includes('--bericht')

  const eintraege = leseAlleEintraege()
  const bericht = erstelleAbgleichbericht(eintraege)
  console.log(formatiereBericht(bericht))

  if (nurBericht) return

  // Der Datenbankzugriff wird erst hier geladen, damit `--bericht` ohne
  // laufende Datenbank funktioniert.
  const { db } = await import('../src/db')
  const { schreibeEintraege } = await import('../src/bibliothek/schreiben')

  const ergebnis = await schreibeEintraege(db, eintraege)
  console.log(
    `  Geschrieben: ${ergebnis.neu} neu, ${ergebnis.ersetzt} geändert, ` +
      `${ergebnis.unveraendert} unverändert übersprungen.\n` +
      `  Neue und geänderte Einträge stehen auf „entwurf" — Freigabe über die\n` +
      `  Oberfläche. Unveränderte behalten ihren Status samt Freigabe.\n`,
  )
  process.exit(0)
}

main().catch((fehler) => {
  console.error(fehler)
  process.exit(1)
})
