CREATE TABLE "bild" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"stellungnahme_id" uuid NOT NULL,
	"dateiname" text NOT NULL,
	"mimetyp" text NOT NULL,
	"daten" text NOT NULL,
	"breite_px" integer NOT NULL,
	"hoehe_px" integer NOT NULL,
	"bytes" integer NOT NULL,
	"erstellt_von" uuid,
	"erstellt_am" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bild" ADD CONSTRAINT "bild_stellungnahme_id_stellungnahme_id_fk" FOREIGN KEY ("stellungnahme_id") REFERENCES "public"."stellungnahme"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bild" ADD CONSTRAINT "bild_erstellt_von_benutzer_id_fk" FOREIGN KEY ("erstellt_von") REFERENCES "public"."benutzer"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bild_stellungnahme_idx" ON "bild" USING btree ("stellungnahme_id");