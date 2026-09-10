'use server'

import { asc, eq } from 'drizzle-orm'
import { db } from '@/db'
import { position } from '@/db/schema'
import { verlangeBenutzer } from '@/auth/sitzung'
import { ladeVerwendbareEintraege, sucheInBibliothek } from './abfragen'
import { findeVorschlaege } from './treffer'

export interface AktionsErgebnis {
  fehler?: string
  hinweis?: string
  stellungnahmeId?: string
}

/** Ermittelt die Vorschläge für alle Positionen einer Stellungnahme. */
export async function holeVorschlaege(stellungnahmeId: string) {
  await verlangeBenutzer()

  const [positionen, bibliothek] = await Promise.all([
    db
      .select()
      .from(position)
      .where(eq(position.stellungnahmeId, stellungnahmeId))
      .orderBy(asc(position.reihenfolge)),
    ladeVerwendbareEintraege(),
  ])

  return positionen.map((p) => ({
    positionId: p.id,
    ...findeVorschlaege(
      {
        bezeichnung: p.bezeichnung,
        begruendungVersicherer: p.begruendungVersicherer ?? '',
        typ: 'kalkulation',
      },
      bibliothek,
    ),
  }))
}

/** Der zweite Weg aus E6: Volltextsuche über die gesamte Bibliothek. */
export async function durchsucheBibliothek(begriff: string) {
  await verlangeBenutzer()
  return sucheInBibliothek(begriff)
}
