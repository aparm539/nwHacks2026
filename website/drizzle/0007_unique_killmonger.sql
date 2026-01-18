CREATE TABLE "keyword_variant_overrides" (
	"id" serial PRIMARY KEY NOT NULL,
	"parent_keyword" text NOT NULL,
	"parent_stem" text NOT NULL,
	"variant_keyword" text NOT NULL,
	"variant_stem" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "keyword_variant_overrides_variant_stem_unique" UNIQUE("variant_stem")
);
