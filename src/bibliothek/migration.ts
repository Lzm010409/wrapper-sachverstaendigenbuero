import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  NICHT_MIGRIERT,
  STANDARD_DATEIEN,
  parseReferenzdatei,
  parseSonderfaelle,
  type GeparsterEintrag,
} from './parser'

export const SONDERFALL_DATEI = 'allgemeine-vorbemerkung-und-sonderfaelle.md'

export function referenzVerzeichnis(wurzel = process.cwd()): string {
  return join(wurzel, 'skills', 'stellungnahme-erstellen', 'references')
}

/** Liest alle migrierbaren Referenzdateien und liefert die Einträge. */
export function leseAlleEintraege(wurzel = process.cwd()): GeparsterEintrag[] {
  const verzeichnis = referenzVerzeichnis(wurzel)

  const ausDateien = STANDARD_DATEIEN.flatMap((konfig) =>
    parseReferenzdatei(readFileSync(join(verzeichnis, konfig.datei), 'utf8'), konfig),
  )

  const sonderfaelle = parseSonderfaelle(
    readFileSync(join(verzeichnis, SONDERFALL_DATEI), 'utf8'),
    SONDERFALL_DATEI,
  )

  return [...ausDateien, ...sonderfaelle]
}

export interface Abgleichbericht {
  gesamt: number
  jeBereich: Record<string, number>
  mitGegenargument: number
  nurVorgehen: number
  mitVarianten: number
  mitErgaenzungen: number
  platzhalterWerte: number
  platzhalterRegie: number
  belegKandidaten: number
  vorbedingungsKandidaten: number
  auffaellig: { eintrag: string; warnungen: string[] }[]
  nichtMigriert: readonly { datei: string; grund: string }[]
}

/**
 * Fasst zusammen, was die Migration übernommen hat und was nachzusehen ist.
 * Bewusst kein stiller Durchlauf: alles Unklare wird namentlich aufgeführt.
 */
export function erstelleAbgleichbericht(eintraege: GeparsterEintrag[]): Abgleichbericht {
  const jeBereich: Record<string, number> = {}
  let platzhalterWerte = 0
  let platzhalterRegie = 0
  let belegKandidaten = 0
  let vorbedingungsKandidaten = 0
  const auffaellig: { eintrag: string; warnungen: string[] }[] = []

  for (const e of eintraege) {
    jeBereich[e.bereich] = (jeBereich[e.bereich] ?? 0) + 1
    for (const p of e.platzhalter) {
      if (p.art === 'wert') platzhalterWerte++
      else platzhalterRegie++
    }
    belegKandidaten += e.belege.length
    vorbedingungsKandidaten += e.vorbedingungsKandidaten.length
    if (e.warnungen.length > 0) {
      auffaellig.push({ eintrag: `${e.bereich}/${e.nummer} ${e.titel}`, warnungen: e.warnungen })
    }
  }

  return {
    gesamt: eintraege.length,
    jeBereich,
    mitGegenargument: eintraege.filter((e) => e.gegenargument.trim()).length,
    nurVorgehen: eintraege.filter((e) => !e.gegenargument.trim() && e.vorgehen?.trim()).length,
    mitVarianten: eintraege.filter((e) => e.varianten.length > 0).length,
    mitErgaenzungen: eintraege.filter((e) => e.ergaenzungen.length > 0).length,
    platzhalterWerte,
    platzhalterRegie,
    belegKandidaten,
    vorbedingungsKandidaten,
    auffaellig,
    nichtMigriert: NICHT_MIGRIERT,
  }
}

/** Formt den Bericht als Text fürs Terminal. */
export function formatiereBericht(b: Abgleichbericht): string {
  const z: string[] = []
  const zeile = (label: string, wert: string | number) =>
    z.push(`  ${label.padEnd(34)} ${String(wert)}`)

  z.push('')
  z.push('  Abgleichbericht Bibliotheksmigration')
  z.push('  ' + '─'.repeat(52))
  zeile('Einträge gesamt', b.gesamt)
  for (const [bereich, anzahl] of Object.entries(b.jeBereich)) {
    zeile(`  davon ${bereich}`, anzahl)
  }
  z.push('')
  zeile('mit Gegenargument', b.mitGegenargument)
  zeile('nur mit Vorgehen (kein Text)', b.nurVorgehen)
  zeile('mit Varianten', b.mitVarianten)
  zeile('mit Ergänzungen', b.mitErgaenzungen)
  z.push('')
  zeile('Platzhalter (einzusetzender Wert)', b.platzhalterWerte)
  zeile('Platzhalter (Regieanweisung)', b.platzhalterRegie)
  zeile('Beleg-Kandidaten (unverifiziert)', b.belegKandidaten)
  zeile('Vorbedingungs-Kandidaten', b.vorbedingungsKandidaten)

  if (b.nichtMigriert.length > 0) {
    z.push('')
    z.push('  Nicht migriert')
    for (const n of b.nichtMigriert) z.push(`    · ${n.datei} — ${n.grund}`)
  }

  z.push('')
  if (b.auffaellig.length === 0) {
    z.push('  Keine Auffälligkeiten.')
  } else {
    z.push(`  Zu prüfen (${b.auffaellig.length})`)
    for (const a of b.auffaellig) {
      z.push(`    · ${a.eintrag}`)
      for (const w of a.warnungen) z.push(`        ${w}`)
    }
  }
  z.push('')
  return z.join('\n')
}
