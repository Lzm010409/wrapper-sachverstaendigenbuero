ALTER TABLE "stellungnahme" ADD COLUMN "dokument" jsonb;--> statement-breakpoint
ALTER TABLE "stellungnahme" ADD COLUMN "dokument_stand" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "stellungnahme" ADD COLUMN "dokument_geaendert_am" timestamp with time zone;