'use server'

import { revalidatePath } from 'next/cache'
import { verlangeRecht } from '@/rechte/zugriff'
import type { Beschaedigungsart } from './lexikon'
import { loescheTeil, nameVergeben, speichereTeil } from './lexikon-ablage'
import type { Aktionsergebnis } from '@/melden/typen'

/**
 * Die Pflege des Fotolexikons — ausschliesslich für `fotolexikon.verwalten`.
 *
 * Wer hier schreibt, legt fest, in welchem Wortlaut der Fotoassistent künftig
 * Schäden beschriftet (`src/fotos/assistent.ts`). Deshalb dasselbe enge Recht
 * wie bei anderen Stellen mit Aussenwirkung, keines der alltäglichen.
 */

export interface FotoTeilEingabe {
  name: string
  erkennungsmerkmal: string
  beschaedigungsarten: { begriff: string; hinweis: string }[]
}

/** Säubert die Eingabe aus dem Formular — Leerzeichen, leere Zeilen. */
function geputzt(eingabe: FotoTeilEingabe): {
  name: string
  erkennungsmerkmal: string | null
  beschaedigungsarten: Beschaedigungsart[]
} {
  const erkennungsmerkmal = eingabe.erkennungsmerkmal.trim()
  return {
    name: eingabe.name.trim(),
    // Leer heisst „kein Merkmal hinterlegt" — dafür steht `null`, kein
    // leerer String in der Spalte.
    erkennungsmerkmal: erkennungsmerkmal.length > 0 ? erkennungsmerkmal : null,
    beschaedigungsarten: eingabe.beschaedigungsarten
      .map((b) => ({ begriff: b.begriff.trim(), hinweis: b.hinweis.trim() }))
      .filter((b) => b.begriff.length > 0),
  }
}

/** Legt einen Teil neu an (`id` leer) oder ändert ihn (`id` gesetzt). */
export async function speichereFotoTeil(
  id: string | undefined,
  roheEingabe: FotoTeilEingabe,
): Promise<Aktionsergebnis> {
  const benutzer = await verlangeRecht('fotolexikon.verwalten')

  const eingabe = geputzt(roheEingabe)
  if (!eingabe.name) return { fehler: 'Der Name des Teils darf nicht leer sein.' }
  if (eingabe.beschaedigungsarten.length === 0) {
    return {
      fehler:
        'Mindestens eine Beschädigungsart wird gebraucht — sonst hat die KI keine Auswahl.',
    }
  }
  if (await nameVergeben(eingabe.name, id)) {
    return {
      fehler:
        `„${eingabe.name}" gibt es im Lexikon schon — ein Teil steht nur einmal in der Liste. ` +
        'Für eine weitere Seite oder Beschädigungsart diesen bestehenden Eintrag aufklappen ' +
        'und ergänzen, statt einen zweiten mit demselben Namen anzulegen.',
    }
  }

  await speichereTeil(eingabe, benutzer.id, id)
  revalidatePath('/verwaltung/fotolexikon')
  return { hinweis: 'Gespeichert.' }
}

export async function loescheFotoTeil(id: string): Promise<Aktionsergebnis> {
  await verlangeRecht('fotolexikon.verwalten')
  await loescheTeil(id)
  revalidatePath('/verwaltung/fotolexikon')
  return { hinweis: 'Gelöscht.' }
}
