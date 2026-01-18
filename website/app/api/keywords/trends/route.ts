import { NextResponse } from "next/server";
import { db } from "@/db";
import { dailyKeywords, keywordStats } from "@/db/schema";
import { asc } from "drizzle-orm";

interface KeywordTrend {
  keyword: string;
  currentRank: number;
  previousRank: number | null;
  rankChange: number | null; // positive = improved (lower rank), negative = dropped
  currentScore: number;
  variantCount: number;
  trend: "up" | "down" | "new" | "stable";
  // Stats from keywordStats table
  lastSeenTime: number | null;
  firstSeenTime: number | null;
  totalDaysAppeared: number | null;
}

interface DailyTrends {
  date: string;
  itemCount: number;
  keywords: KeywordTrend[];
}

export async function GET() {
  try {
    // Fetch all daily keywords ordered by date and rank
    const allKeywords = await db
      .select()
      .from(dailyKeywords)
      .orderBy(asc(dailyKeywords.date), asc(dailyKeywords.rank));

    if (allKeywords.length === 0) {
      return NextResponse.json({ error: "No daily keywords found" }, { status: 404 });
    }

    // Fetch all keyword stats and create a lookup map
    const allStats = await db.select().from(keywordStats);
    const statsMap = new Map(allStats.map(s => [s.keyword, s]));

    // Group by date
    const byDate: Record<string, typeof allKeywords> = {};
    for (const kw of allKeywords) {
      if (!byDate[kw.date]) byDate[kw.date] = [];
      byDate[kw.date].push(kw);
    }

    const dates = Object.keys(byDate).sort();
    const trends: DailyTrends[] = [];

    for (let i = 0; i < dates.length; i++) {
      const date = dates[i];
      const currentDay = byDate[date];
      const previousDay = i > 0 ? byDate[dates[i - 1]] : null;

      // Create lookup for previous day ranks
      const prevRankMap: Record<string, number> = {};
      if (previousDay) {
        for (const kw of previousDay) {
          prevRankMap[kw.keyword] = kw.rank;
        }
      }

      const keywordTrends: KeywordTrend[] = currentDay.map((kw) => {
        const previousRank = prevRankMap[kw.keyword] ?? null;
        let rankChange: number | null = null;
        let trend: "up" | "down" | "new" | "stable" = "stable";

        if (previousRank === null) {
          trend = "new";
        } else {
          rankChange = previousRank - kw.rank; // positive = rank improved (went from 10 to 5 = +5)
          if (rankChange > 2) {
            trend = "up";
          } else if (rankChange < -2) {
            trend = "down";
          } else {
            trend = "stable";
          }
        }

        // Get stats for this keyword
        const stats = statsMap.get(kw.keyword);

        return {
          keyword: kw.keyword,
          currentRank: kw.rank,
          previousRank,
          rankChange,
          currentScore: kw.score,
          variantCount: kw.variantCount,
          trend,
          lastSeenTime: stats?.lastItemTime ?? null,
          firstSeenTime: stats?.firstSeenTime ?? null,
          totalDaysAppeared: stats?.totalDaysAppeared ?? null,
        };
      });

      trends.push({
        date,
        itemCount: currentDay[0]?.itemCount || 0,
        keywords: keywordTrends,
      });
    }

    // Calculate overall movers (biggest gainers/losers across the week)
    const latestDay = trends[trends.length - 1];
    const firstDay = trends[0];
    
    // Create lookup for first day ranks
    const firstDayRanks: Record<string, number> = {};
    for (const kw of firstDay.keywords) {
      firstDayRanks[kw.keyword] = kw.currentRank;
    }

    const weeklyMovers = latestDay.keywords.map((kw) => {
      const startRank = firstDayRanks[kw.keyword] ?? null;
      const weeklyChange = startRank !== null ? startRank - kw.currentRank : null;
      return {
        keyword: kw.keyword,
        currentRank: kw.currentRank,
        startRank,
        weeklyChange,
        isNew: startRank === null,
      };
    }).sort((a, b) => {
      // Sort by weekly change (biggest gainers first)
      if (a.weeklyChange === null) return 1;
      if (b.weeklyChange === null) return -1;
      return b.weeklyChange - a.weeklyChange;
    });

    return NextResponse.json({
      success: true,
      dateRange: { from: dates[0], to: dates[dates.length - 1] },
      totalDays: dates.length,
      dailyTrends: trends,
      topGainers: weeklyMovers.filter(m => (m.weeklyChange ?? 0) > 0).slice(0, 10),
      topLosers: weeklyMovers.filter(m => (m.weeklyChange ?? 0) < 0).slice(-10).reverse(),
      newThisWeek: weeklyMovers.filter(m => m.isNew).slice(0, 10),
    });
  } catch (error) {
    console.error("Trends API error:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
