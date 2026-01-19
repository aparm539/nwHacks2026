import { count, sql } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { db } from '@/db'
import { dailyKeywords, items } from '@/db/schema'

export async function GET() {
  try {
    // Get item count
    const [itemCountResult] = await db
      .select({ count: count() })
      .from(items)
    const itemCount = itemCountResult?.count ?? 0

    // Get keyword count
    const [keywordCountResult] = await db
      .select({ count: count() })
      .from(dailyKeywords)
    const hasKeywords = (keywordCountResult?.count ?? 0) > 0

    // Get date range of items
    let dateRange: { min: string, max: string } | null = null
    if (itemCount > 0) {
      const [rangeResult] = await db
        .select({
          minTime: sql<number>`MIN(${items.time})`,
          maxTime: sql<number>`MAX(${items.time})`,
        })
        .from(items)

      if (rangeResult?.minTime && rangeResult?.maxTime) {
        dateRange = {
          min: new Date(rangeResult.minTime * 1000).toISOString().split('T')[0],
          max: new Date(rangeResult.maxTime * 1000).toISOString().split('T')[0],
        }
      }
    }

    return NextResponse.json({
      itemCount,
      hasKeywords,
      dateRange,
    })
  }
  catch (error) {
    console.error('Status API error:', error)
    return NextResponse.json(
      { error: String(error) },
      { status: 500 },
    )
  }
}
