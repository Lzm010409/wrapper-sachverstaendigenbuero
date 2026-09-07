import 'server-only'
import { and, eq, inArray, or } from 'drizzle-orm'
import { db } from '@/db'
import { bild } from '@/db/schema'
import { Bildfehler, MAX_BILD_BYTES, leseBildmasse, type Bildmasse } from './lesen'

/**
 * Bilder liegen in der Datenbank.
 *
 * Der Container ist flüchtig — ein Neustart nähme jedes Bild im Dateisystem
 * mit, und ein eigener Datenträger wäre eine zusätzliche bewegliche Sache
 * im Betrieb. Ein paar Kalkulationsauszüge je Stellungnahme sind für
 * Postgres nichts.
 */

export interface GespeichertesBild {
  id: string
  dateiname: string
  mimetyp: string
  breitePx: number
  hoehePx: number
  bytes: number
}

export async function speichereBild(auftrag: {
  /** Leer, wenn das Bild direkt in die Bibliothek geht. */
  stellungnahmeId: string | null
  dateiname: string
  daten: Uint8Array
  benutzerId: string
  inBibliothek?: boolean
}): Promise<GespeichertesBild> {
  if (auftrag.daten.byteLength === 0) throw new Bildfehler('Die Datei ist leer.')
  if (auftrag.daten.byteLength > MAX_BILD_BYTES) {
    throw new Bildfehler(`Das Bild ist grösser als ${MAX_BILD_BYTES / 1024 / 1024} MB.`)
  }

  const masse: Bildmasse = leseBildmasse(auftrag.daten)

  const [zeile] = await db
    .insert(bild)
    .values({
      stellungnahmeId: auftrag.stellungnahmeId,
      dateiname: auftrag.dateiname.slice(0, 200) || `bild.${masse.endung}`,
      mimetyp: masse.format,
      daten: Buffer.from(auftrag.daten).toString('base64'),
      breitePx: masse.breite,
      hoehePx: masse.hoehe,
      bytes: auftrag.daten.byteLength,
      inBibliothek: auftrag.inBibliothek === true,
      erstelltVon: auftrag.benutzerId,
    })
    .returning({ id: bild.id, dateiname: bild.dateiname })

  return {
    id: zeile!.id,
    dateiname: zeile!.dateiname,
    mimetyp: masse.format,
    breitePx: masse.breite,
    hoehePx: masse.hoehe,
    bytes: auftrag.daten.byteLength,
  }
}

export interface Bildinhalt extends GespeichertesBild {
  daten: Uint8Array
}

export async function ladeBild(id: string): Promise<Bildinhalt | null> {
  const [zeile] = await db.select().from(bild).where(eq(bild.id, id)).limit(1)
  if (!zeile) return null
  return {
    id: zeile.id,
    dateiname: zeile.dateiname,
    mimetyp: zeile.mimetyp,
    breitePx: zeile.breitePx,
    hoehePx: zeile.hoehePx,
    bytes: zeile.bytes,
    daten: new Uint8Array(Buffer.from(zeile.daten, 'base64')),
  }
}

/**
 * Lädt mehrere Bilder für ein Schreiben.
 *
 * Ausgegeben wird, was zu diesem Schreiben gehört **oder** in der
 * Bildbibliothek steht. Die Eingrenzung bleibt damit bestehen: eine fremde
 * Kennung aus einem anderen Schreiben liefert nichts, auch wenn sie im Baum
 * stünde.
 */
export async function ladeBilder(
  stellungnahmeId: string,
  ids: string[],
): Promise<Map<string, Bildinhalt>> {
  const gefunden = new Map<string, Bildinhalt>()
  if (ids.length === 0) return gefunden

  const zeilen = await db
    .select()
    .from(bild)
    .where(
      and(
        inArray(bild.id, ids),
        or(eq(bild.stellungnahmeId, stellungnahmeId), eq(bild.inBibliothek, true)),
      ),
    )

  for (const z of zeilen) {
    gefunden.set(z.id, {
      id: z.id,
      dateiname: z.dateiname,
      mimetyp: z.mimetyp,
      breitePx: z.breitePx,
      hoehePx: z.hoehePx,
      bytes: z.bytes,
      daten: new Uint8Array(Buffer.from(z.daten, 'base64')),
    })
  }
  return gefunden
}
