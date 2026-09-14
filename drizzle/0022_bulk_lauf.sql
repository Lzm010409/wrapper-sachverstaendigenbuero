CREATE TYPE "public"."bulk_operation" AS ENUM('status', 'freigabe', 'bereich');--> statement-breakpoint
CREATE TABLE "bulk_lauf" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"benutzer_id" uuid,
	"operation" "bulk_operation" NOT NULL,
	"eintrag_ids" jsonb NOT NULL,
	"vorher_zustand" jsonb NOT NULL,
	"rueckgaengig_gemacht_am" timestamp with time zone,
	"erstellt_am" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bulk_lauf" ADD CONSTRAINT "bulk_lauf_benutzer_id_benutzer_id_fk" FOREIGN KEY ("benutzer_id") REFERENCES "public"."benutzer"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bulk_lauf_benutzer_idx" ON "bulk_lauf" USING btree ("benutzer_id");