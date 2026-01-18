ALTER TABLE "daily_keywords" ADD COLUMN "stemmed_keyword" text;--> statement-breakpoint
ALTER TABLE "keyword_stats" ADD COLUMN "stemmed_keyword" text;