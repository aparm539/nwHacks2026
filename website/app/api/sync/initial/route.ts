import { NextResponse } from "next/server";
import { db } from "@/db";
import { items } from "@/db/schema";
import { count } from "drizzle-orm";
import {
  fetchMaxItem,
  findItemIdAtTimestamp,
  ONE_WEEK_SECONDS,
} from "@/lib/hn-api";
import {
  findExistingRunningSyncOrPaused,
  createSyncRun,
  resumeSyncRun,
} from "@/lib/sync-utils";

interface StartSyncResult {
  success: boolean;
  syncRunId?: number;
  startMaxItem?: number;
  targetEndItem?: number;
  totalItems?: number;
  resumed?: boolean;
  error?: string;
}

// POST - Start initial sync (only when items table is empty)
export async function POST(): Promise<NextResponse<StartSyncResult>> {
  try {
    // Check if items table is empty
    const [itemCountResult] = await db
      .select({ count: count() })
      .from(items);

    const itemCount = itemCountResult?.count ?? 0;

    if (itemCount > 0) {
      return NextResponse.json(
        {
          success: false,
          error: "Initial sync can only be run when the database is empty. Use incremental sync instead.",
        },
        { status: 400 }
      );
    }

    // Check for an existing running/paused sync
    const existingSync = await findExistingRunningSyncOrPaused();

    if (existingSync) {
      // Resume the existing sync
      await resumeSyncRun(existingSync.id);

      return NextResponse.json({
        success: true,
        syncRunId: existingSync.id,
        startMaxItem: existingSync.startMaxItem,
        targetEndItem: existingSync.targetEndItem,
        totalItems: existingSync.totalItems,
        resumed: true,
      });
    }

    // Get the current max item from HN API
    const remoteMaxItem = await fetchMaxItem();

    // Calculate one week ago timestamp
    const now = Math.floor(Date.now() / 1000);
    const oneWeekAgo = now - ONE_WEEK_SECONDS;

    // Binary search to find the item ID at the one-week boundary
    console.log("Finding item ID at one-week boundary...");
    const targetEndItem = await findItemIdAtTimestamp(oneWeekAgo, remoteMaxItem);
    console.log(`Target end item: ${targetEndItem}`);

    const totalItems = Math.max(0, remoteMaxItem - targetEndItem);

    // Create a new sync run
    const syncRun = await createSyncRun(remoteMaxItem, targetEndItem, totalItems);

    return NextResponse.json({
      success: true,
      syncRunId: syncRun.id,
      startMaxItem: remoteMaxItem,
      targetEndItem,
      totalItems,
      resumed: false,
    });
  } catch (error) {
    console.error("Failed to start initial sync:", error);
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}
