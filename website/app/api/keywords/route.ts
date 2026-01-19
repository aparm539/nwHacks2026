import { and, eq, gte, inArray, lt } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { db } from '@/db'
import { items, keywordExtractions, keywords as keywordsTable } from '@/db/schema'

const KEYWORD_SERVICE_URL = process.env.KEYWORD_SERVICE_URL || 'http://127.0.0.1:8000'

interface Keyword {
  keyword: string
  score: number
}

interface KeywordExtractionResponse {
  keywords: Keyword[]
  text_length: number
  keyword_count: number
}

// Strip HTML tags from text
function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, '\'')
    .replace(/\s+/g, ' ')
    .trim()
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { itemIds, date, maxKeywords = 15 } = body

    let fetchedItems

    // If date is provided, fetch items by date
    if (date) {
      // Parse the date string (YYYY-MM-DD format) - add T00:00:00Z to ensure UTC
      const dateMatch = date.match(/^(\d{4})-(\d{2})-(\d{2})$/)
      if (!dateMatch) {
        return NextResponse.json(
          { error: 'Invalid date format. Use YYYY-MM-DD' },
          { status: 400 },
        )
      }

      // Create UTC date to avoid timezone issues
      const year = Number.parseInt(dateMatch[1], 10)
      const month = Number.parseInt(dateMatch[2], 10) - 1 // JS months are 0-indexed
      const day = Number.parseInt(dateMatch[3], 10)
      const startOfDay = Math.floor(Date.UTC(year, month, day) / 1000)
      const endOfDay = startOfDay + 86400 // 24 hours in seconds

      console.log(`Searching for items between ${startOfDay} and ${endOfDay} (${date})`)

      // Fetch items from that day (stories only for cleaner results)
      fetchedItems = await db
        .select({
          id: items.id,
          title: items.title,
          text: items.text,
          type: items.type,
          by: items.by,
          score: items.score,
        })
        .from(items)
        .where(
          and(
            gte(items.time, startOfDay),
            lt(items.time, endOfDay),
            eq(items.type, 'story'),
          ),
        )
        .limit(1000) // Limit to prevent overwhelming results

      console.log(`Found ${fetchedItems.length} items for date ${date}`)
    }
    else if (itemIds && Array.isArray(itemIds) && itemIds.length > 0) {
      // Convert to numbers and validate
      const ids = itemIds.map((id: unknown) => {
        const num = Number(id)
        if (isNaN(num))
          throw new Error(`Invalid item ID: ${id}`)
        return num
      })

      // Fetch items from database
      fetchedItems = await db
        .select({
          id: items.id,
          title: items.title,
          text: items.text,
          type: items.type,
          by: items.by,
          score: items.score,
        })
        .from(items)
        .where(inArray(items.id, ids))
    }
    else {
      return NextResponse.json(
        { error: 'Either itemIds or date must be provided' },
        { status: 400 },
      )
    }

    if (fetchedItems.length === 0) {
      const errorMsg = date
        ? `No stories found for date ${date}. Make sure you have synced data for this date.`
        : 'No items found with the provided IDs'
      return NextResponse.json(
        { error: errorMsg },
        { status: 404 },
      )
    }

    // Combine all text content from items
    const textParts: string[] = []
    for (const item of fetchedItems) {
      if (item.title) {
        textParts.push(stripHtml(item.title))
      }
      if (item.text) {
        textParts.push(stripHtml(item.text))
      }
    }

    const combinedText = textParts.join(' ')

    if (combinedText.length < 10) {
      return NextResponse.json(
        { error: 'Not enough text content in the selected items' },
        { status: 400 },
      )
    }

    // Call the keyword extraction service
    const keywordResponse = await fetch(`${KEYWORD_SERVICE_URL}/extract`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: combinedText,
        max_keywords: maxKeywords,
        language: 'en',
        n_gram_max: 3,
      }),
    })

    if (!keywordResponse.ok) {
      const errorText = await keywordResponse.text()
      console.error('Keyword service error:', errorText)
      return NextResponse.json(
        { error: 'Failed to extract keywords from service' },
        { status: 502 },
      )
    }

    const keywordData: KeywordExtractionResponse = await keywordResponse.json()

    // Save extraction to database
    const itemIdsList = fetchedItems.map(item => item.id).join(',')
    const [extraction] = await db
      .insert(keywordExtractions)
      .values({
        itemCount: fetchedItems.length,
        textLength: combinedText.length,
        filterDate: date || null,
        itemIds: itemIdsList.length <= 10000 ? itemIdsList : null, // Only store if not too long
      })
      .returning()

    // Save keywords to database
    if (keywordData.keywords.length > 0) {
      await db.insert(keywordsTable).values(
        keywordData.keywords.map((kw, idx) => ({
          extractionId: extraction.id,
          keyword: kw.keyword,
          score: kw.score,
          rank: idx + 1,
        })),
      )
    }

    return NextResponse.json({
      success: true,
      extractionId: extraction.id,
      items: fetchedItems,
      itemCount: fetchedItems.length,
      combinedTextLength: combinedText.length,
      keywords: keywordData.keywords,
    })
  }
  catch (error) {
    console.error('Keywords API error:', error)
    return NextResponse.json(
      { error: String(error) },
      { status: 500 },
    )
  }
}
