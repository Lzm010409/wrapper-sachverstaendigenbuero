CREATE TYPE "public"."baustein_herkunft" AS ENUM('vorschlag', 'bibliothekssuche', 'eigener_text');--> statement-breakpoint
CREATE TYPE "public"."baustein_typ" AS ENUM('bibliothek', 'eigener_text');--> statement-breakpoint
CREATE TYPE "public"."behandlung" AS ENUM('offen', 'bestritten', 'anerkannt', 'nicht_bestreiten');--> statement-breakpoint
CREATE TYPE "public"."beleg_typ" AS ENUM('urteil', 'norm', 'literatur', 'regelwerk');--> statement-breakpoint
CREATE TYPE "public"."bereich" AS ENUM('kalkulation', 'wertminderung', 'wbw', 'restwert', 'sonderfall');--> statement-breakpoint
CREATE TYPE "public"."eintrag_status" AS ENUM('entwurf', 'pruefung', 'freigegeben', 'zurueckgezogen');--> statement-breakpoint
CREATE TYPE "public"."herkunft" AS ENUM('migration', 'manuell', 'ki_vorschlag', 'aus_stellungnahme');--> statement-breakpoint
CREATE TYPE "public"."modus" AS ENUM('standard', 'schnell', 'individuell');--> statement-breakpoint
CREATE TYPE "public"."platzhalter_art" AS ENUM('wert', 'regieanweisung');--> statement-breakpoint
CREATE TYPE "public"."platzhalter_quelle" AS ENUM('autoixpert', 'pruefbericht', 'manuell', 'berechnet');--> statement-breakpoint
CREATE TYPE "public"."rolle" AS ENUM('ersteller', 'freigeber', 'admin');--> statement-breakpoint
CREATE TABLE "beleg" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"eintrag_id" uuid NOT NULL,
	"typ" "beleg_typ" DEFAULT 'urteil' NOT NULL,
	"gericht" text,
	"aktenzeichen" text,
	"datum" text,
	"fundstelle" text,
	"kernaussage" text,
	"quelle_url" text,
	"verifiziert_am" timestamp with time zone,
	"verifiziert_von" uuid
);
--> statement-breakpoint
CREATE TABLE "benutzer" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"passwort_hash" text,
	"entra_oid" text,
	"rolle" "rolle" DEFAULT 'ersteller' NOT NULL,
	"aktiv" boolean DEFAULT true NOT NULL,
	"letzte_anmeldung" timestamp with time zone,
	"erstellt_am" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "eintrag" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nummer" text NOT NULL,
	"titel" text NOT NULL,
	"bereich" "bereich" NOT NULL,
	"abschnitt" text NOT NULL,
	"typische_begruendung" text,
	"gegenargument" text,
	"vorgehen" text,
	"hinweise" text,
	"haeufigkeit_text" text,
	"status" "eintrag_status" DEFAULT 'entwurf' NOT NULL,
	"herkunft" "herkunft" DEFAULT 'manuell' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"embedding" jsonb,
	"quelldatei" text,
	"erstellt_von" uuid,
	"freigegeben_von" uuid,
	"freigegeben_am" timestamp with time zone,
	"erstellt_am" timestamp with time zone DEFAULT now() NOT NULL,
	"geaendert_am" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "eintrag_ergaenzung" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"eintrag_id" uuid NOT NULL,
	"titel" text NOT NULL,
	"text" text NOT NULL,
	"wann_einsetzen" text,
	"reihenfolge" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "eintrag_platzhalter" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"eintrag_id" uuid NOT NULL,
	"schluessel" text NOT NULL,
	"art" "platzhalter_art" DEFAULT 'wert' NOT NULL,
	"quelle" "platzhalter_quelle" DEFAULT 'manuell' NOT NULL,
	"feldpfad" text,
	"pflicht" boolean DEFAULT true NOT NULL,
	"beispiel" text
);
--> statement-breakpoint
CREATE TABLE "eintrag_variante" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"eintrag_id" uuid NOT NULL,
	"bezeichnung" text NOT NULL,
	"text" text NOT NULL,
	"bedingung" text,
	"reihenfolge" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "eintrag_vorbedingung" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"eintrag_id" uuid NOT NULL,
	"text" text NOT NULL,
	"muss_bestaetigt_werden" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fall" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"aktenzeichen" text,
	"autoixpert_id" text,
	"daten" jsonb,
	"abgerufen_am" timestamp with time zone,
	"erstellt_am" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "position" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"stellungnahme_id" uuid NOT NULL,
	"bezeichnung" text NOT NULL,
	"seite" integer,
	"betrag_gutachten" numeric(12, 2),
	"betrag_gekuerzt" numeric(12, 2),
	"differenz" numeric(12, 2),
	"begruendung_versicherer" text,
	"behandlung" "behandlung" DEFAULT 'offen' NOT NULL,
	"reihenfolge" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "position_baustein" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"position_id" uuid NOT NULL,
	"typ" "baustein_typ" NOT NULL,
	"eintrag_id" uuid,
	"varianten_ids" jsonb DEFAULT '[]'::jsonb,
	"ergaenzungen_ids" jsonb DEFAULT '[]'::jsonb,
	"text_final" text,
	"herkunft" "baustein_herkunft" NOT NULL,
	"reihenfolge" integer DEFAULT 0 NOT NULL,
	"in_bibliothek_uebernehmen" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "position_bild" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"position_id" uuid NOT NULL,
	"dateiname" text NOT NULL,
	"pfad" text NOT NULL,
	"breite_emu" integer,
	"hoehe_emu" integer,
	"reihenfolge" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sitzung" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"benutzer_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"laeuft_ab_am" timestamp with time zone NOT NULL,
	"erstellt_am" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stellungnahme" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"fall_id" uuid,
	"modus" "modus" DEFAULT 'standard' NOT NULL,
	"empfaenger_name" text,
	"empfaenger_strasse" text,
	"empfaenger_plz_ort" text,
	"anrede" text,
	"betreff" text,
	"einleitung_datum" text,
	"einleitung_medium" text,
	"vorbemerkung_einfuegen" boolean DEFAULT false NOT NULL,
	"ergebnis_absatz" text,
	"erstellt_von" uuid,
	"erstellt_am" timestamp with time zone DEFAULT now() NOT NULL,
	"versendet_am" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "beleg" ADD CONSTRAINT "beleg_eintrag_id_eintrag_id_fk" FOREIGN KEY ("eintrag_id") REFERENCES "public"."eintrag"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "beleg" ADD CONSTRAINT "beleg_verifiziert_von_benutzer_id_fk" FOREIGN KEY ("verifiziert_von") REFERENCES "public"."benutzer"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eintrag" ADD CONSTRAINT "eintrag_erstellt_von_benutzer_id_fk" FOREIGN KEY ("erstellt_von") REFERENCES "public"."benutzer"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eintrag" ADD CONSTRAINT "eintrag_freigegeben_von_benutzer_id_fk" FOREIGN KEY ("freigegeben_von") REFERENCES "public"."benutzer"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eintrag_ergaenzung" ADD CONSTRAINT "eintrag_ergaenzung_eintrag_id_eintrag_id_fk" FOREIGN KEY ("eintrag_id") REFERENCES "public"."eintrag"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eintrag_platzhalter" ADD CONSTRAINT "eintrag_platzhalter_eintrag_id_eintrag_id_fk" FOREIGN KEY ("eintrag_id") REFERENCES "public"."eintrag"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eintrag_variante" ADD CONSTRAINT "eintrag_variante_eintrag_id_eintrag_id_fk" FOREIGN KEY ("eintrag_id") REFERENCES "public"."eintrag"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eintrag_vorbedingung" ADD CONSTRAINT "eintrag_vorbedingung_eintrag_id_eintrag_id_fk" FOREIGN KEY ("eintrag_id") REFERENCES "public"."eintrag"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "position" ADD CONSTRAINT "position_stellungnahme_id_stellungnahme_id_fk" FOREIGN KEY ("stellungnahme_id") REFERENCES "public"."stellungnahme"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "position_baustein" ADD CONSTRAINT "position_baustein_position_id_position_id_fk" FOREIGN KEY ("position_id") REFERENCES "public"."position"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "position_baustein" ADD CONSTRAINT "position_baustein_eintrag_id_eintrag_id_fk" FOREIGN KEY ("eintrag_id") REFERENCES "public"."eintrag"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "position_bild" ADD CONSTRAINT "position_bild_position_id_position_id_fk" FOREIGN KEY ("position_id") REFERENCES "public"."position"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sitzung" ADD CONSTRAINT "sitzung_benutzer_id_benutzer_id_fk" FOREIGN KEY ("benutzer_id") REFERENCES "public"."benutzer"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stellungnahme" ADD CONSTRAINT "stellungnahme_fall_id_fall_id_fk" FOREIGN KEY ("fall_id") REFERENCES "public"."fall"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stellungnahme" ADD CONSTRAINT "stellungnahme_erstellt_von_benutzer_id_fk" FOREIGN KEY ("erstellt_von") REFERENCES "public"."benutzer"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "beleg_eintrag_idx" ON "beleg" USING btree ("eintrag_id");--> statement-breakpoint
CREATE UNIQUE INDEX "benutzer_email_idx" ON "benutzer" USING btree (lower("email"));--> statement-breakpoint
CREATE UNIQUE INDEX "benutzer_entra_idx" ON "benutzer" USING btree ("entra_oid");--> statement-breakpoint
CREATE UNIQUE INDEX "eintrag_bereich_nummer_idx" ON "eintrag" USING btree ("bereich","nummer");--> statement-breakpoint
CREATE INDEX "eintrag_status_idx" ON "eintrag" USING btree ("status");--> statement-breakpoint
CREATE INDEX "eintrag_bereich_idx" ON "eintrag" USING btree ("bereich");--> statement-breakpoint
CREATE INDEX "ergaenzung_eintrag_idx" ON "eintrag_ergaenzung" USING btree ("eintrag_id");--> statement-breakpoint
CREATE INDEX "platzhalter_eintrag_idx" ON "eintrag_platzhalter" USING btree ("eintrag_id");--> statement-breakpoint
CREATE UNIQUE INDEX "platzhalter_eintrag_schluessel_idx" ON "eintrag_platzhalter" USING btree ("eintrag_id","schluessel");--> statement-breakpoint
CREATE INDEX "variante_eintrag_idx" ON "eintrag_variante" USING btree ("eintrag_id");--> statement-breakpoint
CREATE INDEX "vorbedingung_eintrag_idx" ON "eintrag_vorbedingung" USING btree ("eintrag_id");--> statement-breakpoint
CREATE INDEX "fall_aktenzeichen_idx" ON "fall" USING btree ("aktenzeichen");--> statement-breakpoint
CREATE INDEX "fall_autoixpert_idx" ON "fall" USING btree ("autoixpert_id");--> statement-breakpoint
CREATE INDEX "position_stellungnahme_idx" ON "position" USING btree ("stellungnahme_id");--> statement-breakpoint
CREATE INDEX "baustein_position_idx" ON "position_baustein" USING btree ("position_id");--> statement-breakpoint
CREATE INDEX "bild_position_idx" ON "position_bild" USING btree ("position_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sitzung_token_idx" ON "sitzung" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "sitzung_benutzer_idx" ON "sitzung" USING btree ("benutzer_id");--> statement-breakpoint
CREATE INDEX "stellungnahme_fall_idx" ON "stellungnahme" USING btree ("fall_id");