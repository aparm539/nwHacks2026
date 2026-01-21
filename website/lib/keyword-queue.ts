import { eq, or } from 'drizzle-orm'
import { db } from '@/db'
import {
  keywordExtractionQueue,
} from '@/db/schema'

export async function createQueueRecord(syncRunId: number) {
  try {
    const result = await db
      .insert(keywordExtractionQueue)
      .values({
        syncRunId,
        status: 'pending',
        retryCount: 0,
      })
      .returning()
    return result[0]
  }
  catch (error) {
    console.error('Failed to create keyword extraction queue record:', error)
    throw error
  }
}

export async function findPendingRecords() {
  try {
    const records = await db
      .select()
      .from(keywordExtractionQueue)
      .where(or(eq(keywordExtractionQueue.status, 'pending'), eq(keywordExtractionQueue.status, 'failed')))
      .orderBy(keywordExtractionQueue.createdAt)
    return records
  }
  catch (error) {
    console.error('Failed to find pending keyword extraction records:', error)
    throw error
  }
}

export async function updateStatus(
  id: number,
  status: 'pending' | 'processing' | 'completed' | 'failed',
  errorMessage?: string,
  processedAt?: Date,
) {
  try {
    const updateData: Record<string, unknown> = {
      status,
    }
    if (errorMessage) {
      updateData.errorMessage = errorMessage
    }
    if (processedAt) {
      updateData.processedAt = processedAt
    }
    const result = await db
      .update(keywordExtractionQueue)
      .set(updateData)
      .where(eq(keywordExtractionQueue.id, id))
      .returning()
    return result[0]
  }
  catch (error) {
    console.error('Failed to update keyword extraction queue status:', error)
    throw error
  }
}

export async function incrementRetry(id: number) {
  try {
    const record = await db
      .select()
      .from(keywordExtractionQueue)
      .where(eq(keywordExtractionQueue.id, id))

    if (!record.length) {
      throw new Error('Queue record not found')
    }

    const newRetryCount = (record[0].retryCount || 0) + 1

    const result = await db
      .update(keywordExtractionQueue)
      .set({
        retryCount: newRetryCount,
        status: 'pending',
      })
      .where(eq(keywordExtractionQueue.id, id))
      .returning()
    return result[0]
  }
  catch (error) {
    console.error('Failed to increment retry count:', error)
    throw error
  }
}

export async function logError(
  id: number,
  error: Error | string,
  shouldRetry: boolean = true,
) {
  const errorMessage = error instanceof Error ? error.message : String(error)
  try {
    if (shouldRetry) {
      await incrementRetry(id)
      console.error(`Queue record ${id} marked for retry. Error: ${errorMessage}`)
    }
    else {
      await updateStatus(id, 'failed', errorMessage, new Date())
      console.error(`Queue record ${id} marked as permanently failed. Error: ${errorMessage}`)
    }
  }
  catch (err) {
    console.error('Failed to log error:', err)
  }
}
