import {
  pgTable,
  serial,
  integer,
  text,
  boolean,
  pgEnum,
  timestamp,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// Enum for item types
export const itemTypeEnum = pgEnum("item_type", [
  "story",
  "comment",
  "job",
  "poll",
  "pollopt",
]);

// Users table - matches HN API /v0/user/<id>
export const users = pgTable("users", {
  // The user's unique username. Case-sensitive.
  id: text("id").primaryKey(),
  // Creation date of the user, in Unix Time
  created: integer("created").notNull(),
  // The user's karma
  karma: integer("karma").notNull().default(0),
  // The user's optional self-description. HTML.
  about: text("about"),
});

// Items table - matches HN API /v0/item/<id>
// Stories, comments, jobs, Ask HNs, polls, and pollopts are all items
export const items = pgTable("items", {
  // The item's unique id
  id: integer("id").primaryKey(),
  // true if the item is deleted
  deleted: boolean("deleted").default(false),
  // The type of item: "job", "story", "comment", "poll", or "pollopt"
  type: itemTypeEnum("type").notNull(),
  // The username of the item's author
  by: text("by").references(() => users.id),
  // Creation date of the item, in Unix Time
  time: integer("time").notNull(),
  // The comment, story or poll text. HTML.
  text: text("text"),
  // true if the item is dead
  dead: boolean("dead").default(false),
  // The comment's parent: either another comment or the relevant story
  parent: integer("parent"),
  // The pollopt's associated poll
  poll: integer("poll"),
  // The URL of the story
  url: text("url"),
  // The story's score, or the votes for a pollopt
  score: integer("score").default(0),
  // The title of the story, poll or job. HTML.
  title: text("title"),
  // In the case of stories or polls, the total comment count
  descendants: integer("descendants").default(0),
});

// Junction table for item kids (comments)
// The ids of the item's comments, in ranked display order
export const itemKids = pgTable("item_kids", {
  id: serial("id").primaryKey(),
  itemId: integer("item_id")
    .notNull()
    .references(() => items.id),
  kidId: integer("kid_id")
    .notNull()
    .references(() => items.id),
  // Order/rank of the kid in display order
  rank: integer("rank").notNull(),
});

// Junction table for poll parts (pollopts)
// A list of related pollopts, in display order
export const pollParts = pgTable("poll_parts", {
  id: serial("id").primaryKey(),
  pollId: integer("poll_id")
    .notNull()
    .references(() => items.id),
  polloptId: integer("pollopt_id")
    .notNull()
    .references(() => items.id),
  // Order/rank in display order
  rank: integer("rank").notNull(),
});

// Junction table for user submissions
// List of the user's stories, polls and comments
export const userSubmissions = pgTable("user_submissions", {
  id: serial("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  itemId: integer("item_id")
    .notNull()
    .references(() => items.id),
});

// Sync runs table - tracks HN API sync operations
export const syncRuns = pgTable("sync_runs", {
  id: serial("id").primaryKey(),
  // The max item ID at the start of this sync run
  startMaxItem: integer("start_max_item").notNull(),
  // The last item ID that was successfully fetched
  lastFetchedItem: integer("last_fetched_item").notNull(),
  // Number of items fetched in this run
  itemsFetched: integer("items_fetched").notNull().default(0),
  // When the sync run started
  startedAt: timestamp("started_at").notNull().defaultNow(),
  // When the sync run completed
  completedAt: timestamp("completed_at"),
  // Status of the sync run
  status: text("status").notNull().default("running"), // 'running', 'completed', 'failed'
});

// Relations
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

// Type exports for use in application
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Item = typeof items.$inferSelect;
export type NewItem = typeof items.$inferInsert;
export type ItemType = (typeof itemTypeEnum.enumValues)[number];
export type SyncRun = typeof syncRuns.$inferSelect;
export type NewSyncRun = typeof syncRuns.$inferInsert;
