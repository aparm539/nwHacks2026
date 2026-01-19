import { NextResponse } from 'next/server'
import { findPendingRecords, logError, updateStatus } from '@/lib/keyword-queue'

export async function POST() {
  try {
    // Find all pending and failed records that need processing
    const pendingRecords = await findPendingRecords()

    if (pendingRecords.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No pending keyword extractions to process',
        processed: 0,
      })
    }

    let successCount = 0
    let failureCount = 0

    for (const record of pendingRecords) {
      try {
        // Mark as processing
        await updateStatus(record.id, 'processing')

        // Call the daily keyword extraction endpoint
        const response = await fetch(
          `${process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3000'}/api/keywords/extract-daily`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
          },
        )

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}))
          throw new Error(
            `Keyword extraction failed: ${response.statusText}. ${JSON.stringify(errorData)}`,
          )
        }

        // Mark as completed
        await updateStatus(record.id, 'completed', undefined, new Date())
        successCount++
        console.log(`Successfully processed keyword extraction for sync run ${record.syncRunId}`)
      }
      catch (error) {
        failureCount++
        await logError(record.id, error as Error | string, true) // Auto-retry on next run
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Keyword extraction queue processed',
      processed: pendingRecords.length,
      successful: successCount,
      failed: failureCount,
    })
  }
  catch (error) {
    console.error('Error processing keyword extraction queue:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    )
  }
}
