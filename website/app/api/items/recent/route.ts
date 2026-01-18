import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { items } from "@/db/schema";
import { desc, isNotNull, or, and, ne } from "drizzle-orm";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 50);

    // Fetch recent items that have text or title content
    // Filter out deleted and dead items
    // Order by id desc since HN item IDs are monotonically increasing
    const recentItems = await db
      .select({
        id: items.id,
        type: items.type,
        title: items.title,
        text: items.text,
        by: items.by,
        time: items.time,
        url: items.url,
        score: items.score,
      })
      .from(items)
      .where(
        and(
          or(isNotNull(items.text), isNotNull(items.title)),
          ne(items.deleted, true),
          ne(items.dead, true)
        )
      )
      .orderBy(desc(items.id))
      .limit(limit);

    return NextResponse.json({
      success: true,
      items: recentItems,
      count: recentItems.length,
    });
  } catch (error) {
    console.error("Error fetching recent items:", error);
    return NextResponse.json(
      { error: "Failed to fetch recent items" },
      { status: 500 }
    );
  }
}
