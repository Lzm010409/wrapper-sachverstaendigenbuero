CREATE TABLE "rechnung" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sevdesk_id" text NOT NULL,
	"nummer" text NOT NULL,
	"schluessel" text NOT NULL,
	"status" integer NOT NULL,
	"brutto_cent" integer DEFAULT 0 NOT NULL,
	"bezahlt_cent" integer DEFAULT 0 NOT NULL,
	"rechnungsdatum" timestamp with time zone,
	"zahldatum" timestamp with time zone,
	"zahlungsziel_tage" integer,
	"mahnstufe" integer,
	"geaendert_am" timestamp with time zone NOT NULL,
	"abgeglichen_am" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "rechnung_sevdesk_idx" ON "rechnung" USING btree ("sevdesk_id");--> statement-breakpoint
CREATE INDEX "rechnung_nummer_idx" ON "rechnung" USING btree ("nummer");--> statement-breakpoint
CREATE INDEX "rechnung_schluessel_idx" ON "rechnung" USING btree ("schluessel");--> statement-breakpoint
CREATE INDEX "rechnung_geaendert_idx" ON "rechnung" USING btree ("geaendert_am");