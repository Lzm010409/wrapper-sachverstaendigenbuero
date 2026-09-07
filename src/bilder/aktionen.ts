'use server'

import { revalidatePath } from 'next/cache'
import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { bild } from '@/db/schema'
import { verlangeBenutzer } from '@/auth/sitzung'
import { sucheBilder, wirdVerwendet, type Bibliotheksbild } from './bibliothek'
import { leseThemen } from './themen'

export interface BildErgebnis {
  fehler?: string
  hinweis?: string
}

/** Titel, Beschreibung und Themen ändern. */
export async function beschrifteBild(
  bildId: string,
  daten: { titel: string; beschreibung: string; themen: string },
): Promise<BildErgebnis> {
  await verlangeBenutzer()

  await db
    .update(bild)
    .set({
      titel: daten.titel.trim() || null,
      beschreibung: daten.beschreibung.trim() || null,
      themen: leseThemen(daten.themen),
    })
    .where(eq(bild.id, bildId))

  revalidatePath('/bilder')
  return { hinweis: 'Gespeichert.' }
}

/**
 * Nimmt ein Bild aus einem Schreiben in die Bibliothek auf.
 *
 * Das Bild bleibt dieselbe Zeile — es wird nicht kopiert. Ein
 * Bibliotheksbild, das in mehreren Schreiben steht, soll überall dieselbe
 * Beschreibung tragen.
 */
export async function uebernehmeInBildbibliothek(bildId: string): Promise<BildErgebnis> {
  await verlangeBenutzer()

  await db.update(bild).set({ inBibliothek: true }).where(eq(bild.id, bildId))

  revalidatePath('/bilder')
  return { hinweis: 'In die Bildbibliothek übernommen — jetzt noch beschriften.' }
}

/**
 * Nimmt ein Bild wieder aus der Bibliothek, ohne es zu löschen.
 *
 * Mit derselben Sperre wie beim Löschen — und aus demselben Grund, auch
 * wenn der Knopf harmloser klingt. `ladeBilder` findet ein Bild nur, wenn es
 * entweder zu genau diesem Schreiben gehört *oder* in der Bibliothek steht
 * (`src/bilder/ablage.ts:104`). Ein Bibliotheksbild, das in einen Brief
 * eingesetzt wurde, gehört zu keinem Schreiben; nimmt man es aus der
 * Bibliothek, erfüllt es beide Bedingungen nicht mehr. Die Kennung steht
 * dann weiter im Dokument, das Bild fällt aber aus dem Word-Dokument — und
 * auf `/bilder` ist es nicht mehr zu finden, also auch nicht mehr
 * zurückzuholen. Ein stiller Verlust, gegen den weder Meldung noch
 * Rückgängig half.
 */
export async function ausBibliothekNehmen(bildId: string): Promise<BildErgebnis> {
  await verlangeBenutzer()

  const anzahl = await wirdVerwendet(bildId)
  if (anzahl > 0) {
    return {
      fehler:
        `Dieses Bild steht in ${anzahl} ${anzahl === 1 ? 'Schreiben' : 'Schreiben'} — ` +
        'aus der Bibliothek genommen fiele es dort aus dem Dokument. Nimm es dort zuerst heraus.',
    }
  }

  /*
    Und die zweite Falle, dieselbe Sorte stiller Verlust.

    Die Bildbibliothek zeigt zweierlei: was in ihr steht, und was aus einem
    Schreiben stammt und noch nicht übernommen wurde. Ein Bild, das direkt
    in die Bibliothek geladen wurde, gehört zu keinem Schreiben. Nimmt man
    es aus der Bibliothek, erfüllt es keine der beiden Bedingungen mehr:
    es verschwindet von der Seite, ist über nichts mehr zu finden und
    lässt sich auch nicht zurückholen. Der Knopf verspricht „das Bild
    selbst bleibt erhalten" — erhalten schon, auffindbar nicht.

    Wer es wirklich loswerden will, hat den Löschknopf daneben. Der sagt,
    was er tut.
  */
  const [zeile] = await db
    .select({ stellungnahmeId: bild.stellungnahmeId })
    .from(bild)
    .where(eq(bild.id, bildId))
    .limit(1)

  if (!zeile) return { fehler: 'Dieses Bild gibt es nicht mehr.' }
  if (!zeile.stellungnahmeId) {
    return {
      fehler:
        'Dieses Bild gehört zu keinem Schreiben — aus der Bibliothek genommen wäre es ' +
        'nirgends mehr zu finden und nicht zurückzuholen. Wenn es weg soll, dann löschen.',
    }
  }

  await db.update(bild).set({ inBibliothek: false }).where(eq(bild.id, bildId))
  revalidatePath('/bilder')
  return { hinweis: 'Aus der Bibliothek genommen. Das Bild selbst bleibt erhalten.' }
}

/**
 * Löscht ein Bild — aber nicht, solange es in einem Schreiben steht.
 *
 * Die Lücke fiele sonst erst beim Erzeugen des Word-Dokuments auf, und
 * dann steht dort nur noch der Marker.
 */
export async function loescheBild(bildId: string): Promise<BildErgebnis> {
  await verlangeBenutzer()

  const anzahl = await wirdVerwendet(bildId)
  if (anzahl > 0) {
    return {
      fehler:
        `Dieses Bild steht in ${anzahl} ${anzahl === 1 ? 'Schreiben' : 'Schreiben'} — ` +
        'es lässt sich nicht löschen. Nimm es dort zuerst heraus.',
    }
  }

  await db.delete(bild).where(eq(bild.id, bildId))
  revalidatePath('/bilder')
  return { hinweis: 'Bild gelöscht.' }
}

/** Suche für die Randspalte im Brief. */
export async function durchsucheBildbibliothek(begriff: string): Promise<Bibliotheksbild[]> {
  await verlangeBenutzer()
  return sucheBilder(begriff, '', 12)
}
