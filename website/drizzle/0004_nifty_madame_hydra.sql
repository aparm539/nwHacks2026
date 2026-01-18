CREATE TABLE "keyword_stats" (
	"id" serial PRIMARY KEY NOT NULL,
	"keyword" text NOT NULL,
	"last_item_time" integer NOT NULL,
	"last_item_id" integer,
	"first_seen_time" integer NOT NULL,
	"total_days_appeared" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "keyword_stats_keyword_unique" UNIQUE("keyword")
);
--> statement-breakpoint
ALTER TABLE "daily_keywords" ADD CONSTRAINT "daily_keywords_date_keyword_unique" UNIQUE("date","keyword");