import { count, max } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { db } from '@/db'
import { items } from '@/db/schema'
import { fetchMaxItem } from '@/lib/hn-api'
import { findExistingRunningSyncOrPaused } from '@/lib/sync-utils'

interface StatusResponse {
  itemCount: number
  hasRunningSync: boolean
  localMaxItem: number
  remoteMaxItem: number
  itemsBehind: number
}

export async function GET(): Promise<NextResponse<StatusResponse>> {
  // Fetch local stats and remote maxitem in parallel
  const [itemCountResult, localMaxResult, remoteMaxItem] = await Promise.all([
    db.select({ count: count() }).from(items),
    db.select({ maxId: max(items.id) }).from(items),
    fetchMaxItem(),
  ])

  const existingSync = await findExistingRunningSyncOrPaused()
  const localMaxItem = localMaxResult[0]?.maxId ?? 0
  const itemsBehind = Math.max(0, remoteMaxItem - localMaxItem)

  return NextResponse.json({
    itemCount: itemCountResult[0]?.count ?? 0,
    hasRunningSync: existingSync !== null,
    localMaxItem,
    remoteMaxItem,
    itemsBehind,
  })
}
