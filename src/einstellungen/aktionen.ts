'use server'

import { revalidatePath } from 'next/cache'
import { verlangeBenutzer } from '@/auth/sitzung'
import {
  apiTokenStatus,
  erzeugeApiToken,
  ladeApiTokens,
  widerrufeApiToken,
  type ApiTokenAblauf,
  type ApiTokenStatus,
} from '@/auth/api-token'

/**
 * Die eigenen API-Tokens verwalten — jeder Benutzer nur seine eigenen, ohne
 * dass dafür ein eigenes Recht nötig wäre. Ein Token trägt dieselben Rechte
 * wie sein Benutzer; es gibt hier nichts zu vergeben, was der Zugang nicht
 * ohnehin schon hätte.
 */

export interface ApiTokenZeile {
  id: string
  name: string
  praefix: string
  status: ApiTokenStatus
  erstelltAm: Date
  laeuftAbAm: Date | null
  letzteVerwendungAm: Date | null
}

export async function meineApiTokens(): Promise<ApiTokenZeile[]> {
  const benutzer = await verlangeBenutzer()
  const zeilen = await ladeApiTokens(benutzer.id)
  return zeilen.map((z) => ({
    id: z.id,
    name: z.name,
    praefix: z.praefix,
    status: apiTokenStatus(z),
    erstelltAm: z.erstelltAm,
    laeuftAbAm: z.laeuftAbAm,
    letzteVerwendungAm: z.letzteVerwendungAm,
  }))
}

export interface ErzeugtErgebnis {
  klartext?: string
  fehler?: string
}

export async function erzeugeMeinApiToken(
  name: string,
  ablauf: ApiTokenAblauf,
): Promise<ErzeugtErgebnis> {
  const benutzer = await verlangeBenutzer()

  const bereinigt = name.trim()
  if (!bereinigt) return { fehler: 'Bitte einen Namen für das Token angeben.' }
  if (bereinigt.length > 200) return { fehler: 'Der Name ist zu lang.' }

  const erzeugt = await erzeugeApiToken(benutzer.id, bereinigt, ablauf)
  revalidatePath('/einstellungen')
  return { klartext: erzeugt.klartext }
}

export async function widerrufeMeinApiToken(tokenId: string): Promise<{
  fehler?: string
  hinweis?: string
}> {
  const benutzer = await verlangeBenutzer()

  const erfolg = await widerrufeApiToken(benutzer.id, tokenId)
  if (!erfolg) {
    return { fehler: 'Dieses Token gehört nicht zu deinem Zugang oder ist schon widerrufen.' }
  }

  revalidatePath('/einstellungen')
  return { hinweis: 'Das Token ist widerrufen.' }
}
