CREATE TYPE "public"."wbw_zustand" AS ENUM('laeuft', 'fertig', 'fehler');--> statement-breakpoint
CREATE TABLE "wbw_lauf" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"fall_id" uuid NOT NULL,
	"zustand" "wbw_zustand" DEFAULT 'laeuft' NOT NULL,
	"eingabe" jsonb NOT NULL,
	"protokoll" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"ergebnis" jsonb,
	"markenfremd" jsonb,
	"fehler" text,
	"ordner" text,
	"begonnen_am" timestamp with time zone DEFAULT now() NOT NULL,
	"beendet_am" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "wbw_lauf" ADD CONSTRAINT "wbw_lauf_fall_id_fall_id_fk" FOREIGN KEY ("fall_id") REFERENCES "public"."fall"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "wbw_lauf_fall_idx" ON "wbw_lauf" USING btree ("fall_id");--> statement-breakpoint
CREATE INDEX "wbw_lauf_zustand_idx" ON "wbw_lauf" USING btree ("zustand");