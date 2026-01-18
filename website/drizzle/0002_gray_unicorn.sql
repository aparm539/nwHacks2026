ALTER TABLE "sync_runs" ADD COLUMN "target_end_item" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "sync_runs" ADD COLUMN "total_items" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "sync_runs" ADD COLUMN "error_message" text;