/**
 * Liest das `result.json` des Plugins für die Anzeige.
 *
 * Die Datei kommt aus einem eigenen Prozess und aus einem Projekt, das
 * weiterentwickelt wird. Sie wird deshalb nicht als bekannte Form
 * vorausgesetzt, sondern Feld für Feld geprüft: fehlt eines, fehlt es in der
 * Anzeige — die Oberfläche stürzt nicht ab, weil das Plugin ein Feld
 * umbenannt hat.
 */

export interface Korbeintrag {
  rang: number
  score: number | null
  quelle: string | null
  titel: string | null
  preis: number | null
  kilometerstand: number | null
  /** `MM/JJJJ`. */
  erstzulassung: string | null
  leistungKw: number | null
  /** Postleitzahl oder Ort, je nachdem, was das Portal hergab. */
  ort: string | null
  entfernungKm: number | null
  url: string | null
  /** Angaben, die im Inserat fehlten — sie stehen im Bewertungsraster. */
  fehlend: string[]
}

export interface Trichter {
  gescraped: number | null
  imUmkreis: number | null
  toleranzRaus: number | null
  dublettenRaus: number | null
  linieRaus: number | null
  karosserieRaus: number | null
  getriebeRaus: number | null
  tuerenRaus: number | null
  imKorb: number | null
}

export interface Wertermittlung {
  vorschlagBrutto: number | null
  anzahl: number | null
  medianRoh: number | null
  medianBereinigt: number | null
  getrimmt: number | null
  min: number | null
  max: number | null
}

export interface Laufergebnis {
  wert: Wertermittlung
  trichter: Trichter
  korb: Korbeintrag[]
}

function objekt(wert: unknown): Record<string, unknown> {
  return wert && typeof wert === 'object' ? (wert as Record<string, unknown>) : {}
}

function zahl(wert: unknown): number | null {
  if (typeof wert === 'number' && Number.isFinite(wert)) return wert
  if (typeof wert === 'string') {
    const gelesen = Number.parseFloat(wert)
    return Number.isFinite(gelesen) ? gelesen : null
  }
  return null
}

function text(wert: unknown): string | null {
  return typeof wert === 'string' && wert.trim() ? wert : null
}

/**
 * Der Preis. AutoScout24 liefert ihn verschachtelt
 * (`price.total.amount`), die Adapter flach als `preis` — beides kommt vor,
 * je nachdem, welche Stufe der Kette getragen hat.
 */
function preisAus(fahrzeug: Record<string, unknown>): number | null {
  const flach = zahl(fahrzeug.preis) ?? zahl(fahrzeug.price)
  if (flach !== null) return flach
  const preis = objekt(fahrzeug.price)
  const gesamt = objekt(preis.total)
  return zahl(gesamt.amount) ?? zahl(preis.amount)
}

function texte(wert: unknown): string[] {
  return Array.isArray(wert) ? wert.filter((x): x is string => typeof x === 'string') : []
}

export function leseErgebnis(roh: unknown): Laufergebnis | null {
  if (!roh || typeof roh !== 'object') return null
  const daten = objekt(roh)
  const wbw = objekt(daten.wbw)
  const bereinigt = objekt(wbw.bereinigt)
  const rohWerte = objekt(wbw.roh)
  const st = objekt(daten.statistik)

  return {
    wert: {
      vorschlagBrutto: zahl(wbw.vorschlagBrutto),
      anzahl: zahl(wbw.anzahl),
      medianRoh: zahl(rohWerte.median),
      medianBereinigt: zahl(bereinigt.median),
      getrimmt: zahl(bereinigt.getrimmt),
      min: zahl(rohWerte.min),
      max: zahl(rohWerte.max),
    },
    trichter: {
      gescraped: zahl(st.gescraped),
      imUmkreis: zahl(st.imUmkreis),
      toleranzRaus: zahl(st.toleranzRaus),
      dublettenRaus: zahl(st.dublettenRaus),
      linieRaus: zahl(st.linieRaus),
      karosserieRaus: zahl(st.karosserieRaus),
      getriebeRaus: zahl(st.getriebeRaus),
      tuerenRaus: zahl(st.tuerenRaus),
      imKorb: zahl(st.imKorb),
    },
    korb: (Array.isArray(daten.korb) ? daten.korb : []).map((eintrag, i) => {
      const e = objekt(eintrag)
      const f = objekt(e.fahrzeug)
      return {
        rang: zahl(e.rang) ?? i + 1,
        score: zahl(e.score),
        quelle: text(f.source) ?? text(f.quelle),
        titel: text(f.title) ?? text(f.titel),
        preis: preisAus(f),
        // Die Vereinheitlichung des Plugins (`normalize.js`) benennt die
        // Felder anders als die Adapter: `mileage` statt `kilometerstand`,
        // `ez` statt `erstzulassung`. Gelesen werden beide Schreibweisen —
        // hier soll nichts leer bleiben, weil ein Name gewechselt hat.
        kilometerstand: zahl(f.mileage) ?? zahl(f.kilometerstand),
        erstzulassung: text(f.ez) ?? text(f.erstzulassung),
        leistungKw: zahl(f.power) ?? zahl(f.leistungKw),
        ort: text(f.ort) ?? text(f.zip) ?? text(f.plz),
        entfernungKm: zahl(f._distanzKm) ?? zahl(e._distanzKm),
        url: text(f.url),
        fehlend: texte(e.fehlend),
      }
    }),
  }
}

/** Die Stationen des Trichters für die Anzeige — nur die, die etwas entfernt haben. */
export function trichterzeilen(t: Trichter): { name: string; wert: number }[] {
  const alle: { name: string; wert: number | null }[] = [
    { name: 'von den Portalen', wert: t.gescraped },
    { name: 'im Umkreis', wert: t.imUmkreis },
    { name: 'ausserhalb der Toleranzen', wert: t.toleranzRaus },
    { name: 'Dubletten', wert: t.dublettenRaus },
    { name: 'andere Ausstattungslinie', wert: t.linieRaus },
    { name: 'andere Karosserie', wert: t.karosserieRaus },
    { name: 'anderes Getriebe', wert: t.getriebeRaus },
    { name: 'andere Türzahl', wert: t.tuerenRaus },
    { name: 'im Korb', wert: t.imKorb },
  ]
  return alle
    .filter((z): z is { name: string; wert: number } => z.wert !== null)
    .filter((z) => z.wert > 0 || z.name === 'im Korb')
}
