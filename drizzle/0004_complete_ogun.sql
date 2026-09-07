ALTER TABLE "bild" ALTER COLUMN "stellungnahme_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "bild" ADD COLUMN "titel" text;--> statement-breakpoint
ALTER TABLE "bild" ADD COLUMN "beschreibung" text;--> statement-breakpoint
ALTER TABLE "bild" ADD COLUMN "themen" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "bild" ADD COLUMN "in_bibliothek" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX "bild_bibliothek_idx" ON "bild" USING btree ("in_bibliothek");