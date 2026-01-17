import { NextResponse } from "next/server";
import { db } from "@/db";
import { items, users, syncRuns } from "@/db/schema";
import { desc, eq } from "drizzle-orm";

const HN_API_BASE = "https://hacker-news.firebaseio.com/v0";
const ONE_WEEK_SECONDS = 7 * 24 * 60 * 60;

// Types for HN API responses
interface HNItem {
  id: number;
  deleted?: boolean;
  type?: "job" | "story" | "comment" | "poll" | "pollopt";
  by?: string;
  time?: number;
  text?: string;
  dead?: boolean;
  parent?: number;
  poll?: number;
  kids?: number[];
  url?: string;
  score?: number;
  title?: string;
  parts?: number[];
  descendants?: number;
}

interface HNUser {
  id: string;
  created: number;
  karma: number;
  about?: string;
  submitted?: number[];
}

async function fetchHNItem(id: number): Promise<HNItem | null> {
  try {
    const response = await fetch(`${HN_API_BASE}/item/${id}.json`);
    if (!response.ok) return null;
    return response.json();
  } catch {
    return null;
  }
}

async function fetchHNUser(id: string): Promise<HNUser | null> {
  try {
    const response = await fetch(`${HN_API_BASE}/user/${id}.json`);
    if (!response.ok) return null;
    return response.json();
  } catch {
    return null;
  }
}

async function fetchMaxItem(): Promise<number> {
  const response = await fetch(`${HN_API_BASE}/maxitem.json`);
  return response.json();
}

async function ensureUserExists(username: string): Promise<boolean> {
  // Check if user already exists
  const existing = await db
    .select()
    .from(users)
    .where(eq(users.id, username))
    .limit(1);

  if (existing.length > 0) return true;

  // Fetch user from HN API
  const hnUser = await fetchHNUser(username);
  if (!hnUser) return false;

  try {
    await db.insert(users).values({
      id: hnUser.id,
      created: hnUser.created,
      karma: hnUser.karma,
      about: hnUser.about ?? null,
    });
    return true;
  } catch {
    // User might have been inserted by another request - ignore
    return true;
  }
}

async function insertItem(hnItem: HNItem): Promise<boolean> {
  if (!hnItem.type || !hnItem.time) return false;

  // Ensure user exists if there's an author
  if (hnItem.by) {
    await ensureUserExists(hnItem.by);
  }

  try {
    // Insert the item
    await db
      .insert(items)
      .values({
        id: hnItem.id,
        deleted: hnItem.deleted ?? false,
        type: hnItem.type,
        by: hnItem.by ?? null,
        time: hnItem.time,
        text: hnItem.text ?? null,
        dead: hnItem.dead ?? false,
        parent: hnItem.parent ?? null,
        poll: hnItem.poll ?? null,
        url: hnItem.url ?? null,
        score: hnItem.score ?? 0,
        title: hnItem.title ?? null,
        descendants: hnItem.descendants ?? 0,
      })
      .onConflictDoNothing();

    // Note: Kids and parts relationships are stored in the items themselves
    // They reference other item IDs which may or may not exist yet
    // The HN API includes kids[] and parts[] arrays directly on items

    return true;
  } catch (error) {
    console.error(`Failed to insert item ${hnItem.id}:`, error);
    return false;
  }
}

export async function POST() {
  try {
    const now = Math.floor(Date.now() / 1000);
    const oneWeekAgo = now - ONE_WEEK_SECONDS;

    // Get the max item ID from HN
    const maxItem = await fetchMaxItem();

    // Get the last sync run to determine where to stop
    const lastSync = await db
      .select()
      .from(syncRuns)
      .where(eq(syncRuns.status, "completed"))
      .orderBy(desc(syncRuns.completedAt))
      .limit(1);

    const stopAtItem = lastSync.length > 0 ? lastSync[0].startMaxItem : 0;

    // Create a new sync run record
    const [syncRun] = await db
      .insert(syncRuns)
      .values({
        startMaxItem: maxItem,
        lastFetchedItem: maxItem,
        itemsFetched: 0,
        status: "running",
      })
      .returning();

    let currentId = maxItem;
    let itemsFetched = 0;
    let lastFetchedItem = maxItem;
    const batchSize = 100; // Process in batches for efficiency

    // Walk backwards from maxItem
    while (currentId > 0) {
      const batchPromises: Promise<HNItem | null>[] = [];

      // Fetch a batch of items in parallel
      for (let i = 0; i < batchSize && currentId > 0; i++, currentId--) {
        // Stop if we've reached items from the previous sync
        if (currentId <= stopAtItem && stopAtItem > 0) {
          currentId = 0;
          break;
        }
        batchPromises.push(fetchHNItem(currentId));
      }

      const batchItems = await Promise.all(batchPromises);

      let shouldStop = false;

      for (const hnItem of batchItems) {
        if (!hnItem) continue;

        // Check if the item is older than one week
        if (hnItem.time && hnItem.time < oneWeekAgo) {
          shouldStop = true;
          break;
        }

        // Insert the item
        const inserted = await insertItem(hnItem);
        if (inserted) {
          itemsFetched++;
          lastFetchedItem = hnItem.id;
        }
      }

      // Update the sync run progress periodically
      if (itemsFetched % 500 === 0) {
        await db
          .update(syncRuns)
          .set({
            lastFetchedItem,
            itemsFetched,
          })
          .where(eq(syncRuns.id, syncRun.id));
      }

      if (shouldStop) break;
    }

    // Mark sync as completed
    await db
      .update(syncRuns)
      .set({
        lastFetchedItem,
        itemsFetched,
        completedAt: new Date(),
        status: "completed",
      })
      .where(eq(syncRuns.id, syncRun.id));

    return NextResponse.json({
      success: true,
      syncRunId: syncRun.id,
      startMaxItem: maxItem,
      lastFetchedItem,
      itemsFetched,
      stoppedAtPreviousSync: stopAtItem > 0 && lastFetchedItem > stopAtItem,
    });
  } catch (error) {
    console.error("Sync failed:", error);
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}

export async function GET() {
  // Get sync run history
  const runs = await db
    .select()
    .from(syncRuns)
    .orderBy(desc(syncRuns.startedAt))
    .limit(10);

  return NextResponse.json({ runs });
}
