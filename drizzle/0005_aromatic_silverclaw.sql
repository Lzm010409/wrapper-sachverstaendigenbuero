ALTER TABLE "stellungnahme" ADD COLUMN "auswertungsstand" text;--> statement-breakpoint
ALTER TABLE "stellungnahme" ADD COLUMN "auswertungsschritt" text;--> statement-breakpoint
ALTER TABLE "stellungnahme" ADD COLUMN "auswertungs_prozent" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "stellungnahme" ADD COLUMN "auswertungsfehler" text;--> statement-breakpoint
ALTER TABLE "stellungnahme" ADD COLUMN "auswertung_aktualisiert_am" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "stellungnahme" ADD COLUMN "pruefbericht_daten" text;