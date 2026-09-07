ALTER TABLE "stellungnahme" ADD COLUMN "extraktion" jsonb;--> statement-breakpoint
ALTER TABLE "stellungnahme" ADD COLUMN "sonderfaelle" jsonb;--> statement-breakpoint
ALTER TABLE "stellungnahme" ADD COLUMN "pruefbericht_dateiname" text;--> statement-breakpoint
ALTER TABLE "stellungnahme" ADD COLUMN "pruefbericht_seiten" integer;