CREATE TYPE "public"."foto_teil_hoehenachse" AS ENUM('oben', 'unten', 'mittig');--> statement-breakpoint
CREATE TYPE "public"."foto_teil_laengsachse" AS ENUM('vorne', 'hinten');--> statement-breakpoint
CREATE TYPE "public"."foto_teil_querachse" AS ENUM('links', 'rechts');--> statement-breakpoint
ALTER TABLE "foto_teil" ADD COLUMN "gueltige_laengsachsen" "foto_teil_laengsachse"[] DEFAULT '{}'::foto_teil_laengsachse[] NOT NULL;--> statement-breakpoint
ALTER TABLE "foto_teil" ADD COLUMN "gueltige_querachsen" "foto_teil_querachse"[] DEFAULT '{}'::foto_teil_querachse[] NOT NULL;--> statement-breakpoint
ALTER TABLE "foto_teil" ADD COLUMN "gueltige_hoehenachsen" "foto_teil_hoehenachse"[] DEFAULT '{}'::foto_teil_hoehenachse[] NOT NULL;