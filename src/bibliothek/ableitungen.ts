import { findeBelege, findePlatzhalter, type GeparsterBeleg, type GeparsterPlatzhalter } from './parser'

/**
 * Was sich aus den Texten eines Eintrags von selbst ergibt.
 *
 * Beim Einlesen der Referenzdateien werden Platzhalter und Gerichtszitate
 * aus dem Text gezogen (`schreiben.ts`). Ein von Hand angelegter Eintrag
 * bekommt dieselbe Behandlung, mit denselben Funktionen — sonst hinge es am
 * Weg in die Bibliothek, ob `[Betrag]` später den Export sperrt und ob eine
 * zitierte Entscheidung zur Bestätigung vorgelegt wird.
 *
 * **Warum die internen Hinweise nur bei den Platzhaltern mitzählen.** Sie
 * dürfen nie in ein Schreiben geraten (Konzept R4). Ein Arbeitsauftrag, der
 * dort in Klammern steht, ist trotzdem einer und soll sichtbar bleiben. Ein
 * Gerichtsname dagegen ist dort eine Notiz und keine Aussage, die belegt
 * werden müsste — ihn zur Bestätigung vorzulegen, hiesse die Belegprüfung
 * mit Rauschen zu füllen und damit zu entwerten.
 */

export interface Eintragstexte {
  typischeBegruendung?: string | null
  gegenargument?: string | null
  vorgehen?: string | null
  hinweise?: string | null
}

export interface Ableitungen {
  platzhalter: GeparsterPlatzhalter[]
  belege: GeparsterBeleg[]
}

function vorhanden(...texte: (string | null | undefined)[]): string[] {
  return texte.filter((t): t is string => !!t && t.trim().length > 0)
}

export function leiteAb(texte: Eintragstexte): Ableitungen {
  const nachAussen = vorhanden(texte.typischeBegruendung, texte.gegenargument, texte.vorgehen)
  return {
    platzhalter: findePlatzhalter(...nachAussen, ...vorhanden(texte.hinweise)),
    belege: findeBelege(...nachAussen),
  }
}
