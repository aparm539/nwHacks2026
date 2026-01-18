import { NextResponse } from "next/server";
import { db } from "@/db";
import { items, dailyKeywords } from "@/db/schema";
import { and, gte, lt, inArray, sql } from "drizzle-orm";
import { isBlacklisted } from "@/lib/keyword-blacklist";

const KEYWORD_SERVICE_URL = process.env.KEYWORD_SERVICE_URL || "http://127.0.0.1:8000";

interface KeywordResult {
  keyword: string;
  score: number;
}

interface KeywordExtractionResponse {
  keywords: KeywordResult[];
  text_length: number;
  keyword_count: number;
}

interface AggregatedKeyword {
  keyword: string;
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

// Group keywords by root term
function aggregateKeywords(keywords: KeywordResult[]): AggregatedKeyword[] {
  const groups: Record<string, { keywords: string[]; totalScore: number; count: number }> = {};
  
  for (const kw of keywords) {
    // Skip blacklisted keywords
    if (isBlacklisted(kw.keyword)) {
      continue;
    }
    
    const lowerKeyword = kw.keyword.toLowerCase();
    
    const rootTerms = ["claude", "rust", "python", "agent", "api", "openai", "gpt", "llm", "ai", "machine learning", "deep learning", "javascript", "typescript", "react", "node", "docker", "kubernetes", "aws", "google", "microsoft", "apple", "linux", "github", "open source"];
    let matchedRoot = rootTerms.find(root => lowerKeyword.includes(root));
    
    if (!matchedRoot) matchedRoot = kw.keyword;
    
    // Also check if the root term is blacklisted
    if (isBlacklisted(matchedRoot)) {
      continue;
    }
    
    if (!groups[matchedRoot]) {
      groups[matchedRoot] = { keywords: [], totalScore: 0, count: 0 };
    }
    groups[matchedRoot].keywords.push(kw.keyword);
    groups[matchedRoot].totalScore += kw.score;
    groups[matchedRoot].count++;
  }
  
  return Object.entries(groups)
    .map(([root, data]) => ({
      keyword: root,
      avgScore: data.totalScore / data.count,
      count: data.count,
      variants: data.keywords,
    }))
    .sort((a, b) => b.count - a.count);
}

export async function POST() {
  try {
    // Clear existing daily keywords
    console.log("Clearing existing daily keywords...");
    await db.delete(dailyKeywords);
    
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

    // Generate list of dates to process
    const dates: string[] = [];
    let currentTimestamp = minTime;
    while (currentTimestamp <= maxTime) {
      const date = new Date(currentTimestamp * 1000);
      const dateStr = date.toISOString().split("T")[0];
      if (!dates.includes(dateStr)) {
        dates.push(dateStr);
      }
      currentTimestamp += 86400; // Add one day
    }

    console.log(`Processing ${dates.length} days from ${dates[0]} to ${dates[dates.length - 1]}`);

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
        await db.insert(dailyKeywords).values(
          top75.map((kw, idx) => ({
            date: dateStr,
            keyword: kw.keyword,
            score: kw.avgScore,
            rank: idx + 1,
            variantCount: kw.count,
            itemCount: dayItems.length,
          }))
        );
      }

      results.push({
        date: dateStr,
        itemCount: dayItems.length,
        keywordCount: top75.length,
      });

      console.log(`Processed ${dateStr}: ${dayItems.length} items, ${top75.length} keywords`);
    }

    return NextResponse.json({
      success: true,
      daysProcessed: results.length,
      dateRange: { from: dates[0], to: dates[dates.length - 1] },
      results,
    });
  } catch (error) {
    console.error("Extract-daily error:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
