import { useCallback, useState } from 'react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export function KeywordExtractTab() {
  const [extracting, setExtracting] = useState(false)
  const [extractionMessage, setExtractionMessage] = useState<string | null>(null)

  const extractKeywords = useCallback(async (force: boolean = false) => {
    setExtracting(true)
    setExtractionMessage(force ? 'Re-extracting all keywords...' : 'Extracting keywords from synced items...')
    try {
      const url = force ? '/api/keywords/extract-daily?force=true' : '/api/keywords/extract-daily'
      const res = await fetch(url, { method: 'POST' })
      const json = await res.json()
      if (json.error) {
        setExtractionMessage(`Error: ${json.error}`)
      }
      else if (json.daysProcessed === 0 && json.message) {
        setExtractionMessage(json.message)
        setTimeout(() => setExtractionMessage(null), 2000)
      }
      else {
        setExtractionMessage(`Extracted keywords for ${json.daysProcessed} new days! (${json.totalDaysWithKeywords} total)`)
        setTimeout(() => setExtractionMessage(null), 1500)
      }
    }
    catch (err) {
      setExtractionMessage(`Error: ${String(err)}`)
    }
    finally {
      setExtracting(false)
    }
  }, [])

  return (
    <Card>
      <CardHeader>
        <CardTitle>Keyword Extraction</CardTitle>
        <CardDescription>Extract or refresh keyword trends from synced items.</CardDescription>
      </CardHeader>
      <CardContent>
        {extractionMessage && (
          <Alert variant={extractionMessage.startsWith('Error') ? 'destructive' : 'default'}>
            <AlertDescription>{extractionMessage}</AlertDescription>
          </Alert>
        )}
        <div className="flex gap-4 mt-4">
          <Button onClick={() => extractKeywords(false)} disabled={extracting}>
            {extracting ? 'Extracting...' : 'Extract Keywords Now'}
          </Button>
          <Button variant="outline" onClick={() => extractKeywords(true)} disabled={extracting}>
            Force Refresh
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
