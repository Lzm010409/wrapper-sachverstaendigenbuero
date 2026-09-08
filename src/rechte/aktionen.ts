'use server'

import { revalidatePath } from 'next/cache'
import { verlangeRecht } from './zugriff'
import { istRecht, type Rolle } from './katalog'
import { setzeAktiv, setzeRecht, setzeRolle, verwalterAusser } from './benutzerverwaltung'
import { protokolliereInfo } from '@/protokoll'
import type { Aktionsergebnis } from '@/melden/typen'

/**
 * Die Benutzerverwaltung.
 *
 * **Jede Änderung geht ins Protokoll.** Nicht aus Misstrauen, sondern weil
 * eine Rechteänderung später erklärt werden muss: „seit wann darf der das
 * eigentlich?" ist eine Frage, auf die es eine Antwort geben soll.
 *
 * **Zwei Sperren gegen das Aussperren.** Niemand kann sich selbst die
 * Benutzerverwaltung entziehen oder sich selbst sperren, und die letzte
 * Person mit diesem Recht kann es auch nicht verlieren. Sonst stünde das
 * Büro vor einer Anwendung, in die nur noch ein Datenbankzugang hineinführt.
 */

const ROLLEN: Rolle[] = ['ersteller', 'freigeber', 'admin']

export async function aendereRolle(benutzerId: string, rolle: string): Promise<Aktionsergebnis> {
  const ich = await verlangeRecht('benutzer.verwalten')
  if (!ROLLEN.includes(rolle as Rolle)) return { fehler: 'Unbekannte Rolle.' }

  if (benutzerId === ich.id && rolle !== 'admin') {
    return {
      fehler:
        'Die eigene Rolle lässt sich nicht herabsetzen. Sonst könnte man sich ' +
        'mit einem Klick aus der Verwaltung aussperren.',
    }
  }

  await setzeRolle(benutzerId, rolle as Rolle)
  protokolliereInfo('rechte.rolle', 'Eine Rolle wurde geändert.', {
    benutzerId: ich.id,
    betroffen: benutzerId,
    rolle,
  })
  revalidatePath('/verwaltung')
  return { hinweis: 'Rolle geändert.' }
}

export async function aendereRecht(
  benutzerId: string,
  recht: string,
  /** `true` gibt, `false` nimmt weg, `null` überlässt es der Rolle. */
  gewaehrt: boolean | null,
): Promise<Aktionsergebnis> {
  const ich = await verlangeRecht('benutzer.verwalten')
  if (!istRecht(recht)) return { fehler: 'Unbekanntes Recht.' }

  const entziehtVerwaltung = recht === 'benutzer.verwalten' && gewaehrt === false
  if (entziehtVerwaltung) {
    if (benutzerId === ich.id) {
      return { fehler: 'Die eigene Benutzerverwaltung lässt sich nicht entziehen.' }
    }
    if ((await verwalterAusser(benutzerId)) === 0) {
      return {
        fehler:
          'Das ist der letzte Zugang, der Benutzer verwalten kann. ' +
          'Erst einem anderen das Recht geben, dann dieses entziehen.',
      }
    }
  }

  await setzeRecht(benutzerId, recht, gewaehrt, ich.id)
  protokolliereInfo('rechte.recht', 'Ein Recht wurde gesetzt.', {
    benutzerId: ich.id,
    betroffen: benutzerId,
    recht,
    gewaehrt,
  })
  revalidatePath('/verwaltung')
  return { hinweis: 'Gespeichert.' }
}

export async function aendereSperre(
  benutzerId: string,
  aktiv: boolean,
): Promise<Aktionsergebnis> {
  const ich = await verlangeRecht('benutzer.verwalten')

  if (benutzerId === ich.id && !aktiv) {
    return { fehler: 'Der eigene Zugang lässt sich nicht sperren.' }
  }
  if (!aktiv && (await verwalterAusser(benutzerId)) === 0) {
    return {
      fehler:
        'Das ist der letzte Zugang, der Benutzer verwalten kann. ' +
        'Ihn zu sperren hiesse, die Anwendung ohne Verwaltung zurückzulassen.',
    }
  }

  await setzeAktiv(benutzerId, aktiv)
  protokolliereInfo('rechte.sperre', aktiv ? 'Ein Zugang wurde entsperrt.' : 'Ein Zugang wurde gesperrt.', {
    benutzerId: ich.id,
    betroffen: benutzerId,
  })
  revalidatePath('/verwaltung')
  return { hinweis: aktiv ? 'Zugang entsperrt.' : 'Zugang gesperrt.' }
}
