import {
  pgTable,
  serial,
  integer,
  text,
  boolean,
  pgEnum,
  timestamp,
  real,
  foreignKey,
  unique,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

export const itemTypeEnum = pgEnum("item_type", [
  "story",
  "comment",
  "job",
  "poll",
  "pollopt",
]);

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  created: integer("created").notNull(),
  karma: integer("karma").notNull().default(0),
  about: text("about"),
});

export const items = pgTable("items", {
  id: integer("id").primaryKey(),
  deleted: boolean("deleted").default(false),
  type: itemTypeEnum("type").notNull(),
  by: text("by").references(() => users.id),
  time: integer("time").notNull(),
  text: text("text"),
  dead: boolean("dead").default(false),
  parent: integer("parent"),
  poll: integer("poll"),
  url: text("url"),
  score: integer("score").default(0),
  title: text("title"),
  descendants: integer("descendants").default(0),
});

export const itemKids = pgTable("item_kids", {
  id: serial("id").primaryKey(),
  itemId: integer("item_id")
    .notNull()
    .references(() => items.id),
  kidId: integer("kid_id")
    .notNull()
    .references(() => items.id),
  rank: integer("rank").notNull(),
});

export const pollParts = pgTable("poll_parts", {
  id: serial("id").primaryKey(),
  pollId: integer("poll_id")
    .notNull()
    .references(() => items.id),
  polloptId: integer("pollopt_id")
    .notNull()
    .references(() => items.id),
  rank: integer("rank").notNull(),
});

export const userSubmissions = pgTable("user_submissions", {
  id: serial("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  itemId: integer("item_id")
    .notNull()
    .references(() => items.id),
});

export const syncRuns = pgTable("sync_runs", {
  id: serial("id").primaryKey(),
  startMaxItem: integer("start_max_item").notNull(),
  targetEndItem: integer("target_end_item").notNull().default(0),
  totalItems: integer("total_items").notNull().default(0),
  lastFetchedItem: integer("last_fetched_item").notNull(),
  itemsFetched: integer("items_fetched").notNull().default(0),
  startedAt: timestamp("started_at").notNull().defaultNow(),
  completedAt: timestamp("completed_at"),
  status: text("status").notNull().default("running"),
  errorMessage: text("error_message"),
});

export const keywordExtractions = pgTable("keyword_extractions", {
  id: serial("id").primaryKey(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  itemCount: integer("item_count").notNull(),
  textLength: integer("text_length").notNull(),
  filterDate: text("filter_date"),
  itemIds: text("item_ids"),
});

export const keywords = pgTable(
  "keywords",
  {
    id: serial("id").primaryKey(),
    extractionId: integer("extraction_id").notNull(),
    keyword: text("keyword").notNull(),
    score: real("score").notNull(),
    rank: integer("rank").notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.extractionId],
      foreignColumns: [keywordExtractions.id],
      name: "keywords_extraction_id_keyword_extractions_id_fk",
    }).onDelete("cascade"),
  ]
);

export const usersRelations = relations(users, ({ many }) => ({
  items: many(items),
  submissions: many(userSubmissions),
}));

export const itemsRelations = relations(items, ({ one, many }) => ({
  author: one(users, {
    fields: [items.by],
    references: [users.id],
  }),
  parentItem: one(items, {
    fields: [items.parent],
    references: [items.id],
    relationName: "parentChild",
  }),
  children: many(items, {
    relationName: "parentChild",
  }),
  pollItem: one(items, {
    fields: [items.poll],
    references: [items.id],
    relationName: "pollPollopt",
  }),
  pollopts: many(items, {
    relationName: "pollPollopt",
  }),
  kids: many(itemKids, {
    relationName: "itemToKids",
  }),
  parts: many(pollParts, {
    relationName: "pollToParts",
  }),
}));

export const itemKidsRelations = relations(itemKids, ({ one }) => ({
  item: one(items, {
    fields: [itemKids.itemId],
    references: [items.id],
    relationName: "itemToKids",
  }),
  kid: one(items, {
    fields: [itemKids.kidId],
    references: [items.id],
  }),
}));

export const pollPartsRelations = relations(pollParts, ({ one }) => ({
  poll: one(items, {
    fields: [pollParts.pollId],
    references: [items.id],
    relationName: "pollToParts",
  }),
  pollopt: one(items, {
    fields: [pollParts.polloptId],
    references: [items.id],
  }),
}));

export const userSubmissionsRelations = relations(
  userSubmissions,
  ({ one }) => ({
    user: one(users, {
      fields: [userSubmissions.userId],
      references: [users.id],
    }),
    item: one(items, {
      fields: [userSubmissions.itemId],
      references: [items.id],
    }),
  })
);

export const keywordExtractionsRelations = relations(
  keywordExtractions,
  ({ many }) => ({
    keywords: many(keywords),
  })
);

export const keywordsRelations = relations(keywords, ({ one }) => ({
  extraction: one(keywordExtractions, {
    fields: [keywords.extractionId],
    references: [keywordExtractions.id],
  }),
}));

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Item = typeof items.$inferSelect;
export type NewItem = typeof items.$inferInsert;
export type ItemType = (typeof itemTypeEnum.enumValues)[number];
export type SyncRun = typeof syncRuns.$inferSelect;
export type NewSyncRun = typeof syncRuns.$inferInsert;
export type KeywordExtraction = typeof keywordExtractions.$inferSelect;
export type NewKeywordExtraction = typeof keywordExtractions.$inferInsert;
export type Keyword = typeof keywords.$inferSelect;
export type NewKeyword = typeof keywords.$inferInsert;

// Daily keywords table - keywords aggregated by date
export const dailyKeywords = pgTable(
  "daily_keywords",
  {
    id: serial("id").primaryKey(),
    // The date this keyword was extracted from (YYYY-MM-DD)
    date: text("date").notNull(),
    // The aggregated keyword (shortest variant)
    keyword: text("keyword").notNull(),
    // The stemmed version of the keyword (used for grouping)
    stemmedKeyword: text("stemmed_keyword"),
    // Average YAKE score across variants (lower = more relevant)
    score: real("score").notNull(),
    // Rank within this day (1 = most frequent)
    rank: integer("rank").notNull(),
    // Number of variants merged into this keyword
    variantCount: integer("variant_count").notNull(),
    // Number of items analyzed for this day
    itemCount: integer("item_count").notNull(),
    // When this row was created
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    // Unique constraint on date + keyword to prevent duplicates
    dateKeywordUnique: unique("daily_keywords_date_keyword_unique").on(
      table.date,
      table.keyword
    ),
  })
);

export type DailyKeyword = typeof dailyKeywords.$inferSelect;
export type NewDailyKeyword = typeof dailyKeywords.$inferInsert;

// Keyword stats table - global stats for each keyword (updated incrementally)
export const keywordStats = pgTable("keyword_stats", {
  id: serial("id").primaryKey(),
  // The keyword (unique across all time)
  keyword: text("keyword").notNull().unique(),
  // The stemmed version of the keyword
  stemmedKeyword: text("stemmed_keyword"),
  // Unix timestamp of most recent item containing this keyword
  lastItemTime: integer("last_item_time").notNull(),
  // ID of the most recent item (for linking)
  lastItemId: integer("last_item_id"),
  // First time this keyword appeared (unix timestamp)
  firstSeenTime: integer("first_seen_time").notNull(),
  // Number of days this keyword has appeared
  totalDaysAppeared: integer("total_days_appeared").notNull().default(1),
  // Last updated timestamp
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type KeywordStat = typeof keywordStats.$inferSelect;
export type NewKeywordStat = typeof keywordStats.$inferInsert;

// Keyword extraction queue - tracks pending, processing, completed, and failed extractions
export const keywordExtractionQueue = pgTable("keyword_extraction_queue", {
  id: serial("id").primaryKey(),
  syncRunId: integer("sync_run_id")
    .notNull()
    .references(() => syncRuns.id),
  status: text("status").notNull().default("pending"), // pending, processing, completed, failed
  errorMessage: text("error_message"),
  retryCount: integer("retry_count").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  processedAt: timestamp("processed_at"),
});

export const keywordExtractionQueueRelations = relations(
  keywordExtractionQueue,
  ({ one }) => ({
    syncRun: one(syncRuns, {
      fields: [keywordExtractionQueue.syncRunId],
      references: [syncRuns.id],
    }),
  })
);

export const syncRunsRelations = relations(syncRuns, ({ many }) => ({
  queueRecords: many(keywordExtractionQueue),
}));

export type KeywordExtractionQueue =
  typeof keywordExtractionQueue.$inferSelect;
export type NewKeywordExtractionQueue =
  typeof keywordExtractionQueue.$inferInsert;

// Blacklist action enum - block adds to blacklist, allow removes/overrides defaults
export const blacklistActionEnum = pgEnum("blacklist_action", ["block", "allow"]);

// Blacklist overrides table - user-managed blacklist additions and removals
export const blacklistOverrides = pgTable(
  "blacklist_overrides",
  {
    id: serial("id").primaryKey(),
    // The original keyword (for display)
    keyword: text("keyword").notNull(),
    // The stemmed version of the keyword (for matching)
    stem: text("stem").notNull(),
    // Action: 'block' to blacklist, 'allow' to override/whitelist a default
    action: blacklistActionEnum("action").notNull(),
    // Optional reason for the override
    reason: text("reason"),
    // When this override was created
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    // Unique constraint on stem to prevent duplicate overrides
    stemUnique: unique("blacklist_overrides_stem_unique").on(table.stem),
  })
);

export type BlacklistOverride = typeof blacklistOverrides.$inferSelect;
export type NewBlacklistOverride = typeof blacklistOverrides.$inferInsert;

// Keyword variant overrides table - manual parent/variant groupings
export const keywordVariantOverrides = pgTable(
  "keyword_variant_overrides",
  {
    id: serial("id").primaryKey(),
    parentKeyword: text("parent_keyword").notNull(),
    parentStem: text("parent_stem").notNull(),
    variantKeyword: text("variant_keyword").notNull(),
    variantStem: text("variant_stem").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    // Each variant stem should map to only one parent
    variantStemUnique: unique("keyword_variant_overrides_variant_stem_unique").on(
      table.variantStem
    ),
  })
);

export type KeywordVariantOverride =
  typeof keywordVariantOverrides.$inferSelect;
export type NewKeywordVariantOverride =
  typeof keywordVariantOverrides.$inferInsert;
