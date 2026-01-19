const HN_API_BASE = 'https://hacker-news.firebaseio.com/v0'

export const ONE_WEEK_SECONDS = 7 * 24 * 60 * 60

// Types for HN API responses
export interface HNItem {
  id: number
  deleted?: boolean
  type?: 'job' | 'story' | 'comment' | 'poll' | 'pollopt'
  by?: string
  time?: number
  text?: string
  dead?: boolean
  parent?: number
  poll?: number
  kids?: number[]
  url?: string
  score?: number
  title?: string
  parts?: number[]
  descendants?: number
}

export interface HNUser {
  id: string
  created: number
  karma: number
  about?: string
  submitted?: number[]
}

export async function fetchHNItem(id: number): Promise<HNItem | null> {
  try {
    const response = await fetch(`${HN_API_BASE}/item/${id}.json`)
    if (!response.ok)
      return null
    const data = await response.json()
    return data
  }
  catch {
    return null
  }
}

export async function fetchHNUser(id: string): Promise<HNUser | null> {
  try {
    const response = await fetch(`${HN_API_BASE}/user/${id}.json`)
    if (!response.ok)
      return null
    return response.json()
  }
  catch {
    return null
  }
}

export async function fetchMaxItem(): Promise<number> {
  const response = await fetch(`${HN_API_BASE}/maxitem.json`)
  return response.json()
}

/**
 * Binary search to find the item ID closest to a target timestamp.
 * HN item IDs are sequential, so timestamps are roughly monotonic.
 *
 * @param targetTimestamp - Unix timestamp to search for
 * @param maxItem - The current max item ID
 * @param minItem - The minimum item ID to search from (default: 1)
 * @returns The item ID closest to (but not newer than) the target timestamp
 */
export async function findItemIdAtTimestamp(
  targetTimestamp: number,
  maxItem: number,
  minItem: number = 1,
): Promise<number> {
  let low = minItem
  let high = maxItem
  let bestMatch = minItem

  // Binary search with ~20 iterations max (covers billions of items)
  while (low <= high) {
    const mid = Math.floor((low + high) / 2)
    const item = await fetchHNItem(mid)

    if (!item || !item.time) {
      // Item doesn't exist or has no timestamp, search lower
      high = mid - 1
      continue
    }

    if (item.time <= targetTimestamp) {
      // This item is at or before our target, search higher
      bestMatch = mid
      low = mid + 1
    }
    else {
      // This item is after our target, search lower
      high = mid - 1
    }
  }

  // Add a buffer of ~1000 items to ensure we don't miss any
  // (timestamps aren't perfectly monotonic)
  return Math.max(minItem, bestMatch - 1000)
}

/**
 * Fetch items in a batch with concurrency control
 */
export async function fetchItemsBatch(
  ids: number[],
  concurrency: number = 20,
): Promise<(HNItem | null)[]> {
  const results: (HNItem | null)[] = Array.from({ length: ids.length }).fill(null)

  // Process in chunks to control concurrency
  for (let i = 0; i < ids.length; i += concurrency) {
    const chunk = ids.slice(i, i + concurrency)
    const chunkResults = await Promise.all(
      chunk.map(id => fetchHNItem(id)),
    )

    for (let j = 0; j < chunkResults.length; j++) {
      results[i + j] = chunkResults[j]
    }
  }

  return results
}
