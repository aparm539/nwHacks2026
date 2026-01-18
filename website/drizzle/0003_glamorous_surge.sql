CREATE TABLE "daily_top_keywords" (
	"id" serial PRIMARY KEY NOT NULL,
	"date" text NOT NULL,
	"keyword" text NOT NULL,
	"score" real NOT NULL,
	"rank" integer NOT NULL,
	"occurrences" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "keyword_extractions" (
	"id" serial PRIMARY KEY NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"item_count" integer NOT NULL,
	"text_length" integer NOT NULL,
	"filter_date" text,
	"item_ids" text
);
--> statement-breakpoint
CREATE TABLE "keywords" (
	"id" serial PRIMARY KEY NOT NULL,
	"extraction_id" integer NOT NULL,
	"keyword" text NOT NULL,
	"score" real NOT NULL,
	"rank" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "keywords" ADD CONSTRAINT "keywords_extraction_id_keyword_extractions_id_fk" FOREIGN KEY ("extraction_id") REFERENCES "public"."keyword_extractions"("id") ON DELETE cascade ON UPDATE no action;