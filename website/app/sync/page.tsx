"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";

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

  const getStatusColor = (status: string) => {
    switch (status) {
      case "completed":
        return "text-green-600 bg-green-100";
      case "running":
        return "text-blue-600 bg-blue-100";
      case "paused":
        return "text-yellow-600 bg-yellow-100";
      case "failed":
        return "text-red-600 bg-red-100";
      default:
        return "text-gray-600 bg-gray-100";
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
          <div className="mb-6 p-4 bg-red-100 border border-red-300 text-red-700 rounded-lg">
            {error}
            <button
              onClick={() => setError(null)}
              className="ml-4 text-red-500 hover:text-red-700"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Current Sync Progress */}
        {currentProgress && !currentProgress.done && (
          <div className="mb-8 p-6 bg-white rounded-lg shadow-md">
            <div className="mb-4">
              <div className="flex justify-between text-sm text-gray-600 mb-1">
                <span>Progress: {currentProgress.progress}%</span>
                <span>
                  {formatNumber(currentProgress.itemsFetched)} /{" "}
                  {formatNumber(currentProgress.totalItems)} items
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-4">
                <div
                  className="bg-blue-600 h-4 rounded-full transition-all duration-300"
                  style={{ width: `${currentProgress.progress}%` }}
                />
              </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-4 mb-4 text-sm">
              <div>
                <span className="text-gray-500">Current ID:</span>{" "}
                <span className="font-mono">
                  {formatNumber(currentProgress.lastFetchedItem)}
                </span>
              </div>
              <div>
                <span className="text-gray-500">Target ID:</span>{" "}
                <span className="font-mono">
                  {formatNumber(currentProgress.targetEndItem)}
                </span>
              </div>
              <div>
                <span className="text-gray-500">Remaining:</span>{" "}
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
                <button
                  onClick={pauseSync}
                  className="px-6 py-2 bg-yellow-500 text-white rounded-lg hover:bg-yellow-600 transition"
                >
                  Pause Sync
                </button>
              ) : (
                <button
                  onClick={() => {
                    setSyncing(true);
                    setAutoSync(true);
                    processChunk(currentProgress.syncRunId);
                  }}
                  className="px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition"
                >
                  Continue Sync
                </button>
              )}
            </div>
          </div>
        )}

        {/* Start New Sync Buttons */}
        {!currentProgress || currentProgress.done ? (
          <div className="mb-8 flex gap-4">
            <button
              onClick={() => startSync("initial")}
              disabled={syncing || (itemCount !== null && itemCount > 0)}
              className="px-8 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
              title={itemCount !== null && itemCount > 0 ? "Initial sync is only available when the database is empty" : "Fetch the last 7 days of HN items"}
            >
              {syncing ? "Starting..." : "Initial Sync (Last 7 Days)"}
            </button>
            <button
              onClick={() => startSync("incremental")}
              disabled={syncing}
              className="px-8 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
              title="Fetch new items since last sync"
            >
              {syncing ? "Starting..." : "Incremental Sync"}
            </button>
            {itemCount !== null && (
              <span className="self-center text-sm text-gray-500">
                {itemCount.toLocaleString()} items in database
              </span>
            )}
          </div>
        ) : null}

        {/* Sync History Table */}
        <div className="bg-white rounded-lg shadow-md overflow-hidden">
          <h2 className="text-xl font-semibold p-6 border-b">Sync History</h2>

          {loading ? (
            <div className="p-8 text-center text-gray-500">Loading...</div>
          ) : runs.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              No sync runs yet. Start your first sync!
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">
                      ID
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">
                      Status
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">
                      Progress
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">
                      Items
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">
                      Range
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">
                      Started
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">
                      Completed
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {runs.map((run) => (
                    <tr key={run.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm font-mono">{run.id}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(
                            run.status
                          )}`}
                        >
                          {run.status}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-24 bg-gray-200 rounded-full h-2">
                            <div
                              className="bg-blue-600 h-2 rounded-full"
                              style={{ width: `${run.progress}%` }}
                            />
                          </div>
                          <span className="text-sm text-gray-600">
                            {run.progress}%
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm">
                        {formatNumber(run.itemsFetched)} /{" "}
                        {formatNumber(run.totalItems)}
                      </td>
                      <td className="px-4 py-3 text-sm font-mono text-gray-500">
                        {formatNumber(run.targetEndItem)} →{" "}
                        {formatNumber(run.startMaxItem)}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500">
                        {formatDate(run.startedAt)}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500">
                        {formatDate(run.completedAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
