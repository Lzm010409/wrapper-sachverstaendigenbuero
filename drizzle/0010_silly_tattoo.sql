CREATE TABLE "benutzer_recht" (
	"benutzer_id" uuid NOT NULL,
	"recht" text NOT NULL,
	"gewaehrt" boolean NOT NULL,
	"gesetzt_von" uuid,
	"gesetzt_am" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "benutzer_recht" ADD CONSTRAINT "benutzer_recht_benutzer_id_benutzer_id_fk" FOREIGN KEY ("benutzer_id") REFERENCES "public"."benutzer"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "benutzer_recht" ADD CONSTRAINT "benutzer_recht_gesetzt_von_benutzer_id_fk" FOREIGN KEY ("gesetzt_von") REFERENCES "public"."benutzer"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "benutzer_recht_eindeutig" ON "benutzer_recht" USING btree ("benutzer_id","recht");--> statement-breakpoint
CREATE INDEX "benutzer_recht_benutzer_idx" ON "benutzer_recht" USING btree ("benutzer_id");