CREATE TYPE "public"."meldungsart" AS ENUM('fehler', 'warnung', 'erfolg', 'info');--> statement-breakpoint
CREATE TABLE "meldung" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"benutzer_id" uuid NOT NULL,
	"art" "meldungsart" NOT NULL,
	"titel" text NOT NULL,
	"text" text NOT NULL,
	"verweis" text,
	"quelle" text,
	"erstellt_am" timestamp with time zone DEFAULT now() NOT NULL,
	"gelesen_am" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "wbw_lauf" ADD COLUMN "angestossen_von" uuid;--> statement-breakpoint
ALTER TABLE "meldung" ADD CONSTRAINT "meldung_benutzer_id_benutzer_id_fk" FOREIGN KEY ("benutzer_id") REFERENCES "public"."benutzer"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "meldung_benutzer_idx" ON "meldung" USING btree ("benutzer_id","erstellt_am");--> statement-breakpoint
ALTER TABLE "wbw_lauf" ADD CONSTRAINT "wbw_lauf_angestossen_von_benutzer_id_fk" FOREIGN KEY ("angestossen_von") REFERENCES "public"."benutzer"("id") ON DELETE set null ON UPDATE no action;