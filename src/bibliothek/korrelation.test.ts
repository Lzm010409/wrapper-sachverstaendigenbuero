import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Regressionsschutz gegen eine stille Fehlerquelle.
 *
 * Drizzle rendert eine Spaltenreferenz in rohem SQL unqualifiziert: aus
 * `${eintrag.id}` wird `"id"`. Steht das in einer korrelierten Unterabfrage
 * über eine Tabelle, die selbst eine Spalte `id` hat — und das trifft auf
 * alle Untertabellen der Bibliothek zu —, vergleicht die Bedingung die
 * Untertabelle mit sich selbst. Ergebnis: immer 0 Treffer, kein Fehler,
 * keine Warnung. Genau so sind die Marker in der Trefferliste zunächst
 * unsichtbar geblieben.
 *
 * Der Test liest die Quelle statt eine Datenbank zu brauchen: er soll in
 * jeder Umgebung laufen und die Ursache benennen, nicht nur das Symptom.
 */
describe('Korrelierte Unterabfragen', () => {
  const quelle = readFileSync(join(process.cwd(), 'src/bibliothek/abfragen.ts'), 'utf8')

  it('verweist in rohem SQL nie unqualifiziert auf eintrag.id', () => {
    // Innerhalb von sql`…`-Vorlagen darf `${eintrag.id}` nicht vorkommen.
    const vorlagen = [...quelle.matchAll(/sql(?:<[^>]*>)?`([^`]*)`/gs)].map((m) => m[1] ?? '')
    const verdaechtig = vorlagen.filter((v) => v.includes('${eintrag.id}'))
    expect(
      verdaechtig,
      'Unqualifizierter Verweis auf eintrag.id — bitte EINTRAG_ID verwenden.',
    ).toEqual([])
  })

  it('qualifiziert jede Unterabfrage über eine Untertabelle', () => {
    const vorlagen = [...quelle.matchAll(/sql(?:<[^>]*>)?`([^`]*)`/gs)].map((m) => m[1] ?? '')
    const korreliert = vorlagen.filter((v) => /\beintrag_id\s*=/.test(v))

    expect(korreliert.length, 'Es sollte korrelierte Unterabfragen geben.').toBeGreaterThan(0)
    for (const v of korreliert) {
      expect(v, `Nicht qualifiziert: ${v.replace(/\s+/g, ' ').trim().slice(0, 90)}`).toContain(
        '${EINTRAG_ID}',
      )
    }
  })

  it('definiert EINTRAG_ID mit Tabellen- und Spaltenbezeichner', () => {
    expect(quelle).toMatch(
      /const EINTRAG_ID = sql`\$\{sql\.identifier\('eintrag'\)\}\.\$\{sql\.identifier\('id'\)\}`/,
    )
  })
})
