/**
 * Keyword Blacklist Configuration
 * 
 * Add keywords here to prevent them from appearing in extraction results.
 * Keywords are case-insensitive and will match if the extracted keyword
 * contains any of these terms.
 * 
 * Examples:
 * - "show" will filter out "Show HN", "Ask Show", etc.
 * - "https" will filter out any keyword containing URLs
 */

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
  "n’t",
  "things",
  "make",
  "time",
  "lot",
  "problem",
  "point",
  "years ago",
  "long time",
  "works",
  "people",
  "work",
  "thing",
  "good",
  "good thing",
  "year",
  "years",
  "Good thing people",
  "pretty",
  "works",
  "state",
  "made",
  "find",
  "back",
  "great",
  "case",
  "long",
  "bad",
  "find",
  "personal",
  "run",
  "day",
  "part",
  "write code",
  "open",
  "understand",
  "hard",
  "tool"
  
];

/**
 * Check if a keyword should be filtered out
 */
export function isBlacklisted(keyword: string): boolean {
  const lowerKeyword = keyword.toLowerCase();
  return BLACKLISTED_KEYWORDS.some(
    (blacklisted) => lowerKeyword.includes(blacklisted.toLowerCase())
  );
}

/**
 * Filter an array of keywords, removing blacklisted ones
 */
export function filterBlacklisted<T extends { keyword: string }>(
  keywords: T[]
): T[] {
  return keywords.filter((kw) => !isBlacklisted(kw.keyword));
}
