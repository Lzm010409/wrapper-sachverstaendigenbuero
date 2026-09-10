/**
 * Schreibt die Bibliothek aus der Datenbank zurück ins Markdown-Format der
 * Referenzdateien.
 *
 *   pnpm bibliothek:export                 nach skills/…/references/
 *   pnpm bibliothek:export --ziel ./tmp    in ein anderes Verzeichnis
 *
 * Damit bleiben die bestehenden Skills im Chat nutzbar, auch wenn die
 * Pflege längst in der Webapp stattfindet (Konzept E4, „Rückweg").
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { asc, eq } from 'drizzle-orm'
import { db } from '../src/db'
import { eintrag, eintragErgaenzung, eintragVariante } from '../src/db/schema'
import { baueReferenzdatei, type ExportEintrag } from '../src/bibliothek/markdown-export'
import { referenzVerzeichnis } from '../src/bibliothek/migration'

interface Zieldatei {
  bereich: 'kalkulation' | 'wertminderung' | 'wbw'
  datei: string
  titel: string
  einleitung: string
  eintragEbene: 2 | 3
}

const ZIELE: Zieldatei[] = [
  {
    bereich: 'kalkulation',
    datei: 'argumente-kalkulation.md',
    titel: 'Argumentbibliothek: Kalkulationskürzungen',
    einleitung:
      'Diese Bibliothek enthält bewährte Gegenargumente des Sachverständigenbüros ' +
      'Gollenstede zu Kürzungspositionen, wie sie Prüfdienstleister und Versicherer ' +
      'in Kürzungs- bzw. Prüfberichten regelmäßig vorbringen.\n\n' +
      'Format je Eintrag: **Kürzungsgrund** → typische Versicherer-Begründung → ' +
      'einsatzfertiges Gegenargument → Hinweise/Varianten.\n\n' +
      '_Erzeugt aus der Kürzungsabwehr-Werkbank. Änderungen bitte dort vornehmen._',
    eintragEbene: 3,
  },
  {
    bereich: 'wertminderung',
    datei: 'argumente-wertminderung.md',
    titel: 'Argumentbibliothek: Wertminderung',
    einleitung:
      'Kanonische Gegenargumente zu Kürzungen des merkantilen Minderwerts.\n\n' +
      '_Erzeugt aus der Kürzungsabwehr-Werkbank. Änderungen bitte dort vornehmen._',
    eintragEbene: 2,
  },
  {
    bereich: 'wbw',
    datei: 'argumente-wbw-bausteine.md',
    titel: 'Argumentbibliothek: Wiederbeschaffungswert',
    einleitung:
      'Die einzelnen Bausteine für Stellungnahmen zum Wiederbeschaffungswert. Den ' +
      'Aufbau des Schreibens beschreibt daneben `argumente-wbw.md` — diese Datei wird ' +
      'vom Rückweg nicht angefasst, weil sie Vorlagen und keine Einträge enthält.\n\n' +
      '_Erzeugt aus der Kürzungsabwehr-Werkbank. Änderungen bitte dort vornehmen._',
    eintragEbene: 3,
  },
]

async function ladeBereich(bereich: Zieldatei['bereich']): Promise<ExportEintrag[]> {
  const zeilen = await db
    .select()
    .from(eintrag)
    .where(eq(eintrag.bereich, bereich))
    .orderBy(asc(eintrag.nummer))

  const ergebnis: ExportEintrag[] = []
  for (const z of zeilen) {
    const varianten = await db
      .select()
      .from(eintragVariante)
      .where(eq(eintragVariante.eintragId, z.id))
      .orderBy(asc(eintragVariante.reihenfolge))
    const ergaenzungen = await db
      .select()
      .from(eintragErgaenzung)
      .where(eq(eintragErgaenzung.eintragId, z.id))
      .orderBy(asc(eintragErgaenzung.reihenfolge))

    ergebnis.push({
      nummer: z.nummer,
      titel: z.titel,
      abschnitt: z.abschnitt,
      typischeBegruendung: z.typischeBegruendung,
      gegenargument: z.gegenargument,
      vorgehen: z.vorgehen,
      hinweise: z.hinweise,
      varianten: varianten.map((v) => ({
        bezeichnung: v.bezeichnung,
        text: v.text,
        reihenfolge: v.reihenfolge,
      })),
      ergaenzungen: ergaenzungen.map((e) => ({
        titel: e.titel,
        text: e.text,
        reihenfolge: e.reihenfolge,
      })),
    })
  }
  return ergebnis
}

async function main() {
  const zielIndex = process.argv.indexOf('--ziel')
  const ziel =
    zielIndex >= 0 && process.argv[zielIndex + 1]
      ? process.argv[zielIndex + 1]!
      : referenzVerzeichnis()

  mkdirSync(ziel, { recursive: true })

  for (const konfig of ZIELE) {
    const eintraege = await ladeBereich(konfig.bereich)
    const markdown = baueReferenzdatei({
      titel: konfig.titel,
      einleitung: konfig.einleitung,
      eintragEbene: konfig.eintragEbene,
      eintraege,
    })
    const pfad = join(ziel, konfig.datei)
    writeFileSync(pfad, markdown, 'utf8')
    console.log(`  ${konfig.datei.padEnd(34)} ${eintraege.length} Einträge → ${pfad}`)
  }

  console.log()
  process.exit(0)
}

main().catch((fehler) => {
  console.error(fehler)
  process.exit(1)
})
