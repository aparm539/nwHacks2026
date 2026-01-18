import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { items, users, syncRuns } from "@/db/schema";
import { eq, inArray } from "drizzle-orm";
import { fetchHNUser, fetchItemsBatch, HNItem } from "@/lib/hn-api";

const CHUNK_SIZE = 1000; // Items per chunk
const CONCURRENCY = 20; // Parallel HN API requests

interface ChunkResult {
  success: boolean;
  done: boolean;
  syncRunId: number;
  itemsFetched: number;
  totalItems: number;
  lastFetchedItem: number;
  targetEndItem: number;
  progress: number;
  error?: string;
}

// Batch insert users - collect unique usernames and insert all at once
async function batchInsertUsers(usernames: string[]): Promise<void> {
  if (usernames.length === 0) return;

  const uniqueUsernames = [...new Set(usernames)];

  // Check which users already exist
  const existingUsers = await db
    .select({ id: users.id })
    .from(users)
    .where(inArray(users.id, uniqueUsernames));

  const existingIds = new Set(existingUsers.map((u) => u.id));
  const newUsernames = uniqueUsernames.filter((u) => !existingIds.has(u));

  if (newUsernames.length === 0) return;

  // Fetch new users from HN API in parallel
  const userPromises = newUsernames.map((username) => fetchHNUser(username));
  const hnUsers = await Promise.all(userPromises);

  // Filter out nulls and prepare for insert
  const usersToInsert = hnUsers
    .filter((u): u is NonNullable<typeof u> => u !== null)
    .map((u) => ({
      id: u.id,
      created: u.created,
      karma: u.karma,
      about: u.about ?? null,
    }));

  if (usersToInsert.length > 0) {
    await db.insert(users).values(usersToInsert).onConflictDoNothing();
  }
}

// Batch insert items
async function batchInsertItems(hnItems: HNItem[]): Promise<number> {
  if (hnItems.length === 0) return 0;

  // Filter valid items
  const validItems = hnItems.filter((item) => item.type && item.time);
  if (validItems.length === 0) return 0;

  // Collect all usernames for batch user insert
  const usernames = validItems
    .map((item) => item.by)
    .filter((by): by is string => by !== undefined);

  await batchInsertUsers(usernames);

  // Prepare items for insert
  const itemsToInsert = validItems.map((item) => ({
    id: item.id,
    deleted: item.deleted ?? false,
    type: item.type!,
    by: item.by ?? null,
    time: item.time!,
    text: item.text ?? null,
    dead: item.dead ?? false,
    parent: item.parent ?? null,
    poll: item.poll ?? null,
    url: item.url ?? null,
    score: item.score ?? 0,
    title: item.title ?? null,
    descendants: item.descendants ?? 0,
  }));

  await db.insert(items).values(itemsToInsert).onConflictDoNothing();
  return itemsToInsert.length;
}

export async function POST(request: NextRequest): Promise<NextResponse<ChunkResult>> {
  try {
    const { searchParams } = new URL(request.url);
    const syncRunId = parseInt(searchParams.get("syncRunId") || "0", 10);

    if (!syncRunId) {
      return NextResponse.json(
        { success: false, done: false, error: "syncRunId is required" } as ChunkResult,
        { status: 400 }
      );
    }

    // Get the sync run
    const [syncRun] = await db
      .select()
      .from(syncRuns)
      .where(eq(syncRuns.id, syncRunId))
      .limit(1);

    if (!syncRun) {
      return NextResponse.json(
        { success: false, done: false, error: "Sync run not found" } as ChunkResult,
        { status: 404 }
      );
    }

    if (syncRun.status === "completed") {
      return NextResponse.json({
        success: true,
        done: true,
        syncRunId,
        itemsFetched: syncRun.itemsFetched,
        totalItems: syncRun.totalItems,
        lastFetchedItem: syncRun.lastFetchedItem,
        targetEndItem: syncRun.targetEndItem,
        progress: 100,
      });
    }

    // Update status to running if it was paused
    if (syncRun.status === "paused") {
      await db
        .update(syncRuns)
        .set({ status: "running" })
        .where(eq(syncRuns.id, syncRunId));
    }

    // Calculate the range for this chunk
    const startId = syncRun.lastFetchedItem;
    const endId = Math.max(syncRun.targetEndItem, startId - CHUNK_SIZE);

    // Generate IDs to fetch (walking backwards)
    const idsToFetch: number[] = [];
    for (let id = startId - 1; id >= endId && idsToFetch.length < CHUNK_SIZE; id--) {
      idsToFetch.push(id);
    }

    if (idsToFetch.length === 0) {
      // We've reached the end
      await db
        .update(syncRuns)
        .set({
          status: "completed",
          completedAt: new Date(),
        })
        .where(eq(syncRuns.id, syncRunId));

      return NextResponse.json({
        success: true,
        done: true,
        syncRunId,
        itemsFetched: syncRun.itemsFetched,
        totalItems: syncRun.totalItems,
        lastFetchedItem: syncRun.lastFetchedItem,
        targetEndItem: syncRun.targetEndItem,
        progress: 100,
      });
    }

    // Fetch items in parallel with concurrency control
    const fetchedItems = await fetchItemsBatch(idsToFetch, CONCURRENCY);

    // Filter out nulls and items that are too old
    const validItems = fetchedItems.filter(
      (item): item is HNItem => item !== null
    );

    // Batch insert all items
    const insertedCount = await batchInsertItems(validItems);

    // Calculate new progress
    const newLastFetched = Math.min(...idsToFetch);
    const newItemsFetched = syncRun.itemsFetched + insertedCount;
    const progress = Math.round(
      ((syncRun.startMaxItem - newLastFetched) / syncRun.totalItems) * 100
    );

    const isDone = newLastFetched <= syncRun.targetEndItem;

    // Update sync run progress
    await db
      .update(syncRuns)
      .set({
        lastFetchedItem: newLastFetched,
        itemsFetched: newItemsFetched,
        status: isDone ? "completed" : "running",
        completedAt: isDone ? new Date() : null,
      })
      .where(eq(syncRuns.id, syncRunId));

    return NextResponse.json({
      success: true,
      done: isDone,
      syncRunId,
      itemsFetched: newItemsFetched,
      totalItems: syncRun.totalItems,
      lastFetchedItem: newLastFetched,
      targetEndItem: syncRun.targetEndItem,
      progress: Math.min(progress, 100),
    });
  } catch (error) {
    console.error("Chunk sync failed:", error);
    return NextResponse.json(
      { success: false, done: false, error: String(error) } as ChunkResult,
      { status: 500 }
    );
  }
}
