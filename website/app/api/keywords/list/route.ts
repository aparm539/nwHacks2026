import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { dailyKeywords, keywordStats, keywords as keywordsTable } from "@/db/schema";
import { desc, sql } from "drizzle-orm";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const limit = Math.min(parseInt(searchParams.get("limit") || "100"), 500);
    const offset = parseInt(searchParams.get("offset") || "0");

    // Get distinct keywords sorted by score (descending)
    let keywordsList = await db
      .select({
        keyword: dailyKeywords.keyword,
        avgScore: sql<number>`AVG(${dailyKeywords.score})`,
        count: sql<number>`COUNT(*)::int`,
        maxScore: sql<number>`MAX(${dailyKeywords.score})`,
      })
      .from(dailyKeywords)
      .groupBy(dailyKeywords.keyword)
      .orderBy(desc(sql<number>`AVG(${dailyKeywords.score})`))
      .limit(limit)
      .offset(offset);

    if (keywordsList.length === 0) {
      keywordsList = await db
        .select({
          keyword: keywordStats.keyword,
          avgScore: sql<number>`0`,
          count: sql<number>`${keywordStats.totalDaysAppeared}`,
          maxScore: sql<number>`0`,
        })
        .from(keywordStats)
        .orderBy(desc(keywordStats.totalDaysAppeared))
        .limit(limit)
        .offset(offset);
    }

    if (keywordsList.length === 0) {
      keywordsList = await db
        .select({
          keyword: keywordsTable.keyword,
          avgScore: sql<number>`AVG(${keywordsTable.score})`,
          count: sql<number>`COUNT(*)::int`,
          maxScore: sql<number>`MAX(${keywordsTable.score})`,
        })
        .from(keywordsTable)
        .groupBy(keywordsTable.keyword)
        .orderBy(desc(sql<number>`AVG(${keywordsTable.score})`))
        .limit(limit)
        .offset(offset);
    }

    // Get total count of distinct keywords
    let countResult = await db
      .select({
        count: sql<number>`COUNT(DISTINCT ${dailyKeywords.keyword})::int`,
      })
      .from(dailyKeywords);

    if (!countResult[0]?.count) {
      countResult = await db
        .select({
          count: sql<number>`COUNT(DISTINCT ${keywordStats.keyword})::int`,
        })
        .from(keywordStats);
    }

    if (!countResult[0]?.count) {
      countResult = await db
        .select({
          count: sql<number>`COUNT(DISTINCT ${keywordsTable.keyword})::int`,
        })
        .from(keywordsTable);
    }

    const total = countResult[0]?.count || 0;

    return NextResponse.json({
      success: true,
      keywords: keywordsList,
      total,
      limit,
      offset,
    });
  } catch (error) {
    console.error("Error fetching keywords list:", error);
    return NextResponse.json({ error: "Failed to fetch keywords" }, { status: 500 });
  }
}
