import { NextResponse } from "next/server";
import { db } from "@/db";
import { syncRuns } from "@/db/schema";
import { desc, eq } from "drizzle-orm";

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
