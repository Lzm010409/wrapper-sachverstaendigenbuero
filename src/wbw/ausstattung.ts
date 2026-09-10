import type { VxsDaten } from '@/autoixpert/vxs'

/**
 * Übersetzt die DAT-Ausstattung in die Merkmale, die das WBW-Plugin kennt.
 *
 * **Warum das gebraucht wird:** Die Soll-Ausstattung filtert den
 * Vergleichskorb hart — ohne sie mischt sich Basis mit Vollausstattung und
 * der Median wird wertlos. Bisher musste sie von Hand eingetippt werden, denn
 * das Gutachten-Objekt der Schnittstelle hat für die Ausstattung **kein
 * einziges Feld**. Die DAT-Kalkulation hat sie: am echten Fall 0926/2081TG
 * 66 Sonder- und 50 Serienpositionen, aus der Fahrgestellnummer abgeleitet.
 *
 * **Übersetzt werden muss trotzdem.** DAT schreibt
 * `Audio-Navigationssystem: COMAND Online`, das Plugin kennt
 * `navigationssystem`; DAT schreibt `Multibeam LED`, das Plugin
 * `led_scheinwerfer`. Die Muster hier zielen genau auf den Wortschatz des
 * Plugins (`ausstattung-matcher.js`, Objekt `ALIASE`) — herauskommen die
 * Begriffe, die es selbst versteht.
 *
 * **Was nicht erkannt wird, wird nicht behauptet.** Von den 66
 * Sonderpositionen tragen die meisten nichts zum Vergleich bei
 * („Einstiegsleisten beleuchtet", „Kältemittel R 1234 YF"). Sie fallen
 * stillschweigend heraus — der Vorschlag soll kurz und belastbar sein, nicht
 * vollständig.
 */

/** Ein erkanntes Merkmal, mit der DAT-Zeile, aus der es stammt. */
export interface Merkmal {
  /** Der Begriff für die Soll-Ausstattung, z. B. `Sitzheizung`. */
  merkmal: string
  /** Sonderausstattung unterscheidet, Serienausstattung hat jedes Fahrzeug der Baureihe. */
  quelle: 'sonder' | 'serie'
  /** Die Zeile aus der DAT-Kalkulation — damit nichts unbelegt behauptet wird. */
  beleg: string
}

/**
 * Die Regeln. `muster` trifft, `nicht` schliesst aus.
 *
 * Beispiel für die Notwendigkeit von `nicht`: `Leder` steht in dieser
 * Kalkulation viermal — Armaturentafel, Lenkrad, Sitzbezug. Nur der Sitzbezug
 * bedeutet Lederausstattung; das Plugin schliesst `lederlenkrad` und
 * `ledernachbildung` aus denselben Gründen aus.
 */
const REGELN: { merkmal: string; muster: RegExp[]; nicht?: RegExp[] }[] = [
  { merkmal: 'AHK', muster: [/anhängerkupplung/i, /anhängevorrichtung/i], nicht: [/vorrüstung/i, /vorbereitung/i] },
  {
    merkmal: 'Navigationssystem',
    muster: [/navigationssystem/i, /\bcomand\b/i, /\bmbux\b/i],
    nicht: [/vorrüstung/i, /vorbereitung/i],
  },
  { merkmal: 'Panoramadach', muster: [/panorama/i] },
  { merkmal: 'Schiebedach', muster: [/schiebedach/i], nicht: [/panorama/i] },
  {
    merkmal: 'Sitzheizung',
    muster: [/sitzheizung/i, /sitze.*beheiz/i],
    nicht: [/lenkrad/i],
  },
  {
    merkmal: 'Lederausstattung',
    muster: [/sitzbezug[^:]*:\s*leder\b/i, /polsterung[^:]*:\s*leder\b/i, /vollleder/i, /ledersitze/i],
    nicht: [/nachbildung/i, /artico/i, /kunstleder/i, /teilleder/i],
  },
  {
    merkmal: 'Alufelgen',
    muster: [/lm-felgen/i, /leichtmetallfelgen/i, /alufelgen/i, /alu-felgen/i],
  },
  { merkmal: 'Allrad', muster: [/allradantrieb/i, /\b4-?matic\b/i, /quattro/i, /xdrive/i, /4motion/i] },
  {
    merkmal: 'LED-Scheinwerfer',
    muster: [/multibeam/i, /led[- ]scheinwerfer/i, /matrix[- ]?led/i, /voll-?led/i],
    nicht: [/tagfahr/i, /rückleuchten/i, /heckleuchten/i, /innenraum/i, /ambiente/i],
  },
  {
    merkmal: 'Head-Up-Display',
    muster: [/head-?up/i],
  },
  {
    merkmal: 'ACC',
    muster: [/distronic/i, /abstandsregelung/i, /abstandstempomat/i, /adaptive[rn]? tempomat/i],
  },
  {
    merkmal: 'Tempomat',
    muster: [/\btempomat\b/i, /geschwindigkeitsregel/i],
    // Ein Abstandstempomat ist ACC und wird dort gezählt.
    nicht: [/abstand/i, /distronic/i, /adaptiv/i],
  },
  {
    merkmal: 'Einparkhilfe',
    muster: [/parktronic/i, /einparkhilfe/i, /park-?assistent/i, /\bpdc\b/i, /parksensor/i],
    nicht: [/ferngesteuert/i],
  },
  {
    merkmal: 'Rückfahrkamera',
    muster: [/rückfahrkamera/i, /rückfahr-kamera/i, /kamerasystem 360/i, /360[- ]grad[- ]kamera/i],
  },
  {
    merkmal: 'Klimaautomatik',
    muster: [/klimaautomatik/i, /thermatic/i, /thermotronic/i, /klimatisierungsautomatik/i],
  },
  {
    merkmal: 'Klimaanlage',
    muster: [/klimaanlage/i],
    nicht: [/automatik/i, /thermatic/i, /thermotronic/i],
  },
  {
    merkmal: 'Standheizung',
    muster: [/standheizung/i, /webasto/i],
    nicht: [/vorbereitung/i, /vorrüstung/i],
  },
  {
    merkmal: 'Elektrische Fensterheber',
    muster: [/fensterheber elektrisch/i, /elektr\w*\.? fensterheber/i],
  },
  { merkmal: 'Isofix', muster: [/isofix/i] },
  {
    merkmal: 'CarPlay',
    muster: [/carplay/i, /android auto/i, /smartphone integr/i],
    nicht: [/vorrüstung/i, /vorbereitung/i],
  },
]

function trifft(text: string, regel: (typeof REGELN)[number]): boolean {
  if (regel.nicht?.some((r) => r.test(text))) return false
  return regel.muster.some((r) => r.test(text))
}

/**
 * Sucht in einer Liste von DAT-Beschreibungen die Merkmale des Plugins.
 * Jedes Merkmal kommt höchstens einmal vor; belegt wird es mit der ersten
 * Zeile, die es ausgelöst hat.
 */
function erkenne(zeilen: string[], quelle: 'sonder' | 'serie'): Merkmal[] {
  const gefunden: Merkmal[] = []
  for (const regel of REGELN) {
    const beleg = zeilen.find((z) => trifft(z, regel))
    if (beleg) gefunden.push({ merkmal: regel.merkmal, quelle, beleg })
  }
  return gefunden
}

export interface Ausstattungsvorschlag {
  /** Was dieses Fahrzeug **zusätzlich** hat — der eigentliche Filter. */
  sonder: Merkmal[]
  /**
   * Was in dieser Baureihe Serie ist.
   *
   * Als Filter nicht wertlos: Kleinanzeigen kennt keine Motorvarianten, dort
   * wird über die ganze Baureihe gesucht. Was beim E 53 AMG Serie ist
   * (Allrad, Klimaautomatik), unterscheidet ihn dort sehr wohl von einem
   * E 220 d.
   */
  serie: Merkmal[]
  /** Wie viele Zeilen DAT geliefert hat — für die Einordnung des Vorschlags. */
  gelesen: { sonder: number; serie: number }
}

export function ausstattungAusVxs(daten: VxsDaten): Ausstattungsvorschlag {
  const sonder = erkenne(daten.ausstattung.sonderausstattung, 'sonder')
  const bereits = new Set(sonder.map((m) => m.merkmal))
  // Doppelt gezählt würde ein Merkmal, das in beiden Listen steht
  // (`Sitzheizung vorn` ist hier Serie **und** Sonderausstattung). Die
  // Sonderausstattung gewinnt — sie ist die belastbarere Angabe.
  const serie = erkenne(daten.ausstattung.serienausstattung, 'serie').filter(
    (m) => !bereits.has(m.merkmal),
  )

  return {
    sonder,
    serie,
    gelesen: {
      sonder: daten.ausstattung.sonderausstattung.length,
      serie: daten.ausstattung.serienausstattung.length,
    },
  }
}

/**
 * Die Ausstattungslinie, wenn DAT sie benennt.
 *
 * Sie ist eine der Pflichtangaben des Plugins und musste bisher immer von
 * Hand eingetragen werden. In der Kalkulation steht sie als eigene Position:
 * `AMG-Line Exterieur`, `M Sportpaket`, `S line Sportpaket`.
 *
 * `Design- und Ausstattungslinie Standard` gilt **nicht** als Linie — als
 * Suchbegriff wäre „Standard" nichts wert. Wo sich nichts Belastbares findet,
 * kommt `null`, und der Sachverständige trägt sie wie bisher ein.
 */
export function linieAus(daten: VxsDaten): string | null {
  const zeilen = [...daten.ausstattung.sonderausstattung, ...daten.ausstattung.serienausstattung]
  for (const zeile of zeilen) {
    const linie = /\b([A-Za-zÄÖÜäöü]{1,12})[-\s]?Line\b/.exec(zeile)
    if (linie?.[1] && !/^(?:und|design)$/i.test(linie[1])) return `${linie[1]}-Line`
    const paket = /\b([MS])[-\s]?Sportpaket\b/.exec(zeile)
    if (paket?.[1]) return `${paket[1]} Sportpaket`
  }
  return null
}
