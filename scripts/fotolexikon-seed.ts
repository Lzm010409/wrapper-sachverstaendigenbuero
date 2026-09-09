/**
 * Befüllt das Fotolexikon mit einer Handvoll Beispielteilen.
 *
 *   pnpm fotolexikon:seed
 *
 * Das Wording ist keine Erfindung: es stammt aus echten Fotobeschreibungen
 * offener Gutachten (autoiXpert-Stichprobe vom 09.09.2026, fünf Gutachten,
 * über die Abrufregel — nur offen, ab Mai 2026, rein lesend). „Flächig
 * deformiert" etwa steht dort für Blechteile durchgängig, nicht nur
 * „deformiert" — das übernimmt dieses Skript, statt es zu erraten.
 *
 * Überspringt Teile, die es (nach Namen, ohne Gross-/Kleinschreibung) schon
 * gibt — ein zweiter Lauf richtet keinen Schaden an und überschreibt keine
 * Handarbeit aus der Verwaltungsseite.
 */
import { sql } from 'drizzle-orm'
import { db } from '../src/db'
import { fotoTeil } from '../src/db/schema'
import type { Seite } from '../src/fotos/lexikon'

interface Vorlage {
  name: string
  seiten: Seite[]
  erkennungsmerkmal: string
  beschaedigungsarten: { begriff: string; hinweis: string }[]
}

const TEILE: Vorlage[] = [
  {
    name: 'Kotflügel',
    seiten: ['links', 'rechts'],
    erkennungsmerkmal:
      'Sitzt zwischen Scheinwerfer/Frontverkleidung und der Tür, umschliesst den ' +
      'Radlauf. Anders als die Tür hat er keinen Türgriff und keine umlaufende Fuge.',
    beschaedigungsarten: [
      {
        begriff: 'kratzbeschädigt',
        hinweis: 'Nur oberflächlicher Kratzer im Lack, kein sichtbarer Verzug im Blech.',
      },
      {
        begriff: 'flächig deformiert',
        hinweis: 'Blech sichtbar eingedrückt oder verzogen, auch über eine größere Fläche.',
      },
    ],
  },
  {
    name: 'Tür',
    seiten: ['links', 'rechts'],
    erkennungsmerkmal:
      'Trägt Türgriff und Fensterrahmen, umlaufende Fuge zu Kotflügel, Seitenwand ' +
      'und Schweller. Nicht der Kotflügel (kein Griff, keine Fuge ringsum).',
    beschaedigungsarten: [
      { begriff: 'kratzbeschädigt', hinweis: 'Nur oberflächlicher Kratzer im Lack.' },
      { begriff: 'flächig deformiert', hinweis: 'Blech sichtbar eingedrückt oder verzogen.' },
    ],
  },
  {
    name: 'Seitenwand',
    seiten: ['links', 'rechts'],
    erkennungsmerkmal:
      'Durchgehende Blechfläche zwischen den Radläufen, ohne eigene Tür-Fuge — bei ' +
      'Transportern oft fensterlos. Nicht die Tür (keine Fuge, kein Griff).',
    beschaedigungsarten: [
      { begriff: 'kratzbeschädigt', hinweis: 'Nur oberflächlicher Kratzer im Lack.' },
      { begriff: 'flächig deformiert', hinweis: 'Blech sichtbar eingedrückt oder verzogen.' },
    ],
  },
  {
    name: 'Schweller',
    seiten: ['links', 'rechts'],
    erkennungsmerkmal: 'Schmale Leiste unterhalb der Türen, zwischen Vorder- und Hinterrad.',
    beschaedigungsarten: [
      { begriff: 'kratzbeschädigt', hinweis: 'Oberflächlicher Kratzer oder Schürfspur, ohne Verformung.' },
    ],
  },
  {
    name: 'Frontverkleidung',
    seiten: [],
    erkennungsmerkmal:
      'Stossfänger vorne, meist über die gesamte Fahrzeugbreite, aus Kunststoff — ' +
      'anders als der lackierte Blech-Kotflügel daneben.',
    beschaedigungsarten: [
      { begriff: 'kratzbeschädigt', hinweis: 'Oberflächlicher Kratzer im Kunststoff, ohne Verformung.' },
      {
        begriff: 'plastisch verformt',
        hinweis: 'Kunststoff sichtbar eingedrückt oder verzogen, aber nicht gebrochen.',
      },
      { begriff: 'gebrochen', hinweis: 'Riss oder Bruchstelle im Kunststoff, ggf. lose Teile.' },
    ],
  },
  {
    name: 'Heckverkleidung',
    seiten: [],
    erkennungsmerkmal: 'Stossfänger hinten — dieselbe Bauart wie die Frontverkleidung, nur am Heck.',
    beschaedigungsarten: [
      { begriff: 'kratzbeschädigt', hinweis: 'Oberflächlicher Kratzer im Kunststoff, ohne Verformung.' },
      {
        begriff: 'plastisch verformt',
        hinweis: 'Kunststoff sichtbar eingedrückt oder verzogen, aber nicht gebrochen.',
      },
      { begriff: 'gebrochen', hinweis: 'Riss oder Bruchstelle im Kunststoff, ggf. lose Teile.' },
    ],
  },
  {
    name: 'Heckklappe',
    seiten: [],
    erkennungsmerkmal:
      'Grosse, nach oben klappbare Tür am Heck über dem Kennzeichen, trägt meist die ' +
      'Rückleuchten.',
    beschaedigungsarten: [
      { begriff: 'kratzbeschädigt', hinweis: 'Oberflächlicher Kratzer im Lack.' },
      { begriff: 'flächig deformiert', hinweis: 'Blech sichtbar eingedrückt oder verzogen.' },
    ],
  },
  {
    name: 'Spiegel',
    seiten: ['links', 'rechts'],
    erkennungsmerkmal: 'Aussenspiegelgehäuse aus Kunststoff, an der Tür montiert.',
    beschaedigungsarten: [
      { begriff: 'kratzbeschädigt', hinweis: 'Oberflächlicher Kratzer im Gehäuse.' },
      { begriff: 'gebrochen', hinweis: 'Gehäuse oder Glas gerissen, gesprungen oder abgebrochen.' },
    ],
  },
  {
    name: 'Felge',
    seiten: ['links', 'rechts'],
    erkennungsmerkmal: 'Metallrad unter dem Reifen, durch die Speichen sichtbar.',
    beschaedigungsarten: [
      {
        begriff: 'mit frischen Andruckspuren',
        hinweis:
          'Helle, glänzende Streifspur auf der Felgenkante, meist vom Bordstein — kein ' +
          'Lackschaden, keine Verformung.',
      },
    ],
  },
]

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
