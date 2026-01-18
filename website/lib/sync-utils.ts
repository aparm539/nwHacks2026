import { db } from "@/db";
import { syncRuns } from "@/db/schema";
import { eq, or, desc } from "drizzle-orm";

export interface SyncRun {
  id: number;
  startMaxItem: number;
  targetEndItem: number;
  totalItems: number;
  lastFetchedItem: number;
  itemsFetched: number;
  startedAt: Date;
  completedAt: Date | null;
  status: string;
  errorMessage: string | null;
}

/**
 * Find an existing running or paused sync run
 */
export async function findExistingRunningSyncOrPaused(): Promise<SyncRun | null> {
  const [existingSync] = await db
    .select()
    .from(syncRuns)
    .where(or(eq(syncRuns.status, "running"), eq(syncRuns.status, "paused")))
    .orderBy(desc(syncRuns.startedAt))
    .limit(1);

  return existingSync ?? null;
}

/**
 * Create a new sync run record
 */
export async function createSyncRun(
  startMaxItem: number,
  targetEndItem: number,
  totalItems: number
): Promise<SyncRun> {
  const [syncRun] = await db
    .insert(syncRuns)
    .values({
      startMaxItem,
      targetEndItem,
      totalItems,
      lastFetchedItem: startMaxItem,
      itemsFetched: 0,
      status: "running",
    })
    .returning();

  return syncRun;
}

/**
 * Resume a paused sync run by setting its status to running
 */
export async function resumeSyncRun(syncRunId: number): Promise<void> {
  await db
    .update(syncRuns)
    .set({ status: "running" })
    .where(eq(syncRuns.id, syncRunId));
}
