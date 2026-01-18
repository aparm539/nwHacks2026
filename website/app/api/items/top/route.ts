import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { items } from "@/db/schema";
import { desc, eq, isNotNull, and, ne, gte } from "drizzle-orm";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 50);
    
    // Get the start of today (UTC) or past 24 hours
    const hoursBack = parseInt(searchParams.get("hours") || "24");
    const cutoffTime = Math.floor(Date.now() / 1000) - (hoursBack * 60 * 60);

    // Fetch top stories from the past day, sorted by score
    const topStories = await db
      .select({
        id: items.id,
        type: items.type,
        title: items.title,
        text: items.text,
        by: items.by,
        time: items.time,
        url: items.url,
        score: items.score,
        descendants: items.descendants,
      })
      .from(items)
      .where(
        and(
          eq(items.type, "story"),
          isNotNull(items.title),
          ne(items.deleted, true),
          ne(items.dead, true),
          gte(items.time, cutoffTime)
        )
      )
      .orderBy(desc(items.score))
      .limit(limit);

    return NextResponse.json({
      success: true,
      items: topStories,
      count: topStories.length,
      hoursBack,
    });
  } catch (error) {
    console.error("Error fetching top stories:", error);
    return NextResponse.json(
      { error: "Failed to fetch top stories" },
      { status: 500 }
    );
  }
}
