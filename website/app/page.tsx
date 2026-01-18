"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";

interface WeeklyMover {
  keyword: string;
  currentRank: number;
  startRank: number | null;
  weeklyChange: number | null;
  isNew: boolean;
}

interface TrendsData {
  success: boolean;
  topGainers: WeeklyMover[];
  topLosers: WeeklyMover[];
  newThisWeek: WeeklyMover[];
}

export default function Home() {
  const [trends, setTrends] = useState<TrendsData | null>(null);
  const [loadingTrends, setLoadingTrends] = useState(true);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  useEffect(() => {
    // Fetch keyword trends
    fetch("/api/keywords/trends")
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          setTrends(data);
          // Select the latest date by default
          if (data.dailyTrends?.length > 0) {
            setSelectedDate(data.dailyTrends[data.dailyTrends.length - 1].date);
          }
        }
      })
      .catch(console.error)
      .finally(() => setLoadingTrends(false));
  }, []);
  // Helper functions for table display
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
  const selectedDayData = trends?.dailyTrends.find((d) => d.date === selectedDate);

  return (
    <div className="min-h-screen bg-[#0d1117] text-slate-100">
      {/* Header */}
      <header className="border-b border-slate-800 bg-[#161b22]">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-6">
              <div className="bg-white rounded-lg p-2.5">
                <Image
                  src="/espn-logo-transparent.png"
                  alt="ESPN Logo"
                  width={100}
                  height={50}
                  className="object-contain"
                />
              </div>
              <nav className="flex items-center gap-4">
                <Link
                  href="/sync"
                  className="text-sm text-slate-400 hover:text-white transition-colors"
                >
                  Sync
                </Link>
                <Link
                  href="/keywords"
                  className="text-sm text-slate-400 hover:text-white transition-colors"
                >
                  Keywords
                </Link>
              </nav>
            </div>
            <Link
              href="/draft"
              className="px-4 py-2 rounded-lg bg-white text-black text-sm font-medium hover:bg-slate-200 transition-colors"
            >
              Draft
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative overflow-hidden border-b border-slate-800 bg-gradient-to-br from-[#161b22] via-[#0d1117] to-[#161b22]">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml,%3Csvg%20width%3D%2260%22%20height%3D%2260%22%20viewBox%3D%220%200%2060%2060%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3Cg%20fill%3D%22none%22%20fill-rule%3D%22evenodd%22%3E%3Cg%20fill%3D%22%23374151%22%20fill-opacity%3D%220.1%22%3E%3Cpath%20d%3D%22M36%2034v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6%2034v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6%204V0H4v4H0v2h4v4h2V6h4V4H6z%22%2F%3E%3C%2Fg%3E%3C%2Fg%3E%3C%2Fsvg%3E')] opacity-50" />
        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 py-12 sm:py-16">
          <div className="max-w-2xl">
            <h2 className="text-4xl sm:text-5xl font-bold text-white tracking-tight mb-4">
              Fantasy <span className="text-slate-300">Tech News</span>
            </h2>
            <p className="text-lg text-slate-400 mb-8">
              Draft trending keywords from Hacker News and score points as they appear in new stories. 
              Compete against AI opponents in real-time.
            </p>
            <Link
              href="/draft"
              className="inline-flex items-center gap-2 px-8 py-4 rounded-xl bg-white text-black text-lg font-semibold hover:bg-slate-200 transition-colors shadow-lg shadow-black/30"
            >
              <span>Start Draft</span>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </Link>
          </div>
        </div>
      </section>

      {/* Main Content */}
      <main className="mx-auto max-w-7xl px-4 sm:px-6 py-8">
        {/* Weekly Movers Section - grid style like keywords page */}
        <div className="mb-8 grid gap-6 lg:grid-cols-3">
          {/* Top Gainers */}
          <div className="rounded-xl border border-slate-800 bg-[#161b22] p-5">
            <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-emerald-400">
              <span>🚀</span> Top Gainers
            </h2>
            <div className="space-y-2">
              {loadingTrends ? (
                [...Array(5)].map((_, i) => (
                  <div key={i} className="h-10 bg-slate-800 rounded-lg animate-pulse" />
                ))
              ) : trends?.topGainers && trends.topGainers.length > 0 ? (
                trends.topGainers.slice(0, 5).map((mover, idx) => (
                  <div key={idx} className="flex items-center justify-between rounded-lg bg-[#0d1117] px-3 py-2">
                    <span className="font-medium text-slate-200">{mover.keyword}</span>
                    <span className="text-emerald-400 font-mono">
                      +{mover.weeklyChange} ranks
                    </span>
                  </div>
                ))
              ) : (
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
              {loadingTrends ? (
                [...Array(5)].map((_, i) => (
                  <div key={i} className="h-10 bg-slate-800 rounded-lg animate-pulse" />
                ))
              ) : trends?.topLosers && trends.topLosers.length > 0 ? (
                trends.topLosers.slice(0, 5).map((mover, idx) => (
                  <div key={idx} className="flex items-center justify-between rounded-lg bg-[#0d1117] px-3 py-2">
                    <span className="font-medium text-slate-200">{mover.keyword}</span>
                    <span className="text-red-400 font-mono">
                      {mover.weeklyChange} ranks
                    </span>
                  </div>
                ))
              ) : (
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
              {loadingTrends ? (
                [...Array(5)].map((_, i) => (
                  <div key={i} className="h-10 bg-slate-800 rounded-lg animate-pulse" />
                ))
              ) : trends?.newThisWeek && trends.newThisWeek.length > 0 ? (
                trends.newThisWeek.slice(0, 5).map((mover, idx) => (
                  <div key={idx} className="flex items-center justify-between rounded-lg bg-[#0d1117] px-3 py-2">
                    <span className="font-medium text-slate-200">{mover.keyword}</span>
                    <span className="text-cyan-400 font-mono">
                      #{mover.currentRank}
                    </span>
                  </div>
                ))
              ) : (
                <div className="text-sm text-slate-500">No new keywords</div>
              )}
            </div>
          </div>
        </div>


        {/* Daily Trends Selector - always visible */}
        {trends?.dailyTrends && (
          <div className="mb-6 flex flex-wrap gap-2">
            {trends.dailyTrends.map((day) => (
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
        )}

        {/* Daily Keywords Table - shown if a day is selected */}
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
