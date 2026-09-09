CREATE TABLE "kontaktumhang" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vorgang" uuid NOT NULL,
	"benutzer_id" uuid,
	"sieger_id" text NOT NULL,
	"verlierer_id" text NOT NULL,
	"objekt_art" text NOT NULL,
	"objekt_id" text NOT NULL,
	"bezeichnung" text,
	"schritt" text NOT NULL,
	"erfolg" boolean NOT NULL,
	"meldung" text,
	"rueckgaengig_am" timestamp with time zone,
	"erstellt_am" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "kontaktumhang" ADD CONSTRAINT "kontaktumhang_benutzer_id_benutzer_id_fk" FOREIGN KEY ("benutzer_id") REFERENCES "public"."benutzer"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "kontaktumhang_vorgang_idx" ON "kontaktumhang" USING btree ("vorgang");--> statement-breakpoint
CREATE INDEX "kontaktumhang_verlierer_idx" ON "kontaktumhang" USING btree ("verlierer_id");