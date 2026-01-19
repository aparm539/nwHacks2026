import { max } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { db } from '@/db'
import { items } from '@/db/schema'
import { fetchMaxItem } from '@/lib/hn-api'
import {
  createSyncRun,
  findExistingRunningSyncOrPaused,
  resumeSyncRun,
} from '@/lib/sync-utils'

interface StartSyncResult {
  success: boolean
  syncRunId?: number
  startMaxItem?: number
  targetEndItem?: number
  totalItems?: number
  resumed?: boolean
  error?: string
}

// POST - Start incremental sync (capture new items since last sync)
export async function POST(): Promise<NextResponse<StartSyncResult>> {
  try {
    // Check for an existing running/paused sync
    const existingSync = await findExistingRunningSyncOrPaused()

    if (existingSync) {
      // Resume the existing sync
      await resumeSyncRun(existingSync.id)

      return NextResponse.json({
        success: true,
        syncRunId: existingSync.id,
        startMaxItem: existingSync.startMaxItem,
        targetEndItem: existingSync.targetEndItem,
        totalItems: existingSync.totalItems,
        resumed: true,
      })
    }

    // Get the latest item ID we have in the database
    const [latestItem] = await db
      .select({ maxId: max(items.id) })
      .from(items)
      .limit(1)

    // Get the current max item from HN API
    const remoteMaxItem = await fetchMaxItem()

    // For incremental sync, we go from remoteMaxItem down to our latest item
    const targetEndItem = latestItem?.maxId ?? 0
    const startMaxItem = remoteMaxItem

    const totalItems = Math.max(0, startMaxItem - targetEndItem)

    if (totalItems === 0) {
      return NextResponse.json({
        success: true,
        syncRunId: 0,
        startMaxItem,
        targetEndItem,
        totalItems: 0,
        resumed: false,
      })
    }

    // Create a new sync run
    const syncRun = await createSyncRun(startMaxItem, targetEndItem, totalItems)

    return NextResponse.json({
      success: true,
      syncRunId: syncRun.id,
      startMaxItem,
      targetEndItem,
      totalItems,
      resumed: false,
    })
  }
  catch (error) {
    console.error('Failed to start incremental sync:', error)
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 },
    )
  }
}
