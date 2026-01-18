CREATE TYPE "public"."blacklist_action" AS ENUM('block', 'allow');--> statement-breakpoint
CREATE TABLE "blacklist_overrides" (
	"id" serial PRIMARY KEY NOT NULL,
	"keyword" text NOT NULL,
	"stem" text NOT NULL,
	"action" "blacklist_action" NOT NULL,
	"reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "blacklist_overrides_stem_unique" UNIQUE("stem")
);
