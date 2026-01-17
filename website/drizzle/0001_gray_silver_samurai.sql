CREATE TABLE "sync_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"start_max_item" integer NOT NULL,
	"last_fetched_item" integer NOT NULL,
	"items_fetched" integer DEFAULT 0 NOT NULL,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp,
	"status" text DEFAULT 'running' NOT NULL
);
