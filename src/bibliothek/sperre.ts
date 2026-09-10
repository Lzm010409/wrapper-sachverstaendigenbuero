import 'server-only'
import { sql } from 'drizzle-orm'
import type { db as DbTyp } from '@/db'
import { BEREICHE, type Bereich } from './eingabe'

/**
 * Die Sperre, unter der eine Gliederungsnummer vergeben wird.
 *
 * **Warum es sie braucht.** Eine Vergabe liest den Bestand und schreibt dann
 * eine Nummer, die es beim Lesen noch nicht gab. Zwei gleichzeitige Anlagen
 * im selben Bereich lesen denselben Bestand, errechnen dieselbe Nummer, und
 * die zweite läuft in den eindeutigen Index über (Bereich, Nummer).
 * `SELECT … FOR UPDATE` hilft dagegen nicht: Postgres sperrt vorhandene
 * Zeilen, nicht die Lücke dahinter. Eine Vorgangssperre je Bereich tut genau
 * das Richtige und ist mit dem Ende der Transaktion von selbst wieder fort —
 * auch wenn diese scheitert.
 *
 * **Warum sie hier steht und nicht in der Aktion.** Es gibt zwei Wege, auf
 * denen ein Eintrag entsteht: das Anlegeformular (`bibliothek/aktionen.ts`)
 * und die Übernahme eines selbst geschriebenen Abschnitts aus dem Editor
 * (`stellungnahme/editor-aktionen.ts`). Nähme nur einer die Sperre, wäre sie
 * wertlos — die Gegenseite schriebe daran vorbei. Eine Sperre, die zwei
 * Aufrufer teilen, gehört an einen Ort, den beide sehen.
 *
 * **Warum die Zahlen als Literal in der Anweisung stehen.** Die Funktion
 * verlangt `int`; ein Bindeparameter käme je nach Treiber als `numeric` an
 * und fände die Funktion nicht. Beide Zahlen sind hier errechnet — die
 * erste eine Konstante, die zweite der Rang des Bereichs in einer
 * geschlossenen Liste — und stammen nicht aus einer Eingabe.
 */
const SPERRSCHLUESSEL = 8419

type Transaktion = Parameters<Parameters<typeof DbTyp.transaction>[0]>[0]

export async function sperreBereichZurNummernvergabe(
  tx: Transaktion,
  bereich: Bereich,
): Promise<void> {
  const rang = BEREICHE.indexOf(bereich)
  // Ein unbekannter Bereich käme mit −1 durch und teilte sich eine Sperre
  // mit jedem anderen unbekannten. Er soll gar nicht erst hierher gelangen.
  if (rang < 0) throw new Error(`Unbekannter Bereich: ${bereich}`)
  await tx.execute(sql.raw(`select pg_advisory_xact_lock(${SPERRSCHLUESSEL}, ${rang})`))
}

/**
 * Ob eine Ausnahme die Verletzung eines eindeutigen Index ist (Postgres
 * meldet sie als `23505`).
 *
 * Die Sperre macht das zum Ausnahmefall, nicht zum Regelfall — aber
 * verlassen wird sich darauf nicht: Eine rohe Datenbankmeldung im Formular
 * hilft niemandem.
 */
export function istDublette(ausnahme: unknown): boolean {
  return (
    typeof ausnahme === 'object' &&
    ausnahme !== null &&
    'code' in ausnahme &&
    (ausnahme as { code?: unknown }).code === '23505'
  )
}
