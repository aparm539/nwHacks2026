"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import Link from "next/link";

// Types
interface KeywordTrend {
  keyword: string;
  currentRank: number;
  previousRank: number | null;
  rankChange: number | null;
  currentScore: number;
  variantCount: number;
  trend: "up" | "down" | "new" | "stable";
  // Stats from keywordStats table
  lastSeenTime: number | null;
  firstSeenTime: number | null;
  totalDaysAppeared: number | null;
}

// Helper to format relative time
const formatLastSeen = (unixTime: number | null): string => {
  if (!unixTime) return "Unknown";
  const now = Date.now() / 1000;
  const diff = now - unixTime;
  if (diff < 60) return "Just now";
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

// Helper to extract a text snippet that includes keywords
const extractTextWithKeywords = (
  text: string,
  keywords: string[],
  maxLength: number = 300
): { text: string; hasPrefix: boolean } => {
  if (!text || text.length <= maxLength) {
    return { text, hasPrefix: false };
  }

  // Clean the text first
  const cleanText = text.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  
  if (cleanText.length <= maxLength) {
    return { text: cleanText, hasPrefix: false };
  }

  // If no keywords, just return the start
  if (keywords.length === 0) {
    return { text: cleanText.slice(0, maxLength), hasPrefix: false };
  }

  // Find the first keyword occurrence
  const lowerText = cleanText.toLowerCase();
  let firstKeywordIndex = -1;
  let firstKeyword = '';

  for (const keyword of keywords) {
    const escapedKeyword = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`\\b${escapedKeyword}\\b`, 'i');
    const match = lowerText.match(pattern);
    if (match && match.index !== undefined) {
      if (firstKeywordIndex === -1 || match.index < firstKeywordIndex) {
        firstKeywordIndex = match.index;
        firstKeyword = keyword;
      }
    }
  }

  // If keyword is in the first part of text, just show from start
  if (firstKeywordIndex === -1 || firstKeywordIndex < maxLength - 50) {
    return { text: cleanText.slice(0, maxLength), hasPrefix: false };
  }

  // Otherwise, start from a bit before the keyword
  const startIndex = Math.max(0, firstKeywordIndex - 50);
  const snippet = cleanText.slice(startIndex, startIndex + maxLength);
  
  return { 
    text: snippet, 
    hasPrefix: startIndex > 0 
  };
};

interface DailyTrends {
  date: string;
  itemCount: number;
  keywords: KeywordTrend[];
}

interface TrendsData {
  success: boolean;
  dateRange: { from: string; to: string };
  totalDays: number;
  dailyTrends: DailyTrends[];
}

interface Player {
  id: number;
  name: string;
  isHuman: boolean;
  color: string;
}

interface PickHistoryItem {
  playerId: number;
  keyword: string;
  rank: number;
  round: number;
  pickNumber: number;
}

interface DraftState {
  phase: "setup" | "drafting" | "complete";
  players: Player[];
  humanPlayerId: number;
  rosters: Record<number, string[]>;
  availableKeywords: KeywordTrend[];
  currentPickIndex: number; // overall pick number (0-indexed)
  currentRound: number;
  totalRounds: number;
  pickHistory: PickHistoryItem[];
}

interface RecentItem {
  id: number;
  type: string;
  title: string | null;
  text: string | null;
  by: string | null;
  time: number;
  url: string | null;
  score: number | null;
}

// Constants
const AI_NAMES = ["Bot Alpha", "Bot Beta", "Bot Gamma", "Bot Delta", "Bot Epsilon", "Bot Zeta", "Bot Eta"];
const POLL_INTERVAL_SECONDS = 20;
const PLAYER_COLORS = [
  "bg-emerald-500", // Human
  "bg-blue-500",
  "bg-purple-500", 
  "bg-orange-500",
  "bg-pink-500",
  "bg-cyan-500",
  "bg-yellow-500",
  "bg-red-500",
];

export default function DraftPage() {
  // Draft state
  const [draftState, setDraftState] = useState<DraftState>({
    phase: "setup",
    players: [],
    humanPlayerId: 0,
    rosters: {},
    availableKeywords: [],
    currentPickIndex: 0,
    currentRound: 1,
    totalRounds: 5,
    pickHistory: [],
  });

  // Setup form state
  const [playerName, setPlayerName] = useState("Player");
  const [aiCount, setAiCount] = useState(3);
  const [rounds, setRounds] = useState(5);
  const [draftPosition, setDraftPosition] = useState<"first" | "last" | "random">("first");

  // UI state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<"rank" | "recent">("rank");
  const [aiThinking, setAiThinking] = useState(false);

  const aiTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pollRef = useRef<NodeJS.Timeout | null>(null);
  const countdownRef = useRef<NodeJS.Timeout | null>(null);
  const [countdown, setCountdown] = useState(POLL_INTERVAL_SECONDS);
  const [recentItems, setRecentItems] = useState<RecentItem[]>([]);
  const draftCompletedAtItemId = useRef<number | null>(null);
  const seenItemIds = useRef<Set<number>>(new Set());

  // Calculate current picker based on snake draft order
  const getCurrentPicker = useCallback((pickIndex: number, players: Player[]): Player => {
    const numPlayers = players.length;
    const round = Math.floor(pickIndex / numPlayers);
    const positionInRound = pickIndex % numPlayers;
    
    // Snake: even rounds go forward, odd rounds go backward
    const isReversed = round % 2 === 1;
    const playerIndex = isReversed ? numPlayers - 1 - positionInRound : positionInRound;
    
    return players[playerIndex];
  }, []);

  // Get the current picker
  const currentPicker = draftState.players.length > 0 
    ? getCurrentPicker(draftState.currentPickIndex, draftState.players)
    : null;

  const isHumanTurn = currentPicker?.isHuman ?? false;

  // Fetch keywords and start draft
  const startDraft = async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/keywords/trends");
      const data: TrendsData = await res.json();

      if (!data.success || !data.dailyTrends?.length) {
        throw new Error("No keyword data available. Please extract keywords first.");
      }

      // Use the latest day's keywords
      const latestDay = data.dailyTrends[data.dailyTrends.length - 1];
      const keywords = latestDay.keywords;

      if (keywords.length < (aiCount + 1) * rounds) {
        throw new Error(`Not enough keywords. Need at least ${(aiCount + 1) * rounds}, but only have ${keywords.length}.`);
      }

      // Create players
      const players: Player[] = [];
      let humanPosition = 0;
      
      if (draftPosition === "last") {
        humanPosition = aiCount;
      } else if (draftPosition === "random") {
        humanPosition = Math.floor(Math.random() * (aiCount + 1));
      }

      for (let i = 0; i <= aiCount; i++) {
        if (i === humanPosition) {
          players.push({
            id: i,
            name: playerName || "Player",
            isHuman: true,
            color: PLAYER_COLORS[0],
          });
        } else {
          const aiIndex = i < humanPosition ? i : i - 1;
          players.push({
            id: i,
            name: AI_NAMES[aiIndex] || `Bot ${aiIndex + 1}`,
            isHuman: false,
            color: PLAYER_COLORS[(i % (PLAYER_COLORS.length - 1)) + 1],
          });
        }
      }

      // Initialize rosters
      const rosters: Record<number, string[]> = {};
      players.forEach(p => rosters[p.id] = []);

      setDraftState({
        phase: "drafting",
        players,
        humanPlayerId: players.find(p => p.isHuman)!.id,
        rosters,
        availableKeywords: keywords,
        currentPickIndex: 0,
        currentRound: 1,
        totalRounds: rounds,
        pickHistory: [],
      });
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  // Make a pick
  const makePick = useCallback((keyword: string) => {
    setDraftState(prev => {
      const picker = getCurrentPicker(prev.currentPickIndex, prev.players);
      const keywordData = prev.availableKeywords.find(k => k.keyword === keyword);
      if (!keywordData) return prev;

      const newRosters = { ...prev.rosters };
      newRosters[picker.id] = [...newRosters[picker.id], keyword];

      const newAvailable = prev.availableKeywords.filter(k => k.keyword !== keyword);
      const newPickIndex = prev.currentPickIndex + 1;
      const newRound = Math.floor(newPickIndex / prev.players.length) + 1;

      const totalPicks = prev.players.length * prev.totalRounds;
      const isComplete = newPickIndex >= totalPicks;

      const newHistory: PickHistoryItem = {
        playerId: picker.id,
        keyword,
        rank: keywordData.currentRank,
        round: prev.currentRound,
        pickNumber: prev.currentPickIndex + 1,
      };

      return {
        ...prev,
        rosters: newRosters,
        availableKeywords: newAvailable,
        currentPickIndex: newPickIndex,
        currentRound: newRound,
        pickHistory: [...prev.pickHistory, newHistory],
        phase: isComplete ? "complete" : "drafting",
      };
    });
  }, [getCurrentPicker]);

  // AI auto-pick logic
  useEffect(() => {
    if (draftState.phase !== "drafting") return;
    if (!currentPicker || currentPicker.isHuman) return;

    // AI's turn - pick after delay
    setAiThinking(true);
    
    const delay = 800 + Math.random() * 600; // 800-1400ms
    aiTimeoutRef.current = setTimeout(() => {
      // AI picks highest ranked available keyword
      const bestKeyword = draftState.availableKeywords[0]; // Already sorted by rank
      if (bestKeyword) {
        makePick(bestKeyword.keyword);
      }
      setAiThinking(false);
    }, delay);

    return () => {
      if (aiTimeoutRef.current) {
        clearTimeout(aiTimeoutRef.current);
      }
    };
  }, [draftState.phase, draftState.currentPickIndex, currentPicker, draftState.availableKeywords, makePick]);

  // Silent refresh of keywords (for auto-update)
  const silentRefreshKeywords = useCallback(async () => {
    try {
      // First trigger extraction silently
      await fetch("/api/keywords/extract-daily", { method: "POST" });
      
      // Then fetch fresh trends
      const res = await fetch("/api/keywords/trends");
      const data: TrendsData = await res.json();
      
      if (!data.success || !data.dailyTrends?.length) return;
      
      const latestDay = data.dailyTrends[data.dailyTrends.length - 1];
      const freshKeywords = latestDay.keywords;
      
      // Update available keywords, filtering out already picked ones
      setDraftState(prev => {
        if (prev.phase !== "drafting") return prev;
        
        // Get all picked keywords
        const pickedKeywords = new Set(prev.pickHistory.map(p => p.keyword));
        
        // Filter fresh keywords to remove picked ones
        const updatedAvailable = freshKeywords.filter(k => !pickedKeywords.has(k.keyword));
        
        return {
          ...prev,
          availableKeywords: updatedAvailable,
        };
      });
    } catch {
      // Silent failure - don't disrupt the draft
    }
  }, []);

  // Fetch recent items (triggers sync first to get new items from HN)
  // Only shows items that arrived AFTER the draft was completed
  const fetchRecentItems = useCallback(async () => {
    try {
      // First trigger an incremental sync to fetch new items from HN
      const syncRes = await fetch("/api/sync/incremental", { method: "POST" });
      const syncData = await syncRes.json();
      
      // If we have a sync run with items to fetch, process a chunk
      if (syncData.success && syncData.syncRunId && syncData.totalItems > 0) {
        await fetch(`/api/sync/chunk?syncRunId=${syncData.syncRunId}`, { method: "POST" });
      }
      
      // Fetch recent items from our database
      const res = await fetch("/api/items/recent?limit=50");
      const data = await res.json();
      
      if (data.success && data.items && data.items.length > 0) {
        const items: RecentItem[] = data.items;
        
        // On first fetch after draft complete, set the cutoff to the highest item ID
        // This means we start with an empty list and only show truly new items
        if (draftCompletedAtItemId.current === null) {
          const maxId = Math.max(...items.map((item: RecentItem) => item.id));
          draftCompletedAtItemId.current = maxId;
          seenItemIds.current = new Set(items.map((item: RecentItem) => item.id));
          // Don't set any items yet - start empty
          return;
        }
        
        // Filter to only include items newer than the cutoff and not already seen
        const newItems = items.filter((item: RecentItem) => 
          item.id > draftCompletedAtItemId.current! && !seenItemIds.current.has(item.id)
        );
        
        if (newItems.length > 0) {
          // Add new item IDs to seen set
          newItems.forEach((item: RecentItem) => seenItemIds.current.add(item.id));
          
          // Prepend new items to existing list (newest first)
          setRecentItems(prev => {
            const combined = [...newItems, ...prev];
            // Keep only the most recent 100 items to prevent unbounded growth
            return combined.slice(0, 100);
          });
        }
      }
    } catch {
      // Silent failure
    }
  }, []);

  // Auto-update: periodically refresh during drafting and complete phases
  useEffect(() => {
    if (draftState.phase === "setup") {
      // Clean up timers when in setup
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

    const autoRefresh = async () => {
      setCountdown(POLL_INTERVAL_SECONDS);
      
      if (draftState.phase === "drafting") {
        // During drafting, refresh keywords
        await silentRefreshKeywords();
      } else if (draftState.phase === "complete") {
        // During complete, refresh recent items
        await fetchRecentItems();
      }
    };

    // Initial refresh
    autoRefresh();

    // Set up the polling interval
    pollRef.current = setInterval(autoRefresh, POLL_INTERVAL_SECONDS * 1000);

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
  }, [draftState.phase, silentRefreshKeywords, fetchRecentItems]);

  // Helper to get player color class for a keyword
  const getKeywordOwner = useCallback((keyword: string): Player | null => {
    for (const player of draftState.players) {
      if (draftState.rosters[player.id]?.includes(keyword)) {
        return player;
      }
    }
    return null;
  }, [draftState.players, draftState.rosters]);

  // Get all drafted keywords for highlighting
  const allDraftedKeywords = useCallback((): string[] => {
    return Object.values(draftState.rosters).flat();
  }, [draftState.rosters]);

  // Helper to convert bg color to text color
  const bgToTextColor = (bgColor: string): string => {
    const colorMap: Record<string, string> = {
      "bg-emerald-500": "text-emerald-400",
      "bg-blue-500": "text-blue-400",
      "bg-purple-500": "text-purple-400",
      "bg-orange-500": "text-orange-400",
      "bg-pink-500": "text-pink-400",
      "bg-cyan-500": "text-cyan-400",
      "bg-yellow-500": "text-yellow-400",
      "bg-red-500": "text-red-400",
    };
    return colorMap[bgColor] || "text-white";
  };

  // Highlight keywords in text
  const highlightKeywords = useCallback((text: string): React.ReactNode => {
    if (!text) return null;
    
    const drafted = allDraftedKeywords();
    if (drafted.length === 0) return text;

    // Create regex pattern for all drafted keywords (case insensitive, word boundaries)
    const pattern = new RegExp(
      `\\b(${drafted.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\b`,
      'gi'
    );

    const parts = text.split(pattern);
    
    return parts.map((part, idx) => {
      const owner = getKeywordOwner(part.toLowerCase()) || 
                    getKeywordOwner(part) || 
                    drafted.find(k => k.toLowerCase() === part.toLowerCase()) 
                      ? getKeywordOwner(drafted.find(k => k.toLowerCase() === part.toLowerCase())!)
                      : null;
      
      if (owner) {
        return (
          <span key={idx} className={`font-bold ${bgToTextColor(owner.color)}`}>
            {part}
          </span>
        );
      }
      return part;
    });
  }, [allDraftedKeywords, getKeywordOwner]);

  // Get players who scored from a specific item and their matched keywords
  const getItemScorers = useCallback((item: RecentItem): { player: Player; keywords: string[]; points: number }[] => {
    const textToSearch = [
      item.title ? decodeHtmlEntities(item.title) : '',
      item.text ? decodeHtmlEntities(item.text.replace(/<[^>]*>/g, ' ')) : ''
    ].join(' ').toLowerCase();

    const scorers: { player: Player; keywords: string[]; points: number }[] = [];

    draftState.players.forEach(player => {
      const matchedKeywords: string[] = [];
      let totalPoints = 0;

      draftState.rosters[player.id]?.forEach(keyword => {
        const escapedKeyword = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const pattern = new RegExp(`\\b${escapedKeyword}\\b`, 'gi');
        const matches = textToSearch.match(pattern);
        if (matches) {
          matchedKeywords.push(keyword);
          totalPoints += matches.length;
        }
      });

      if (matchedKeywords.length > 0) {
        scorers.push({ player, keywords: matchedKeywords, points: totalPoints });
      }
    });

    // Sort by points descending, human player first if tied
    return scorers.sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      if (a.player.isHuman) return -1;
      if (b.player.isHuman) return 1;
      return 0;
    });
  }, [draftState.players, draftState.rosters]);

  // Calculate points for each player based on keyword matches in recent items
  const playerPoints = useMemo(() => {
    const points: Record<number, { total: number; byKeyword: Record<string, number> }> = {};
    
    // Initialize points for all players
    draftState.players.forEach(player => {
      points[player.id] = { total: 0, byKeyword: {} };
      draftState.rosters[player.id]?.forEach(keyword => {
        points[player.id].byKeyword[keyword] = 0;
      });
    });

    // Count keyword matches in each recent item
    recentItems.forEach(item => {
      const textToSearch = [
        item.title ? decodeHtmlEntities(item.title) : '',
        item.text ? decodeHtmlEntities(item.text.replace(/<[^>]*>/g, ' ')) : ''
      ].join(' ').toLowerCase();

      draftState.players.forEach(player => {
        draftState.rosters[player.id]?.forEach(keyword => {
          // Create a word boundary regex for the keyword
          const escapedKeyword = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const pattern = new RegExp(`\\b${escapedKeyword}\\b`, 'gi');
          const matches = textToSearch.match(pattern);
          if (matches) {
            const matchCount = matches.length;
            points[player.id].byKeyword[keyword] += matchCount;
            points[player.id].total += matchCount;
          }
        });
      });
    });

    return points;
  }, [draftState.players, draftState.rosters, recentItems]);

  // Filter and sort keywords
  const displayKeywords = draftState.availableKeywords
    .filter(k => k.keyword.toLowerCase().includes(searchQuery.toLowerCase()))
    .sort((a, b) => {
      if (sortBy === "recent") {
        // Sort by lastSeenTime descending (most recent first)
        // Keywords without lastSeenTime go to the end
        if (!a.lastSeenTime && !b.lastSeenTime) return a.currentRank - b.currentRank;
        if (!a.lastSeenTime) return 1;
        if (!b.lastSeenTime) return -1;
        return b.lastSeenTime - a.lastSeenTime;
      }
      return a.currentRank - b.currentRank;
    });

  // Get draft order display for current round
  const getDraftOrderDisplay = () => {
    if (draftState.players.length === 0) return null;
    
    const numPlayers = draftState.players.length;
    const isReversed = (draftState.currentRound - 1) % 2 === 1;
    
    const order = isReversed 
      ? [...draftState.players].reverse() 
      : draftState.players;
    
    return order.map((p, i) => (
      <span key={p.id} className="flex items-center gap-1">
        {i > 0 && <span className="text-slate-600 mx-1">→</span>}
        <span className={`${p.id === currentPicker?.id ? "text-white font-semibold" : "text-slate-500"}`}>
          {p.isHuman ? "You" : p.name}
        </span>
      </span>
    ));
  };

  // Reset draft
  const resetDraft = () => {
    setDraftState({
      phase: "setup",
      players: [],
      humanPlayerId: 0,
      rosters: {},
      availableKeywords: [],
      currentPickIndex: 0,
      currentRound: 1,
      totalRounds: 5,
      pickHistory: [],
    });
    setSearchQuery("");
    setRecentItems([]);
    draftCompletedAtItemId.current = null;
    seenItemIds.current = new Set();
  };

  // ============ SETUP PHASE ============
  if (draftState.phase === "setup") {
    return (
      <div className="min-h-screen bg-[#0d1117] text-slate-100">
        <header className="border-b border-slate-800 bg-[#161b22]">
          <div className="mx-auto max-w-6xl px-6 py-6">
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
              <h1 className="text-2xl font-bold tracking-tight text-white">
                <span className="text-emerald-400">Fantasy</span> Draft
              </h1>
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-xl px-6 py-12">
          <div className="rounded-xl border border-slate-800 bg-[#161b22] p-8">
            <h2 className="text-xl font-semibold text-white mb-6">Draft Setup</h2>

            {error && (
              <div className="mb-6 rounded-lg bg-red-900/30 border border-red-800 p-4 text-red-400 text-sm">
                {error}
              </div>
            )}

            <div className="space-y-6">
              {/* Player Name */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Your Name
                </label>
                <input
                  type="text"
                  value={playerName}
                  onChange={(e) => setPlayerName(e.target.value)}
                  className="w-full rounded-lg bg-[#0d1117] border border-slate-700 px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition-colors"
                  placeholder="Enter your name"
                />
              </div>

              {/* AI Count */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Number of AI Opponents
                </label>
                <div className="flex gap-2">
                  {[1, 2, 3, 4, 5, 6, 7].map((n) => (
                    <button
                      key={n}
                      onClick={() => setAiCount(n)}
                      className={`flex-1 py-3 rounded-lg font-medium transition-colors ${
                        aiCount === n
                          ? "bg-emerald-600 text-white"
                          : "bg-slate-800 text-slate-400 hover:bg-slate-700"
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>

              {/* Rounds */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Keywords Per Player
                </label>
                <div className="flex gap-2">
                  {[3, 5, 7].map((n) => (
                    <button
                      key={n}
                      onClick={() => setRounds(n)}
                      className={`flex-1 py-3 rounded-lg font-medium transition-colors ${
                        rounds === n
                          ? "bg-emerald-600 text-white"
                          : "bg-slate-800 text-slate-400 hover:bg-slate-700"
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>

              {/* Draft Position */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Draft Position
                </label>
                <div className="flex gap-2">
                  {[
                    { value: "first" as const, label: "Pick First" },
                    { value: "random" as const, label: "Random" },
                    { value: "last" as const, label: "Pick Last" },
                  ].map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => setDraftPosition(opt.value)}
                      className={`flex-1 py-3 rounded-lg font-medium transition-colors ${
                        draftPosition === opt.value
                          ? "bg-emerald-600 text-white"
                          : "bg-slate-800 text-slate-400 hover:bg-slate-700"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Start Button */}
              <button
                onClick={startDraft}
                disabled={loading}
                className="w-full py-4 rounded-lg bg-emerald-600 text-white font-semibold text-lg hover:bg-emerald-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? "Loading Keywords..." : "Start Draft"}
              </button>

              <p className="text-center text-sm text-slate-500">
                You&apos;ll draft {rounds} keywords against {aiCount} AI opponent{aiCount > 1 ? "s" : ""}.
                <br />
                AIs always pick the highest-ranked available keyword.
              </p>
            </div>
          </div>
        </main>
      </div>
    );
  }

  // ============ COMPLETE PHASE ============
  if (draftState.phase === "complete") {
    const humanPlayer = draftState.players.find(p => p.isHuman)!;
    const humanRoster = draftState.rosters[humanPlayer.id];

    return (
      <div className="min-h-screen bg-[#0d1117] text-slate-100 flex flex-col">
        <header className="border-b border-slate-800 bg-[#161b22]">
          <div className="mx-auto max-w-7xl px-6 py-6">
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
                <h1 className="text-2xl font-bold tracking-tight text-white">
                  Draft <span className="text-emerald-400">Complete!</span>
                </h1>
              </div>
              <div className="flex items-center gap-3">
                {/* Auto-Update Countdown */}
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
                  <span className="text-xs text-slate-400">Live</span>
                </div>

                <button
                  onClick={resetDraft}
                  className="px-4 py-2 rounded-lg bg-slate-700 text-white font-medium hover:bg-slate-600 transition-colors"
                >
                  New Draft
                </button>
              </div>
            </div>
          </div>
        </header>

        <div className="flex-1 flex overflow-hidden">
          {/* Left Side - Team Rosters */}
          <div className="w-72 lg:w-80 border-r border-slate-800 bg-[#161b22] flex flex-col overflow-y-auto">
            <div className="p-4 border-b border-slate-800">
              <h3 className="text-lg font-semibold text-white">Teams</h3>
            </div>
            <div className="p-4 space-y-4">
              {/* Human Player Card - Highlighted */}
              <div className="rounded-xl border-2 border-emerald-500 bg-[#0d1117] p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className={`w-4 h-4 rounded-full ${humanPlayer.color}`} />
                    <h3 className="text-base font-semibold text-white">{humanPlayer.name}</h3>
                    <span className="text-xs bg-emerald-600 text-white px-2 py-0.5 rounded">YOU</span>
                  </div>
                  <div className="flex items-center gap-1.5 bg-emerald-600/20 border border-emerald-500/50 rounded-lg px-3 py-1">
                    <span className="text-lg font-bold text-emerald-400">{playerPoints[humanPlayer.id]?.total || 0}</span>
                    <span className="text-xs text-emerald-400/70">pts</span>
                  </div>
                </div>
                <div className="space-y-1.5">
                  {humanRoster.map((keyword) => {
                    const pick = draftState.pickHistory.find(p => p.keyword === keyword);
                    const keywordPoints = playerPoints[humanPlayer.id]?.byKeyword[keyword] || 0;
                    return (
                      <div key={keyword} className="flex items-center justify-between bg-[#161b22] rounded-lg px-3 py-1.5">
                        <span className="font-medium text-white text-sm">{keyword}</span>
                        <div className="flex items-center gap-2">
                          {keywordPoints > 0 && (
                            <span className="text-xs font-medium text-emerald-400">+{keywordPoints}</span>
                          )}
                          <span className="text-xs text-slate-400">#{pick?.rank}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* AI Player Cards */}
              {draftState.players.filter(p => !p.isHuman).map((player) => (
                <div key={player.id} className="rounded-xl border border-slate-800 bg-[#0d1117] p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className={`w-4 h-4 rounded-full ${player.color}`} />
                      <h3 className="text-base font-semibold text-slate-300">{player.name}</h3>
                    </div>
                    <div className="flex items-center gap-1.5 bg-slate-800 border border-slate-700 rounded-lg px-3 py-1">
                      <span className="text-lg font-bold text-slate-300">{playerPoints[player.id]?.total || 0}</span>
                      <span className="text-xs text-slate-500">pts</span>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    {draftState.rosters[player.id].map((keyword) => {
                      const pick = draftState.pickHistory.find(p => p.keyword === keyword);
                      const keywordPoints = playerPoints[player.id]?.byKeyword[keyword] || 0;
                      return (
                        <div key={keyword} className="flex items-center justify-between bg-[#161b22] rounded-lg px-3 py-1.5">
                          <span className="font-medium text-slate-300 text-sm">{keyword}</span>
                          <div className="flex items-center gap-2">
                            {keywordPoints > 0 && (
                              <span className="text-xs font-medium text-slate-400">+{keywordPoints}</span>
                            )}
                            <span className="text-xs text-slate-500">#{pick?.rank}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Middle - New Items Feed */}
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="p-4 border-b border-slate-800 bg-[#161b22]">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-white">New Posts & Comments</h3>
                <span className="text-sm text-slate-500">{recentItems.length} new</span>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {recentItems.length === 0 ? (
                  <div className="col-span-full text-center py-12">
                    <div className="text-slate-400 mb-2">Waiting for new posts...</div>
                    <div className="text-sm text-slate-600">
                      New posts and comments will appear here as they are made on Hacker News.
                      <br />
                      Points are earned when your keywords appear in new content.
                    </div>
                  </div>
                ) : (
                  recentItems.map((item) => {
                    const scorers = getItemScorers(item);
                    const hasScorers = scorers.length > 0;
                    
                    return (
                      <div
                        key={item.id}
                        className={`rounded-lg border p-4 transition-colors ${
                          hasScorers 
                            ? "border-emerald-700/50 bg-[#161b22] ring-1 ring-emerald-500/20" 
                            : "border-slate-800 bg-[#161b22] hover:border-slate-700"
                        }`}
                      >
                        {/* Player score tags */}
                        {hasScorers && (
                          <div className="flex flex-wrap gap-1.5 mb-2">
                            {scorers.map(({ player, keywords, points }) => (
                              <div
                                key={player.id}
                                className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-xs ${
                                  player.isHuman
                                    ? "bg-emerald-600/30 border border-emerald-500/50"
                                    : "bg-slate-800 border border-slate-700"
                                }`}
                              >
                                <div className={`w-2 h-2 rounded-full ${player.color}`} />
                                <span className={player.isHuman ? "text-emerald-300 font-medium" : "text-slate-300"}>
                                  {player.isHuman ? "You" : player.name}
                                </span>
                                <span className={player.isHuman ? "text-emerald-400 font-bold" : "text-slate-400 font-medium"}>
                                  +{points}
                                </span>
                                <span className="text-slate-500">
                                  ({keywords.join(", ")})
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                        
                        <div className="flex items-center gap-2 mb-2 text-xs text-slate-500">
                          <span className={`px-1.5 py-0.5 rounded ${
                            item.type === "story" ? "bg-orange-900/50 text-orange-400" : "bg-slate-800 text-slate-400"
                          }`}>
                            {item.type}
                          </span>
                          {item.by && <span>by {item.by}</span>}
                          <span>{formatLastSeen(item.time)}</span>
                          {item.score !== null && item.score > 0 && (
                            <span className="text-emerald-400">{item.score} pts</span>
                          )}
                        </div>
                        {item.title && (
                          <div className="text-sm font-medium text-white mb-1">
                            {highlightKeywords(decodeHtmlEntities(item.title))}
                          </div>
                        )}
                        {item.text && (() => {
                          const matchedKeywords = scorers.flatMap(s => s.keywords);
                          const { text: snippetText, hasPrefix } = extractTextWithKeywords(
                            item.text,
                            matchedKeywords,
                            300
                          );
                          return (
                            <div className="text-sm text-slate-400 line-clamp-3">
                              {hasPrefix && <span className="text-slate-500">... </span>}
                              {highlightKeywords(decodeHtmlEntities(snippetText))}
                            </div>
                          );
                        })()}
                        {item.url && (
                          <a
                            href={item.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-blue-400 hover:underline mt-1 block truncate"
                          >
                            {item.url}
                          </a>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          {/* Right Side - Draft History */}
          <div className="w-72 lg:w-80 border-l border-slate-800 bg-[#161b22] flex flex-col">
            <div className="p-4 border-b border-slate-800">
              <h3 className="text-lg font-semibold text-white">Draft History</h3>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              <div className="space-y-2">
                {draftState.pickHistory.map((pick, idx) => {
                  const player = draftState.players.find(p => p.id === pick.playerId)!;
                  return (
                    <div
                      key={idx}
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm ${
                        player.isHuman ? "bg-emerald-900/30 border border-emerald-700" : "bg-[#0d1117]"
                      }`}
                    >
                      <span className="text-slate-500 font-mono text-xs w-6">#{idx + 1}</span>
                      <div className={`w-2.5 h-2.5 rounded-full ${player.color}`} />
                      <span className={`flex-1 font-medium ${player.isHuman ? "text-emerald-400" : "text-slate-300"}`}>
                        {pick.keyword}
                      </span>
                      <span className="text-xs text-slate-500">{player.isHuman ? "You" : player.name}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ============ DRAFTING PHASE ============
  const totalPicks = draftState.players.length * draftState.totalRounds;

  return (
    <div className="min-h-screen bg-[#0d1117] text-slate-100 flex flex-col">
      {/* Header */}
      <header className="border-b border-slate-800 bg-[#161b22]">
        <div className="mx-auto max-w-7xl px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-6">
              <Link
                href="/"
                className="flex items-center gap-1 text-slate-400 hover:text-white transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </Link>
              <div>
                <div className="flex items-center gap-3">
                  <span className="text-lg font-bold text-white">
                    Round {draftState.currentRound} / Pick {draftState.currentPickIndex + 1}
                  </span>
                  <span className="text-slate-500">of {totalPicks}</span>
                </div>
                <div className="flex items-center gap-1 text-sm mt-1">
                  {getDraftOrderDisplay()}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {/* Auto-Update Countdown */}
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
                <span className="text-xs text-slate-400">Sync</span>
              </div>

              {/* Turn Indicator */}
              <div className={`px-6 py-3 rounded-xl font-semibold text-lg ${
                isHumanTurn 
                  ? "bg-emerald-600 text-white" 
                  : "bg-slate-800 text-slate-300"
              }`}>
                {aiThinking ? (
                  <span className="flex items-center gap-2">
                    <span className="w-2 h-2 bg-current rounded-full animate-pulse" />
                    {currentPicker?.name} is thinking...
                  </span>
                ) : isHumanTurn ? (
                  "YOUR TURN"
                ) : (
                  `${currentPicker?.name}'s turn`
                )}
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Panel - Keyword Pool */}
        <div className="flex-1 flex flex-col overflow-hidden border-r border-slate-800">
          {/* Search & Sort */}
          <div className="p-4 border-b border-slate-800 bg-[#161b22]">
            <div className="flex gap-3">
              <div className="flex-1 relative">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search keywords..."
                  className="w-full pl-10 pr-4 py-2.5 rounded-lg bg-[#0d1117] border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                />
              </div>
              <button
                onClick={() => setSortBy(sortBy === "rank" ? "recent" : "rank")}
                className="px-4 py-2.5 rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700 transition-colors flex items-center gap-2"
              >
                {sortBy === "rank" ? "Rank ↓" : "Recent ↓"}
              </button>
            </div>
          </div>

          {/* Keywords List */}
          <div className="flex-1 overflow-y-auto p-4">
            <div className="space-y-3">
              {displayKeywords.map((kw) => (
                <button
                  key={kw.keyword}
                  onClick={() => isHumanTurn && makePick(kw.keyword)}
                  disabled={!isHumanTurn}
                  className={`w-full p-4 rounded-xl border text-left transition-all ${
                    isHumanTurn
                      ? "bg-[#161b22] border-slate-700 hover:border-emerald-500 hover:bg-[#1c2128] cursor-pointer"
                      : "bg-[#161b22] border-slate-800 opacity-60 cursor-not-allowed"
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    {/* Left side - Keyword info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3">
                        <span className="text-xl font-bold text-white">{kw.keyword}</span>
                        <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                          kw.trend === "up" ? "bg-emerald-900/50 text-emerald-400" :
                          kw.trend === "down" ? "bg-red-900/50 text-red-400" :
                          kw.trend === "new" ? "bg-cyan-900/50 text-cyan-400" :
                          "bg-slate-800 text-slate-400"
                        }`}>
                          {kw.trend === "up" && "↑ Rising"}
                          {kw.trend === "down" && "↓ Falling"}
                          {kw.trend === "new" && "★ New"}
                          {kw.trend === "stable" && "— Stable"}
                        </div>
                      </div>
                      
                      {/* Rank history */}
                      <div className="mt-2 flex items-center gap-4 text-sm">
                        <div className="flex items-center gap-2">
                          <span className="text-slate-500">Current:</span>
                          <span className="font-mono font-semibold text-white">#{kw.currentRank}</span>
                        </div>
                        {kw.previousRank !== null ? (
                          <div className="flex items-center gap-2">
                            <span className="text-slate-500">Previous:</span>
                            <span className="font-mono text-slate-400">#{kw.previousRank}</span>
                          </div>
                        ) : (
                          <span className="text-cyan-400/70 text-xs">First appearance</span>
                        )}
                        {kw.rankChange !== null && kw.rankChange !== 0 && (
                          <div className={`font-mono text-sm ${
                            kw.rankChange > 0 ? "text-emerald-400" : "text-red-400"
                          }`}>
                            {kw.rankChange > 0 ? `+${kw.rankChange}` : kw.rankChange}
                          </div>
                        )}
                      </div>

                      {/* Additional stats */}
                      <div className="mt-2 flex items-center gap-4 text-xs text-slate-500">
                        <span>Variants: {kw.variantCount}</span>
                        <span>Score: {kw.currentScore.toFixed(3)}</span>
                        {kw.lastSeenTime && (
                          <span className="text-slate-400">
                            Last seen: <span className="text-white">{formatLastSeen(kw.lastSeenTime)}</span>
                          </span>
                        )}
                        {kw.totalDaysAppeared && kw.totalDaysAppeared > 1 && (
                          <span>Appeared {kw.totalDaysAppeared} days</span>
                        )}
                      </div>
                    </div>

                    {/* Right side - Draft button */}
                    <div className="flex-shrink-0">
                      {isHumanTurn ? (
                        <div className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium">
                          Draft
                        </div>
                      ) : (
                        <div className="px-4 py-2 rounded-lg bg-slate-800 text-slate-500 text-sm">
                          Wait...
                        </div>
                      )}
                    </div>
                  </div>
                </button>
              ))}
            </div>
            {displayKeywords.length === 0 && (
              <div className="text-center text-slate-500 py-12">
                No keywords match your search.
              </div>
            )}
          </div>
        </div>

        {/* Right Panel - Remaining Picks */}
        <div className="w-80 lg:w-96 flex flex-col overflow-hidden bg-[#161b22]">
          <div className="flex-1 overflow-y-auto p-4 space-y-2">
            {/* Generate all remaining picks in draft order */}
            {(() => {
              const numPlayers = draftState.players.length;
              const totalPicks = numPlayers * draftState.totalRounds;
              const remainingPicks: { pickIndex: number; player: Player; round: number; pickInRound: number }[] = [];
              
              // Generate all remaining picks
              for (let pickIdx = draftState.currentPickIndex; pickIdx < totalPicks; pickIdx++) {
                const round = Math.floor(pickIdx / numPlayers) + 1;
                const positionInRound = pickIdx % numPlayers;
                const isReversed = (round - 1) % 2 === 1;
                const playerIndex = isReversed ? numPlayers - 1 - positionInRound : positionInRound;
                const player = draftState.players[playerIndex];
                
                remainingPicks.push({
                  pickIndex: pickIdx,
                  player,
                  round,
                  pickInRound: positionInRound + 1,
                });
              }

              // Find human's next pick (first occurrence after current)
              const humanNextPickIndex = remainingPicks.findIndex(
                (p, idx) => idx > 0 && p.player.isHuman
              );
              const humanNextPick = humanNextPickIndex > 0 ? remainingPicks[humanNextPickIndex] : null;

              return remainingPicks.map((pick, idx) => {
                const { player, pickIndex, round } = pick;
                const roster = draftState.rosters[player.id];
                const isCurrentPick = idx === 0;
                const isHumanNextPick = humanNextPick && pickIndex === humanNextPick.pickIndex;
                const isHuman = player.isHuman;
                
                // Only expand: current picker OR human's next pick
                const isExpanded = isCurrentPick || isHumanNextPick;

                return (
                  <div 
                    key={`pick-${pickIndex}`} 
                    className={`rounded-xl border bg-[#0d1117] overflow-hidden transition-colors ${
                      isCurrentPick 
                        ? "border-yellow-500 border-2" 
                        : isHumanNextPick
                          ? "border-emerald-600 border-2"
                          : "border-slate-800"
                    }`}
                  >
                    <div
                      className={`flex items-center justify-between p-3 ${
                        isExpanded ? "" : "hover:bg-[#161b22]"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono text-slate-600 w-8">#{pickIndex + 1}</span>
                        <div className={`w-3 h-3 rounded-full ${player.color}`} />
                        <span className={`font-medium ${isCurrentPick || isHumanNextPick ? "text-white" : "text-slate-400"}`}>
                          {isHuman ? "You" : player.name}
                        </span>
                        <span className="text-xs text-slate-600">R{round}</span>
                        {isCurrentPick && (
                          <span className={`text-xs px-2 py-0.5 rounded font-medium ${
                            isHuman ? "bg-emerald-600 text-white" : "bg-yellow-600 text-white"
                          }`}>
                            {aiThinking ? "THINKING..." : "NOW"}
                          </span>
                        )}
                        {isHumanNextPick && !isCurrentPick && (
                          <span className="text-xs bg-emerald-600/50 text-emerald-300 px-2 py-0.5 rounded">NEXT</span>
                        )}
                      </div>
                      <span className="text-xs text-slate-500">
                        {roster.length}/{draftState.totalRounds}
                      </span>
                    </div>
                    {isExpanded && (
                      <div className="px-3 pb-3 space-y-1.5">
                        {roster.length > 0 ? (
                          roster.map((keyword) => {
                            const pickData = draftState.pickHistory.find(p => p.keyword === keyword);
                            return (
                              <div key={keyword} className="flex items-center justify-between bg-[#161b22] rounded-lg px-3 py-1.5">
                                <span className={`text-sm font-medium ${isHuman ? "text-emerald-400" : "text-slate-300"}`}>
                                  {keyword}
                                </span>
                                <span className="text-xs text-slate-500">#{pickData?.rank}</span>
                              </div>
                            );
                          })
                        ) : (
                          <div className="text-xs text-slate-600 text-center py-1">No picks yet</div>
                        )}
                      </div>
                    )}
                  </div>
                );
              });
            })()}
          </div>
        </div>
      </div>

      {/* Footer - Recent Picks */}
      <div className="border-t border-slate-800 bg-[#161b22] px-6 py-3">
        <div className="flex items-center gap-2 overflow-x-auto">
          <span className="text-sm text-slate-500 shrink-0">Recent:</span>
          {draftState.pickHistory.slice(-8).reverse().map((pick, idx) => {
            const player = draftState.players.find(p => p.id === pick.playerId)!;
            return (
              <div 
                key={idx}
                className={`flex items-center gap-2 px-3 py-1 rounded-full text-sm shrink-0 ${
                  player.isHuman ? "bg-emerald-900/30" : "bg-slate-800"
                }`}
              >
                <div className={`w-2 h-2 rounded-full ${player.color}`} />
                <span className={player.isHuman ? "text-emerald-400" : "text-slate-400"}>
                  {player.isHuman ? "You" : player.name}
                </span>
                <span className="text-slate-500">took</span>
                <span className="text-white font-medium">{pick.keyword}</span>
              </div>
            );
          })}
          {draftState.pickHistory.length === 0 && (
            <span className="text-sm text-slate-600">No picks yet</span>
          )}
        </div>
      </div>
    </div>
  );
}
