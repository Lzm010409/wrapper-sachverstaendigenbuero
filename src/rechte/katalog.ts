/**
 * Was in dieser Anwendung ein Recht ist.
 *
 * **Der Zustand vorher.** Es gab drei Rollen — `ersteller`, `freigeber`,
 * `admin` — und im ganzen Code **eine einzige** Stelle, die eine davon
 * prüfte: die Freigabe eines Bibliothekstexts. Alles andere fragte nur „ist
 * angemeldet". Jeder konnte jede Stellungnahme löschen, jedes Bild
 * entfernen, einen kostenpflichtigen Portalabruf auslösen und nach
 * autoiXpert zurückschreiben. Die Rolle `admin` hatte **gar keine** eigene
 * Wirkung; sie stand in der Datenbank und war ein Etikett.
 *
 * **Das Modell.** Ein Recht ist ein benannter Vorgang, keine Tabelle und
 * keine Seite. Jede Rolle bringt einen Satz Rechte mit; einzelne Rechte
 * lassen sich einem Benutzer zusätzlich geben oder wegnehmen. Damit ist der
 * Normalfall ein Klick („Ersteller") und der Sonderfall trotzdem möglich
 * („Ersteller, darf aber ausnahmsweise freigeben").
 *
 * **Warum die Rechte grob geschnitten sind.** Ein Recht je Knopf wäre eine
 * Liste, die niemand mehr überblickt, und niemand weiss dann, was er gerade
 * vergibt. Geschnitten wird nach der Frage: *Wovor will man jemanden
 * bewahren?* Vor Unwiederbringlichem (Löschen), vor Aussagen nach draussen
 * (Freigabe, Versand, Schreiben nach autoiXpert), vor Kosten (Apify) und vor
 * der Verwaltung selbst.
 *
 * **Was ausdrücklich kein Recht ist:** Lesen. Wer in diesem Büro angemeldet
 * ist, arbeitet an denselben Fällen; eine Trennung „nur meine Fälle" würde
 * die Vertretung im Urlaub unmöglich machen und wurde nicht verlangt.
 */

export const RECHTE = [
  'stellungnahme.loeschen',
  'bild.loeschen',
  'bibliothek.freigeben',
  'autoixpert.schreiben',
  'wbw.kostenpflichtig',
  'versand.vermerken',
  'benutzer.verwalten',
  'protokoll.lesen',
] as const

export type Recht = (typeof RECHTE)[number]

export type Rolle = 'ersteller' | 'freigeber' | 'admin'

export interface Rechtebeschreibung {
  recht: Recht
  name: string
  /** Was jemand damit tun kann — und wovor das Recht bewahrt. */
  erklaerung: string
}

export const BESCHREIBUNGEN: Rechtebeschreibung[] = [
  {
    recht: 'stellungnahme.loeschen',
    name: 'Stellungnahmen löschen',
    erklaerung:
      'Ein gelöschtes Schreiben ist fort, samt Positionen, Bausteinen und Bildern. ' +
      'Es gibt keinen Papierkorb.',
  },
  {
    recht: 'bild.loeschen',
    name: 'Bilder löschen',
    erklaerung: 'Bilder aus der Bibliothek entfernen. Ebenfalls ohne Papierkorb.',
  },
  {
    recht: 'bibliothek.freigeben',
    name: 'Bibliothekstexte freigeben',
    erklaerung:
      'Der Status „freigegeben" ist die Zusage, dass ein Textbaustein so hinausgehen darf. ' +
      'Kein KI-Aufruf erreicht diesen Weg (Konzept E5).',
  },
  {
    recht: 'autoixpert.schreiben',
    name: 'Nach autoiXpert zurückschreiben',
    erklaerung:
      'Fotos beschriften und Verwendungen setzen. Wirkt im führenden System, nicht nur hier. ' +
      'Zusätzlich muss AUTOIXPERT_SCHREIBEN=erlaubt gesetzt sein — das Recht allein genügt nicht.',
  },
  {
    recht: 'wbw.kostenpflichtig',
    name: 'Kostenpflichtige Portalabrufe',
    erklaerung:
      'Das Häkchen „mobile.de" im Recherchelauf greift auf einen kostenpflichtigen Dienst zu (Apify).',
  },
  {
    recht: 'versand.vermerken',
    name: 'Versand vermerken',
    erklaerung:
      '„Als versendet markieren" ist eine Aussage über die Aussenwelt und Grundlage für Fristen.',
  },
  {
    recht: 'benutzer.verwalten',
    name: 'Benutzer verwalten',
    erklaerung: 'Zugänge anlegen, Rollen setzen, Rechte vergeben, Konten sperren.',
  },
  {
    recht: 'protokoll.lesen',
    name: 'Fehlerprotokoll lesen',
    erklaerung:
      'Die Fehlerliste der Anwendung einsehen. Sie enthält keine personenbezogenen Daten, ' +
      'aber sie zeigt, was im Haus schiefgeht.',
  },
]

/**
 * Was eine Rolle von sich aus mitbringt.
 *
 * `ersteller` ist bewusst schmal: die tägliche Arbeit am Schreiben und an der
 * Recherche, aber nichts Unwiederbringliches und nichts, was Geld kostet oder
 * nach draussen wirkt. Wer mehr braucht, bekommt das einzelne Recht — das ist
 * eine bewusste Entscheidung und keine Beförderung.
 */
export const ROLLENRECHTE: Record<Rolle, Recht[]> = {
  ersteller: [],
  freigeber: ['bibliothek.freigeben', 'versand.vermerken', 'stellungnahme.loeschen'],
  admin: [...RECHTE],
}

export function istRecht(wert: string): wert is Recht {
  return (RECHTE as readonly string[]).includes(wert)
}
