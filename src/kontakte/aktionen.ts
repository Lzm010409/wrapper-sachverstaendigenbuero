'use server'

import { randomUUID } from 'node:crypto'
import { and, desc, eq, isNull } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { db } from '@/db'
import { kontaktumhang } from '@/db/schema'
import { verlangeRecht } from '@/rechte/zugriff'
import { holeAnhaenge, istLeer } from '@/sevdesk/anhaenge'
import { dublettenvermerk, haengeUm, loescheKontakt, markiere } from '@/sevdesk/schreiben'
import { ladeDubletten } from '@/sevdesk/kontakte'
import { planeSchritte, probeschritt, type Objektart, type Plan } from './plan'
import { protokolliereFehler } from '@/protokoll'
import type { Aktionsergebnis } from '@/melden/typen'

/**
 * Das Zusammenführen doppelter sevDesk-Kontakte.
 *
 * **Drei getrennte Handgriffe, nicht einer.** Vorschau, Umhängen, Löschen.
 * Das ist keine Umständlichkeit: solange nichts gelöscht ist, lässt sich
 * jeder Umhang zurücknehmen. Wäre das Löschen Teil desselben Knopfs, wäre
 * der Rückweg nach dem ersten Klick verbaut — Rechnungen an einen Kontakt
 * zurückzuhängen, den es nicht mehr gibt, geht nicht.
 *
 * **Der Probeschritt.** Vor dem Rest wandert genau eine Rechnung, und es
 * wird nachgesehen, ob sie wirklich gewechselt hat. Lässt sevDesk das nicht
 * zu, kostet der Irrtum eine Rechnung statt acht — und die eine steht im
 * Protokoll und ist mit einem Klick zurückzuholen.
 */

export interface Vorschau {
  plan: Plan | null
  siegerAnzeige: string
  verliererAnzeigen: Record<string, string>
  fehler?: string
}

export interface Schrittbericht {
  bezeichnung: string
  erfolg: boolean
  meldung?: string
}

export interface Umhangbericht {
  vorgang: string | null
  schritte: Schrittbericht[]
  /** Verlierer, die jetzt leer sind und gelöscht werden könnten. */
  leer: string[]
  fehler?: string
}

/** Liest frisch, was an den Kontakten hängt, und baut daraus den Plan. */
async function planeFrisch(siegerId: string, verliererIds: string[]) {
  const dubletten = await ladeDubletten()
  const namen = new Map<string, string>()
  for (const gruppe of dubletten) {
    for (const kontakt of gruppe.kontakte) namen.set(kontakt.id, kontakt.anzeige)
  }

  const sieger = await holeAnhaenge(siegerId, namen.get(siegerId) ?? siegerId)
  const verlierer = []
  for (const id of verliererIds) {
    verlierer.push(await holeAnhaenge(id, namen.get(id) ?? id))
  }
  return { plan: planeSchritte(sieger, verlierer), sieger, verlierer }
}

/** Was passieren würde. Liest nur. */
export async function zeigeVorschau(
  siegerId: string,
  verliererIds: string[],
): Promise<Vorschau> {
  await verlangeRecht('sevdesk.zusammenfuehren')

  if (!siegerId || verliererIds.length === 0) {
    return { plan: null, siegerAnzeige: '', verliererAnzeigen: {}, fehler: 'Bitte einen Kontakt zum Bleiben und mindestens einen zum Zusammenführen wählen.' }
  }
  if (verliererIds.includes(siegerId)) {
    return { plan: null, siegerAnzeige: '', verliererAnzeigen: {}, fehler: 'Der bleibende Kontakt kann nicht zugleich zusammengeführt werden.' }
  }

  try {
    const { plan, sieger, verlierer } = await planeFrisch(siegerId, verliererIds)
    return {
      plan,
      siegerAnzeige: sieger.anzeige,
      verliererAnzeigen: Object.fromEntries(verlierer.map((v) => [v.kontaktId, v.anzeige])),
    }
  } catch (fehler) {
    const kennung = protokolliereFehler('kontakte.vorschau', 'Die Vorschau ist gescheitert.', fehler, {
      dienst: 'sevdesk',
      siegerId,
    })
    return {
      plan: null,
      siegerAnzeige: '',
      verliererAnzeigen: {},
      fehler: `${fehler instanceof Error ? fehler.message : String(fehler)} (Kennung ${kennung})`,
    }
  }
}

/**
 * Hängt alles um. Löscht nichts.
 *
 * Bricht ab, sobald der Probeschritt misslingt: dann trägt der Weg nicht,
 * und jeder weitere Versuch wäre derselbe Fehler noch einmal.
 */
export async function fuehreZusammen(
  siegerId: string,
  verliererIds: string[],
): Promise<Umhangbericht> {
  const benutzer = await verlangeRecht('sevdesk.zusammenfuehren')

  if (!siegerId || verliererIds.length === 0 || verliererIds.includes(siegerId)) {
    return { vorgang: null, schritte: [], leer: [], fehler: 'Die Auswahl passt nicht.' }
  }

  let plan: Plan
  let siegerAnzeige: string
  try {
    const frisch = await planeFrisch(siegerId, verliererIds)
    plan = frisch.plan
    siegerAnzeige = frisch.sieger.anzeige
  } catch (fehler) {
    return {
      vorgang: null,
      schritte: [],
      leer: [],
      fehler: fehler instanceof Error ? fehler.message : String(fehler),
    }
  }

  const vorgang = randomUUID()
  const schritte: Schrittbericht[] = []

  async function vermerke(
    verliererId: string,
    objektArt: Objektart | 'Contact',
    objektId: string,
    bezeichnung: string,
    schritt: string,
    ergebnis: { erfolg: boolean; meldung?: string },
  ) {
    schritte.push({ bezeichnung, erfolg: ergebnis.erfolg, ...(ergebnis.meldung ? { meldung: ergebnis.meldung } : {}) })
    await db.insert(kontaktumhang).values({
      vorgang,
      benutzerId: benutzer.id,
      siegerId,
      verliererId,
      objektArt,
      objektId,
      bezeichnung,
      schritt,
      erfolg: ergebnis.erfolg,
      meldung: ergebnis.meldung ?? null,
    })
  }

  // Der Probeschritt zuerst — allein und mit Abbruch.
  const probe = probeschritt(plan)
  if (probe?.objektArt && probe.objektId) {
    const ergebnis = await haengeUm(probe.objektArt, probe.objektId, siegerId)
    await vermerke(probe.verliererId, probe.objektArt, probe.objektId, probe.bezeichnung, 'umgehaengt', ergebnis)
    if (!ergebnis.erfolg) {
      return {
        vorgang,
        schritte,
        leer: [],
        fehler:
          'Die Probe ist misslungen — es wurde nichts weiter angefasst. ' +
          (ergebnis.meldung ?? ''),
      }
    }
  }

  for (const schritt of plan.schritte) {
    if (schritt.art !== 'umhaengen' || !schritt.objektArt || !schritt.objektId) continue
    if (probe && schritt.objektId === probe.objektId && schritt.objektArt === probe.objektArt) continue
    const ergebnis = await haengeUm(schritt.objektArt, schritt.objektId, siegerId)
    await vermerke(schritt.verliererId, schritt.objektArt, schritt.objektId, schritt.bezeichnung, 'umgehaengt', ergebnis)
  }

  // Erst jetzt, auf frischen Daten: wer ist leer, wer bleibt stehen?
  const leer: string[] = []
  for (const verliererId of verliererIds) {
    let jetztLeer = false
    try {
      jetztLeer = await istLeer(verliererId)
    } catch {
      jetztLeer = false
    }
    if (jetztLeer) {
      leer.push(verliererId)
      continue
    }
    const ergebnis = await markiere(verliererId, dublettenvermerk(siegerAnzeige))
    await vermerke(verliererId, 'Contact', verliererId, `Vermerk an ${verliererId}`, 'markiert', ergebnis)
  }

  revalidatePath('/verwaltung/kontakte')
  return { vorgang, schritte, leer }
}

/**
 * Löscht einen Kontakt — als eigener Handgriff, nach eigener Prüfung.
 *
 * Die Leerprüfung läuft hier noch einmal, unmittelbar davor und auf
 * frischen Daten. Der Bericht des Zusammenführens ist dafür kein Ersatz:
 * zwischen ihm und diesem Klick kann jemand in sevDesk eine Rechnung
 * angelegt haben.
 */
export async function loescheLeeren(kontaktId: string): Promise<Aktionsergebnis> {
  const benutzer = await verlangeRecht('sevdesk.zusammenfuehren')

  let leer = false
  try {
    leer = await istLeer(kontaktId)
  } catch (fehler) {
    return { fehler: `Nicht prüfbar, ob der Kontakt leer ist: ${fehler instanceof Error ? fehler.message : String(fehler)}` }
  }
  if (!leer) {
    return { fehler: 'An diesem Kontakt hängt noch etwas. Es wurde nichts gelöscht.' }
  }

  const ergebnis = await loescheKontakt(kontaktId)
  await db.insert(kontaktumhang).values({
    vorgang: randomUUID(),
    benutzerId: benutzer.id,
    siegerId: '',
    verliererId: kontaktId,
    objektArt: 'Contact',
    objektId: kontaktId,
    bezeichnung: `Kontakt ${kontaktId}`,
    schritt: 'geloescht',
    erfolg: ergebnis.erfolg,
    meldung: ergebnis.meldung ?? null,
  })

  revalidatePath('/verwaltung/kontakte')
  return ergebnis.erfolg ? { hinweis: 'Kontakt gelöscht.' } : { fehler: ergebnis.meldung ?? 'Das Löschen ging nicht durch.' }
}

/** Nimmt die Umhänge eines Vorgangs zurück. */
export async function machRueckgaengig(vorgang: string): Promise<Umhangbericht> {
  await verlangeRecht('sevdesk.zusammenfuehren')

  const zeilen = await db
    .select()
    .from(kontaktumhang)
    .where(
      and(
        eq(kontaktumhang.vorgang, vorgang),
        eq(kontaktumhang.schritt, 'umgehaengt'),
        eq(kontaktumhang.erfolg, true),
        isNull(kontaktumhang.rueckgaengigAm),
      ),
    )
    .orderBy(desc(kontaktumhang.erstelltAm))

  if (zeilen.length === 0) {
    return { vorgang, schritte: [], leer: [], fehler: 'Zu diesem Vorgang gibt es nichts zurückzunehmen.' }
  }

  const schritte: Schrittbericht[] = []
  for (const zeile of zeilen) {
    const art = zeile.objektArt as Objektart
    const ergebnis = await haengeUm(art, zeile.objektId, zeile.verliererId)
    schritte.push({
      bezeichnung: zeile.bezeichnung ?? zeile.objektId,
      erfolg: ergebnis.erfolg,
      ...(ergebnis.meldung ? { meldung: ergebnis.meldung } : {}),
    })
    if (ergebnis.erfolg) {
      await db
        .update(kontaktumhang)
        .set({ rueckgaengigAm: new Date() })
        .where(eq(kontaktumhang.id, zeile.id))
    }
  }

  revalidatePath('/verwaltung/kontakte')
  return { vorgang, schritte, leer: [] }
}
