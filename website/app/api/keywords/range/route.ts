import { NextResponse } from "next/server";
import { db } from "@/db";
import { items } from "@/db/schema";
import { sql } from "drizzle-orm";

export async function GET() {
  try {
    // Get the min and max timestamps from items table
    const result = await db
      .select({
        minTime: sql<number>`MIN(${items.time})`,
        maxTime: sql<number>`MAX(${items.time})`,
        totalCount: sql<number>`COUNT(*)`,
        storyCount: sql<number>`COUNT(*) FILTER (WHERE ${items.type} = 'story')`,
      })
      .from(items);

    const { minTime, maxTime, totalCount, storyCount } = result[0];

    if (!minTime || !maxTime) {
      return NextResponse.json({
        hasData: false,
        message: "No items in database",
      });
    }

    // Convert Unix timestamps to ISO date strings
    const oldestDate = new Date(minTime * 1000).toISOString().split("T")[0];
    const newestDate = new Date(maxTime * 1000).toISOString().split("T")[0];

    return NextResponse.json({
      hasData: true,
      oldestDate,
      newestDate,
      oldestTimestamp: minTime,
      newestTimestamp: maxTime,
      totalCount: Number(totalCount),
      storyCount: Number(storyCount),
    });
  } catch (error) {
    console.error("Error fetching date range:", error);
    return NextResponse.json(
      { error: String(error) },
      { status: 500 }
    );
  }
}
