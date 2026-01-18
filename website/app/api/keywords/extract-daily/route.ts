import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { items, dailyKeywords, keywordStats } from "@/db/schema";
import { and, gte, lt, inArray, sql, desc, or, ilike } from "drizzle-orm";
import { isStemBlacklisted } from "@/lib/keyword-blacklist";

const KEYWORD_SERVICE_URL = process.env.KEYWORD_SERVICE_URL || "http://127.0.0.1:8000";

interface KeywordResult {
  keyword: string;
  score: number;
  stemmed: string;
}

interface KeywordExtractionResponse {
  keywords: KeywordResult[];
  text_length: number;
  keyword_count: number;
}

interface AggregatedKeyword {
  keyword: string;
  stem: string;
  avgScore: number;
  count: number;
  variants: string[];
}

// Strip HTML tags from text
function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

// Group keywords by stem, selecting shortest variant as canonical
function aggregateKeywords(keywords: KeywordResult[]): AggregatedKeyword[] {
  const groups: Record<string, { 
    keywords: string[]; 
    totalScore: number; 
    count: number;
    shortestKeyword: string;
  }> = {};
  
  for (const kw of keywords) {
    // Skip blacklisted keywords (using stem-based blacklist check)
    if (isStemBlacklisted(kw.stemmed)) {
      continue;
    }
    
    // Use the stemmed version from Python service as the group key
    const stem = kw.stemmed;
    
    if (!groups[stem]) {
      groups[stem] = { 
        keywords: [], 
        totalScore: 0, 
        count: 0,
        shortestKeyword: kw.keyword 
      };
    }
    groups[stem].keywords.push(kw.keyword);
    groups[stem].totalScore += kw.score;
    groups[stem].count++;
    
    // Keep the shortest variant as the canonical display keyword
    if (kw.keyword.length < groups[stem].shortestKeyword.length) {
      groups[stem].shortestKeyword = kw.keyword;
    }
  }
  
  return Object.entries(groups)
    .map(([stem, data]) => ({
      keyword: data.shortestKeyword,
      stem: stem,
      avgScore: data.totalScore / data.count,
      count: data.count,
      variants: data.keywords,
    }))
    .sort((a, b) => b.count - a.count);
}

export async function POST(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const forceReextract = searchParams.get("force") === "true";
    
    // Get the date range from items table
    const dateRange = await db
      .select({
        minTime: sql<number>`MIN(${items.time})`,
        maxTime: sql<number>`MAX(${items.time})`,
      })
      .from(items);
    
    const { minTime, maxTime } = dateRange[0];
    if (!minTime || !maxTime) {
      return NextResponse.json({ error: "No items in database" }, { status: 404 });
    }

    // Generate list of all dates in range
    const allDates: string[] = [];
    
    // Get the date strings for min and max times
    const minDate = new Date(minTime * 1000).toISOString().split("T")[0];
    const maxDate = new Date(maxTime * 1000).toISOString().split("T")[0];
    
    // Generate all dates from minDate to maxDate
    const currentDate = new Date(minDate + "T00:00:00Z");
    const endDate = new Date(maxDate + "T00:00:00Z");
    
    while (currentDate <= endDate) {
      allDates.push(currentDate.toISOString().split("T")[0]);
      currentDate.setUTCDate(currentDate.getUTCDate() + 1);
    }

    // Get dates that already have keywords extracted
    const existingDates = await db
      .selectDistinct({ date: dailyKeywords.date })
      .from(dailyKeywords);
    const existingDateSet = new Set(existingDates.map(d => d.date));

    // Filter to only dates that need processing
    let dates: string[];
    const today = new Date().toISOString().split("T")[0];
    
    if (forceReextract) {
      // Clear all existing keywords and stats, reprocess everything
      console.log("Force re-extraction: clearing existing daily keywords and stats...");
      await db.delete(dailyKeywords);
      await db.delete(keywordStats);
      dates = allDates;
    } else {
      // Process dates that don't have keywords yet, PLUS always re-process today
      // This ensures lastItemTime stays up-to-date as new items arrive
      dates = allDates.filter(d => !existingDateSet.has(d) || d === today);
    }

    if (dates.length === 0) {
      return NextResponse.json({
        success: true,
        message: "All dates already have keywords extracted",
        daysProcessed: 0,
        totalDaysWithKeywords: existingDateSet.size,
        dateRange: { from: allDates[0], to: allDates[allDates.length - 1] },
        results: [],
      });
    }

    console.log(`Processing ${dates.length} days (${existingDateSet.size} already done) from ${allDates[0]} to ${allDates[allDates.length - 1]}`);

    const results: { date: string; itemCount: number; keywordCount: number }[] = [];

    // Process each day
    for (const dateStr of dates) {
      // Parse date to get start/end timestamps
      const [year, month, day] = dateStr.split("-").map(Number);
      const startOfDay = Math.floor(Date.UTC(year, month - 1, day) / 1000);
      const endOfDay = startOfDay + 86400;

      // Fetch items for this day
      const dayItems = await db
        .select({
          id: items.id,
          title: items.title,
          text: items.text,
        })
        .from(items)
        .where(
          and(
            gte(items.time, startOfDay),
            lt(items.time, endOfDay),
            inArray(items.type, ["story", "comment"])
          )
        );

      if (dayItems.length === 0) {
        console.log(`No items for ${dateStr}, skipping`);
        continue;
      }

      // Combine text
      const textParts: string[] = [];
      for (const item of dayItems) {
        if (item.title) textParts.push(stripHtml(item.title));
        if (item.text) textParts.push(stripHtml(item.text));
      }
      const combinedText = textParts.join(" ");

      if (combinedText.length < 50) {
        console.log(`Not enough text for ${dateStr}, skipping`);
        continue;
      }

      // Call keyword service
      let keywordResponse;
      try {
        keywordResponse = await fetch(`${KEYWORD_SERVICE_URL}/extract`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: combinedText,
            max_keywords: 250,
            language: "en",
            n_gram_max: 3,
          }),
        });
      } catch (fetchError) {
        console.error(`Fetch error for ${dateStr}:`, fetchError);
        continue;
      }

      if (!keywordResponse.ok) {
        console.error(`Keyword service error for ${dateStr}`);
        continue;
      }

      const keywordData: KeywordExtractionResponse = await keywordResponse.json();
      
      // Aggregate keywords
      const aggregated = aggregateKeywords(keywordData.keywords);
      
      // Take top 75
      const top75 = aggregated.slice(0, 75);

      // Insert into database
      if (top75.length > 0) {
        // If re-processing today, delete existing keywords first
        if (dateStr === today && existingDateSet.has(today)) {
          await db.delete(dailyKeywords).where(sql`${dailyKeywords.date} = ${today}`);
        }
        
        await db.insert(dailyKeywords).values(
          top75.map((kw, idx) => ({
            date: dateStr,
            keyword: kw.keyword,
            stemmedKeyword: kw.stem,
            score: kw.avgScore,
            rank: idx + 1,
            variantCount: kw.count,
            itemCount: dayItems.length,
          }))
        ).onConflictDoNothing();

        // Update keyword stats - find most recent item for each keyword
        // Always search ALL items to find the true most recent item containing each keyword
        const isReprocessingToday = dateStr === today && existingDateSet.has(today);
        
        for (const kw of top75) {
          try {
            // Search for items containing this keyword (case-insensitive)
            // Always search ALL items (no date filter) to get the globally most recent match
            const keywordLower = kw.keyword.toLowerCase();
            
            const matchingItem = await db
              .select({ id: items.id, time: items.time })
              .from(items)
              .where(
                or(
                  ilike(items.title, `%${keywordLower}%`),
                  ilike(items.text, `%${keywordLower}%`)
                )
              )
              .orderBy(desc(items.time))
              .limit(1);

            if (matchingItem.length > 0) {
              const itemTime = matchingItem[0].time;
              const itemId = matchingItem[0].id;

              if (isReprocessingToday) {
                // When re-processing today, just update the lastItemTime without incrementing totalDaysAppeared
                await db
                  .insert(keywordStats)
                  .values({
                    keyword: kw.keyword,
                    stemmedKeyword: kw.stem,
                    lastItemTime: itemTime,
                    lastItemId: itemId,
                    firstSeenTime: itemTime,
                    totalDaysAppeared: 1,
                  })
                  .onConflictDoUpdate({
                    target: keywordStats.keyword,
                    set: {
                      // Always update to the most recent item time
                      lastItemTime: itemTime,
                      lastItemId: itemId,
                      updatedAt: sql`NOW()`,
                    },
                  });
              } else {
                // First time processing this day - full upsert with stats
                await db
                  .insert(keywordStats)
                  .values({
                    keyword: kw.keyword,
                    stemmedKeyword: kw.stem,
                    lastItemTime: itemTime,
                    lastItemId: itemId,
                    firstSeenTime: itemTime,
                    totalDaysAppeared: 1,
                  })
                  .onConflictDoUpdate({
                    target: keywordStats.keyword,
                    set: {
                      // Update lastItemTime only if this item is more recent
                      lastItemTime: sql`GREATEST(${keywordStats.lastItemTime}, ${itemTime})`,
                      lastItemId: sql`CASE WHEN ${itemTime} > ${keywordStats.lastItemTime} THEN ${itemId} ELSE ${keywordStats.lastItemId} END`,
                      // Update firstSeenTime only if this item is older
                      firstSeenTime: sql`LEAST(${keywordStats.firstSeenTime}, ${itemTime})`,
                      // Increment days appeared
                      totalDaysAppeared: sql`${keywordStats.totalDaysAppeared} + 1`,
                      updatedAt: sql`NOW()`,
                    },
                  });
              }
            }
          } catch (statsError) {
            // Log but don't fail the whole extraction
            console.error(`Error updating stats for keyword "${kw.keyword}":`, statsError);
          }
        }
      }

      results.push({
        date: dateStr,
        itemCount: dayItems.length,
        keywordCount: top75.length,
      });

      console.log(`Processed ${dateStr}: ${dayItems.length} items, ${top75.length} keywords`);
    }

    // Get updated count of days with keywords
    const updatedExistingDates = await db
      .selectDistinct({ date: dailyKeywords.date })
      .from(dailyKeywords);

    return NextResponse.json({
      success: true,
      daysProcessed: results.length,
      totalDaysWithKeywords: updatedExistingDates.length,
      dateRange: { from: allDates[0], to: allDates[allDates.length - 1] },
      results,
    });
  } catch (error) {
    console.error("Extract-daily error:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
