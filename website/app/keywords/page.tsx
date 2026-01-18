"use client";

import { useState, useEffect } from "react";

interface Keyword {
  keyword: string;
  score: number;
}

interface ItemInfo {
  id: number;
  title: string | null;
  text: string | null;
  type: string;
  by: string | null;
  score: number | null;
}

interface AnalysisResult {
  success: boolean;
  items: ItemInfo[];
  itemCount: number;
  combinedTextLength: number;
  keywords: Keyword[];
}

interface DateRange {
  hasData: boolean;
  oldestDate?: string;
  newestDate?: string;
  totalCount?: number;
  storyCount?: number;
}

type InputMode = "ids" | "date";

export default function KeywordsPage() {
  const [inputMode, setInputMode] = useState<InputMode>("ids");
  const [inputValue, setInputValue] = useState("");
  const [dateValue, setDateValue] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [dateRange, setDateRange] = useState<DateRange | null>(null);

  // Fetch available date range on mount
  useEffect(() => {
    fetch("/api/keywords/range")
      .then((res) => res.json())
      .then((data) => setDateRange(data))
      .catch((err) => console.error("Failed to fetch date range:", err));
  }, []);

  // Parse input that may contain ranges like "123-456" or individual IDs
  const parseIds = (input: string): number[] => {
    const tokens = input
      .split(/[,\s]+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    const ids: number[] = [];

    for (const token of tokens) {
      // Check if it's a range (e.g., "46646256-46646356")
      const rangeMatch = token.match(/^(\d+)-(\d+)$/);
      if (rangeMatch) {
        const start = parseInt(rangeMatch[1], 10);
        const end = parseInt(rangeMatch[2], 10);
        if (!isNaN(start) && !isNaN(end)) {
          const min = Math.min(start, end);
          const max = Math.max(start, end);
          // Limit range to 6000 items to prevent abuse
          const limitedMax = Math.min(max, min + 6000);
          for (let i = min; i <= limitedMax; i++) {
            ids.push(i);
          }
        }
      } else {
        // Single ID
        const num = parseInt(token, 10);
        if (!isNaN(num)) {
          ids.push(num);
        }
      }
    }

    // Remove duplicates
    return [...new Set(ids)];
  };

  const handleAnalyze = async () => {
    setError(null);
    setResult(null);

    let requestBody: { itemIds?: number[]; date?: string; maxKeywords: number };

    if (inputMode === "date") {
      if (!dateValue) {
        setError("Please select a date");
        return;
      }
      requestBody = { date: dateValue, maxKeywords: 20 };
    } else {
      const itemIds = parseIds(inputValue);

      if (itemIds.length === 0) {
        setError("Please enter at least one valid post ID or range");
        return;
      }

      if (itemIds.length > 6000) {
        setError("Maximum 6000 posts allowed. Please use a smaller range.");
        return;
      }

      requestBody = { itemIds, maxKeywords: 20 };
    }

    setLoading(true);

    try {
      const response = await fetch("/api/keywords", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Failed to analyze keywords");
        return;
      }

      setResult(data);
    } catch (err) {
      setError(`Network error: ${err}`);
    } finally {
      setLoading(false);
    }
  };

  const getScoreColor = (score: number) => {
    // Lower scores are more relevant in YAKE
    if (score < 0.05) return "bg-emerald-500";
    if (score < 0.1) return "bg-teal-500";
    if (score < 0.2) return "bg-cyan-500";
    if (score < 0.4) return "bg-sky-500";
    return "bg-slate-500";
  };

  const getScoreWidth = (score: number, maxScore: number) => {
    // Invert because lower is better
    const normalized = 1 - score / maxScore;
    return Math.max(15, normalized * 100);
  };

  return (
    <div className="min-h-screen bg-[#0d1117] text-slate-100">
      {/* Header */}
      <header className="border-b border-slate-800 bg-[#161b22]">
        <div className="mx-auto max-w-5xl px-6 py-6">
          <h1 className="text-2xl font-bold tracking-tight text-white">
            <span className="text-emerald-400">⚡</span> Keyword Analyzer
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Find common keywords across multiple Hacker News posts
          </p>
          {/* Date Range Info */}
          {dateRange?.hasData && (
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
              <span className="text-slate-500">
                📅 Data available:{" "}
                <span className="text-slate-300">{dateRange.oldestDate}</span>
                {" → "}
                <span className="text-slate-300">{dateRange.newestDate}</span>
              </span>
              <span className="text-slate-500">
                📊 {dateRange.storyCount?.toLocaleString()} stories / {dateRange.totalCount?.toLocaleString()} total items
              </span>
            </div>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-10">
        {/* Input Section */}
        <div className="rounded-xl border border-slate-800 bg-[#161b22] p-6">
          {/* Mode Tabs */}
          <div className="mb-5 flex gap-2">
            <button
              onClick={() => setInputMode("ids")}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                inputMode === "ids"
                  ? "bg-emerald-600 text-white"
                  : "bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-slate-300"
              }`}
            >
              By Post IDs
            </button>
            <button
              onClick={() => setInputMode("date")}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                inputMode === "date"
                  ? "bg-emerald-600 text-white"
                  : "bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-slate-300"
              }`}
            >
              By Date
            </button>
          </div>

          {inputMode === "ids" ? (
            <>
              <label
                htmlFor="post-ids"
                className="mb-3 block text-sm font-medium text-slate-300"
              >
                Enter Post IDs
              </label>
              <div className="flex flex-col gap-4 sm:flex-row">
                <input
                  id="post-ids"
                  type="text"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  placeholder="e.g., 46646256-46646356 or 42607321, 42607322"
                  className="flex-1 rounded-lg border border-slate-700 bg-[#0d1117] px-4 py-3 text-white placeholder-slate-500 outline-none transition-colors focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                  onKeyDown={(e) => e.key === "Enter" && handleAnalyze()}
                />
                <button
                  onClick={handleAnalyze}
                  disabled={loading}
                  className="rounded-lg bg-emerald-600 px-8 py-3 font-semibold text-white transition-all hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {loading ? (
                    <span className="flex items-center gap-2">
                      <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24">
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                          fill="none"
                        />
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                        />
                      </svg>
                      Analyzing...
                    </span>
                  ) : (
                    "Analyze"
                  )}
                </button>
              </div>
              <p className="mt-3 text-xs text-slate-500">
                Use ranges (e.g., 123-456) or separate IDs with commas/spaces. Max 6000 posts.
              </p>
            </>
          ) : (
            <>
              <label
                htmlFor="date-picker"
                className="mb-3 block text-sm font-medium text-slate-300"
              >
                Select a Date
              </label>
              <div className="flex flex-col gap-4 sm:flex-row">
                <input
                  id="date-picker"
                  type="date"
                  value={dateValue}
                  onChange={(e) => setDateValue(e.target.value)}
                  className="flex-1 rounded-lg border border-slate-700 bg-[#0d1117] px-4 py-3 text-white outline-none transition-colors focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 [color-scheme:dark]"
                />
                <button
                  onClick={handleAnalyze}
                  disabled={loading}
                  className="rounded-lg bg-emerald-600 px-8 py-3 font-semibold text-white transition-all hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {loading ? (
                    <span className="flex items-center gap-2">
                      <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24">
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                          fill="none"
                        />
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                        />
                      </svg>
                      Analyzing...
                    </span>
                  ) : (
                    "Analyze"
                  )}
                </button>
              </div>
              <p className="mt-3 text-xs text-slate-500">
                Analyze all stories posted on the selected date (UTC). Limited to 1000 posts.
              </p>
            </>
          )}
        </div>

        {/* Error Display */}
        {error && (
          <div className="mt-6 rounded-lg border border-red-800 bg-red-950/50 px-5 py-4 text-red-300">
            <strong className="font-medium">Error:</strong> {error}
          </div>
        )}

        {/* Results */}
        {result && (
          <div className="mt-8 space-y-8">
            {/* Stats */}
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="rounded-lg border border-slate-800 bg-[#161b22] p-5">
                <div className="text-3xl font-bold text-emerald-400">
                  {result.itemCount}
                </div>
                <div className="mt-1 text-sm text-slate-400">Posts Analyzed</div>
              </div>
              <div className="rounded-lg border border-slate-800 bg-[#161b22] p-5">
                <div className="text-3xl font-bold text-cyan-400">
                  {result.keywords.length}
                </div>
                <div className="mt-1 text-sm text-slate-400">Keywords Found</div>
              </div>
              <div className="rounded-lg border border-slate-800 bg-[#161b22] p-5">
                <div className="text-3xl font-bold text-violet-400">
                  {result.combinedTextLength.toLocaleString()}
                </div>
                <div className="mt-1 text-sm text-slate-400">Characters Processed</div>
              </div>
            </div>

            {/* Keywords */}
            <div className="rounded-xl border border-slate-800 bg-[#161b22] p-6">
              <h2 className="mb-5 text-lg font-semibold text-white">
                Extracted Keywords
              </h2>
              <div className="space-y-3">
                {result.keywords.map((kw, idx) => {
                  const maxScore =
                    result.keywords[result.keywords.length - 1]?.score || 1;
                  return (
                    <div key={idx} className="flex items-center gap-4">
                      <span className="w-6 text-right text-sm text-slate-500">
                        {idx + 1}
                      </span>
                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-slate-200">
                            {kw.keyword}
                          </span>
                          <span className="text-xs text-slate-500">
                            {kw.score.toFixed(4)}
                          </span>
                        </div>
                        <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-slate-800">
                          <div
                            className={`h-full rounded-full ${getScoreColor(kw.score)} transition-all`}
                            style={{ width: `${getScoreWidth(kw.score, maxScore)}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Items List */}
            <div className="rounded-xl border border-slate-800 bg-[#161b22] p-6">
              <h2 className="mb-5 text-lg font-semibold text-white">
                Analyzed Posts
              </h2>
              <div className="space-y-4">
                {result.items.map((item) => (
                  <div
                    key={item.id}
                    className="rounded-lg border border-slate-800 bg-[#0d1117] p-4"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="rounded bg-slate-800 px-2 py-0.5 text-xs font-medium text-slate-400">
                            {item.type}
                          </span>
                          <span className="text-xs text-slate-500">#{item.id}</span>
                        </div>
                        {item.title && (
                          <a
                            href={`https://news.ycombinator.com/item?id=${item.id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="block font-medium text-slate-200 hover:text-emerald-400"
                          >
                            {item.title}
                          </a>
                        )}
                        {item.text && (
                          <p className="line-clamp-2 text-sm text-slate-400">
                            {item.text.replace(/<[^>]*>/g, " ").slice(0, 200)}...
                          </p>
                        )}
                      </div>
                      <div className="text-right text-sm text-slate-500">
                        {item.by && <div>by {item.by}</div>}
                        {item.score !== null && <div>{item.score} pts</div>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
