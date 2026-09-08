import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { relations, sql } from 'drizzle-orm'

/* ------------------------------------------------------------------ *
 * Aufzählungen
 * ------------------------------------------------------------------ */

/** Anspruchstyp, nach dem die Skills die Bibliothek gliedern. */
export const bereichEnum = pgEnum('bereich', [
  'kalkulation',
  'wertminderung',
  'wbw',
  'restwert',
  'sonderfall',
])

/**
 * Freigabestand eines Bibliothekseintrags. Der Übergang nach `freigegeben`
 * ist ausschließlich über die Oberfläche möglich (Konzept E5) — kein
 * KI-Aufruf darf ihn auslösen.
 */
export const eintragStatusEnum = pgEnum('eintrag_status', [
  'entwurf',
  'pruefung',
  'freigegeben',
  'zurueckgezogen',
])

/** Der Stand eines WBW-Recherchelaufs. */
export const wbwZustandEnum = pgEnum('wbw_zustand', ['laeuft', 'fertig', 'fehler'])

/** Die Art einer Meldung — sie entscheidet über Farbe, Vorlesen und Verweildauer. */
export const meldungsartEnum = pgEnum('meldungsart', ['fehler', 'warnung', 'erfolg', 'info'])

/** Die Stufe eines Protokolleintrags. */
export const protokollstufeEnum = pgEnum('protokollstufe', ['fehler', 'warnung', 'info'])

/** Woher ein Eintrag stammt — für den Prüfbericht der Migration und die Audit-Spur. */
export const herkunftEnum = pgEnum('herkunft', [
  'migration',
  'manuell',
  'ki_vorschlag',
  'aus_stellungnahme',
])

export const rolleEnum = pgEnum('rolle', ['ersteller', 'freigeber', 'admin'])

/** Woher der Wert eines Platzhalters kommt. */
export const platzhalterQuelleEnum = pgEnum('platzhalter_quelle', [
  'autoixpert',
  'pruefbericht',
  'manuell',
  'berechnet',
])

export const belegTypEnum = pgEnum('beleg_typ', [
  'urteil',
  'norm',
  'literatur',
  'regelwerk',
])

/**
 * Klammerausdrücke im Bibliothekstext sind zweierlei:
 * - `wert`: einzusetzender Fallwert, z.B. `[Betrag]`, `[Bauteilseite]`.
 * - `regieanweisung`: Arbeitsauftrag an den Schreibenden, der im fertigen
 *   Text nicht stehen bleiben darf, z.B. „[Mit Screenshots aus dem
 *   Kalkulationsprogramm belegen.]".
 * Beide sperren den Export, solange sie ungelöst sind — aber sie werden
 * in der Oberfläche unterschiedlich dargestellt.
 */
export const platzhalterArtEnum = pgEnum('platzhalter_art', [
  'wert',
  'regieanweisung',
])

/** Wie eine Kürzungsposition in der Stellungnahme behandelt wird. */
export const behandlungEnum = pgEnum('behandlung', [
  'offen',
  'bestritten',
  'anerkannt',
  'nicht_bestreiten',
])

/**
 * Woher ein Baustein an einer Position kam. Trägt zwei spätere Auswertungen:
 * wo die Trefferliste danebenlag, und die Wirkungsstatistik je Eintrag.
 */
export const bausteinHerkunftEnum = pgEnum('baustein_herkunft', [
  'vorschlag',
  'bibliothekssuche',
  'eigener_text',
])

export const bausteinTypEnum = pgEnum('baustein_typ', ['bibliothek', 'eigener_text'])

export const modusEnum = pgEnum('modus', ['standard', 'schnell', 'individuell'])

/* ------------------------------------------------------------------ *
 * Benutzer und Sitzungen
 * ------------------------------------------------------------------ */

export const benutzer = pgTable(
  'benutzer',
  {
    id: uuid().primaryKey().defaultRandom(),
    email: text().notNull(),
    name: text().notNull(),
    /**
     * Nullable: wer sich über Microsoft Entra anmeldet, braucht kein
     * lokales Passwort. Die Passwortanmeldung bleibt als Rückfallebene,
     * falls der Tenant einmal nicht erreichbar ist.
     */
    passwortHash: text(),
    /**
     * Die unveränderliche Objekt-ID des Kontos in Entra (`oid`). Sie bleibt
     * stabil, wenn sich die Mailadresse ändert — deshalb ist sie und nicht
     * die Adresse der eigentliche Schlüssel zum Konto.
     */
    entraOid: text(),
    rolle: rolleEnum().notNull().default('ersteller'),
    aktiv: boolean().notNull().default(true),
    letzteAnmeldung: timestamp({ withTimezone: true }),
    erstelltAm: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('benutzer_email_idx').on(sql`lower(${t.email})`),
    uniqueIndex('benutzer_entra_idx').on(t.entraOid),
  ],
)

/**
 * Ein Recht, das einem Benutzer zusätzlich gegeben oder ausdrücklich
 * entzogen wurde.
 *
 * **Warum eine Zeile je Abweichung und keine Liste am Benutzer.** Weil hier
 * beides steht: `gewaehrt: true` gibt ein Recht, das die Rolle nicht
 * mitbringt, `gewaehrt: false` nimmt eines weg, das sie mitbringt. Eine
 * blosse Liste könnte nur das Erste. Und beides kommt vor: der Ersteller,
 * der ausnahmsweise freigeben darf, und der Freigeber, dem man das Löschen
 * abgenommen hat, nachdem er sich einmal vergriffen hat.
 *
 * **Warum die Abweichung und nicht der volle Satz gespeichert wird.** Ändert
 * sich später, was eine Rolle mitbringt, gilt das sofort für alle — ohne
 * dass jemand fünfzehn Konten nachpflegen muss. Was von Hand entschieden
 * wurde, bleibt trotzdem stehen.
 */
export const benutzerRecht = pgTable(
  'benutzer_recht',
  {
    benutzerId: uuid()
      .notNull()
      .references(() => benutzer.id, { onDelete: 'cascade' }),
    /** Der Schlüssel aus `src/rechte/katalog.ts`, z. B. `bibliothek.freigeben`. */
    recht: text().notNull(),
    /** `true` gibt zusätzlich, `false` nimmt weg. */
    gewaehrt: boolean().notNull(),
    gesetztVon: uuid().references(() => benutzer.id, { onDelete: 'set null' }),
    gesetztAm: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('benutzer_recht_eindeutig').on(t.benutzerId, t.recht),
    index('benutzer_recht_benutzer_idx').on(t.benutzerId),
  ],
)

export const sitzung = pgTable(
  'sitzung',
  {
    id: uuid().primaryKey().defaultRandom(),
    benutzerId: uuid()
      .notNull()
      .references(() => benutzer.id, { onDelete: 'cascade' }),
    tokenHash: text().notNull(),
    laeuftAbAm: timestamp({ withTimezone: true }).notNull(),
    erstelltAm: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('sitzung_token_idx').on(t.tokenHash),
    index('sitzung_benutzer_idx').on(t.benutzerId),
  ],
)

/* ------------------------------------------------------------------ *
 * Argumentbibliothek — bildet das bestehende Markdown-Format ab
 * (Kürzungsgrund → Typische Begründung → Gegenargument → Hinweise
 *  → Varianten → Ergänzung), siehe Konzept E4.
 * ------------------------------------------------------------------ */

export const eintrag = pgTable(
  'eintrag',
  {
    id: uuid().primaryKey().defaultRandom(),

    /** Gliederungsnummer aus der Quelldatei, z.B. "1.2". */
    nummer: text().notNull(),
    titel: text().notNull(),
    bereich: bereichEnum().notNull(),
    /** Themenabschnitt, z.B. "1. Ersatzteile-Erforderlichkeit / E-Positionen". */
    abschnitt: text().notNull(),

    /** Was der Prüfdienstleister typischerweise vorbringt — der Auslöser. */
    typischeBegruendung: text(),
    /**
     * Der einsatzfertige Gegenargument-Text. Nullable, weil nicht jeder
     * Eintrag einen trägt: die Wertminderungseinträge 3 und 4 halten
     * stattdessen unter `vorgehen` fest, dass die Kürzung in der Praxis
     * meist hinzunehmen ist oder auf einen anderen Eintrag verweist.
     */
    gegenargument: text(),
    /**
     * Handlungsanweisung statt fertigem Text. Erscheint in der Auswahlmaske
     * als Hinweis zur Behandlung der Position, nicht als einfügbarer Baustein.
     */
    vorgehen: text(),
    /**
     * Interne Feldnotizen. Dürfen NIE in ein versandtes Dokument geraten
     * (Konzept R4) — das Exportmodell in src/export/ liest diese Spalte nicht.
     */
    hinweise: text(),
    /** Häufigkeitsangabe aus der Prosa, z.B. "in über 10 Fällen". */
    haeufigkeitText: text(),

    status: eintragStatusEnum().notNull().default('entwurf'),
    herkunft: herkunftEnum().notNull().default('manuell'),
    version: integer().notNull().default(1),

    /** Reserviert für semantische Suche, sobald die Bibliothek dafür groß genug ist. */
    embedding: jsonb(),

    quelldatei: text(),
    /**
     * Fingerabdruck des Inhalts, wie er aus der Referenzdatei gelesen wurde.
     *
     * Der Einlesevorgang ersetzt einen Eintrag samt Unterdatensätzen, und das
     * setzt ihn auf `entwurf` zurück — mit gutem Grund, denn eine Freigabe
     * bezieht sich auf einen bestimmten Wortlaut. Ohne diesen Fingerabdruck
     * traf das aber **jeden** Eintrag bei **jedem** Lauf, auch die, an denen
     * sich kein Zeichen geändert hatte: ein einziger neuer Baustein hätte die
     * Freigabe der ganzen Bibliothek einkassiert.
     *
     * Stimmt der Fingerabdruck überein, bleibt der Eintrag unangetastet —
     * Status, Freigabe und Datum inbegriffen. Ist er `null` (Einträge aus der
     * Zeit vor dieser Spalte), wird einmal ersetzt und dabei gesetzt.
     */
    inhaltsfingerabdruck: text(),
    erstelltVon: uuid().references(() => benutzer.id, { onDelete: 'set null' }),
    freigegebenVon: uuid().references(() => benutzer.id, { onDelete: 'set null' }),
    freigegebenAm: timestamp({ withTimezone: true }),
    erstelltAm: timestamp({ withTimezone: true }).notNull().defaultNow(),
    geaendertAm: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('eintrag_bereich_nummer_idx').on(t.bereich, t.nummer),
    index('eintrag_status_idx').on(t.status),
    index('eintrag_bereich_idx').on(t.bereich),
  ],
)

/** Untervarianten eines Eintrags, z.B. die acht Bauteilarten unter 1.3. */
export const eintragVariante = pgTable(
  'eintrag_variante',
  {
    id: uuid().primaryKey().defaultRandom(),
    eintragId: uuid()
      .notNull()
      .references(() => eintrag.id, { onDelete: 'cascade' }),
    bezeichnung: text().notNull(),
    text: text().notNull(),
    /** Wann diese Variante greift, sofern im Original angegeben. */
    bedingung: text(),
    reihenfolge: integer().notNull().default(0),
  },
  (t) => [index('variante_eintrag_idx').on(t.eintragId)],
)

/** Vertiefende Zusatzabsätze, optional zuschaltbar. */
export const eintragErgaenzung = pgTable(
  'eintrag_ergaenzung',
  {
    id: uuid().primaryKey().defaultRandom(),
    eintragId: uuid()
      .notNull()
      .references(() => eintrag.id, { onDelete: 'cascade' }),
    titel: text().notNull(),
    text: text().notNull(),
    wannEinsetzen: text(),
    reihenfolge: integer().notNull().default(0),
  },
  (t) => [index('ergaenzung_eintrag_idx').on(t.eintragId)],
)

/**
 * Platzhalter, die im Gegenargument-Text stehen (z.B. `[Betrag]`).
 * Aus dem Text geparst; blockieren den Export, solange sie leer sind (R1).
 */
export const eintragPlatzhalter = pgTable(
  'eintrag_platzhalter',
  {
    id: uuid().primaryKey().defaultRandom(),
    eintragId: uuid()
      .notNull()
      .references(() => eintrag.id, { onDelete: 'cascade' }),
    schluessel: text().notNull(),
    art: platzhalterArtEnum().notNull().default('wert'),
    quelle: platzhalterQuelleEnum().notNull().default('manuell'),
    /** Feldpfad in den autoiXpert-Falldaten, falls quelle = autoixpert. */
    feldpfad: text(),
    pflicht: boolean().notNull().default(true),
    beispiel: text(),
  },
  (t) => [
    index('platzhalter_eintrag_idx').on(t.eintragId),
    uniqueIndex('platzhalter_eintrag_schluessel_idx').on(t.eintragId, t.schluessel),
  ],
)

/**
 * Tatsachen, die im konkreten Fall zutreffen müssen, damit das Argument
 * richtig ist ("lückenlos scheckheftgepflegt", "Fotos belegen den Schaden").
 * Der Skill verbietet ausdrücklich, sie als erfüllt zu unterstellen.
 */
export const eintragVorbedingung = pgTable(
  'eintrag_vorbedingung',
  {
    id: uuid().primaryKey().defaultRandom(),
    eintragId: uuid()
      .notNull()
      .references(() => eintrag.id, { onDelete: 'cascade' }),
    text: text().notNull(),
    mussBestaetigtWerden: boolean().notNull().default(true),
  },
  (t) => [index('vorbedingung_eintrag_idx').on(t.eintragId)],
)

/** Gerichtsentscheidungen und Normen. Unverifiziert = Export gesperrt. */
export const beleg = pgTable(
  'beleg',
  {
    id: uuid().primaryKey().defaultRandom(),
    eintragId: uuid()
      .notNull()
      .references(() => eintrag.id, { onDelete: 'cascade' }),
    typ: belegTypEnum().notNull().default('urteil'),
    gericht: text(),
    aktenzeichen: text(),
    datum: text(),
    fundstelle: text(),
    kernaussage: text(),
    quelleUrl: text(),
    verifiziertAm: timestamp({ withTimezone: true }),
    verifiziertVon: uuid().references(() => benutzer.id, { onDelete: 'set null' }),
  },
  (t) => [index('beleg_eintrag_idx').on(t.eintragId)],
)

/* ------------------------------------------------------------------ *
 * Fälle und Stellungnahmen
 * ------------------------------------------------------------------ */

export const fall = pgTable(
  'fall',
  {
    id: uuid().primaryKey().defaultRandom(),
    /** Aktenzeichen des Büros = externalId in autoiXpert. */
    aktenzeichen: text(),
    /** Technische Ressourcen-ID in autoiXpert. */
    autoixpertId: text(),
    /** Rohantwort der Schnittstelle, für Feldpfade und Nachvollziehbarkeit. */
    daten: jsonb(),
    abgerufenAm: timestamp({ withTimezone: true }),
    erstelltAm: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('fall_aktenzeichen_idx').on(t.aktenzeichen),
    index('fall_autoixpert_idx').on(t.autoixpertId),
  ],
)

/**
 * Ein WBW-Recherchelauf.
 *
 * Der Lauf dauert Minuten — die Portale werden nacheinander abgefragt, und
 * zwischen den Abrufen wird bewusst pausiert. Eine HTTP-Antwort kann darauf
 * nicht warten, deshalb steht der Stand hier: die Oberfläche fragt ihn ab,
 * und ein Neuladen der Seite verliert nichts.
 *
 * `protokoll` wächst während des Laufs Schritt für Schritt — daran hängt die
 * Fortschrittsanzeige. `ergebnis` ist das `result.json` des Plugins,
 * unverändert.
 */
export const wbwLauf = pgTable(
  'wbw_lauf',
  {
    id: uuid().primaryKey().defaultRandom(),
    fallId: uuid()
      .notNull()
      .references(() => fall.id, { onDelete: 'cascade' }),
    zustand: wbwZustandEnum().notNull().default('laeuft'),
    /** Die Eingaben, mit denen gesucht wurde — für die Nachvollziehbarkeit. */
    eingabe: jsonb().notNull(),
    /** Die Schritte, wie sie durchlaufen wurden. */
    protokoll: jsonb().notNull().default(sql`'[]'::jsonb`),
    /** `result.json` des Plugins. */
    ergebnis: jsonb(),
    /** Was der Markenfilter je Portal entfernt hat. */
    markenfremd: jsonb(),
    /**
     * Was jeder gelaufene Zyklus ergeben hat — Toleranzen, Modellnamen,
     * Trefferzahlen und der Ordner seines eigenen Reports je Portal.
     */
    zyklen: jsonb().notNull().default(sql`'[]'::jsonb`),
    /** Das Urteil der KI-Prüfung je Fahrzeug, nach seiner Kennzeichnung. */
    urteile: jsonb().notNull().default(sql`'{}'::jsonb`),
    /**
     * Die Kennzeichnungen der Fahrzeuge, die der Sachverständige in den Korb
     * genommen hat. `null` heisst: er hat noch nicht entschieden, dann gilt
     * die Vorbelegung aus den Urteilen.
     */
    auswahl: jsonb(),
    /** Nur bei `fehler`: die Meldung, unverändert. */
    fehler: text(),
    /** Wo die erzeugten Dateien liegen. Überlebt keinen Neustart des Containers. */
    ordner: text(),
    /** Wer ihn angestossen hat — bekommt die Meldung, wenn er fertig ist. */
    angestossenVon: uuid().references(() => benutzer.id, { onDelete: 'set null' }),
    begonnenAm: timestamp({ withTimezone: true }).notNull().defaultNow(),
    beendetAm: timestamp({ withTimezone: true }),
  },
  (t) => [index('wbw_lauf_fall_idx').on(t.fallId), index('wbw_lauf_zustand_idx').on(t.zustand)],
)

/**
 * Eine Meldung, die den Blick überdauern muss.
 *
 * Was am Bildschirm passiert, sagt die Oberfläche selbst. Was **im
 * Hintergrund** passiert, sagt niemand: Ein WBW-Recherchelauf braucht
 * Minuten, und wer ihn angestossen hat, ist längst in einem anderen Reiter
 * oder hat den Rechner zugeklappt. Bis hierher endete so ein Lauf lautlos.
 *
 * Deshalb: fertig oder gescheitert wird hier festgehalten, an den Benutzer
 * gebunden, der ihn angestossen hat. Die Oberfläche fragt danach und zeigt
 * sie als Einblendung und im Verlauf hinter der Glocke.
 *
 * Was hier **nicht** hineingehört: Formularfehler und alles andere, was
 * unmittelbar auf eine Eingabe folgt. Das steht am Feld, nicht in einer
 * Liste.
 */
export const meldung = pgTable(
  'meldung',
  {
    id: uuid().primaryKey().defaultRandom(),
    benutzerId: uuid()
      .notNull()
      .references(() => benutzer.id, { onDelete: 'cascade' }),
    art: meldungsartEnum().notNull(),
    titel: text().notNull(),
    text: text().notNull(),
    /** Wohin die Meldung führt, z. B. `/faelle/…?reiter=wbw`. */
    verweis: text(),
    /** Woher sie kommt, z. B. `wbw` — für die Anzeige und zum Aufräumen. */
    quelle: text(),
    erstelltAm: timestamp({ withTimezone: true }).notNull().defaultNow(),
    /** Gesetzt, sobald der Verlauf geöffnet wurde. */
    gelesenAm: timestamp({ withTimezone: true }),
  },
  (t) => [index('meldung_benutzer_idx').on(t.benutzerId, t.erstelltAm)],
)

/**
 * Die Fehlerliste.
 *
 * **Warum es sie neben dem Containerprotokoll gibt.** Das Containerprotokoll
 * überlebt keinen Neustart, ist nur über Coolify zu erreichen und lässt sich
 * nicht durchsuchen. Wer einen Fehler untersuchen will, braucht beides: die
 * volle Zeile im Strom (für den Betrieb) und einen Ort, an dem sie noch
 * morgen steht (für die Nacharbeit).
 *
 * **Die Kennung ist der Schlüssel dazu.** Sie steht in der Fehlermeldung, die
 * der Benutzer sieht, in der Zeile im Strom und hier. Damit wird aus „bei mir
 * kam ein Fehler" eine Suche mit einem Treffer.
 *
 * **Was hier nicht steht:** personenbezogene Daten. Alles ist durch dieselbe
 * Schwärzung gegangen wie das Containerprotokoll — Kennzeichen,
 * Fahrgestellnummern, E-Mail-Adressen und Token sind schon vorher heraus.
 */
export const ereignis = pgTable(
  'ereignis',
  {
    id: uuid().primaryKey().defaultRandom(),
    /** Die kurze Kennung, die der Benutzer sieht: `K7M2-QP4X`. */
    kennung: text(),
    stufe: protokollstufeEnum().notNull(),
    /** Wo es passiert ist, in Punktschreibweise: `wbw.lauf.autoscout24`. */
    stelle: text().notNull(),
    meldung: text().notNull(),
    fehlerName: text(),
    fehlerMeldung: text(),
    spur: text(),
    /** Der übrige Zusammenhang, geschwärzt. */
    zusammenhang: jsonb(),
    /** Herausgezogen, weil danach gesucht wird. */
    benutzerId: uuid().references(() => benutzer.id, { onDelete: 'set null' }),
    fallId: uuid().references(() => fall.id, { onDelete: 'set null' }),
    erstelltAm: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('ereignis_zeit_idx').on(t.erstelltAm),
    index('ereignis_kennung_idx').on(t.kennung),
    index('ereignis_stelle_idx').on(t.stelle),
  ],
)

export const stellungnahme = pgTable(
  'stellungnahme',
  {
    id: uuid().primaryKey().defaultRandom(),
    fallId: uuid().references(() => fall.id, { onDelete: 'set null' }),
    modus: modusEnum().notNull().default('standard'),

    /** Ergebnis der Prüfbericht-Auswertung, unverändert aufbewahrt. */
    extraktion: jsonb(),
    /** Befunde der Sonderfall-Prüfliste B.1-B.8 (Konzept F4). */
    sonderfaelle: jsonb(),
    pruefberichtDateiname: text(),
    pruefberichtSeiten: integer(),

    /**
     * Das Schreiben selbst, als Dokumentbaum (ProseMirror-JSON).
     *
     * Seit dem Umbau auf den Brief-Editor ist diese Spalte die Wahrheit über
     * den Text — nicht mehr die Bausteinzeilen. Die Herkunft eingefügter
     * Bibliothekstexte hängt als Marke am Text und übersteht damit freies
     * Umformulieren; eine Fremdschlüsselzeile täte das nicht.
     */
    dokument: jsonb(),
    /**
     * Zählt jede gespeicherte Fassung hoch. Zwei Mitarbeiter an derselben
     * Stellungnahme überschreiben sich damit nicht stillschweigend: wer auf
     * einem alten Stand speichert, bekommt eine Meldung statt eines
     * verlorenen Absatzes.
     */
    dokumentStand: integer().notNull().default(0),
    dokumentGeaendertAm: timestamp({ withTimezone: true }),

    empfaengerName: text(),
    empfaengerStrasse: text(),
    empfaengerPlzOrt: text(),
    anrede: text(),
    betreff: text(),
    einleitungDatum: text(),
    einleitungMedium: text(),
    vorbemerkungEinfuegen: boolean().notNull().default(false),
    ergebnisAbsatz: text(),

    /* ---------------- Auswertung des Prüfberichts ---------------- */

    /*
      Die Auswertung läuft im Hintergrund, nicht mehr in der Anfrage.

      Ein Prüfbericht mit vierzig Seiten braucht Minuten: das PDF wird
      Seite für Seite gelesen, gescannte Seiten durch die Texterkennung
      geschickt, und danach liest ein Sprachmodell in **einem** langen
      Aufruf die Kürzungspositionen heraus. Solange das lief, stand der
      Fortschrittsbalken bei wenigen Prozent still, das Fenster musste offen
      bleiben, und ein Verbindungsabbruch warf alles weg.

      Jetzt entsteht die Stellungnahme sofort, und die Verarbeitung schreibt
      ihren Stand hierher. Die Detailseite liest ihn und zeigt ihn an —
      wer will, arbeitet inzwischen woanders weiter.
    */
    /** `laeuft`, `fertig` oder `fehler`; leer bei Schreiben ohne Prüfbericht. */
    auswertungsstand: text(),
    /** Woran gerade gearbeitet wird, im Klartext. */
    auswertungsschritt: text(),
    /** Fortschritt in Prozent, 0 bis 100. */
    auswertungsProzent: integer().notNull().default(0),
    auswertungsfehler: text(),
    auswertungAktualisiertAm: timestamp({ withTimezone: true }),
    /*
      Der Prüfbericht selbst, als Base64.

      Die Verarbeitung läuft nach der Antwort weiter — die hochgeladene
      Datei ist dann längst fort. Sie muss also irgendwo liegen, und die
      Datenbank ist der einzige Ort, den diese Anwendung hat. Nebenbei
      bleibt der Bericht damit beim Schreiben und lässt sich später wieder
      ansehen.
    */
    pruefberichtDaten: text(),

    erstelltVon: uuid().references(() => benutzer.id, { onDelete: 'set null' }),
    erstelltAm: timestamp({ withTimezone: true }).notNull().defaultNow(),
    versendetAm: timestamp({ withTimezone: true }),
  },
  (t) => [index('stellungnahme_fall_idx').on(t.fallId)],
)

/** Eine Kürzungsposition aus dem Prüfbericht. */
export const position = pgTable(
  'position',
  {
    id: uuid().primaryKey().defaultRandom(),
    stellungnahmeId: uuid()
      .notNull()
      .references(() => stellungnahme.id, { onDelete: 'cascade' }),
    bezeichnung: text().notNull(),
    seite: integer(),
    betragGutachten: numeric({ precision: 12, scale: 2 }),
    betragGekuerzt: numeric({ precision: 12, scale: 2 }),
    differenz: numeric({ precision: 12, scale: 2 }),
    begruendungVersicherer: text(),
    behandlung: behandlungEnum().notNull().default('offen'),
    reihenfolge: integer().notNull().default(0),
  },
  (t) => [index('position_stellungnahme_idx').on(t.stellungnahmeId)],
)

/**
 * Bausteine einer Position — der Stand vor dem Brief-Editor.
 *
 * Seit der Umstellung ist `stellungnahme.dokument` die Wahrheit über den
 * Text; hier wird nichts mehr geschrieben. Die Tabelle bleibt, weil ältere
 * Stellungnahmen ihr Dokument beim ersten Öffnen aus diesen Zeilen
 * bekommen — sie ist die Quelle der Übernahme, nicht mehr des Schreibens.
 */
export const positionBaustein = pgTable(
  'position_baustein',
  {
    id: uuid().primaryKey().defaultRandom(),
    positionId: uuid()
      .notNull()
      .references(() => position.id, { onDelete: 'cascade' }),
    typ: bausteinTypEnum().notNull(),
    eintragId: uuid().references(() => eintrag.id, { onDelete: 'set null' }),
    /** Gewählte Varianten und Ergänzungen des Eintrags. */
    variantenIds: jsonb().$type<string[]>().default([]),
    ergaenzungenIds: jsonb().$type<string[]>().default([]),
    /** Ausformulierter Text mit eingesetzten Fallwerten. */
    textFinal: text(),
    herkunft: bausteinHerkunftEnum().notNull(),
    reihenfolge: integer().notNull().default(0),
    /** Nur bei eigenem Text: Brücke in die Bibliothekserweiterung (F9). */
    inBibliothekUebernehmen: boolean().notNull().default(false),
  },
  (t) => [index('baustein_position_idx').on(t.positionId)],
)

export const positionBild = pgTable(
  'position_bild',
  {
    id: uuid().primaryKey().defaultRandom(),
    positionId: uuid()
      .notNull()
      .references(() => position.id, { onDelete: 'cascade' }),
    dateiname: text().notNull(),
    pfad: text().notNull(),
    breiteEmu: integer(),
    hoeheEmu: integer(),
    reihenfolge: integer().notNull().default(0),
  },
  (t) => [index('bild_position_idx').on(t.positionId)],
)

/**
 * Bilder — im Schreiben und in der Bildbibliothek.
 *
 * Die Bytes stehen in der Datenbank, nicht im Dateisystem: der Container
 * ist flüchtig, ein Neustart nähme sonst jedes Bild mit. Im Dokument steht
 * nur die Kennung — ein Bild als Datenstrom im Dokumentbaum würde jede
 * Zwischenspeicherung um Megabytes aufblähen, und gespeichert wird beim
 * Schreiben im Sekundentakt.
 *
 * Eine Zeile, zwei Rollen. `stellungnahmeId` sagt, wo das Bild
 * hereingekommen ist; `inBibliothek` sagt, ob es darüber hinaus wieder
 * verwendbar ist. Ein Bibliotheksbild in mehrere Schreiben zu kopieren wäre
 * die einfachere Tabelle und die schlechtere Sache: dieselbe Aufnahme läge
 * dann vielfach in der Datenbank, und eine berichtigte Beschreibung
 * erreichte nur eine der Kopien.
 */
export const bild = pgTable(
  'bild',
  {
    id: uuid().primaryKey().defaultRandom(),
    /** Wo das Bild hereinkam. Leer bei einem Bild, das direkt in die Bibliothek ging. */
    stellungnahmeId: uuid().references(() => stellungnahme.id, { onDelete: 'cascade' }),
    /** Kurzer Name in der Bibliothek — der Dateiname taugt selten dafür. */
    titel: text(),
    beschreibung: text(),
    /** Freie Schlagworte: „Beilackierung", „DAT-Auszug", „Halterung". */
    themen: text().array().notNull().default([]),
    inBibliothek: boolean().notNull().default(false),
    dateiname: text().notNull(),
    /** `image/png` oder `image/jpeg` — mehr nimmt Word nicht verlässlich an. */
    mimetyp: text().notNull(),
    /** Base64, damit die Bytes ohne Sonderbehandlung durch Postgres gehen. */
    daten: text().notNull(),
    breitePx: integer().notNull(),
    hoehePx: integer().notNull(),
    bytes: integer().notNull(),
    erstelltVon: uuid().references(() => benutzer.id),
    erstelltAm: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('bild_stellungnahme_idx').on(t.stellungnahmeId),
    index('bild_bibliothek_idx').on(t.inBibliothek),
  ],
)

/* ------------------------------------------------------------------ *
 * Beziehungen
 * ------------------------------------------------------------------ */

export const eintragRelations = relations(eintrag, ({ many }) => ({
  varianten: many(eintragVariante),
  ergaenzungen: many(eintragErgaenzung),
  platzhalter: many(eintragPlatzhalter),
  vorbedingungen: many(eintragVorbedingung),
  belege: many(beleg),
}))

export const varianteRelations = relations(eintragVariante, ({ one }) => ({
  eintrag: one(eintrag, { fields: [eintragVariante.eintragId], references: [eintrag.id] }),
}))

export const ergaenzungRelations = relations(eintragErgaenzung, ({ one }) => ({
  eintrag: one(eintrag, { fields: [eintragErgaenzung.eintragId], references: [eintrag.id] }),
}))

export const platzhalterRelations = relations(eintragPlatzhalter, ({ one }) => ({
  eintrag: one(eintrag, { fields: [eintragPlatzhalter.eintragId], references: [eintrag.id] }),
}))

export const vorbedingungRelations = relations(eintragVorbedingung, ({ one }) => ({
  eintrag: one(eintrag, { fields: [eintragVorbedingung.eintragId], references: [eintrag.id] }),
}))

export const belegRelations = relations(beleg, ({ one }) => ({
  eintrag: one(eintrag, { fields: [beleg.eintragId], references: [eintrag.id] }),
}))

export const stellungnahmeRelations = relations(stellungnahme, ({ one, many }) => ({
  fall: one(fall, { fields: [stellungnahme.fallId], references: [fall.id] }),
  positionen: many(position),
}))

export const positionRelations = relations(position, ({ one, many }) => ({
  stellungnahme: one(stellungnahme, {
    fields: [position.stellungnahmeId],
    references: [stellungnahme.id],
  }),
  bausteine: many(positionBaustein),
  bilder: many(positionBild),
}))

export const bausteinRelations = relations(positionBaustein, ({ one }) => ({
  position: one(position, {
    fields: [positionBaustein.positionId],
    references: [position.id],
  }),
  eintrag: one(eintrag, {
    fields: [positionBaustein.eintragId],
    references: [eintrag.id],
  }),
}))

export const bildRelations = relations(positionBild, ({ one }) => ({
  position: one(position, { fields: [positionBild.positionId], references: [position.id] }),
}))

export type Eintrag = typeof eintrag.$inferSelect
export type NeuerEintrag = typeof eintrag.$inferInsert
export type Variante = typeof eintragVariante.$inferSelect
export type Ergaenzung = typeof eintragErgaenzung.$inferSelect
export type Platzhalter = typeof eintragPlatzhalter.$inferSelect
export type Vorbedingung = typeof eintragVorbedingung.$inferSelect
export type Beleg = typeof beleg.$inferSelect
export type Benutzer = typeof benutzer.$inferSelect
export type WbwLauf = typeof wbwLauf.$inferSelect
export type Gemeldetes = typeof meldung.$inferSelect
export type Ereignis = typeof ereignis.$inferSelect
export type BenutzerRecht = typeof benutzerRecht.$inferSelect
