ALTER TABLE "wbw_lauf" ADD COLUMN "zyklen" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "wbw_lauf" ADD COLUMN "urteile" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "wbw_lauf" ADD COLUMN "auswahl" jsonb;