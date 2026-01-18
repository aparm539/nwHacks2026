/**
 * Keyword Variant Management
 *
 * Manages manual keyword variant groupings. Allows users to explicitly
 * group keywords as variants of a parent keyword, overriding automatic
 * stem-based grouping.
 *
 * Manual overrides take precedence over automatic stem-based grouping.
 * Flat structure only - no nested variants (a variant cannot have its own variants).
 */

import { PorterStemmer } from "natural";
import { db } from "@/db";
import { keywordVariantOverrides, KeywordVariantOverride } from "@/db/schema";
import { eq } from "drizzle-orm";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const dbAny = db as any;

// In-memory cache for variant overrides
let variantCache: Map<string, string> | null = null; // Maps variantStem -> parentKeyword
let cacheTimestamp = 0;
const CACHE_TTL_MS = 60000; // 1 minute TTL

/**
 * Stem a keyword using Porter stemming algorithm
 */
export function stemKeyword(keyword: string): string {
  return PorterStemmer.stem(keyword.toLowerCase());
}

/**
 * Load variant overrides from database into cache
 */
async function loadVariantCache(): Promise<Map<string, string>> {
  const now = Date.now();
  if (variantCache && now - cacheTimestamp < CACHE_TTL_MS) {
    return variantCache;
  }

  const overrides: KeywordVariantOverride[] = await dbAny
    .select()
    .from(keywordVariantOverrides);
  
  variantCache = new Map();
  for (const override of overrides) {
    variantCache.set(override.variantStem, override.parentKeyword);
  }
  cacheTimestamp = now;
  return variantCache;
}

/**
 * Get the parent keyword if the given keyword is a variant
 * Returns null if the keyword is not a variant of anything
 */
export async function getParentKeyword(keyword: string): Promise<string | null> {
  const stem = stemKeyword(keyword);
  const cache = await loadVariantCache();
  return cache.get(stem) || null;
}

/**
 * Get all variants for a given parent keyword
 */
export async function getVariants(parentKeyword: string): Promise<KeywordVariantOverride[]> {
  const variants: KeywordVariantOverride[] = await dbAny
    .select()
    .from(keywordVariantOverrides)
    .where(eq(keywordVariantOverrides.parentKeyword, parentKeyword));
  
  return variants;
}

/**
 * Check if a keyword has any variants
 * Used to prevent deletion of parents with existing variants
 */
export async function hasVariants(keyword: string): Promise<boolean> {
  const variants = await getVariants(keyword);
  return variants.length > 0;
}

/**
 * Check if a keyword is itself a variant of another keyword
 * Used to prevent nested variant structures
 */
export async function isVariant(keyword: string): Promise<boolean> {
  const parent = await getParentKeyword(keyword);
  return parent !== null;
}

/**
 * Clear the variant cache (call after making changes)
 */
export function clearVariantCache(): void {
  variantCache = null;
  cacheTimestamp = 0;
}
