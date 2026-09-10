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

  /*
    Ein von Hand angelegter Eintrag unter derselben Nummer bleibt stehen —
    aber nicht stillschweigend: Sonst fehlte der Eintrag aus der Datei in der
    Bibliothek, und niemand wüsste, warum.
  */
  if (ergebnis.geschuetzt.length > 0) {
    const eine = ergebnis.geschuetzt.length === 1
    console.log(
      `  NICHT geschrieben: ${ergebnis.geschuetzt.length} Eintrag${eine ? '' : 'e'} aus den Referenzdateien.\n` +
        `  Unter dieser Nummer steht ein von Hand angelegter Eintrag, den der\n` +
        `  Import nicht überschreibt.\n` +
        ergebnis.geschuetzt.map((z) => `    · ${z}\n`).join('') +
        `  Entweder den handgeschriebenen Eintrag umnummerieren oder die Nummer\n` +
        `  in der Referenzdatei ändern.\n`,
    )
  }
  process.exit(0)
}

main().catch((fehler) => {
  console.error(fehler)
  process.exit(1)
})
