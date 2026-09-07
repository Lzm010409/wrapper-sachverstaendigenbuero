/**
 * Erzeugt aus Datenbankeinträgen wieder das Markdown-Format der
 * Referenzdateien.
 *
 * Das ist der Rückweg aus Konzept E4: solange dieser Export läuft, bleiben
 * die bestehenden Skills im Chat voll nutzbar und die Webapp ist keine
 * Einbahnstraße.
 */

export interface ExportVariante {
  bezeichnung: string
  text: string
  reihenfolge: number
}

export interface ExportErgaenzung {
  titel: string
  text: string
  reihenfolge: number
}

export interface ExportEintrag {
  nummer: string
  titel: string
  abschnitt: string
  typischeBegruendung: string | null
  gegenargument: string | null
  vorgehen: string | null
  hinweise: string | null
  varianten: ExportVariante[]
  ergaenzungen: ExportErgaenzung[]
}

/** Setzt einen mehrzeiligen Text als Markdown-Blockzitat. */
function alsZitat(text: string): string {
  return text
    .split('\n')
    .map((z) => (z.trim() ? `> ${z}` : '>'))
    .join('\n')
}

/**
 * Stellt die Schreibweise der Quelldateien wieder her: einstufige Nummern
 * tragen dort einen Punkt („## 1. Einseitige Stützung"), mehrstufige nicht
 * („### 1.2 Halterung Stoßfänger", „### B.7 Grundlagenfehler"). Ohne diese
 * Unterscheidung verschiebt sich beim Rückweg die Abschnittsbezeichnung.
 */
export function formatiereNummer(nummer: string): string {
  if (!nummer) return ''
  return nummer.includes('.') ? nummer : `${nummer}.`
}

function formatiereEintrag(e: ExportEintrag, ebene: 2 | 3): string {
  const h = '#'.repeat(ebene)
  const teile: string[] = [`${h} ${formatiereNummer(e.nummer)} ${e.titel}`.trim()]

  if (e.typischeBegruendung) {
    teile.push(`**Typische Begründung:** ${e.typischeBegruendung}`)
  }

  if (e.gegenargument) {
    teile.push(`**Gegenargument:**\n${alsZitat(e.gegenargument)}`)
  }

  if (e.vorgehen) {
    teile.push(`**Vorgehen:** ${e.vorgehen}`)
  }

  if (e.hinweise) {
    teile.push(`**Hinweise:** ${e.hinweise}`)
  }

  for (const erg of [...e.ergaenzungen].sort((a, b) => a.reihenfolge - b.reihenfolge)) {
    teile.push(`**${erg.titel}:** ${erg.text}`)
  }

  const varianten = [...e.varianten].sort((a, b) => a.reihenfolge - b.reihenfolge)
  if (varianten.length > 0) {
    const liste = varianten.map((v) => `- *${v.bezeichnung}:* ${v.text}`).join('\n')
    teile.push(`**Varianten je nach Bauteilart:**\n${liste}`)
  }

  return teile.join('\n\n')
}

export interface ExportDatei {
  titel: string
  einleitung: string
  /** Auf welcher Ebene die Einträge stehen — muss zur Quelldatei passen. */
  eintragEbene: 2 | 3
  eintraege: ExportEintrag[]
}

/**
 * Baut eine vollständige Referenzdatei. Einträge werden nach ihrer
 * Gliederungsnummer sortiert und bei dreistufigen Dateien unter ihren
 * Abschnittsüberschriften gruppiert.
 */
export function baueReferenzdatei(datei: ExportDatei): string {
  const sortiert = [...datei.eintraege].sort((a, b) =>
    vergleicheNummern(a.nummer, b.nummer),
  )

  const bloecke: string[] = [`# ${datei.titel}`, datei.einleitung.trim()]

  if (datei.eintragEbene === 2) {
    for (const e of sortiert) bloecke.push(formatiereEintrag(e, 2))
    return bloecke.filter(Boolean).join('\n\n') + '\n'
  }

  let letzterAbschnitt = ''
  for (const e of sortiert) {
    if (e.abschnitt !== letzterAbschnitt) {
      bloecke.push(`## ${e.abschnitt}`)
      letzterAbschnitt = e.abschnitt
    }
    bloecke.push(formatiereEintrag(e, 3))
  }

  return bloecke.filter(Boolean).join('\n\n') + '\n'
}

/** Sortiert „1.2" vor „1.10" und „B.2" vor „B.10". */
export function vergleicheNummern(a: string, b: string): number {
  const zerlege = (s: string) => {
    const praefix = s.match(/^[A-Z](?=\.)/)?.[0] ?? ''
    const zahlen = s
      .replace(/^[A-Z]\./, '')
      .split('.')
      .map((t) => Number.parseInt(t, 10))
      .map((n) => (Number.isNaN(n) ? 0 : n))
    return { praefix, zahlen }
  }

  const x = zerlege(a)
  const y = zerlege(b)

  if (x.praefix !== y.praefix) return x.praefix.localeCompare(y.praefix)

  const laenge = Math.max(x.zahlen.length, y.zahlen.length)
  for (let i = 0; i < laenge; i++) {
    const diff = (x.zahlen[i] ?? 0) - (y.zahlen[i] ?? 0)
    if (diff !== 0) return diff
  }
  return 0
}
