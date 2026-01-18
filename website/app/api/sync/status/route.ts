import { NextResponse } from "next/server";
import { db } from "@/db";
import { items } from "@/db/schema";
import { count } from "drizzle-orm";
import { findExistingRunningSyncOrPaused } from "@/lib/sync-utils";

interface StatusResponse {
  itemCount: number;
  hasRunningSync: boolean;
}

export async function GET(): Promise<NextResponse<StatusResponse>> {
  const [itemCountResult] = await db
    .select({ count: count() })
    .from(items);

  const existingSync = await findExistingRunningSyncOrPaused();

  return NextResponse.json({
    itemCount: itemCountResult?.count ?? 0,
    hasRunningSync: existingSync !== null,
  });
}
