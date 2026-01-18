"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface BlacklistEntry {
  id: number | null;
  keyword: string;
  stem: string;
  action: "block" | "allow";
  source: "default" | "user";
  reason: string | null;
  createdAt: string | null;
}

interface BlacklistStats {
  totalDefaults: number;
  userBlocks: number;
  userAllows: number;
}

interface TopKeyword {
  keyword: string;
  score: number;
  rank: number;
}

interface WeeklyMover {
  keyword: string;
  currentRank: number;
  startRank: number | null;
  weeklyChange: number | null;
  isNew: boolean;
}

export function BlacklistTab() {
  const [entries, setEntries] = useState<BlacklistEntry[]>([]);
  const [stats, setStats] = useState<BlacklistStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newKeyword, setNewKeyword] = useState("");
  const [adding, setAdding] = useState(false);
  const [filter, setFilter] = useState<"all" | "blocked" | "allowed">("all");
  const [topKeywords, setTopKeywords] = useState<TopKeyword[]>([]);
  const [topGainers, setTopGainers] = useState<WeeklyMover[]>([]);
  const [topLosers, setTopLosers] = useState<WeeklyMover[]>([]);
  const [newThisWeek, setNewThisWeek] = useState<WeeklyMover[]>([]);
  const [loadingTop, setLoadingTop] = useState(true);

  const fetchBlacklist = useCallback(async () => {
    try {
      const res = await fetch("/api/keywords/blacklist");
      const data = await res.json();
      if (data.success) {
        setEntries(data.entries);
        setStats(data.stats);
      } else {
        setError(data.error || "Failed to fetch blacklist");
      }
    } catch {
      setError("Failed to fetch blacklist");
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchTopKeywords = useCallback(async () => {
    try {
      setLoadingTop(true);
      const res = await fetch("/api/keywords/trends");
      const data = await res.json();
      if (data.dailyTrends && data.dailyTrends.length > 0) {
        // Get the most recent day's keywords
        const latestTrends = data.dailyTrends[data.dailyTrends.length - 1];
        const keywords = latestTrends.keywords.slice(0, 30).map((kw: { keyword: string; currentScore: number; currentRank: number }) => ({
          keyword: kw.keyword,
          score: kw.currentScore,
          rank: kw.currentRank,
        }));
        setTopKeywords(keywords);
      }
      // Set weekly movers
      if (data.topGainers) setTopGainers(data.topGainers);
      if (data.topLosers) setTopLosers(data.topLosers);
      if (data.newThisWeek) setNewThisWeek(data.newThisWeek);
    } catch {
      // Non-critical, just leave empty
      console.error("Failed to fetch top keywords");
    } finally {
      setLoadingTop(false);
    }
  }, []);

  const refreshTrends = useCallback(async () => {
    try {
      await fetch("/api/keywords/extract-daily?force=true", { method: "POST" });
      await fetchTopKeywords();
    } catch {
      // Non-critical; trends may update on next manual refresh
    }
  }, [fetchTopKeywords]);

  useEffect(() => {
    fetchBlacklist();
    fetchTopKeywords();
  }, [fetchBlacklist, fetchTopKeywords]);

  const handleAddKeyword = async (keywordToAdd?: string) => {
    const keyword = keywordToAdd || newKeyword.trim();
    if (!keyword) return;

    setAdding(true);
    setError(null);

    try {
      const res = await fetch("/api/keywords/blacklist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          keyword: keyword,
          action: "block",
        }),
      });

      const data = await res.json();
      if (data.success) {
        if (!keywordToAdd) setNewKeyword("");
        fetchBlacklist();
        refreshTrends();
      } else {
        setError(data.error || "Failed to add keyword");
      }
    } catch {
      setError("Failed to add keyword");
    } finally {
      setAdding(false);
    }
  };

  // Check if a keyword is already in the blacklist
  const isKeywordBlacklisted = (keyword: string) => {
    return entries.some(
      (e) => e.keyword.toLowerCase() === keyword.toLowerCase() && e.action === "block"
    );
  };

  // Filter top keywords to exclude those already blacklisted
  const availableTopKeywords = topKeywords.filter(
    (kw) => !isKeywordBlacklisted(kw.keyword)
  );

  const handleToggleOverride = async (entry: BlacklistEntry) => {
    setError(null);

    // If it's a default with no override, or a blocked default, allow it
    // If it's already allowed, remove the override (revert to default)
    // If it's a user-added block, delete it
    if (entry.source === "default") {
      if (entry.action === "block" && entry.id === null) {
        // Default with no override -> add allow override
        try {
          const res = await fetch("/api/keywords/blacklist", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              keyword: entry.keyword,
              action: "allow",
            }),
          });
          const data = await res.json();
          if (!data.success) {
            setError(data.error || "Failed to update");
          }
          fetchBlacklist();
          refreshTrends();
        } catch {
          setError("Failed to update");
        }
      } else if (entry.id !== null) {
        // Has an override -> remove it to revert to default
        try {
          const res = await fetch(`/api/keywords/blacklist?id=${entry.id}`, {
            method: "DELETE",
          });
          const data = await res.json();
          if (!data.success) {
            setError(data.error || "Failed to remove override");
          }
          fetchBlacklist();
          refreshTrends();
        } catch {
          setError("Failed to remove override");
        }
      }
    } else {
      // User-added entry -> delete it
      if (entry.id !== null) {
        try {
          const res = await fetch(`/api/keywords/blacklist?id=${entry.id}`, {
            method: "DELETE",
          });
          const data = await res.json();
          if (!data.success) {
            setError(data.error || "Failed to delete");
          }
          fetchBlacklist();
          refreshTrends();
        } catch {
          setError("Failed to delete");
        }
      }
    }
  };

  const filteredEntries = entries.filter((entry) => {
    if (filter === "all") return true;
    if (filter === "blocked") return entry.action === "block";
    if (filter === "allowed") return entry.action === "allow";
    return true;
  });

  const getActionBadge = (entry: BlacklistEntry) => {
    if (entry.action === "allow") {
      return <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">Allowed</Badge>;
    }
    return <Badge variant="secondary">Blocked</Badge>;
  };

  const getSourceBadge = (entry: BlacklistEntry) => {
    if (entry.source === "default") {
      return <Badge variant="outline" className="text-gray-500">Default</Badge>;
    }
    return <Badge variant="default" className="bg-blue-500">Custom</Badge>;
  };

  const getActionButton = (entry: BlacklistEntry) => {
    if (entry.source === "default") {
      if (entry.action === "block" && entry.id === null) {
        // Default blocked, no override
        return (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleToggleOverride(entry)}
            className="text-green-600 hover:text-green-700 hover:bg-green-50"
          >
            Allow
          </Button>
        );
      } else if (entry.action === "allow") {
        // Default with allow override
        return (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleToggleOverride(entry)}
            className="text-orange-600 hover:text-orange-700 hover:bg-orange-50"
          >
            Revert
          </Button>
        );
      }
    } else {
      // User-added entry
      return (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => handleToggleOverride(entry)}
          className="text-red-600 hover:text-red-700 hover:bg-red-50"
        >
          Delete
        </Button>
      );
    }
    return null;
  };

  return (
    <div className="space-y-6">
      {/* Error Display */}
      {error && (
        <Alert variant="destructive">
          <AlertDescription className="flex items-center justify-between">
            {error}
            <Button variant="ghost" size="sm" onClick={() => setError(null)}>
              Dismiss
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Default Keywords</CardDescription>
              <CardTitle className="text-2xl">{stats.totalDefaults}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Custom Blocked</CardDescription>
              <CardTitle className="text-2xl text-blue-600">{stats.userBlocks}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Overrides (Allowed)</CardDescription>
              <CardTitle className="text-2xl text-green-600">{stats.userAllows}</CardTitle>
            </CardHeader>
          </Card>
        </div>
      )}

      {/* Add New Keyword */}
      <Card>
        <CardHeader>
          <CardTitle>Add Keyword to Blacklist</CardTitle>
          <CardDescription>
            Add custom keywords to filter out from extraction results
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Input
              placeholder="Enter keyword to blacklist..."
              value={newKeyword}
              onChange={(e) => setNewKeyword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAddKeyword()}
              disabled={adding}
              className="max-w-md"
            />
            <Button onClick={() => handleAddKeyword()} disabled={adding || !newKeyword.trim()}>
              {adding ? "Adding..." : "Add"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Top Keywords Suggestions */}
      <Card>
        <CardHeader>
          <CardTitle>Keyword Trends</CardTitle>
          <CardDescription>
            Trending keywords that can be added to the blacklist
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loadingTop ? (
            <div className="p-4 text-center text-muted-foreground">Loading keywords...</div>
          ) : (
            <Tabs defaultValue="top" className="w-full">
              <TabsList className="grid w-full grid-cols-4 mb-4">
                <TabsTrigger value="top">Top Keywords</TabsTrigger>
                <TabsTrigger value="gainers">Top Gainers</TabsTrigger>
                <TabsTrigger value="losers">Top Losers</TabsTrigger>
                <TabsTrigger value="new">New This Week</TabsTrigger>
              </TabsList>

              {/* Top Keywords Tab */}
              <TabsContent value="top">
                {availableTopKeywords.length === 0 ? (
                  <div className="p-4 text-center text-muted-foreground">
                    {topKeywords.length === 0 
                      ? "No trending keywords available. Run keyword extraction first." 
                      : "All top keywords are already blacklisted."}
                  </div>
                ) : (
                  <div className="overflow-x-auto max-h-80 overflow-y-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Rank</TableHead>
                          <TableHead>Keyword</TableHead>
                          <TableHead>Score</TableHead>
                          <TableHead className="text-right">Action</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {availableTopKeywords.map((kw) => (
                          <TableRow key={kw.keyword}>
                            <TableCell>
                              <Badge variant="outline">#{kw.rank}</Badge>
                            </TableCell>
                            <TableCell className="font-medium">{kw.keyword}</TableCell>
                            <TableCell className="text-muted-foreground">
                              {kw.score.toFixed(1)}
                            </TableCell>
                            <TableCell className="text-right">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleAddKeyword(kw.keyword)}
                                disabled={adding || isKeywordBlacklisted(kw.keyword)}
                                className="text-red-600 hover:text-red-700 hover:bg-red-50"
                              >
                                Block
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </TabsContent>

              {/* Top Gainers Tab */}
              <TabsContent value="gainers">
                {topGainers.length === 0 ? (
                  <div className="p-4 text-center text-muted-foreground">No gainers data available.</div>
                ) : (
                  <div className="overflow-x-auto max-h-80 overflow-y-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Rank</TableHead>
                          <TableHead>Keyword</TableHead>
                          <TableHead>Change</TableHead>
                          <TableHead className="text-right">Action</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {topGainers.map((kw) => (
                          <TableRow key={kw.keyword}>
                            <TableCell>
                              <Badge variant="outline">#{kw.currentRank}</Badge>
                            </TableCell>
                            <TableCell className="font-medium">{kw.keyword}</TableCell>
                            <TableCell>
                              <Badge className="bg-green-100 text-green-700 border-green-200">
                                ↑ {kw.weeklyChange}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleAddKeyword(kw.keyword)}
                                disabled={adding || isKeywordBlacklisted(kw.keyword)}
                                className="text-red-600 hover:text-red-700 hover:bg-red-50"
                              >
                                {isKeywordBlacklisted(kw.keyword) ? "Blocked" : "Block"}
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </TabsContent>

              {/* Top Losers Tab */}
              <TabsContent value="losers">
                {topLosers.length === 0 ? (
                  <div className="p-4 text-center text-muted-foreground">No losers data available.</div>
                ) : (
                  <div className="overflow-x-auto max-h-80 overflow-y-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Rank</TableHead>
                          <TableHead>Keyword</TableHead>
                          <TableHead>Change</TableHead>
                          <TableHead className="text-right">Action</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {topLosers.map((kw) => (
                          <TableRow key={kw.keyword}>
                            <TableCell>
                              <Badge variant="outline">#{kw.currentRank}</Badge>
                            </TableCell>
                            <TableCell className="font-medium">{kw.keyword}</TableCell>
                            <TableCell>
                              <Badge className="bg-red-100 text-red-700 border-red-200">
                                ↓ {Math.abs(kw.weeklyChange || 0)}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleAddKeyword(kw.keyword)}
                                disabled={adding || isKeywordBlacklisted(kw.keyword)}
                                className="text-red-600 hover:text-red-700 hover:bg-red-50"
                              >
                                {isKeywordBlacklisted(kw.keyword) ? "Blocked" : "Block"}
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </TabsContent>

              {/* New This Week Tab */}
              <TabsContent value="new">
                {newThisWeek.length === 0 ? (
                  <div className="p-4 text-center text-muted-foreground">No new keywords this week.</div>
                ) : (
                  <div className="overflow-x-auto max-h-80 overflow-y-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Rank</TableHead>
                          <TableHead>Keyword</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead className="text-right">Action</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {newThisWeek.map((kw) => (
                          <TableRow key={kw.keyword}>
                            <TableCell>
                              <Badge variant="outline">#{kw.currentRank}</Badge>
                            </TableCell>
                            <TableCell className="font-medium">{kw.keyword}</TableCell>
                            <TableCell>
                              <Badge className="bg-blue-100 text-blue-700 border-blue-200">
                                New
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleAddKeyword(kw.keyword)}
                                disabled={adding || isKeywordBlacklisted(kw.keyword)}
                                className="text-red-600 hover:text-red-700 hover:bg-red-50"
                              >
                                {isKeywordBlacklisted(kw.keyword) ? "Blocked" : "Block"}
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </TabsContent>
            </Tabs>
          )}
        </CardContent>
      </Card>

      {/* Blacklist Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Blacklist Entries</CardTitle>
              <CardDescription>
                {filteredEntries.length} entries
                {filter !== "all" && ` (filtered: ${filter})`}
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button
                variant={filter === "all" ? "default" : "outline"}
                size="sm"
                onClick={() => setFilter("all")}
              >
                All
              </Button>
              <Button
                variant={filter === "blocked" ? "default" : "outline"}
                size="sm"
                onClick={() => setFilter("blocked")}
              >
                Blocked
              </Button>
              <Button
                variant={filter === "allowed" ? "default" : "outline"}
                size="sm"
                onClick={() => setFilter("allowed")}
              >
                Allowed
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="p-8 text-center text-muted-foreground">Loading...</div>
          ) : filteredEntries.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              No entries found
            </div>
          ) : (
            <div className="overflow-x-auto max-h-125 overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Keyword</TableHead>
                    <TableHead>Stem</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredEntries.map((entry, idx) => (
                    <TableRow key={entry.id ?? `default-${idx}`}>
                      <TableCell className="font-medium">{entry.keyword}</TableCell>
                      <TableCell className="font-mono text-sm text-muted-foreground">
                        {entry.stem}
                      </TableCell>
                      <TableCell>{getSourceBadge(entry)}</TableCell>
                      <TableCell>{getActionBadge(entry)}</TableCell>
                      <TableCell className="text-right">
                        {getActionButton(entry)}
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
  );
}
