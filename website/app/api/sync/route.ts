import { NextResponse } from "next/server";
import { db } from "@/db";
import { syncRuns } from "@/db/schema";
import { desc, eq, or } from "drizzle-orm";
import {
  fetchMaxItem,
  findItemIdAtTimestamp,
  ONE_WEEK_SECONDS,
} from "@/lib/hn-api";

interface StartSyncResult {
  success: boolean;
  syncRunId?: number;
  startMaxItem?: number;
  targetEndItem?: number;
  totalItems?: number;
  resumed?: boolean;
  error?: string;
}

interface SyncRunStatus {
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
  progress: number;
}

// POST - Start a new sync or resume an existing one
export async function POST(): Promise<NextResponse<StartSyncResult>> {
  try {
    // Check for an existing running/paused sync
    const [existingSync] = await db
      .select()
      .from(syncRuns)
      .where(or(eq(syncRuns.status, "running"), eq(syncRuns.status, "paused")))
      .orderBy(desc(syncRuns.startedAt))
      .limit(1);

    if (existingSync) {
      // Resume the existing sync
      await db
        .update(syncRuns)
        .set({ status: "running" })
        .where(eq(syncRuns.id, existingSync.id));

      return NextResponse.json({
        success: true,
        syncRunId: existingSync.id,
        startMaxItem: existingSync.startMaxItem,
        targetEndItem: existingSync.targetEndItem,
        totalItems: existingSync.totalItems,
        resumed: true,
      });
    }

    // Get the current max item ID from HN
    const maxItem = await fetchMaxItem();

    // Calculate one week ago timestamp
    const now = Math.floor(Date.now() / 1000);
    const oneWeekAgo = now - ONE_WEEK_SECONDS;

    // Binary search to find the item ID at the one-week boundary
    console.log("Finding item ID at one-week boundary...");
    const targetEndItem = await findItemIdAtTimestamp(oneWeekAgo, maxItem);
    console.log(`Target end item: ${targetEndItem}`);

    const totalItems = maxItem - targetEndItem;

    // Create a new sync run
    const [syncRun] = await db
      .insert(syncRuns)
      .values({
        startMaxItem: maxItem,
        targetEndItem,
        totalItems,
        lastFetchedItem: maxItem,
        itemsFetched: 0,
        status: "running",
      })
      .returning();

    return NextResponse.json({
      success: true,
      syncRunId: syncRun.id,
      startMaxItem: maxItem,
      targetEndItem,
      totalItems,
      resumed: false,
    });
  } catch (error) {
    console.error("Failed to start sync:", error);
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}

// GET - Get sync run status and history
export async function GET(): Promise<NextResponse<{ runs: SyncRunStatus[] }>> {
  const runs = await db
    .select()
    .from(syncRuns)
    .orderBy(desc(syncRuns.startedAt))
    .limit(10);

  const runsWithProgress = runs.map((run) => ({
    ...run,
    progress:
      run.totalItems > 0
        ? Math.round(
            ((run.startMaxItem - run.lastFetchedItem) / run.totalItems) * 100
          )
        : 0,
  }));

  return NextResponse.json({ runs: runsWithProgress });
}

// DELETE - Pause a running sync
export async function DELETE(): Promise<NextResponse<{ success: boolean; error?: string }>> {
  try {
    const [runningSync] = await db
      .select()
      .from(syncRuns)
      .where(eq(syncRuns.status, "running"))
      .limit(1);

    if (!runningSync) {
      return NextResponse.json({ success: false, error: "No running sync to pause" });
    }

    await db
      .update(syncRuns)
      .set({ status: "paused" })
      .where(eq(syncRuns.id, runningSync.id));

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}
