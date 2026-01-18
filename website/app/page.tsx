"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

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
 useEffect(() => {
  // Fetch keyword trends
    fetch("/api/keywords/trends")
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          setTrends(data);
        }
      })
      .catch(console.error)
      .finally(() => setLoadingTrends(false));
  }, []);

  return (
    <div className="min-h-screen bg-[#0d1117] text-slate-100">
      {/* Header */}
      <header className="border-b border-slate-800 bg-[#161b22]">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-4">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold text-white tracking-tight">
              hacker<span className="text-emerald-400">Draft</span>
            </h1>
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
              <Link
                href="/draft"
                className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 transition-colors"
              >
                Draft
              </Link>
            </nav>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative overflow-hidden border-b border-slate-800 bg-gradient-to-br from-[#161b22] via-[#0d1117] to-[#161b22]">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml,%3Csvg%20width%3D%2260%22%20height%3D%2260%22%20viewBox%3D%220%200%2060%2060%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3Cg%20fill%3D%22none%22%20fill-rule%3D%22evenodd%22%3E%3Cg%20fill%3D%22%23374151%22%20fill-opacity%3D%220.1%22%3E%3Cpath%20d%3D%22M36%2034v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6%2034v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6%204V0H4v4H0v2h4v4h2V6h4V4H6z%22%2F%3E%3C%2Fg%3E%3C%2Fg%3E%3C%2Fsvg%3E')] opacity-50" />
        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 py-12 sm:py-16">
          <div className="max-w-2xl">
            <h2 className="text-4xl sm:text-5xl font-bold text-white tracking-tight mb-4">
              Fantasy <span className="text-emerald-400">Tech News</span>
            </h2>
            <p className="text-lg text-slate-400 mb-8">
              Draft trending keywords from Hacker News and score points as they appear in new stories. 
              Compete against AI opponents in real-time.
            </p>
            <Link
              href="/draft"
              className="inline-flex items-center gap-2 px-8 py-4 rounded-xl bg-emerald-600 text-white text-lg font-semibold hover:bg-emerald-500 transition-colors shadow-lg shadow-emerald-900/30"
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
        <div className="flex flex-col lg:flex-row gap-8">

          {/* Right: Keyword Rankings Sidebar */}
          <aside className="w-full lg:w-80 flex-shrink-0">
            <div className="sticky top-8 space-y-6">
              {/* Top Gainers */}
              <div className="rounded-xl border border-slate-800 bg-[#161b22] overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-800 bg-[#1c2128]">
                  <h3 className="text-lg font-bold text-emerald-400 flex items-center gap-2">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                    </svg>
                    Top Movers
                  </h3>
                </div>
                <div className="p-4">
                  {loadingTrends ? (
                    <div className="space-y-2">
                      {[...Array(5)].map((_, i) => (
                        <div key={i} className="h-10 bg-slate-800 rounded-lg animate-pulse" />
                      ))}
                    </div>
                  ) : trends?.topGainers && trends.topGainers.length > 0 ? (
                    <div className="space-y-2">
                      {trends.topGainers.slice(0, 5).map((kw, idx) => (
                        <div
                          key={idx}
                          className="flex items-center justify-between rounded-lg bg-[#0d1117] px-4 py-2.5"
                        >
                          <div className="flex items-center gap-3">
                            <span className="text-xs font-mono text-slate-600">#{kw.currentRank}</span>
                            <span className="font-medium text-white">{kw.keyword}</span>
                          </div>
                          <span className="text-emerald-400 font-semibold text-sm flex items-center gap-1">
                            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M5.293 9.707a1 1 0 010-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 01-1.414 1.414L11 7.414V15a1 1 0 11-2 0V7.414L6.707 9.707a1 1 0 01-1.414 0z" clipRule="evenodd" />
                            </svg>
                            +{kw.weeklyChange}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-slate-500 text-center py-4">No data yet</p>
                  )}
                </div>
              </div>

              {/* Top Losers */}
              <div className="rounded-xl border border-slate-800 bg-[#161b22] overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-800 bg-[#1c2128]">
                  <h3 className="text-lg font-bold text-red-400 flex items-center gap-2">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 17h8m0 0V9m0 8l-8-8-4 4-6-6" />
                    </svg>
                    Falling
                  </h3>
                </div>
                <div className="p-4">
                  {loadingTrends ? (
                    <div className="space-y-2">
                      {[...Array(5)].map((_, i) => (
                        <div key={i} className="h-10 bg-slate-800 rounded-lg animate-pulse" />
                      ))}
                    </div>
                  ) : trends?.topLosers && trends.topLosers.length > 0 ? (
                    <div className="space-y-2">
                      {trends.topLosers.slice(0, 5).map((kw, idx) => (
                        <div
                          key={idx}
                          className="flex items-center justify-between rounded-lg bg-[#0d1117] px-4 py-2.5"
                        >
                          <div className="flex items-center gap-3">
                            <span className="text-xs font-mono text-slate-600">#{kw.currentRank}</span>
                            <span className="font-medium text-white">{kw.keyword}</span>
                          </div>
                          <span className="text-red-400 font-semibold text-sm flex items-center gap-1">
                            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M14.707 10.293a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 111.414-1.414L9 12.586V5a1 1 0 012 0v7.586l2.293-2.293a1 1 0 011.414 0z" clipRule="evenodd" />
                            </svg>
                            {kw.weeklyChange}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-slate-500 text-center py-4">No data yet</p>
                  )}
                </div>
              </div>

              {/* New This Week */}
              <div className="rounded-xl border border-slate-800 bg-[#161b22] overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-800 bg-[#1c2128]">
                  <h3 className="text-lg font-bold text-cyan-400 flex items-center gap-2">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                    </svg>
                    New This Week
                  </h3>
                </div>
                <div className="p-4">
                  {loadingTrends ? (
                    <div className="space-y-2">
                      {[...Array(5)].map((_, i) => (
                        <div key={i} className="h-10 bg-slate-800 rounded-lg animate-pulse" />
                      ))}
                    </div>
                  ) : trends?.newThisWeek && trends.newThisWeek.length > 0 ? (
                    <div className="space-y-2">
                      {trends.newThisWeek.slice(0, 5).map((kw, idx) => (
                        <div
                          key={idx}
                          className="flex items-center justify-between rounded-lg bg-[#0d1117] px-4 py-2.5"
                        >
                          <div className="flex items-center gap-3">
                            <span className="text-xs font-mono text-slate-600">#{kw.currentRank}</span>
                            <span className="font-medium text-white">{kw.keyword}</span>
                          </div>
                          <span className="text-cyan-400 text-xs font-medium px-2 py-0.5 rounded bg-cyan-900/30">
                            NEW
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-slate-500 text-center py-4">No new keywords</p>
                  )}
                </div>
              </div>

              {/* View All Link */}
              <Link
                href="/keywords"
                className="block text-center text-sm text-slate-400 hover:text-white transition-colors py-2"
              >
                View All Keywords →
              </Link>
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}
