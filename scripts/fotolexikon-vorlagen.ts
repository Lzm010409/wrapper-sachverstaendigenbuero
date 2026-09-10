/**
 * Die Beispielteile für die Startbefüllung des Fotolexikons.
 *
 * Einzige Quelle für zwei Verwendungen: `fotolexikon-seed-erzeugen.ts`
 * schreibt daraus beim Bauen des Abbilds `seed/fotolexikon.json`, das der
 * Startvorgang (`scripts/starten.mjs`) bei jedem Boot abgleicht — und
 * `fotolexikon-seed.ts` liest dieselben Daten für einen manuellen Lauf gegen
 * eine lokale Datenbank. Beide Wege sollen nie auseinanderlaufen.
 *
 * Das Wording ist keine Erfindung: es stammt aus echten Fotobeschreibungen
 * offener Gutachten (autoiXpert-Stichprobe vom 09.09.2026, fünf Gutachten,
 * über die Abrufregel — nur offen, ab Mai 2026, rein lesend). „Flächig
 * deformiert" etwa steht dort für Blechteile durchgängig, nicht nur
 * „deformiert" — das übernimmt diese Liste, statt es zu erraten.
 */
export interface Vorlage {
  name: string
  erkennungsmerkmal: string
  beschaedigungsarten: { begriff: string; hinweis: string }[]
}

export const TEILE: Vorlage[] = [
  {
    name: 'Kotflügel',
    erkennungsmerkmal:
      'Sitzt zwischen Scheinwerfer/Frontverkleidung und der Tür, umschliesst den ' +
      'Radlauf. Anders als die Tür hat er keinen Türgriff und keine umlaufende Fuge.',
    beschaedigungsarten: [
      {
        begriff: 'kratzbeschädigt',
        hinweis: 'Nur oberflächlicher Kratzer im Lack, kein sichtbarer Verzug im Blech.',
      },
      {
        begriff: 'flächig deformiert',
        hinweis: 'Blech sichtbar eingedrückt oder verzogen, auch über eine größere Fläche.',
      },
    ],
  },
  {
    name: 'Tür',
    erkennungsmerkmal:
      'Trägt Türgriff und Fensterrahmen, umlaufende Fuge zu Kotflügel, Seitenwand ' +
      'und Schweller. Nicht der Kotflügel (kein Griff, keine Fuge ringsum).',
    beschaedigungsarten: [
      { begriff: 'kratzbeschädigt', hinweis: 'Nur oberflächlicher Kratzer im Lack.' },
      { begriff: 'flächig deformiert', hinweis: 'Blech sichtbar eingedrückt oder verzogen.' },
    ],
  },
  {
    name: 'Seitenwand',
    erkennungsmerkmal:
      'Durchgehende Blechfläche zwischen den Radläufen, ohne eigene Tür-Fuge — bei ' +
      'Transportern oft fensterlos. Nicht die Tür (keine Fuge, kein Griff).',
    beschaedigungsarten: [
      { begriff: 'kratzbeschädigt', hinweis: 'Nur oberflächlicher Kratzer im Lack.' },
      { begriff: 'flächig deformiert', hinweis: 'Blech sichtbar eingedrückt oder verzogen.' },
    ],
  },
  {
    name: 'Schweller',
    erkennungsmerkmal: 'Schmale Leiste unterhalb der Türen, zwischen Vorder- und Hinterrad.',
    beschaedigungsarten: [
      { begriff: 'kratzbeschädigt', hinweis: 'Oberflächlicher Kratzer oder Schürfspur, ohne Verformung.' },
    ],
  },
  {
    name: 'Frontverkleidung',
    erkennungsmerkmal:
      'Stossfänger vorne, meist über die gesamte Fahrzeugbreite, aus Kunststoff — ' +
      'anders als der lackierte Blech-Kotflügel daneben.',
    beschaedigungsarten: [
      { begriff: 'kratzbeschädigt', hinweis: 'Oberflächlicher Kratzer im Kunststoff, ohne Verformung.' },
      {
        begriff: 'plastisch verformt',
        hinweis: 'Kunststoff sichtbar eingedrückt oder verzogen, aber nicht gebrochen.',
      },
      { begriff: 'gebrochen', hinweis: 'Riss oder Bruchstelle im Kunststoff, ggf. lose Teile.' },
    ],
  },
  {
    name: 'Heckverkleidung',
    erkennungsmerkmal: 'Stossfänger hinten — dieselbe Bauart wie die Frontverkleidung, nur am Heck.',
    beschaedigungsarten: [
      { begriff: 'kratzbeschädigt', hinweis: 'Oberflächlicher Kratzer im Kunststoff, ohne Verformung.' },
      {
        begriff: 'plastisch verformt',
        hinweis: 'Kunststoff sichtbar eingedrückt oder verzogen, aber nicht gebrochen.',
      },
      { begriff: 'gebrochen', hinweis: 'Riss oder Bruchstelle im Kunststoff, ggf. lose Teile.' },
    ],
  },
  {
    name: 'Heckklappe',
    erkennungsmerkmal:
      'Grosse, nach oben klappbare Tür am Heck über dem Kennzeichen, trägt meist die ' +
      'Rückleuchten.',
    beschaedigungsarten: [
      { begriff: 'kratzbeschädigt', hinweis: 'Oberflächlicher Kratzer im Lack.' },
      { begriff: 'flächig deformiert', hinweis: 'Blech sichtbar eingedrückt oder verzogen.' },
    ],
  },
  {
    name: 'Spiegel',
    erkennungsmerkmal: 'Aussenspiegelgehäuse aus Kunststoff, an der Tür montiert.',
    beschaedigungsarten: [
      { begriff: 'kratzbeschädigt', hinweis: 'Oberflächlicher Kratzer im Gehäuse.' },
      { begriff: 'gebrochen', hinweis: 'Gehäuse oder Glas gerissen, gesprungen oder abgebrochen.' },
    ],
  },
  {
    name: 'Felge',
    erkennungsmerkmal: 'Metallrad unter dem Reifen, durch die Speichen sichtbar.',
    beschaedigungsarten: [
      {
        begriff: 'mit frischen Andruckspuren',
        hinweis:
          'Helle, glänzende Streifspur auf der Felgenkante, meist vom Bordstein — kein ' +
          'Lackschaden, keine Verformung.',
      },
    ],
  },
]
