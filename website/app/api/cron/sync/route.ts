import type { NextRequest } from 'next/server'
import type { HNItem } from '@/lib/hn-api'
import { eq, max } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { db } from '@/db'
import { items, syncRuns } from '@/db/schema'
import { batchInsertItems } from '@/lib/batch-utils'
import { fetchItemsBatch, fetchMaxItem } from '@/lib/hn-api'
import { createQueueRecord } from '@/lib/keyword-queue'
import {
  createSyncRun,
  findExistingRunningSyncOrPaused,
} from '@/lib/sync-utils'

const CHUNK_SIZE = 500 // Smaller chunks for cron to fit in timeout
const CONCURRENCY = 20
const MAX_EXECUTION_MS = 55000 // 55 seconds to stay under 60s limit

interface CronSyncResult {
  success: boolean
  message: string
  itemsSynced?: number
  syncRunId?: number
  completed?: boolean
}

// Process a single chunk, returns number of items inserted
async function processChunk(syncRunId: number): Promise<{ inserted: number, done: boolean }> {
  const [syncRun] = await db
    .select()
    .from(syncRuns)
    .where(eq(syncRuns.id, syncRunId))
    .limit(1)

  if (!syncRun || syncRun.status === 'completed') {
    return { inserted: 0, done: true }
  }

  const startId = syncRun.lastFetchedItem
  const endId = Math.max(syncRun.targetEndItem, startId - CHUNK_SIZE)

  const idsToFetch: number[] = []
  for (let id = startId - 1; id >= endId && idsToFetch.length < CHUNK_SIZE; id--) {
    idsToFetch.push(id)
  }

  if (idsToFetch.length === 0) {
    await db
      .update(syncRuns)
      .set({ status: 'completed', completedAt: new Date() })
      .where(eq(syncRuns.id, syncRunId))
    return { inserted: 0, done: true }
  }

  const fetchedItems = await fetchItemsBatch(idsToFetch, CONCURRENCY)
  const validItems = fetchedItems.filter((item): item is HNItem => item !== null)
  const insertedCount = await batchInsertItems(validItems)

  const newLastFetched = Math.min(...idsToFetch)
  const isDone = newLastFetched <= syncRun.targetEndItem

  await db
    .update(syncRuns)
    .set({
      lastFetchedItem: newLastFetched,
      itemsFetched: syncRun.itemsFetched + insertedCount,
      status: isDone ? 'completed' : 'running',
      completedAt: isDone ? new Date() : null,
    })
    .where(eq(syncRuns.id, syncRunId))

  return { inserted: insertedCount, done: isDone }
}

// GET - Called by external cron service (cron-job.org) every 5 minutes
export async function GET(request: NextRequest): Promise<NextResponse<CronSyncResult>> {
  // Verify cron secret
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json(
      { success: false, message: 'Unauthorized' },
      { status: 401 },
    )
  }

  const startTime = Date.now()

  try {
    // Check for existing running sync
    const existingSync = await findExistingRunningSyncOrPaused()
    let syncRunId: number
    let totalInserted = 0

    if (existingSync) {
      // Continue existing sync
      syncRunId = existingSync.id
      await db
        .update(syncRuns)
        .set({ status: 'running' })
        .where(eq(syncRuns.id, syncRunId))
    }
    else {
      // Start new incremental sync
      const [latestItem] = await db
        .select({ maxId: max(items.id) })
        .from(items)
        .limit(1)

      const remoteMaxItem = await fetchMaxItem()
      const targetEndItem = latestItem?.maxId ?? 0
      const totalItems = Math.max(0, remoteMaxItem - targetEndItem)

      if (totalItems === 0) {
        return NextResponse.json({
          success: true,
          message: 'No new items to sync',
          itemsSynced: 0,
        })
      }

      const syncRun = await createSyncRun(remoteMaxItem, targetEndItem, totalItems)
      syncRunId = syncRun.id
    }

    // Process chunks until timeout or completion
    let done = false
    while (!done && (Date.now() - startTime) < MAX_EXECUTION_MS) {
      const result = await processChunk(syncRunId)
      totalInserted += result.inserted
      done = result.done
    }

    // If sync completed, queue keyword extraction asynchronously
    if (done) {
      try {
        await createQueueRecord(syncRunId)
        console.log(`Queued keyword extraction for sync run ${syncRunId}`)

        // Trigger async processing (fire-and-forget to avoid timeout)
        fetch(
          `${process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3000'}/api/keywords/process-queue`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
          },
        ).catch((error) => {
          console.error('Error triggering keyword extraction processing:', error)
        })
      }
      catch (error) {
        console.error('Failed to queue keyword extraction:', error)
        // Continue anyway - sync completed successfully, just queue is missing
      }
    }

    return NextResponse.json({
      success: true,
      message: done ? 'Sync completed' : 'Sync in progress, will continue on next run',
      itemsSynced: totalInserted,
      syncRunId,
      completed: done,
    })
  }
  catch (error) {
    console.error('Cron sync failed:', error)
    return NextResponse.json(
      { success: false, message: String(error) },
      { status: 500 },
    )
  }
}
