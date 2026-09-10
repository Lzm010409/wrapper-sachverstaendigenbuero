ALTER TABLE "foto_analyse" ADD COLUMN "lauf_zustand" "wbw_zustand" DEFAULT 'fertig' NOT NULL;--> statement-breakpoint
ALTER TABLE "foto_analyse" ADD COLUMN "lauf_begonnen_am" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "foto_analyse" ADD COLUMN "lauf_fehler" text;