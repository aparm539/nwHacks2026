"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";

interface StoryItem {
  id: number;
  type: string;
  title: string | null;
  text: string | null;
  by: string | null;
  time: number;
  url: string | null;
  score: number | null;
  descendants: number | null;
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
  topGainers: WeeklyMover[];
  topLosers: WeeklyMover[];
  newThisWeek: WeeklyMover[];
}

// Helper to format relative time
const formatTimeAgo = (unixTime: number): string => {
  const now = Date.now() / 1000;
  const diff = now - unixTime;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return `${Math.floor(diff / 604800)}w ago`;
};

// Helper to decode HTML entities from HN data
const decodeHtmlEntities = (text: string): string => {
  return text
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, "/")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
};

// Extract domain from URL
const getDomain = (url: string): string => {
  try {
    const hostname = new URL(url).hostname;
    return hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
};

export default function Home() {
  const [stories, setStories] = useState<StoryItem[]>([]);
  const [trends, setTrends] = useState<TrendsData | null>(null);
  const [loadingStories, setLoadingStories] = useState(true);
  const [loadingTrends, setLoadingTrends] = useState(true);

  useEffect(() => {
    // Fetch top stories from the past 24 hours, sorted by score
    fetch("/api/items/top?limit=20&hours=24")
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.items) {
          setStories(data.items);
        }
      })
      .catch(console.error)
      .finally(() => setLoadingStories(false));

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
        <div className="flex flex-col lg:flex-row gap-8">
          {/* Left: Story Feed */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold text-white">Today&apos;s Top Stories</h3>
              <span className="text-sm text-slate-500">past 24 hours</span>
            </div>

            {loadingStories ? (
              <div className="space-y-4">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="rounded-xl border border-slate-800 bg-[#161b22] p-5 animate-pulse">
                    <div className="h-5 bg-slate-800 rounded w-3/4 mb-3" />
                    <div className="h-4 bg-slate-800 rounded w-1/4" />
                  </div>
                ))}
              </div>
            ) : stories.length === 0 ? (
              <div className="rounded-xl border border-slate-800 bg-[#161b22] p-8 text-center">
                <p className="text-slate-400">No stories yet. Run a sync to fetch data.</p>
                <Link
                  href="/sync"
                  className="inline-block mt-4 px-4 py-2 rounded-lg bg-slate-700 text-white text-sm hover:bg-slate-600 transition-colors"
                >
                  Go to Sync
                </Link>
              </div>
            ) : (
              <div className="space-y-4">
                {stories.map((story) => (
                  <article
                    key={story.id}
                    className="rounded-xl border border-slate-800 bg-[#161b22] p-5 hover:border-slate-700 transition-colors"
                  >
                    <a
                      href={story.url || `https://news.ycombinator.com/item?id=${story.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block group"
                    >
                      <h4 className="text-lg font-semibold text-white group-hover:text-slate-300 transition-colors mb-2">
                        {story.title && decodeHtmlEntities(story.title)}
                      </h4>
                    </a>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-500">
                      {story.score !== null && story.score > 0 && (
                        <span className="flex items-center gap-1">
                          <svg className="w-4 h-4 text-slate-400" fill="currentColor" viewBox="0 0 20 20">
                            <path d="M10 3.5L12.5 8.5L18 9.5L14 13.5L15 19L10 16L5 19L6 13.5L2 9.5L7.5 8.5L10 3.5Z" />
                          </svg>
                          <span className="text-slate-300">{story.score}</span>
                        </span>
                      )}
                      {story.by && (
                        <span>
                          by <span className="text-slate-400">{story.by}</span>
                        </span>
                      )}
                      <span>{formatTimeAgo(story.time)}</span>
                      {story.descendants !== null && story.descendants > 0 && (
                        <span className="flex items-center gap-1">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                          </svg>
                          {story.descendants}
                        </span>
                      )}
                      {story.url && (
                        <span className="text-slate-600">({getDomain(story.url)})</span>
                      )}
                    </div>
                    <div className="mt-3 flex gap-2">
                      <a
                        href={`https://news.ycombinator.com/item?id=${story.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
                      >
                        View on HN
                      </a>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>

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
                  <h3 className="text-lg font-bold text-slate-200 flex items-center gap-2">
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
                          <span className="text-white text-xs font-medium px-2 py-0.5 rounded bg-slate-700">
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
