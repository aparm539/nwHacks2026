"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface SyncRun {
  id: number;
  startMaxItem: number;
  targetEndItem: number;
  totalItems: number;
  lastFetchedItem: number;
  itemsFetched: number;
  startedAt: string;
  completedAt: string | null;
  status: string;
  errorMessage: string | null;
  progress: number;
}

interface ChunkResult {
  success: boolean;
  done: boolean;
  syncRunId: number;
  itemsFetched: number;
  totalItems: number;
  lastFetchedItem: number;
  targetEndItem: number;
  progress: number;
  error?: string;
}

interface SSEMessage {
  type: "progress" | "completed" | "idle" | "error";
  syncRunId?: number;
  itemsFetched?: number;
  totalItems?: number;
  lastFetchedItem?: number;
  targetEndItem?: number;
  startMaxItem?: number;
  progress?: number;
  status?: string;
  message?: string;
}

const POLL_INTERVAL_SECONDS = 20;

export default function SyncDashboard() {
  const [runs, setRuns] = useState<SyncRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [currentProgress, setCurrentProgress] = useState<ChunkResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [autoSync, setAutoSync] = useState(false);
  const [connected, setConnected] = useState(false);
  const [itemCount, setItemCount] = useState<number | null>(null);
  const [smartPolling, setSmartPolling] = useState(false);
  const [countdown, setCountdown] = useState(POLL_INTERVAL_SECONDS);
  const [itemsBehind, setItemsBehind] = useState<number>(0);
  const [cronTesting, setCronTesting] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);
  const countdownRef = useRef<NodeJS.Timeout | null>(null);
  const pollRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch sync run history
  const fetchRuns = useCallback(async () => {
    try {
      const res = await fetch("/api/sync");
      const data = await res.json();
      setRuns(data.runs || []);
    } catch {
      setError("Failed to fetch sync history");
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch sync status (item count, maxitem comparison)
  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/sync/status");
      const data = await res.json();
      setItemCount(data.itemCount);
      setItemsBehind(data.itemsBehind);
      return data;
    } catch {
      // Status fetch failure is not critical
      return null;
    }
  }, []);

  // Start a new sync (initial or incremental)
  const startSync = async (type: "initial" | "incremental") => {
    setError(null);
    setSyncing(true);

    try {
      const endpoint = type === "initial" ? "/api/sync/initial" : "/api/sync/incremental";
      const res = await fetch(endpoint, { method: "POST" });
      const data = await res.json();

      if (!data.success) {
        setError(data.error || `Failed to start ${type} sync`);
        setSyncing(false);
        return;
      }

      // If no items to sync, just refresh status
      if (data.totalItems === 0) {
        setSyncing(false);
        fetchStatus();
        return;
      }

      // Start processing chunks
      setAutoSync(true);
      processChunk(data.syncRunId);
    } catch {
      setError(`Failed to start ${type} sync`);
      setSyncing(false);
    }
  };

  // Process a single chunk
  const processChunk = async (syncRunId: number) => {
    try {
      const res = await fetch(`/api/sync/chunk?syncRunId=${syncRunId}`, {
        method: "POST",
      });
      const data: ChunkResult = await res.json();

      if (!data.success) {
        setError(data.error || "Chunk processing failed");
        setSyncing(false);
        setAutoSync(false);
        fetchRuns();
        return;
      }

      setCurrentProgress(data);

      if (data.done) {
        setSyncing(false);
        setAutoSync(false);
        fetchRuns();
      } else if (autoSync) {
        // Continue with next chunk
        setTimeout(() => processChunk(syncRunId), 100);
      }
    } catch {
      setError("Chunk processing failed");
      setSyncing(false);
      setAutoSync(false);
      fetchRuns();
    }
  };

  // Pause sync
  const pauseSync = async () => {
    setAutoSync(false);
    try {
      await fetch("/api/sync", { method: "DELETE" });
      setSyncing(false);
      fetchRuns();
      fetchStatus();
    } catch {
      setError("Failed to pause sync");
    }
  };

  // Test cron sync
  const testCronSync = async () => {
    setError(null);
    setCronTesting(true);

    try {
      const res = await fetch("/api/cron/sync", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${process.env.NEXT_PUBLIC_CRON_SECRET || ""}`,
        },
      });
      const data = await res.json();

      if (!data.success) {
        setError(`Cron test failed: ${data.message}`);
      } else {
        setError(null);
        // Show success message temporarily
        setTimeout(() => {
          fetchRuns();
          fetchStatus();
        }, 500);
      }
    } catch (err) {
      setError(`Cron test error: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      setCronTesting(false);
    }
  };

  // Continue processing (used when autoSync changes)
  useEffect(() => {
    if (autoSync && currentProgress && !currentProgress.done) {
      processChunk(currentProgress.syncRunId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoSync]);

  // Server-Sent Events connection for real-time updates
  useEffect(() => {
    const eventSource = new EventSource("/api/sync/stream");
    eventSourceRef.current = eventSource;

    eventSource.onopen = () => {
      setConnected(true);
    };

    eventSource.onmessage = (event) => {
      try {
        const data: SSEMessage = JSON.parse(event.data);

        if (data.type === "progress") {
          setSyncing(data.status === "running");
          setCurrentProgress({
            success: true,
            done: false,
            syncRunId: data.syncRunId!,
            itemsFetched: data.itemsFetched!,
            totalItems: data.totalItems!,
            lastFetchedItem: data.lastFetchedItem!,
            targetEndItem: data.targetEndItem!,
            progress: data.progress!,
          });
        } else if (data.type === "completed") {
          setSyncing(false);
          setAutoSync(false);
          setCurrentProgress((prev) =>
            prev
              ? { ...prev, done: true, progress: 100 }
              : null
          );
          fetchRuns();
        } else if (data.type === "idle") {
          if (currentProgress?.done === false && !syncing) {
            // Only clear if we weren't actively syncing
          }
        } else if (data.type === "error") {
          setError(data.message || "Stream error");
        }
      } catch {
        // Ignore parse errors
      }
    };

    eventSource.onerror = () => {
      setConnected(false);
      // Reconnect after 3 seconds
      setTimeout(() => {
        if (eventSourceRef.current) {
          eventSourceRef.current.close();
        }
      }, 3000);
    };

    return () => {
      eventSource.close();
      eventSourceRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Initial fetch and polling (reduced frequency since we have SSE)
  useEffect(() => {
    fetchRuns();
    fetchStatus();
    const interval = setInterval(() => {
      fetchRuns();
      // Only fetch status if smart polling is disabled (smart polling handles its own status checks)
      if (!smartPolling) {
        fetchStatus();
      }
    }, 10000); // Reduced to 10s since SSE handles real-time
    return () => clearInterval(interval);
  }, [fetchRuns, fetchStatus, smartPolling]);

  // Smart polling: check for new items and auto-sync if behind
  useEffect(() => {
    if (!smartPolling) {
      // Clean up timers when disabled
      if (countdownRef.current) {
        clearInterval(countdownRef.current);
        countdownRef.current = null;
      }
      if (pollRef.current) {
        clearTimeout(pollRef.current);
        pollRef.current = null;
      }
      setCountdown(POLL_INTERVAL_SECONDS);
      return;
    }

    const checkAndSync = async () => {
      const status = await fetchStatus();
      setCountdown(POLL_INTERVAL_SECONDS);
      
      // If we're behind and not currently syncing, start an incremental sync
      if (status && status.itemsBehind > 0 && !syncing) {
        startSync("incremental");
      }
    };

    // Initial check
    checkAndSync();

    // Set up the polling interval
    pollRef.current = setInterval(checkAndSync, POLL_INTERVAL_SECONDS * 1000);

    // Set up the countdown timer (updates every second)
    countdownRef.current = setInterval(() => {
      setCountdown((prev) => (prev > 1 ? prev - 1 : POLL_INTERVAL_SECONDS));
    }, 1000);

    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
      if (countdownRef.current) {
        clearInterval(countdownRef.current);
        countdownRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [smartPolling]);

  // Check if there's an active sync to resume
  useEffect(() => {
    const activeRun = runs.find(
      (r) => r.status === "running" || r.status === "paused"
    );
    if (activeRun && !syncing && !currentProgress) {
      setCurrentProgress({
        success: true,
        done: false,
        syncRunId: activeRun.id,
        itemsFetched: activeRun.itemsFetched,
        totalItems: activeRun.totalItems,
        lastFetchedItem: activeRun.lastFetchedItem,
        targetEndItem: activeRun.targetEndItem,
        progress: activeRun.progress,
      });
    }
  }, [runs, syncing, currentProgress]);

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "-";
    return new Date(dateStr).toLocaleString();
  };

  const formatNumber = (num: number) => {
    return num.toLocaleString();
  };

  const getStatusVariant = (status: string): "default" | "secondary" | "destructive" | "outline" => {
    switch (status) {
      case "completed":
        return "default";
      case "running":
        return "secondary";
      case "paused":
        return "outline";
      case "failed":
        return "destructive";
      default:
        return "secondary";
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="flex items-center gap-1 text-gray-500 hover:text-gray-700 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              <span className="text-sm font-medium">Back</span>
            </Link>
            <div className="flex items-center gap-2">
              <div
                className={`w-3 h-3 rounded-full ${
                  connected ? "bg-green-500" : "bg-red-500"
                }`}
              />
              <span className="text-sm text-gray-600">
                {connected ? "connected" : "Reconnecting..."}
              </span>
            </div>
          </div>

          {/* Smart Polling Controls */}
          <div className="flex items-center gap-4">
            {smartPolling && (
              <div className="flex items-center gap-3 px-4 py-2 bg-white rounded-lg shadow-sm border">
                <div className="flex items-center gap-2">
                  <div className="relative w-8 h-8">
                    <svg className="w-8 h-8 transform -rotate-90">
                      <circle
                        cx="16"
                        cy="16"
                        r="14"
                        stroke="#e5e7eb"
                        strokeWidth="2"
                        fill="none"
                      />
                      <circle
                        cx="16"
                        cy="16"
                        r="14"
                        stroke="#3b82f6"
                        strokeWidth="2"
                        fill="none"
                        strokeDasharray={`${(countdown / POLL_INTERVAL_SECONDS) * 88} 88`}
                        className="transition-all duration-1000 ease-linear"
                      />
                    </svg>
                    <span className="absolute inset-0 flex items-center justify-center text-xs font-medium text-gray-700">
                      {countdown}
                    </span>
                  </div>
                  <span className="text-sm text-gray-600">Next check</span>
                </div>
              </div>
            )}
            <button
              onClick={() => setSmartPolling(!smartPolling)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg transition ${
                smartPolling
                  ? "bg-blue-600 text-white hover:bg-blue-700"
                  : "bg-gray-200 text-gray-700 hover:bg-gray-300"
              }`}
            >
              <div
                className={`w-2 h-2 rounded-full ${
                  smartPolling ? "bg-white animate-pulse" : "bg-gray-400"
                }`}
              />
              {smartPolling ? "Auto-Sync On" : "Auto-Sync Off"}
            </button>
          </div>
        </div>

        {/* Error Display */}
        {error && (
          <Alert variant="destructive" className="mb-6">
            <AlertDescription className="flex items-center justify-between">
              {error}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setError(null)}
              >
                Dismiss
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {/* Current Sync Progress */}
        {currentProgress && !currentProgress.done && (
          <Card className="mb-8">
            <CardHeader>
              <CardTitle>Current Sync Progress</CardTitle>
              <CardDescription>
                {formatNumber(currentProgress.itemsFetched)} /{" "}
                {formatNumber(currentProgress.totalItems)} items ({currentProgress.progress}%)
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Progress value={currentProgress.progress} className="mb-4" />

              {/* Stats */}
              <div className="grid grid-cols-3 gap-4 mb-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Current ID:</span>{" "}
                  <span className="font-mono">
                    {formatNumber(currentProgress.lastFetchedItem)}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">Target ID:</span>{" "}
                  <span className="font-mono">
                    {formatNumber(currentProgress.targetEndItem)}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">Remaining:</span>{" "}
                  <span className="font-mono">
                    {formatNumber(
                      currentProgress.lastFetchedItem - currentProgress.targetEndItem
                    )}
                  </span>
                </div>
              </div>

              {/* Controls */}
              <div className="flex gap-4">
                {syncing ? (
                  <Button onClick={pauseSync} variant="secondary">
                    Pause Sync
                  </Button>
                ) : (
                  <Button
                    onClick={() => {
                      setSyncing(true);
                      setAutoSync(true);
                      processChunk(currentProgress.syncRunId);
                    }}
                  >
                    Continue Sync
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Start New Sync Buttons */}
        {!currentProgress || currentProgress.done ? (
          <div className="mb-8">
            <div className="flex gap-4 mb-4 items-center">
              <Button
                onClick={() => startSync("initial")}
                disabled={syncing || (itemCount !== null && itemCount > 0)}
                variant="default"
                size="lg"
                title={itemCount !== null && itemCount > 0 ? "Initial sync is only available when the database is empty" : "Fetch the last 7 days of HN items"}
              >
                {syncing ? "Starting..." : "Initial Sync (Last 7 Days)"}
              </Button>
              <Button
                onClick={() => startSync("incremental")}
                disabled={syncing}
                variant="default"
                size="lg"
                title="Fetch new items since last sync"
              >
                {syncing ? "Starting..." : "Incremental Sync"}
              </Button>
              <Button
                onClick={testCronSync}
                disabled={cronTesting}
                variant="outline"
                size="lg"
                title="Test the cron sync endpoint (5-minute sync simulation)"
              >
                {cronTesting ? "Testing..." : "Test Cron"}
              </Button>
              {itemCount !== null && (
                <span className="text-sm text-muted-foreground">
                  {itemCount.toLocaleString()} items in database
                </span>
              )}
            </div>
          </div>
        ) : null}

        {/* Sync History Table */}
        <Card>
          <CardHeader>
            <CardTitle>Sync History</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="p-8 text-center text-muted-foreground">Loading...</div>
            ) : runs.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">
                No sync runs yet. Start your first sync!
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>ID</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Progress</TableHead>
                      <TableHead>Items</TableHead>
                      <TableHead>Range</TableHead>
                      <TableHead>Started</TableHead>
                      <TableHead>Completed</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {runs.map((run) => (
                      <TableRow key={run.id}>
                        <TableCell className="font-mono">{run.id}</TableCell>
                        <TableCell>
                          <Badge variant={getStatusVariant(run.status)}>
                            {run.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className="w-24">
                              <Progress value={run.progress} />
                            </div>
                            <span className="text-sm text-muted-foreground">
                              {run.progress}%
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm">
                          {formatNumber(run.itemsFetched)} /{" "}
                          {formatNumber(run.totalItems)}
                        </TableCell>
                        <TableCell className="text-sm font-mono text-muted-foreground">
                          {formatNumber(run.targetEndItem)} →{" "}
                          {formatNumber(run.startMaxItem)}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {formatDate(run.startedAt)}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {formatDate(run.completedAt)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
