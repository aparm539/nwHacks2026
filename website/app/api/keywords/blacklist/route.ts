import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { blacklistOverrides, BlacklistOverride } from "@/db/schema";
import { eq } from "drizzle-orm";
import {
  BLACKLISTED_KEYWORDS,
  stemPhrase,
} from "@/lib/keyword-blacklist";

interface BlacklistEntry {
  id: number | null;
  keyword: string;
  stem: string;
  action: "block" | "allow";
  source: "default" | "user";
  reason: string | null;
  createdAt: string | null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const dbAny = db as any;

// GET - List all blacklist entries (defaults + user overrides merged)
export async function GET() {
  try {
    // Get user overrides from database
    const userOverrides: BlacklistOverride[] = await dbAny.select().from(blacklistOverrides);

    // Create a map of stems to user overrides for quick lookup
    const overrideMap = new Map<string, BlacklistOverride>();
    for (const override of userOverrides) {
      overrideMap.set(override.stem, override);
    }

    const entries: BlacklistEntry[] = [];

    // Add default blacklist entries (with override status)
    for (const keyword of BLACKLISTED_KEYWORDS) {
      const stem = stemPhrase(keyword);
      const override = overrideMap.get(stem);

      if (override) {
        // There's a user override for this default
        entries.push({
          id: override.id,
          keyword: keyword,
          stem: stem,
          action: override.action,
          source: "default",
          reason: override.reason,
          createdAt: override.createdAt?.toISOString() || null,
        });
        // Remove from map so we don't add it again
        overrideMap.delete(stem);
      } else {
        // Default entry with no override
        entries.push({
          id: null,
          keyword: keyword,
          stem: stem,
          action: "block",
          source: "default",
          reason: null,
          createdAt: null,
        });
      }
    }

    // Add remaining user-added entries (not overriding defaults)
    for (const override of overrideMap.values()) {
      entries.push({
        id: override.id,
        keyword: override.keyword,
        stem: override.stem,
        action: override.action,
        source: "user",
        reason: override.reason,
        createdAt: override.createdAt?.toISOString() || null,
      });
    }

    // Sort: defaults first, then by keyword
    entries.sort((a, b) => {
      if (a.source !== b.source) {
        return a.source === "default" ? -1 : 1;
      }
      return a.keyword.localeCompare(b.keyword);
    });

    return NextResponse.json({
      success: true,
      entries,
      stats: {
        totalDefaults: BLACKLISTED_KEYWORDS.length,
        userBlocks: userOverrides.filter((o) => o.action === "block").length,
        userAllows: userOverrides.filter((o) => o.action === "allow").length,
      },
    });
  } catch (error) {
    console.error("Failed to fetch blacklist:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch blacklist" },
      { status: 500 }
    );
  }
}

// POST - Add or update a blacklist override
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { keyword, action, reason } = body as {
      keyword: string;
      action: "block" | "allow";
      reason?: string;
    };

    if (!keyword || !action) {
      return NextResponse.json(
        { success: false, error: "keyword and action are required" },
        { status: 400 }
      );
    }

    if (action !== "block" && action !== "allow") {
      return NextResponse.json(
        { success: false, error: "action must be 'block' or 'allow'" },
        { status: 400 }
      );
    }

    const stem = stemPhrase(keyword.trim());
    const cleanKeyword = keyword.trim().toLowerCase();

    // Check if override already exists for this stem
    const existing: BlacklistOverride[] = await dbAny
      .select()
      .from(blacklistOverrides)
      .where(eq(blacklistOverrides.stem, stem))
      .limit(1);

    if (existing.length > 0) {
      // Update existing override
      const [updated]: BlacklistOverride[] = await dbAny
        .update(blacklistOverrides)
        .set({
          action,
          reason: reason || null,
          keyword: cleanKeyword,
        })
        .where(eq(blacklistOverrides.id, existing[0].id))
        .returning();

      return NextResponse.json({
        success: true,
        override: updated,
        updated: true,
      });
    }

    // Insert new override
    const [inserted]: BlacklistOverride[] = await dbAny
      .insert(blacklistOverrides)
      .values({
        keyword: cleanKeyword,
        stem,
        action,
        reason: reason || null,
      })
      .returning();

    return NextResponse.json({
      success: true,
      override: inserted,
      created: true,
    });
  } catch (error) {
    console.error("Failed to add blacklist override:", error);
    return NextResponse.json(
      { success: false, error: "Failed to add blacklist override" },
      { status: 500 }
    );
  }
}

// DELETE - Remove a user override (by id or keyword)
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    const keyword = searchParams.get("keyword");

    if (!id && !keyword) {
      return NextResponse.json(
        { success: false, error: "id or keyword query parameter is required" },
        { status: 400 }
      );
    }

    let deleted: BlacklistOverride | undefined;
    if (id) {
      const result: BlacklistOverride[] = await dbAny
        .delete(blacklistOverrides)
        .where(eq(blacklistOverrides.id, parseInt(id)))
        .returning();
      deleted = result[0];
    } else if (keyword) {
      const stem = stemPhrase(keyword.trim());
      const result: BlacklistOverride[] = await dbAny
        .delete(blacklistOverrides)
        .where(eq(blacklistOverrides.stem, stem))
        .returning();
      deleted = result[0];
    }

    if (!deleted) {
      return NextResponse.json(
        { success: false, error: "Override not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      deleted,
    });
  } catch (error) {
    console.error("Failed to delete blacklist override:", error);
    return NextResponse.json(
      { success: false, error: "Failed to delete blacklist override" },
      { status: 500 }
    );
  }
}
