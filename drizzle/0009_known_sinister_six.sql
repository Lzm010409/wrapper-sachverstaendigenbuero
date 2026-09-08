CREATE TYPE "public"."protokollstufe" AS ENUM('fehler', 'warnung', 'info');--> statement-breakpoint
CREATE TABLE "ereignis" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kennung" text,
	"stufe" "protokollstufe" NOT NULL,
	"stelle" text NOT NULL,
	"meldung" text NOT NULL,
	"fehler_name" text,
	"fehler_meldung" text,
	"spur" text,
	"zusammenhang" jsonb,
	"benutzer_id" uuid,
	"fall_id" uuid,
	"erstellt_am" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ereignis" ADD CONSTRAINT "ereignis_benutzer_id_benutzer_id_fk" FOREIGN KEY ("benutzer_id") REFERENCES "public"."benutzer"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ereignis" ADD CONSTRAINT "ereignis_fall_id_fall_id_fk" FOREIGN KEY ("fall_id") REFERENCES "public"."fall"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ereignis_zeit_idx" ON "ereignis" USING btree ("erstellt_am");--> statement-breakpoint
CREATE INDEX "ereignis_kennung_idx" ON "ereignis" USING btree ("kennung");--> statement-breakpoint
CREATE INDEX "ereignis_stelle_idx" ON "ereignis" USING btree ("stelle");