import { NextResponse } from "next/server";
import { db } from "@/db";
import { items, keywordExtractions, keywords as keywordsTable } from "@/db/schema";
import { eq } from "drizzle-orm";

const KEYWORD_SERVICE_URL = process.env.KEYWORD_SERVICE_URL || "http://localhost:8000";

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

export async function POST() {
  try {
    // Fetch ALL stories from the database
    const allStories = await db
      .select({
        id: items.id,
        title: items.title,
        text: items.text,
      })
      .from(items)
      .where(eq(items.type, "story"));

    if (allStories.length === 0) {
      return NextResponse.json(
        { error: "No stories found in database" },
        { status: 404 }
      );
    }

    console.log(`Found ${allStories.length} stories to analyze`);

    // Combine all text content from stories
    const textParts: string[] = [];
    for (const story of allStories) {
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
    const keywordResponse = await fetch(`${KEYWORD_SERVICE_URL}/extract`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: combinedText,
        max_keywords: 5000, // Get more keywords for full database analysis
        language: "en",
        n_gram_max: 3,
      }),
    });

    if (!keywordResponse.ok) {
      const errorText = await keywordResponse.text();
      console.error("Keyword service error:", errorText);
      return NextResponse.json(
        { error: "Failed to extract keywords from service" },
        { status: 502 }
      );
    }

    const keywordData: KeywordExtractionResponse = await keywordResponse.json();
    console.log(`Extracted ${keywordData.keywords.length} keywords`);

    // Save extraction to database
    const [extraction] = await db
      .insert(keywordExtractions)
      .values({
        itemCount: allStories.length,
        textLength: combinedText.length,
        filterDate: "all", // Mark as full database extraction
        itemIds: null, // Too many to store
      })
      .returning();

    // Save keywords to database
    if (keywordData.keywords.length > 0) {
      await db.insert(keywordsTable).values(
        keywordData.keywords.map((kw, idx) => ({
          extractionId: extraction.id,
          keyword: kw.keyword,
          score: kw.score,
          rank: idx + 1,
        }))
      );
    }

    return NextResponse.json({
      success: true,
      extractionId: extraction.id,
      storiesAnalyzed: allStories.length,
      combinedTextLength: combinedText.length,
      keywordsExtracted: keywordData.keywords.length,
      keywords: keywordData.keywords,
    });
  } catch (error) {
    console.error("Extract-all error:", error);
    return NextResponse.json(
      { error: String(error) },
      { status: 500 }
    );
  }
}
