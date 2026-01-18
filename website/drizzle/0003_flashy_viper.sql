CREATE TABLE "daily_keywords" (
	"id" serial PRIMARY KEY NOT NULL,
	"date" text NOT NULL,
	"keyword" text NOT NULL,
	"score" real NOT NULL,
	"rank" integer NOT NULL,
	"variant_count" integer NOT NULL,
	"item_count" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sync_runs" ALTER COLUMN "target_end_item" SET DEFAULT 0;--> statement-breakpoint
ALTER TABLE "sync_runs" ALTER COLUMN "total_items" SET DEFAULT 0;