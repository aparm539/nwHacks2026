CREATE TYPE "public"."item_type" AS ENUM('story', 'comment', 'job', 'poll', 'pollopt');--> statement-breakpoint
CREATE TABLE "item_kids" (
	"id" serial PRIMARY KEY NOT NULL,
	"item_id" integer NOT NULL,
	"kid_id" integer NOT NULL,
	"rank" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "items" (
	"id" integer PRIMARY KEY NOT NULL,
	"deleted" boolean DEFAULT false,
	"type" "item_type" NOT NULL,
	"by" text,
	"time" integer NOT NULL,
	"text" text,
	"dead" boolean DEFAULT false,
	"parent" integer,
	"poll" integer,
	"url" text,
	"score" integer DEFAULT 0,
	"title" text,
	"descendants" integer DEFAULT 0
);
--> statement-breakpoint
CREATE TABLE "poll_parts" (
	"id" serial PRIMARY KEY NOT NULL,
	"poll_id" integer NOT NULL,
	"pollopt_id" integer NOT NULL,
	"rank" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_submissions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"item_id" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"created" integer NOT NULL,
	"karma" integer DEFAULT 0 NOT NULL,
	"about" text
);
--> statement-breakpoint
ALTER TABLE "item_kids" ADD CONSTRAINT "item_kids_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_kids" ADD CONSTRAINT "item_kids_kid_id_items_id_fk" FOREIGN KEY ("kid_id") REFERENCES "public"."items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_by_users_id_fk" FOREIGN KEY ("by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "poll_parts" ADD CONSTRAINT "poll_parts_poll_id_items_id_fk" FOREIGN KEY ("poll_id") REFERENCES "public"."items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "poll_parts" ADD CONSTRAINT "poll_parts_pollopt_id_items_id_fk" FOREIGN KEY ("pollopt_id") REFERENCES "public"."items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_submissions" ADD CONSTRAINT "user_submissions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_submissions" ADD CONSTRAINT "user_submissions_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE no action ON UPDATE no action;