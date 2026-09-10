CREATE TYPE "public"."foto_teil_seite" AS ENUM('links', 'rechts', 'vorne', 'hinten');--> statement-breakpoint
CREATE TABLE "foto_teil" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"seiten" "foto_teil_seite"[] DEFAULT '{}'::foto_teil_seite[] NOT NULL,
	"beschaedigungsarten" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"erstellt_von" uuid,
	"erstellt_am" timestamp with time zone DEFAULT now() NOT NULL,
	"geaendert_am" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "foto_teil" ADD CONSTRAINT "foto_teil_erstellt_von_benutzer_id_fk" FOREIGN KEY ("erstellt_von") REFERENCES "public"."benutzer"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "foto_teil_name_idx" ON "foto_teil" USING btree (lower("name"));