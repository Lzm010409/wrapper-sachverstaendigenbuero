import type { Gutachten } from './typen'
import { STANDARD_ANREDE, baueAnrede } from '@/export/hausstil'
import { GUTACHTENTYPEN, ZUSTAENDE } from './typen'

/**
 * Bildet ein autoiXpert-Gutachten auf die Werte ab, die eine Stellungnahme
 * braucht — Empfängerdaten, Betreffzeile, Fahrzeugangaben und die
 * Platzhalter der Argumentbibliothek.
 *
 * Kein Wert wird geraten. Fehlt eine Angabe im Gutachten, bleibt sie leer
 * und wird in der Oberfläche als offen markiert; der Hausstil verlangt
 * ausdrücklich Nachfragen statt Erfinden.
 */

export interface Beteiligter {
  name: string
  strasse: string | null
  plzOrt: string | null
  email: string | null
  telefon: string | null
  aktenzeichen: string | null
}

export interface Falldaten {
  aktenzeichen: string | null
  autoixpertId: string
  externeId: string | null
  gutachtenTyp: string | null
  zustand: string | null
  auftragsdatum: string | null
  fertigstellung: string | null

  anspruchsteller: Beteiligter | null
  anwalt: Beteiligter | null
  versicherung: (Beteiligter & { schadennummer: string | null }) | null
  werkstatt: Beteiligter | null
  unfallgegner: (Beteiligter & { kennzeichen: string | null }) | null

  fahrzeug: {
    kennzeichen: string | null
    hersteller: string | null
    modell: string | null
    vin: string | null
    erstzulassung: string | null
    laufleistung: number | null
    laufleistungEinheit: string | null
    scheckheftGepflegt: boolean | null
    letzterService: string | null
    vorschaedenRepariert: string | null
    vorschaedenUnrepariert: string | null
    schadenbeschreibung: string | null
  }

  unfall: {
    datum: string | null
    ort: string | null
    hergang: string | null
  }
}

function name(k: {
  first_name?: string | null
  last_name?: string | null
  organization_name?: string | null
}): string {
  const firma = k.organization_name?.trim()
  const person = [k.first_name, k.last_name]
    .map((t) => t?.trim())
    .filter(Boolean)
    .join(' ')
  // Firmenname hat Vorrang: bei Kanzleien und Versicherungen ist er die
  // maßgebliche Anschrift, der Personenname allenfalls die Ansprechperson.
  return firma || person || ''
}

function beteiligter(k: Record<string, unknown> | null | undefined): Beteiligter | null {
  if (!k) return null
  const q = k as Record<string, string | null | undefined>
  const n = name(q)
  const plz = q.zip?.trim()
  const ort = q.city?.trim()
  const plzOrt = [plz, ort].filter(Boolean).join(' ') || null

  if (!n && !plzOrt) return null

  return {
    name: n,
    strasse: q.street_and_housenumber_or_lockbox?.trim() || null,
    plzOrt,
    email: q.email?.trim() || null,
    telefon: q.phone?.trim() || null,
    aktenzeichen: q.case_number?.trim() || null,
  }
}

/** Wählt die belastbarste der drei Laufleistungsangaben. */
function laufleistung(car: Record<string, unknown> | null | undefined): number | null {
  if (!car) return null
  const c = car as Record<string, number | null | undefined>
  // Abgelesen schlägt angegeben, angegeben schlägt geschätzt.
  return c.mileage_meter ?? c.mileage_as_stated ?? c.mileage_estimated ?? null
}

export function leseFalldaten(g: Gutachten): Falldaten {
  const versicherung = beteiligter(g.insurance as Record<string, unknown> | null)
  const gegner = beteiligter(g.author_of_damage as Record<string, unknown> | null)
  const car = (g.car ?? {}) as Record<string, string | number | boolean | null | undefined>

  return {
    aktenzeichen: g.token?.trim() || null,
    autoixpertId: g.id,
    externeId: g.external_id?.trim() || null,
    gutachtenTyp: g.type ? (GUTACHTENTYPEN[g.type] ?? g.type) : null,
    zustand: g.state ? (ZUSTAENDE[g.state] ?? g.state) : null,
    auftragsdatum: g.order_date ?? null,
    fertigstellung: g.completion_date ?? null,

    anspruchsteller: beteiligter(g.claimant as Record<string, unknown> | null),
    anwalt: beteiligter(g.lawyer as Record<string, unknown> | null),
    versicherung: versicherung
      ? {
          ...versicherung,
          schadennummer:
            (g.insurance as { case_number?: string | null } | null)?.case_number?.trim() || null,
        }
      : null,
    werkstatt: beteiligter(g.garage as Record<string, unknown> | null),
    unfallgegner: gegner
      ? {
          ...gegner,
          kennzeichen:
            (g.author_of_damage as { license_plate?: string | null } | null)?.license_plate?.trim() ||
            null,
        }
      : null,

    fahrzeug: {
      kennzeichen: (car.license_plate as string | null)?.trim() || null,
      hersteller: (car.make as string | null)?.trim() || null,
      modell: (car.model as string | null)?.trim() || null,
      vin: (car.vin as string | null)?.trim() || null,
      erstzulassung: (car.first_registration_date as string | null) ?? null,
      laufleistung: laufleistung(g.car as Record<string, unknown> | null),
      laufleistungEinheit: (car.mileage_unit as string | null) ?? 'km',
      scheckheftGepflegt: (car.service_book_complete as boolean | null) ?? null,
      letzterService: (car.last_service_date as string | null) ?? null,
      vorschaedenRepariert: (car.repaired_previous_damage as string | null)?.trim() || null,
      vorschaedenUnrepariert: (car.unrepaired_previous_damage as string | null)?.trim() || null,
      schadenbeschreibung: (car.damage_description as string | null)?.trim() || null,
    },

    unfall: {
      datum: g.accident?.date ?? null,
      ort: g.accident?.location?.trim() || null,
      hergang: g.accident?.circumstances?.trim() || null,
    },
  }
}

/**
 * Werte, mit denen sich Platzhalter der Argumentbibliothek füllen lassen.
 *
 * Die Schlüssel entsprechen den Klammerausdrücken in den Bibliothekstexten
 * (`[Marke]`, `[Datum]`, `[Bauteilseite]` …). Was hier fehlt, muss in der
 * Auswahlmaske von Hand ergänzt werden.
 */
export function platzhalterWerte(d: Falldaten): Record<string, string> {
  const werte: Record<string, string> = {}
  const setze = (schluessel: string, wert: string | number | null | undefined) => {
    if (wert === null || wert === undefined || wert === '') return
    werte[schluessel] = String(wert)
  }

  setze('Marke', d.fahrzeug.hersteller)
  setze('Hersteller', d.fahrzeug.hersteller)
  setze('Modell', d.fahrzeug.modell)
  setze('Fahrzeug', [d.fahrzeug.hersteller, d.fahrzeug.modell].filter(Boolean).join(' '))
  setze('Kennzeichen', d.fahrzeug.kennzeichen)
  setze('Erstzulassung', formatiereDatum(d.fahrzeug.erstzulassung))
  setze(
    'Laufleistung',
    d.fahrzeug.laufleistung
      ? `${d.fahrzeug.laufleistung.toLocaleString('de-DE')} ${d.fahrzeug.laufleistungEinheit ?? 'km'}`
      : null,
  )
  setze('Aktenzeichen', d.aktenzeichen)
  setze('Schadennummer', d.versicherung?.schadennummer)
  setze('Unfalltag', formatiereDatum(d.unfall.datum))
  setze('Schadentag', formatiereDatum(d.unfall.datum))
  setze('Anspruchsteller', d.anspruchsteller?.name)
  setze('Versicherung', d.versicherung?.name)
  setze('Werkstatt', d.werkstatt?.name)

  return werte
}

/** ISO-Datum als TT.MM.JJJJ. */
export function formatiereDatum(wert: string | null | undefined): string | null {
  if (!wert) return null
  const m = wert.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return wert
  return `${m[3]}.${m[2]}.${m[1]}`
}

/**
 * Schlägt Empfänger, Betreff und Anrede für die Stellungnahme vor.
 *
 * Der Hausstil nennt die Rechtsanwaltskanzlei als häufigsten Auftraggeber,
 * danach den Versicherer, danach die Werkstatt — in dieser Reihenfolge wird
 * vorgeschlagen. Bestätigt wird der Vorschlag immer vom Nutzer.
 */
export function schlageEmpfaengerVor(d: Falldaten): {
  empfaenger: Beteiligter | null
  herkunft: 'anwalt' | 'versicherung' | 'werkstatt' | null
  betreff: string | null
  anrede: string
} {
  const kandidaten: [Beteiligter | null, 'anwalt' | 'versicherung' | 'werkstatt'][] = [
    [d.anwalt, 'anwalt'],
    [d.versicherung, 'versicherung'],
    [d.werkstatt, 'werkstatt'],
  ]
  const treffer = kandidaten.find(([k]) => k && k.name)

  const bezeichnung =
    d.anspruchsteller?.name || d.fahrzeug.kennzeichen || d.aktenzeichen || null

  /*
    Die Anrede folgt dem Empfänger, sofern seine Zeile sie hergibt:
    „Rechtsanwältin Claudia Busch" wird zu „Sehr geehrte Frau Busch,".
    Ohne ausdrückliche Anredeform bleibt es bei „Sehr geehrte Damen und
    Herren," — geraten wird nicht, siehe `baueAnrede`.
  */
  return {
    empfaenger: treffer?.[0] ?? null,
    herkunft: treffer?.[1] ?? null,
    betreff: bezeichnung ? `Stellungnahme Abrechnung ${bezeichnung}` : null,
    anrede: baueAnrede(treffer?.[0]?.name) ?? STANDARD_ANREDE,
  }
}
