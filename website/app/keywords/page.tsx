"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";

interface KeywordTrend {
  keyword: string;
  currentRank: number;
  previousRank: number | null;
  rankChange: number | null;
  currentScore: number;
  variantCount: number;
  trend: "up" | "down" | "new" | "stable";
}

interface DailyTrends {
  date: string;
  itemCount: number;
  keywords: KeywordTrend[];
}

interface WeeklyMover {
  keyword: string;
  currentRank: number;
  startRank: number | null;
  weeklyChange: number | null;
  isNew: boolean;
}

interface TrendsData {
  success: boolean;
  dateRange: { from: string; to: string };
  totalDays: number;
  dailyTrends: DailyTrends[];
  topGainers: WeeklyMover[];
  topLosers: WeeklyMover[];
  newThisWeek: WeeklyMover[];
}

interface StatusData {
  itemCount: number;
  hasKeywords: boolean;
  dateRange: { min: string; max: string } | null;
}

const POLL_INTERVAL_SECONDS = 20;

export default function KeywordTrendsPage() {
  const [data, setData] = useState<TrendsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [status, setStatus] = useState<StatusData | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [extractionMessage, setExtractionMessage] = useState<string | null>(null);
  const [autoUpdate, setAutoUpdate] = useState(false);
  const [countdown, setCountdown] = useState(POLL_INTERVAL_SECONDS);
  const countdownRef = useRef<NodeJS.Timeout | null>(null);
  const pollRef = useRef<NodeJS.Timeout | null>(null);

  // Compare two trends data objects to see if they're different
  const hasDataChanged = useCallback((oldData: TrendsData | null, newData: TrendsData | null): boolean => {
    if (!oldData && !newData) return false;
    if (!oldData || !newData) return true;
    
    // Compare daily trends length and latest day's keywords
    if (oldData.dailyTrends.length !== newData.dailyTrends.length) return true;
    
    const oldLatest = oldData.dailyTrends[oldData.dailyTrends.length - 1];
    const newLatest = newData.dailyTrends[newData.dailyTrends.length - 1];
    
    if (!oldLatest || !newLatest) return true;
    if (oldLatest.date !== newLatest.date) return true;
    if (oldLatest.itemCount !== newLatest.itemCount) return true;
    if (oldLatest.keywords.length !== newLatest.keywords.length) return true;
    
    // Compare top keywords to detect ranking changes
    for (let i = 0; i < Math.min(10, oldLatest.keywords.length); i++) {
      if (oldLatest.keywords[i]?.keyword !== newLatest.keywords[i]?.keyword) return true;
      if (oldLatest.keywords[i]?.currentRank !== newLatest.keywords[i]?.currentRank) return true;
    }
    
    return false;
  }, []);

  const fetchTrends = useCallback((silent: boolean = false) => {
    if (!silent) {
      setLoading(true);
      setError(null);
    }
    fetch("/api/keywords/trends")
      .then((res) => res.json())
      .then((json) => {
        if (json.error) {
          // Check if it's just "no data" vs actual error
          if (json.error.includes("No daily keywords found")) {
            if (!silent) setData(null);
          } else {
            if (!silent) setError(json.error);
          }
        } else {
          // Only update if data has actually changed
          setData((prevData) => {
            if (hasDataChanged(prevData, json)) {
              return json;
            }
            return prevData;
          });
          // Select the latest date by default (only on initial load)
          if (!silent && json.dailyTrends?.length > 0) {
            setSelectedDate(json.dailyTrends[json.dailyTrends.length - 1].date);
          }
        }
      })
      .catch((err) => {
        if (!silent) setError(String(err));
      })
      .finally(() => {
        if (!silent) setLoading(false);
      });
  }, [hasDataChanged]);

  const fetchStatus = useCallback(() => {
    fetch("/api/keywords/status")
      .then((res) => res.json())
      .then((json) => {
        if (!json.error) {
          setStatus(json);
        }
      })
      .catch(() => {
        // Status fetch failure is not critical
      });
  }, []);

  const extractKeywords = async (force: boolean = false, silent: boolean = false) => {
    if (!silent) {
      setExtracting(true);
      setExtractionMessage(force ? "Re-extracting all keywords..." : "Extracting keywords from synced items...");
    }
    try {
      const url = force ? "/api/keywords/extract-daily?force=true" : "/api/keywords/extract-daily";
      const res = await fetch(url, { method: "POST" });
      const json = await res.json();
      if (json.error) {
        if (!silent) setExtractionMessage(`Error: ${json.error}`);
      } else if (json.daysProcessed === 0 && json.message) {
        // No new days to process - just silently refresh data
        fetchTrends(true);
        fetchStatus();
        if (!silent) {
          setExtractionMessage(json.message);
          setTimeout(() => setExtractionMessage(null), 2000);
        }
      } else {
        // New data extracted - refresh
        fetchTrends(silent);
        fetchStatus();
        if (!silent) {
          setExtractionMessage(`Extracted keywords for ${json.daysProcessed} new days! (${json.totalDaysWithKeywords} total)`);
          setTimeout(() => setExtractionMessage(null), 1500);
        }
      }
    } catch (err) {
      if (!silent) setExtractionMessage(`Error: ${String(err)}`);
    } finally {
      if (!silent) setExtracting(false);
    }
  };

  useEffect(() => {
    fetchTrends(false);
    fetchStatus();
  }, [fetchTrends, fetchStatus]);

  // Auto-update: periodically extract new keywords (silently)
  useEffect(() => {
    if (!autoUpdate) {
      // Clean up timers when disabled
      if (countdownRef.current) {
        clearInterval(countdownRef.current);
        countdownRef.current = null;
      }
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
      setCountdown(POLL_INTERVAL_SECONDS);
      return;
    }

    const autoExtract = async () => {
      setCountdown(POLL_INTERVAL_SECONDS);
      // Silent extraction - no UI updates unless data actually changes
      await extractKeywords(false, true);
    };

    // Initial silent extract
    autoExtract();

    // Set up the polling interval
    pollRef.current = setInterval(autoExtract, POLL_INTERVAL_SECONDS * 1000);

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
  }, [autoUpdate]);

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr + "T00:00:00");
    return date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  };

  const getTrendIcon = (trend: string) => {
    switch (trend) {
      case "up": return "📈";
      case "down": return "📉";
      case "new": return "🆕";
      default: return "➖";
    }
  };

  const getTrendColor = (trend: string) => {
    switch (trend) {
      case "up": return "text-emerald-400";
      case "down": return "text-red-400";
      case "new": return "text-cyan-400";
      default: return "text-slate-400";
    }
  };

  const getChangeDisplay = (change: number | null, isNew: boolean) => {
    if (isNew) return <span className="text-cyan-400">NEW</span>;
    if (change === null) return <span className="text-slate-500">-</span>;
    if (change > 0) return <span className="text-emerald-400">+{change}</span>;
    if (change < 0) return <span className="text-red-400">{change}</span>;
    return <span className="text-slate-400">0</span>;
  };

  const selectedDayData = data?.dailyTrends.find((d) => d.date === selectedDate);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0d1117]">
        <div className="text-slate-400">Loading trends...</div>
      </div>
    );
  }

  // Show empty state when no keyword data exists
  if (!data && !error) {
    return (
      <div className="min-h-screen bg-[#0d1117] text-slate-100">
        <header className="border-b border-slate-800 bg-[#161b22]">
          <div className="mx-auto max-w-6xl px-6 py-6">
            <h1 className="text-2xl font-bold tracking-tight text-white">
              <span className="text-emerald-400">📊</span> Keyword Trends
            </h1>
            <p className="mt-1 text-sm text-slate-400">
              Track trending topics on Hacker News
            </p>
          </div>
        </header>

        <main className="mx-auto max-w-2xl px-6 py-16">
          <div className="rounded-xl border border-slate-800 bg-[#161b22] p-8 text-center">
            <div className="mb-4 text-5xl">📭</div>
            <h2 className="mb-2 text-xl font-semibold text-white">No Keyword Data Yet</h2>
            <p className="mb-6 text-slate-400">
              Keyword trends need to be extracted from your synced Hacker News items.
            </p>

            {/* Status info */}
            {status && (
              <div className="mb-6 rounded-lg bg-[#0d1117] p-4 text-left">
                <h3 className="mb-2 text-sm font-medium text-slate-300">Database Status</h3>
                <div className="space-y-1 text-sm text-slate-400">
                  <div className="flex justify-between">
                    <span>Items synced:</span>
                    <span className={status.itemCount > 0 ? "text-emerald-400" : "text-yellow-400"}>
                      {status.itemCount.toLocaleString()}
                    </span>
                  </div>
                  {status.dateRange && (
                    <div className="flex justify-between">
                      <span>Date range:</span>
                      <span className="text-slate-300">
                        {status.dateRange.min} to {status.dateRange.max}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {status && status.itemCount === 0 ? (
              <div className="space-y-4">
                <p className="text-sm text-yellow-400">
                  You need to sync some data first before extracting keywords.
                </p>
                <a
                  href="/sync"
                  className="inline-block rounded-lg bg-purple-600 px-6 py-3 font-medium text-white hover:bg-purple-700 transition-colors"
                >
                  Go to Sync Page
                </a>
              </div>
            ) : (
              <div className="space-y-4">
                {extractionMessage && (
                  <div className={`rounded-lg p-3 text-sm ${
                    extractionMessage.startsWith("Error")
                      ? "bg-red-900/30 text-red-400"
                      : "bg-emerald-900/30 text-emerald-400"
                  }`}>
                    {extractionMessage}
                  </div>
                )}
                <button
                  onClick={() => extractKeywords(false)}
                  disabled={extracting}
                  className="inline-block rounded-lg bg-emerald-600 px-6 py-3 font-medium text-white hover:bg-emerald-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {extracting ? "Extracting..." : "Extract Keywords Now"}
                </button>
                <p className="text-xs text-slate-500">
                  This requires the keyword-service to be running locally on port 8000.
                  <br />
                  Run <code className="rounded bg-slate-800 px-1 py-0.5">cd keyword-service && python main.py</code>
                </p>
              </div>
            )}
          </div>
        </main>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[#0d1117] text-slate-100">
        <header className="border-b border-slate-800 bg-[#161b22]">
          <div className="mx-auto max-w-6xl px-6 py-6">
            <h1 className="text-2xl font-bold tracking-tight text-white">
              <span className="text-emerald-400">📊</span> Keyword Trends
            </h1>
          </div>
        </header>
        <main className="mx-auto max-w-2xl px-6 py-16">
          <div className="rounded-xl border border-red-800 bg-red-900/20 p-8 text-center">
            <div className="mb-4 text-4xl">⚠️</div>
            <h2 className="mb-2 text-xl font-semibold text-red-400">Error Loading Trends</h2>
            <p className="mb-4 text-slate-400">{error}</p>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0d1117] text-slate-100">
      {/* Header */}
      <header className="border-b border-slate-800 bg-[#161b22]">
        <div className="mx-auto max-w-6xl px-6 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link
                href="/"
                className="flex items-center gap-1 text-slate-400 hover:text-white transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                <span className="text-sm font-medium">Back</span>
              </Link>
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-white">
                  <span className="text-emerald-400">📊</span> Keyword Trends
                </h1>
                <p className="mt-1 text-sm text-slate-400">
                  Track trending topics on Hacker News • {data?.dateRange.from} to {data?.dateRange.to}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {extractionMessage && (
                <span className={`text-sm ${
                  extractionMessage.startsWith("Error") ? "text-red-400" : "text-emerald-400"
                }`}>
                  {extractionMessage}
                </span>
              )}

              {/* Auto-Update Controls */}
              {autoUpdate && (
                <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-800 rounded-lg border border-slate-700">
                  <div className="relative w-6 h-6">
                    <svg className="w-6 h-6 transform -rotate-90">
                      <circle
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="#374151"
                        strokeWidth="2"
                        fill="none"
                      />
                      <circle
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="#10b981"
                        strokeWidth="2"
                        fill="none"
                        strokeDasharray={`${(countdown / POLL_INTERVAL_SECONDS) * 63} 63`}
                        className="transition-all duration-1000 ease-linear"
                      />
                    </svg>
                    <span className="absolute inset-0 flex items-center justify-center text-[10px] font-medium text-slate-300">
                      {countdown}
                    </span>
                  </div>
                  <span className="text-xs text-slate-400">Next update</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8">
        {/* Weekly Movers */}
        <div className="mb-8 grid gap-6 lg:grid-cols-3">
          {/* Top Gainers */}
          <div className="rounded-xl border border-slate-800 bg-[#161b22] p-5">
            <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-emerald-400">
              <span>🚀</span> Top Gainers
            </h2>
            <div className="space-y-2">
              {data?.topGainers.map((mover, idx) => (
                <div key={idx} className="flex items-center justify-between rounded-lg bg-[#0d1117] px-3 py-2">
                  <span className="font-medium text-slate-200">{mover.keyword}</span>
                  <span className="text-emerald-400 font-mono">
                    +{mover.weeklyChange} ranks
                  </span>
                </div>
              ))}
              {data?.topGainers.length === 0 && (
                <div className="text-sm text-slate-500">No gainers this week</div>
              )}
            </div>
          </div>

          {/* Top Losers */}
          <div className="rounded-xl border border-slate-800 bg-[#161b22] p-5">
            <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-red-400">
              <span>📉</span> Top Losers
            </h2>
            <div className="space-y-2">
              {data?.topLosers.map((mover, idx) => (
                <div key={idx} className="flex items-center justify-between rounded-lg bg-[#0d1117] px-3 py-2">
                  <span className="font-medium text-slate-200">{mover.keyword}</span>
                  <span className="text-red-400 font-mono">
                    {mover.weeklyChange} ranks
                  </span>
                </div>
              ))}
              {data?.topLosers.length === 0 && (
                <div className="text-sm text-slate-500">No losers this week</div>
              )}
            </div>
          </div>

          {/* New This Week */}
          <div className="rounded-xl border border-slate-800 bg-[#161b22] p-5">
            <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-cyan-400">
              <span>🆕</span> New This Week
            </h2>
            <div className="space-y-2">
              {data?.newThisWeek.map((mover, idx) => (
                <div key={idx} className="flex items-center justify-between rounded-lg bg-[#0d1117] px-3 py-2">
                  <span className="font-medium text-slate-200">{mover.keyword}</span>
                  <span className="text-cyan-400 font-mono">
                    #{mover.currentRank}
                  </span>
                </div>
              ))}
              {data?.newThisWeek.length === 0 && (
                <div className="text-sm text-slate-500">No new keywords</div>
              )}
            </div>
          </div>
        </div>

        {/* Date Selector */}
        <div className="mb-6 flex flex-wrap gap-2">
          {data?.dailyTrends.map((day) => (
            <button
              key={day.date}
              onClick={() => setSelectedDate(day.date)}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                selectedDate === day.date
                  ? "bg-emerald-600 text-white"
                  : "bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-slate-300"
              }`}
            >
              {formatDate(day.date)}
            </button>
          ))}
        </div>

        {/* Daily Keywords Table */}
        {selectedDayData && (
          <div className="rounded-xl border border-slate-800 bg-[#161b22] overflow-hidden">
            <div className="border-b border-slate-800 bg-[#1c2128] px-6 py-4">
              <h2 className="text-lg font-semibold text-white">
                {formatDate(selectedDayData.date)}
              </h2>
              <p className="text-sm text-slate-400">
                {selectedDayData.itemCount.toLocaleString()} posts & comments analyzed
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-800 text-left text-sm text-slate-400">
                    <th className="px-6 py-3 font-medium">Rank</th>
                    <th className="px-6 py-3 font-medium">Keyword</th>
                    <th className="px-6 py-3 font-medium text-center">Trend</th>
                    <th className="px-6 py-3 font-medium text-right">Change</th>
                    <th className="px-6 py-3 font-medium text-right">Variants</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedDayData.keywords.slice(0, 30).map((kw, idx) => (
                    <tr
                      key={idx}
                      className="border-b border-slate-800/50 hover:bg-[#1c2128] transition-colors"
                    >
                      <td className="px-6 py-3">
                        <span className="font-mono text-slate-300">#{kw.currentRank}</span>
                      </td>
                      <td className="px-6 py-3">
                        <span className="font-medium text-white">{kw.keyword}</span>
                      </td>
                      <td className="px-6 py-3 text-center">
                        <span className={getTrendColor(kw.trend)}>
                          {getTrendIcon(kw.trend)}
                        </span>
                      </td>
                      <td className="px-6 py-3 text-right font-mono">
                        {getChangeDisplay(kw.rankChange, kw.trend === "new")}
                      </td>
                      <td className="px-6 py-3 text-right">
                        <span className="text-slate-400">{kw.variantCount}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {selectedDayData.keywords.length > 30 && (
              <div className="border-t border-slate-800 px-6 py-3 text-center text-sm text-slate-500">
                Showing top 30 of {selectedDayData.keywords.length} keywords
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
