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
