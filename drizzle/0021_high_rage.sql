CREATE TABLE "api_token" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"benutzer_id" uuid NOT NULL,
	"name" text NOT NULL,
	"token_hash" text NOT NULL,
	"praefix" text NOT NULL,
	"laeuft_ab_am" timestamp with time zone,
	"widerrufen_am" timestamp with time zone,
	"letzte_verwendung_am" timestamp with time zone,
	"erstellt_am" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "api_token" ADD CONSTRAINT "api_token_benutzer_id_benutzer_id_fk" FOREIGN KEY ("benutzer_id") REFERENCES "public"."benutzer"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "api_token_hash_idx" ON "api_token" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "api_token_benutzer_idx" ON "api_token" USING btree ("benutzer_id");