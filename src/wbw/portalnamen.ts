import type { Portal } from './lauf'

/**
 * Der Anzeigename je Portal — die einzige Stelle, die ihn kennt.
 *
 * `Portal` ist zugleich der interne Schlüssel (Eingabedatei-Feld,
 * Beschaffungsprotokoll, Dateiname, Gruppierung der Belege). Wo dieser
 * Schlüssel roh in einer Oberfläche, einer Meldung oder dem Beleg-PDF
 * landete (`autoscout24` statt `AutoScout24`), stand er falsch da.
 *
 * Bewusst eine eigene, von `./lauf` unabhängige Datei: `belegseite.ts` baut
 * den Beleg absichtlich ohne `server-only`, damit er sich ohne Server- oder
 * Browserkontext prüfen lässt (siehe dort) — der `Portal`-Typ selbst bleibt
 * trotzdem `import type`, das wird beim Bauen entfernt und zieht `lauf.ts`
 * nicht mit.
 */
export const PORTAL_NAMEN: Record<Portal, string> = {
  autoscout24: 'AutoScout24',
  kleinanzeigen: 'Kleinanzeigen',
  'mobile.de': 'mobile.de',
}

/** Der Anzeigename eines Portals. Ein unbekannter Schlüssel bleibt unverändert stehen. */
export function portalName(portal: string): string {
  return (PORTAL_NAMEN as Record<string, string>)[portal] ?? portal
}
