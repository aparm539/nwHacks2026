/**
 * Keyword Blacklist Configuration
 *
 * Add keywords here to prevent them from appearing in extraction results.
 * Keywords are case-insensitive and will match if the stemmed version
 * of the extracted keyword matches a blacklisted stem.
 *
 * Uses Porter stemming logic to catch variations:
 * - "showing" → "show" (matches blacklist)
 * - "things" → "thing" (matches blacklist)
 * - "working" → "work" (matches blacklist)
 *
 * User overrides can be managed via the sync page UI:
 * - "block" action: adds custom keywords to the blacklist
 * - "allow" action: removes/overrides default blacklisted keywords
 */

import { PorterStemmer } from "natural";
import { db } from "@/db";
import { blacklistOverrides, BlacklistOverride } from "@/db/schema";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const dbAny = db as any;

export const BLACKLISTED_KEYWORDS: string[] = [
  // Common HN artifacts
  "show",
  "hn",
  "ask",
  "https",
  "http",
  "www",
  "com",

  "thing",
  "things",
  "stuff",
  "way",
  "lot",
  "bit",

  "n't",
  "make",
  "time",
  "problem",
  "point",
  "years ago",
  "long time",
  "works",
  "people",
  "work",
  "good",
  "good thing",
  "year",
  "years",
  "Good thing people",
  "pretty",
  "state",
  "made",
  "find",
  "back",
  "great",
  "case",
  "long",
  "bad",
  "personal",
  "run",
  "day",
  "part",
  "write code",
  "open",
  "understand",
  "hard",
  "tool",
  "'re",
];

/**
 * Stem a phrase (each word stemmed and rejoined)
 */
export function stemPhrase(phrase: string): string {
  return phrase
    .toLowerCase()
    .split(/\s+/)
    .map((word) => PorterStemmer.stem(word))
    .join(" ");
}

/**
 * Pre-computed set of stemmed blacklist words for fast lookup
 */
const STEMMED_BLACKLIST: Set<string> = new Set(
  BLACKLISTED_KEYWORDS.map((kw) => stemPhrase(kw))
);

/**
 * Check if a keyword should be filtered out (by stem matching)
 */
export function isBlacklisted(keyword: string): boolean {
  const stemmed = stemPhrase(keyword);
  // Check if any blacklisted stem is contained within the keyword's stem
  for (const blacklistedStem of STEMMED_BLACKLIST) {
    if (stemmed.includes(blacklistedStem)) {
      return true;
    }
  }
  return false;
}

/**
 * Check if a stemmed keyword is blacklisted (when stem is already computed)
 */
export function isStemBlacklisted(stemmedKeyword: string): boolean {
  for (const blacklistedStem of STEMMED_BLACKLIST) {
    if (stemmedKeyword.includes(blacklistedStem)) {
      return true;
    }
  }
  return false;
}

/**
 * Filter an array of keywords, removing blacklisted ones
 */
export function filterBlacklisted<T extends { keyword: string }>(
  keywords: T[]
): T[] {
  return keywords.filter((kw) => !isBlacklisted(kw.keyword));
}

/**
 * Cache for user overrides to avoid repeated database queries
 * Cleared periodically or on demand
 */
let overrideCache: Map<string, "block" | "allow"> | null = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 60000; // 1 minute cache

/**
 * Load user overrides from database into cache
 */
async function loadOverrideCache(): Promise<Map<string, "block" | "allow">> {
  const now = Date.now();
  if (overrideCache && now - cacheTimestamp < CACHE_TTL_MS) {
    return overrideCache;
  }

  const overrides: BlacklistOverride[] = await dbAny.select().from(blacklistOverrides);
  overrideCache = new Map();
  for (const override of overrides) {
    overrideCache.set(override.stem, override.action);
  }
  cacheTimestamp = now;
  return overrideCache;
}

/**
 * Clear the override cache (call after making changes)
 */
export function clearBlacklistCache(): void {
  overrideCache = null;
  cacheTimestamp = 0;
}

/**
 * Check if a keyword is blacklisted, considering user overrides
 * This is the async version that checks the database
 */
export async function isBlacklistedWithOverrides(
  keyword: string
): Promise<boolean> {
  const stemmed = stemPhrase(keyword);
  const cache = await loadOverrideCache();

  // Check if there's a user override for this stem
  const override = cache.get(stemmed);
  if (override === "allow") {
    // User explicitly allowed this keyword
    return false;
  }
  if (override === "block") {
    // User explicitly blocked this keyword
    return true;
  }

  // No override, check default blacklist
  for (const blacklistedStem of STEMMED_BLACKLIST) {
    if (stemmed.includes(blacklistedStem)) {
      return true;
    }
  }
  return false;
}

/**
 * Filter an array of keywords, considering user overrides (async version)
 */
export async function filterBlacklistedWithOverrides<
  T extends { keyword: string }
>(keywords: T[]): Promise<T[]> {
  const cache = await loadOverrideCache();

  return keywords.filter((kw) => {
    const stemmed = stemPhrase(kw.keyword);

    // Check user override first
    const override = cache.get(stemmed);
    if (override === "allow") return true; // Keep it
    if (override === "block") return false; // Filter it out

    // No override, check default blacklist
    for (const blacklistedStem of STEMMED_BLACKLIST) {
      if (stemmed.includes(blacklistedStem)) {
        return false;
      }
    }
    return true;
  });
}
