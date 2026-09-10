/**
 * Liest die DAT-Kalkulation eines Gutachtens (VXS-XML).
 *
 * `GET /reports/{id}/vxs` liefert die Kalkulation im DAT-Format. Sie enthält
 * zwei Dinge, die im Gutachten-Objekt der Schnittstelle **nicht** stehen —
 * beide am echten Fall 0926/2081TG geprüft (07.09.2026, 412 KB):
 *
 * **1. Die genaue Fahrzeugbezeichnung.**
 *
 *     <ManufacturerName>  Mercedes-Benz
 *     <BaseModelName>     E Limousine (BM 213)
 *     <SubModelName>      E 53 AMG 4Matic+ (213.061)
 *     <ShortName>         Model: Limousine AMG E 53 4MATIC+
 *
 * Das Gutachten-Objekt kennt nur `E Limousine (BM 213)`. Der Untertyp
 * entscheidet aber darüber, ob die Vergleichsfahrzeugsuche etwas taugt:
 * AutoScout24 führt `E 53 AMG` als eigenes Modell, und eine Suche nach der
 * Baureihe mischt 180-kW-Diesel mit einem 320-kW-AMG.
 *
 * **2. Die Kalkulationssummen.**
 *
 *     <TotalNetCosts>     8490.71     (Reparaturkosten netto)
 *     <TotalGrossCosts>  10103.94     (brutto)
 *
 * Beide stimmen mit der autoiXpert-Maske überein. Die Dokumentation der
 * Schnittstelle führt Kalkulationsergebnisse unter „Zukünftige Erweiterungen";
 * über die VXS sind sie längst zu haben.
 *
 * **Was hier nicht steht:** Wiederbeschaffungswert, Restwert und
 * Wertminderung. Die setzt der Sachverständige in autoiXpert, nicht DAT —
 * nachgesehen, sie kommen in der Datei nicht vor. Sie bleiben Sache des
 * gerenderten Gutachtens.
 *
 * **Zum Auslesen mit regulären Ausdrücken:** Die Datei ist maschinell erzeugt,
 * die gesuchten Felder sind einfache Skalare ohne Verschachtelung. Ein
 * XML-Parser wäre eine Abhängigkeit für 400 KB, von denen zwölf Werte
 * gebraucht werden. Sollten je Attribute oder Namensräume dazukommen, ist der
 * Wechsel eine Datei.
 */

export interface VxsFahrzeug {
  hersteller: string | null
  /** Baureihe, z. B. `E Limousine (BM 213)`. */
  basismodell: string | null
  /** Untertyp, z. B. `E 53 AMG 4Matic+ (213.061)`. */
  untertyp: string | null
  /** Kurzform der DAT, z. B. `Model: Limousine AMG E 53 4MATIC+`. */
  kurzname: string | null
  datECode: string | null
  vin: string | null
  /** Leistung in kW, z. B. `320`. */
  leistungKw: number | null
  /** Abgelesener Kilometerstand, z. B. `147441`. */
  laufleistung: number | null
  /** Erstzulassung als ISO-Datum, z. B. `2018-10-12`. */
  erstzulassung: string | null
  /** Getriebeart, wie DAT sie führt: `automatic` oder `manual`. */
  getriebe: string | null
  /** Zahl der Gänge, z. B. `9`. */
  gaenge: number | null
  /** Zahl der Türen, z. B. `4`. */
  tueren: number | null
  /** Farbe im Klartext, z. B. `SELENITGRAU - METALLICLACK`. */
  farbe: string | null
  /** Hubraum in Kubikzentimetern, z. B. `2999`. */
  hubraum: number | null
}

/**
 * Die Ausstattung, wie DAT sie führt — im Gutachten-Objekt der Schnittstelle
 * gibt es dafür **kein einziges Feld**.
 *
 * Am echten Fall 0926/2081TG: 81 Sonder-, 52 Serienpositionen, dazu elf
 * abgewählte Serienpositionen. Die Beschreibungen stehen im Klartext
 * („Anhängerkupplung (Kugelkopf schwenkbar)", „Audio-Navigationssystem:
 * COMAND Online").
 *
 * Für den Vergleichskorb zählt vor allem die **Sonderausstattung**: was in
 * dieser Baureihe Serie ist, hat jedes Vergleichsfahrzeug ohnehin und
 * unterscheidet nichts.
 */
export interface VxsAusstattung {
  sonderausstattung: string[]
  serienausstattung: string[]
  /** Serienausstattung, die dieses Fahrzeug ausdrücklich **nicht** hat. */
  abgewaehlt: string[]
}

export interface VxsKalkulation {
  reparaturkostenNetto: number | null
  reparaturkostenBrutto: number | null
  lohn: number | null
  lackmaterial: number | null
  nebenkosten: number | null
  mehrwertsteuer: number | null
}

export interface VxsDaten {
  fahrzeug: VxsFahrzeug
  kalkulation: VxsKalkulation
  ausstattung: VxsAusstattung
  /** Aktenzeichen, wie DAT es im Dossiernamen führt. */
  bezeichnung: string | null
}

/**
 * Liest den ersten Wert eines Elements.
 *
 * Bewusst der erste: eine VXS kann mehrere Dossiers enthalten, und dann gilt
 * das erste. Fehlt das Element, kommt `null` — nicht `0` und nicht der leere
 * Text, denn „nicht kalkuliert" und „null Euro" sind zweierlei.
 */
function lies(xml: string, feld: string): string | null {
  const treffer = new RegExp(`<vxs:${feld}(?:\\s[^>]*)?>([^<]*)</vxs:${feld}>`).exec(xml)
  const wert = treffer?.[1]?.trim()
  return wert ? entschluessele(wert) : null
}

/** Die fünf XML-Entitäten. Mehr benutzt DAT nicht. */
function entschluessele(text: string): string {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
}

/**
 * Liest einen Betrag. DAT schreibt mit Punkt als Dezimaltrennzeichen.
 * Was sich nicht als Zahl lesen lässt, ergibt `null`.
 */
function liesBetrag(xml: string, feld: string): number | null {
  const roh = lies(xml, feld)
  if (roh === null) return null
  const zahl = Number.parseFloat(roh.replace(',', '.'))
  return Number.isFinite(zahl) ? zahl : null
}

/** Wie `liesBetrag`, aber auf eine ganze Zahl gerundet. */
function liesGanzzahl(xml: string, feld: string): number | null {
  const zahl = liesBetrag(xml, feld)
  return zahl === null ? null : Math.round(zahl)
}

/**
 * Ein Datum. DAT hängt den Zeitzonenversatz an: `2018-10-12+02:00`. Der Rest
 * der Anwendung rechnet mit reinen ISO-Tagen, deshalb fällt er hier weg —
 * eine Erstzulassung hat keine Uhrzeit.
 */
function liesDatum(xml: string, feld: string): string | null {
  const roh = lies(xml, feld)
  if (!roh) return null
  const treffer = /^(\d{4}-\d{2}-\d{2})/.exec(roh)
  return treffer?.[1] ?? null
}

/**
 * Die Beschreibungen eines Ausstattungsblocks.
 *
 * Genommen wird der **erste** Block gleichen Namens: DAT schreibt den
 * Fahrzeugteil zweimal in die Datei, Zeichen für Zeichen gleich (am echten
 * Fall geprüft: zweimal 27.037 Byte Sonderausstattung).
 */
function liesAusstattungsblock(xml: string, name: string): string[] {
  const anfang = xml.indexOf(`<vxs:${name}>`)
  if (anfang === -1) return []
  const ende = xml.indexOf(`</vxs:${name}>`, anfang)
  if (ende === -1) return []
  const block = xml.slice(anfang, ende)

  const gefunden: string[] = []
  const gesehen = new Set<string>()
  for (const treffer of block.matchAll(/<vxs:Description>([^<]*)<\/vxs:Description>/g)) {
    const text = entschluessele((treffer[1] ?? '').trim())
    if (!text || gesehen.has(text)) continue
    gesehen.add(text)
    gefunden.push(text)
  }
  return gefunden
}

export function leseVxs(xml: string): VxsDaten {
  return {
    bezeichnung: lies(xml, 'Name'),
    fahrzeug: {
      hersteller: lies(xml, 'ManufacturerName'),
      basismodell: lies(xml, 'BaseModelName'),
      untertyp: lies(xml, 'SubModelName'),
      kurzname: lies(xml, 'ShortName'),
      datECode: lies(xml, 'DatECode'),
      vin: lies(xml, 'VehicleIdentNumber'),
      leistungKw: liesGanzzahl(xml, 'PowerKw'),
      laufleistung: liesGanzzahl(xml, 'MileageOdometer'),
      erstzulassung: liesDatum(xml, 'InitialRegistration'),
      // DAT schreibt das Feld in zwei Schreibweisen in dieselbe Datei.
      getriebe: lies(xml, 'GearBoxType') ?? lies(xml, 'GearboxType'),
      gaenge: liesGanzzahl(xml, 'NrOfGears'),
      tueren: liesGanzzahl(xml, 'VehicleDoors'),
      farbe: lies(xml, 'Color'),
      hubraum: liesGanzzahl(xml, 'Capacity'),
    },
    ausstattung: {
      sonderausstattung: liesAusstattungsblock(xml, 'SpecialEquipment'),
      serienausstattung: liesAusstattungsblock(xml, 'SeriesEquipment'),
      abgewaehlt: liesAusstattungsblock(xml, 'DeselectedSeriesEquipment'),
    },
    kalkulation: {
      // `TotalNetCosts` und `SumNet` tragen denselben Wert; `Corrected` ist
      // die Fassung nach Korrekturen und hat Vorrang, wo sie abweicht.
      reparaturkostenNetto: liesBetrag(xml, 'TotalNetCorrected') ?? liesBetrag(xml, 'TotalNetCosts'),
      reparaturkostenBrutto:
        liesBetrag(xml, 'TotalGrossCorrected') ?? liesBetrag(xml, 'TotalGrossCosts'),
      lohn: liesBetrag(xml, 'TotalWages'),
      lackmaterial: liesBetrag(xml, 'SumMaterialCorrected') ?? liesBetrag(xml, 'SumMaterial'),
      nebenkosten: liesBetrag(xml, 'SumMiscellaneousCosts') ?? liesBetrag(xml, 'AuxiliaryCosts'),
      mehrwertsteuer: liesBetrag(xml, 'TotalVATCorrected') ?? liesBetrag(xml, 'TotalVAT'),
    },
  }
}

/**
 * Der Modellname für die Portalsuche, aus dem Untertyp der DAT.
 *
 * `E 53 AMG 4Matic+ (213.061)` → `E 53 AMG 4Matic+`. Die Klammer trägt den
 * internen Baumusterschlüssel; kein Portal kennt ihn. Der Rest geht als
 * Suchbegriff in die Modellauflösung des Portals — die entscheidet dann, ob
 * daraus `E 53 AMG` wird.
 */
export function modellVorschlagAusVxs(daten: VxsDaten): string | null {
  const untertyp = daten.fahrzeug.untertyp
  if (!untertyp) return null
  const ohneKlammer = untertyp.replace(/\s*\([^)]*\)\s*$/, '').trim()
  return ohneKlammer || null
}

/**
 * Die Baureihe für Portale, die keine Motorvarianten führen (Kleinanzeigen).
 *
 * `E Limousine (BM 213)` → `E-Klasse`. Die DAT schreibt die Bauform in den
 * Namen der Baureihe („E Limousine", „C T-Modell"); für die Baureihe zählt
 * nur der Buchstabe davor. Wo sich das nicht erkennen lässt, kommt `null` —
 * dann wird nichts geraten.
 */
export function baureiheAusVxs(daten: VxsDaten): string | null {
  const basis = daten.fahrzeug.basismodell
  if (!basis) return null
  const ohneKlammer = basis.replace(/\s*\([^)]*\)\s*$/, '').trim()

  // „E Limousine", „C T-Modell", „A Limousine" → „E-Klasse", „C-Klasse", …
  const klasse = /^([A-Z]{1,3})\s+(Limousine|T-Modell|Coupé|Coupe|Cabrio|Kombi|Kombilimousine)\b/i.exec(
    ohneKlammer,
  )
  if (klasse) return `${klasse[1]!.toUpperCase()}-Klasse`

  return ohneKlammer || null
}
