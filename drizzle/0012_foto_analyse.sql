CREATE TABLE "foto_analyse" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"fall_id" uuid NOT NULL,
	"vorschlaege" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"ohne_vorschlag" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"angestossen_von" uuid,
	"erstellt_am" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "foto_analyse" ADD CONSTRAINT "foto_analyse_fall_id_fall_id_fk" FOREIGN KEY ("fall_id") REFERENCES "public"."fall"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "foto_analyse" ADD CONSTRAINT "foto_analyse_angestossen_von_benutzer_id_fk" FOREIGN KEY ("angestossen_von") REFERENCES "public"."benutzer"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "foto_analyse_fall_idx" ON "foto_analyse" USING btree ("fall_id");