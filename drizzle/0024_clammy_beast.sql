CREATE TYPE "public"."kalkulationsquelle" AS ENUM('dat_damage_calculation', 'report');--> statement-breakpoint
CREATE TABLE "fall_kalkulation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"fall_id" uuid NOT NULL,
	"quelle" "kalkulationsquelle" NOT NULL,
	"zeilen" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"summe_netto" numeric(12, 2),
	"unklarheiten" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"erstellt_von" uuid,
	"erstellt_am" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "fall_kalkulation" ADD CONSTRAINT "fall_kalkulation_fall_id_fall_id_fk" FOREIGN KEY ("fall_id") REFERENCES "public"."fall"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fall_kalkulation" ADD CONSTRAINT "fall_kalkulation_erstellt_von_benutzer_id_fk" FOREIGN KEY ("erstellt_von") REFERENCES "public"."benutzer"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "fall_kalkulation_fall_idx" ON "fall_kalkulation" USING btree ("fall_id");