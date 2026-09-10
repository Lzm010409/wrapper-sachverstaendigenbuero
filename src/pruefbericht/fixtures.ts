import type { Extraktion } from './schema'

/**
 * Beispielauswertungen, den beiden echten Testberichten nachgebildet.
 *
 * Die Originale enthalten Namen, Adressen und Schadennummern und gehören
 * nicht ins Repository. Struktur und Eigenheiten sind hier erhalten:
 * das Bündel aus Sachverständigenhonorar und Prüfbericht, der
 * Werkstattvergleich ohne Einzelteil-Streichungen, die verteilte Kürzung,
 * die sich nicht Zeile für Zeile zuordnen lässt.
 */

/** Sendung eines Versicherers: Honorarkürzung plus DEKRA-Prüfbericht. */
export const BUENDEL_MIT_HONORAR: Extraktion = {
  pruefdienstleister: 'DEKRA',
  versicherer: 'Musterversicherung AG',
  schadennummer: '00-00-000/000000-X',
  aktenzeichen: '0000/0000TG',
  pruefdatum: '2026-07-21',
  fahrzeug: 'VW Passat Variant (3B6 ab 11.00), XX-YY 111',
  summeGutachten: 2983.64,
  summeGekuerzt: 2706.19,
  abschnitte: [
    {
      bezeichnung: 'Abrechnung Sachverständigenhonorar',
      typ: 'sachverstaendigenhonorar',
      seiteVon: 1,
      seiteBis: 2,
      fuerStellungnahmeRelevant: false,
      begruendung:
        'Der Versicherer kürzt das Honorar des Sachverständigen anhand seines Honorartableaus. ' +
        'Das ist ein eigener Vorgang und gehört nicht in die Stellungnahme zur Reparaturkostenabrechnung.',
    },
    {
      bezeichnung: 'Prüfbericht fiktive Abrechnung',
      typ: 'kalkulation',
      seiteVon: 3,
      seiteBis: 6,
      fuerStellungnahmeRelevant: true,
      begruendung: 'Technische Prüfung und Werkstattvergleich zur Reparaturkostenkalkulation.',
    },
  ],
  positionen: [
    {
      bezeichnung: 'Stundenverrechnungssätze Karosserie',
      typ: 'kalkulation',
      betragGutachten: 179.75,
      betragGekuerzt: 169.25,
      begruendungVersicherer:
        'Verweis auf den Referenzbetrieb Autolackiererei Blazevic, 22 km entfernt, ' +
        'als gleichwertige Fachwerkstatt mit verbindlichen Endverbraucherpreisen.',
      seite: 4,
      zusammengefassteZeilen: ['Lohnklasse 1', 'Lohnklasse 2', 'Lohnklasse 3'],
    },
    {
      bezeichnung: 'Stundenverrechnungssätze Mechanik',
      typ: 'kalkulation',
      betragGutachten: 178.75,
      betragGekuerzt: 165.25,
      begruendungVersicherer: 'Verweis auf denselben Referenzbetrieb.',
      seite: 4,
      zusammengefassteZeilen: ['Lohnklasse 1', 'Lohnklasse 2', 'Lohnklasse 3'],
    },
    {
      bezeichnung: 'Lackierlohn',
      typ: 'kalkulation',
      betragGutachten: 206.0,
      betragGekuerzt: 185.25,
      begruendungVersicherer: 'Lackierlohn des Referenzbetriebs.',
      seite: 4,
      zusammengefassteZeilen: [],
    },
    {
      bezeichnung: 'Lackmaterial-Prozentsatz',
      typ: 'kalkulation',
      betragGutachten: 43.04,
      betragGekuerzt: 40.0,
      begruendungVersicherer:
        'Prozentsatz für die gewählte Lackart nach Herstellervorgabe auf 40,00 % gesetzt.',
      seite: 4,
      zusammengefassteZeilen: [],
    },
    {
      bezeichnung: 'Ersatzteilpreisaufschlag',
      typ: 'kalkulation',
      betragGutachten: 26.2,
      betragGekuerzt: 20.0,
      begruendungVersicherer: 'Aufschlag auf die Gesamtsumme auf 20,00 % begrenzt.',
      seite: 4,
      zusammengefassteZeilen: [],
    },
  ],
  unklarheiten: [],
}

/** Ein einfacher Bericht ohne Bündelung, mit einer klassischen E-Teil-Streichung. */
export const EINFACHER_BERICHT: Extraktion = {
  pruefdienstleister: 'ControlExpert',
  versicherer: 'Beispielversicherung',
  schadennummer: '1111-222.333/4',
  aktenzeichen: '0001/0001TG',
  pruefdatum: '2026-08-07',
  fahrzeug: 'VW Passat Variant, XX-YY 111',
  summeGutachten: 1000.0,
  summeGekuerzt: 880.0,
  abschnitte: [
    {
      bezeichnung: 'Prüfbericht Kalkulation',
      typ: 'kalkulation',
      seiteVon: 1,
      seiteBis: 3,
      fuerStellungnahmeRelevant: true,
      begruendung: 'Technische Prüfung der Reparaturkostenkalkulation.',
    },
  ],
  positionen: [
    {
      bezeichnung: 'Halterung Stoßfänger hinten links',
      typ: 'kalkulation',
      betragGutachten: 55.0,
      betragGekuerzt: 0,
      begruendungVersicherer:
        'Keine sichtbare Beschädigung des Halters; bei sorgfältiger Demontage wiederverwendbar.',
      seite: 2,
      zusammengefassteZeilen: [],
    },
    {
      bezeichnung: 'Beilackierung Seitenwand hinten links',
      typ: 'kalkulation',
      betragGutachten: 65.0,
      betragGekuerzt: 0,
      begruendungVersicherer:
        'Beilackierung angrenzender Bauteile technisch nicht erforderlich, Farbtonangleichung ' +
        'erfolgt über Musterblech.',
      seite: 2,
      zusammengefassteZeilen: [
        'Lackierung Seitenwand',
        'Lohn Vorbereitung',
        'Lackmaterial anteilig',
        'Abdeckarbeiten',
      ],
    },
  ],
  unklarheiten: [],
}
