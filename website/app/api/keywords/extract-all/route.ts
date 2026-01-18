import { NextResponse } from "next/server";
import { db } from "@/db";
import { items, keywordExtractions, keywords as keywordsTable } from "@/db/schema";
import { inArray } from "drizzle-orm";
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

interface AggregatedKeyword {
  keyword: string;
  avgScore: number;
  count: number;
  variants: string[];
}

// Group keywords by root term (e.g., "claude")
function aggregateKeywords(keywords: { keyword: string; score: number }[]): AggregatedKeyword[] {
  const groups: Record<string, { keywords: string[]; totalScore: number; count: number }> = {};
  
  for (const kw of keywords) {
    // Skip blacklisted keywords
    if (isBlacklisted(kw.keyword)) {
      continue;
    }
    
    const lowerKeyword = kw.keyword.toLowerCase();
    
    // Find root terms to group by (you can customize this list)
    const rootTerms = ["claude", "rust", "python", "agent", "api", "openai", "gpt", "llm", "ai", "machine learning", "deep learning", "javascript", "typescript", "react", "node", "docker", "kubernetes", "aws", "google", "microsoft", "apple", "linux", "github", "open source", "Adams", "user", "Windows"];
    let matchedRoot = rootTerms.find(root => lowerKeyword.includes(root));
    
    if (!matchedRoot) matchedRoot = kw.keyword; // Keep as-is if no match
    
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
  
  // Return aggregated results sorted by count (most occurrences first)
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
    // Clear existing keyword data
    console.log("Clearing existing keyword data...");
    await db.delete(keywordsTable);
    await db.delete(keywordExtractions);
    console.log("Cleared existing data");

    // Fetch ALL stories and comments from the database
    const allItems = await db
      .select({
        id: items.id,
        title: items.title,
        text: items.text,
      })
      .from(items)
      .where(inArray(items.type, ["story", "comment"]));

    if (allItems.length === 0) {
      return NextResponse.json(
        { error: "No stories or comments found in database" },
        { status: 404 }
      );
    }

    console.log(`Found ${allItems.length} items (stories + comments) to analyze`);

    // Combine all text content from stories
    const textParts: string[] = [];
    for (const story of allItems) {
      if (story.title) {
        textParts.push(stripHtml(story.title));
      }
      if (story.text) {
        textParts.push(stripHtml(story.text));
      }
    }

    const combinedText = textParts.join(" ");
    console.log(`Combined text length: ${combinedText.length} characters`);

    if (combinedText.length < 10) {
      return NextResponse.json(
        { error: "Not enough text content in stories" },
        { status: 400 }
      );
    }

    // Call the keyword extraction service with more keywords for full analysis
    let keywordResponse;
    try {
      keywordResponse = await fetch(`${KEYWORD_SERVICE_URL}/extract`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: combinedText,
          max_keywords: 200, // Get keywords for full database analysis
          language: "en",
          n_gram_max: 3,
        }),
      });
    } catch (fetchError) {
      console.error("Fetch error:", fetchError);
      return NextResponse.json(
        { error: `Failed to connect to keyword service at ${KEYWORD_SERVICE_URL}: ${fetchError}` },
        { status: 502 }
      );
    }

    if (!keywordResponse.ok) {
      const errorText = await keywordResponse.text();
      console.error("Keyword service error:", errorText);
      return NextResponse.json(
        { error: `Failed to extract keywords from service: ${errorText}` },
        { status: 502 }
      );
    }

    const keywordData: KeywordExtractionResponse = await keywordResponse.json();
    console.log(`Extracted ${keywordData.keywords.length} raw keywords`);

    // Aggregate similar keywords
    const aggregatedKeywords = aggregateKeywords(keywordData.keywords);
    console.log(`Aggregated into ${aggregatedKeywords.length} unique keywords`);

    // Save extraction to database
    const [extraction] = await db
      .insert(keywordExtractions)
      .values({
        itemCount: allItems.length,
        textLength: combinedText.length,
        filterDate: "all", // Mark as full database extraction
        itemIds: null, // Too many to store
      })
      .returning();

    // Save aggregated keywords to database
    if (aggregatedKeywords.length > 0) {
      await db.insert(keywordsTable).values(
        aggregatedKeywords.map((kw, idx) => ({
          extractionId: extraction.id,
          keyword: kw.keyword,
          score: kw.avgScore,
          rank: idx + 1,
        }))
      );
    }

    return NextResponse.json({
      success: true,
      extractionId: extraction.id,
      itemsAnalyzed: allItems.length,
      combinedTextLength: combinedText.length,
      rawKeywordsExtracted: keywordData.keywords.length,
      aggregatedKeywords: aggregatedKeywords.length,
      keywords: aggregatedKeywords,
    });
  } catch (error) {
    console.error("Extract-all error:", error);
    return NextResponse.json(
      { error: String(error) },
      { status: 500 }
    );
  }
}
