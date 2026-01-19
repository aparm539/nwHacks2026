import type { NextRequest } from 'next/server'
import type { KeywordVariantOverride } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { db } from '@/db'
import { keywordVariantOverrides } from '@/db/schema'
import {
  clearVariantCache,
  hasVariants,
  isVariant,
  stemKeyword,
} from '@/lib/keyword-variants'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const dbAny = db as any

interface VariantGroup {
  parentKeyword: string
  parentStem: string
  variants: KeywordVariantOverride[]
}

interface VariantStats {
  totalGroups: number
  totalVariants: number
  recentlyCreated: number
}

// GET - List all variant groups with stats
export async function GET(): Promise<
  NextResponse<{ success: boolean, groups: VariantGroup[], stats: VariantStats }>
> {
  try {
    // Get all variant overrides
    const allVariants: KeywordVariantOverride[] = await dbAny
      .select()
      .from(keywordVariantOverrides)
      .orderBy(keywordVariantOverrides.parentKeyword, keywordVariantOverrides.createdAt)

    // Group variants by parent keyword
    const groupsMap = new Map<string, VariantGroup>()
    for (const variant of allVariants) {
      if (!groupsMap.has(variant.parentKeyword)) {
        groupsMap.set(variant.parentKeyword, {
          parentKeyword: variant.parentKeyword,
          parentStem: variant.parentStem,
          variants: [],
        })
      }
      groupsMap.get(variant.parentKeyword)!.variants.push(variant)
    }

    const groups = Array.from(groupsMap.values())

    // Calculate stats
    const now = new Date()
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const recentlyCreated = allVariants.filter(
      v => v.createdAt >= todayStart,
    ).length

    const stats: VariantStats = {
      totalGroups: groups.length,
      totalVariants: allVariants.length,
      recentlyCreated,
    }

    return NextResponse.json({ success: true, groups, stats })
  }
  catch (error) {
    console.error('Error fetching variant groups:', error)
    return NextResponse.json(
      { success: false, groups: [], stats: { totalGroups: 0, totalVariants: 0, recentlyCreated: 0 } },
      { status: 500 },
    )
  }
}

// POST - Create a new variant override
export async function POST(
  request: NextRequest,
): Promise<
  NextResponse<{ success: boolean, override?: KeywordVariantOverride, error?: string }>
> {
  try {
    const body = await request.json()
    const { parentKeyword, variantKeyword } = body

    // Validate inputs
    if (!parentKeyword || !variantKeyword) {
      return NextResponse.json(
        { success: false, error: 'Both parentKeyword and variantKeyword are required' },
        { status: 400 },
      )
    }

    const cleanParent = parentKeyword.trim()
    const cleanVariant = variantKeyword.trim()

    // Validate parent !== variant (no self-references)
    if (cleanParent.toLowerCase() === cleanVariant.toLowerCase()) {
      return NextResponse.json(
        { success: false, error: 'A keyword cannot be a variant of itself' },
        { status: 400 },
      )
    }

    // Compute stems
    const parentStem = stemKeyword(cleanParent)
    const variantStem = stemKeyword(cleanVariant)

    // Check if parent is itself a variant (prevent nesting)
    const parentIsVariant = await isVariant(cleanParent)
    if (parentIsVariant) {
      return NextResponse.json(
        {
          success: false,
          error: 'The parent keyword is already a variant of another keyword. Nested variants are not allowed.',
        },
        { status: 400 },
      )
    }

    // Check if variant is already assigned to a different parent
    const existingVariants: KeywordVariantOverride[] = await dbAny
      .select()
      .from(keywordVariantOverrides)
      .where(eq(keywordVariantOverrides.variantStem, variantStem))
      .limit(1)

    if (existingVariants.length > 0) {
      const existing = existingVariants[0]
      if (existing.parentKeyword !== cleanParent) {
        return NextResponse.json(
          {
            success: false,
            error: `This keyword is already a variant of "${existing.parentKeyword}"`,
          },
          { status: 400 },
        )
      }
      // Already exists with same parent, just return it
      return NextResponse.json({ success: true, override: existing })
    }

    // Insert new variant override
    const [inserted]: KeywordVariantOverride[] = await dbAny
      .insert(keywordVariantOverrides)
      .values({
        parentKeyword: cleanParent,
        parentStem,
        variantKeyword: cleanVariant,
        variantStem,
      })
      .returning()

    // Clear cache to pick up new override
    clearVariantCache()

    return NextResponse.json({ success: true, override: inserted })
  }
  catch (error) {
    console.error('Error creating variant override:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 },
    )
  }
}

// DELETE - Remove a variant override
export async function DELETE(
  request: NextRequest,
): Promise<NextResponse<{ success: boolean, error?: string }>> {
  try {
    const { searchParams } = new URL(request.url)
    const variantKeyword = searchParams.get('variantKeyword')

    if (!variantKeyword) {
      return NextResponse.json(
        { success: false, error: 'variantKeyword parameter is required' },
        { status: 400 },
      )
    }

    const cleanVariant = variantKeyword.trim()
    const variantStem = stemKeyword(cleanVariant)

    // Check if this variant itself has variants (prevent deletion of parents)
    const variantHasVariants = await hasVariants(cleanVariant)
    if (variantHasVariants) {
      return NextResponse.json(
        {
          success: false,
          error: 'Cannot unlink this variant because it has its own variants. Remove those first.',
        },
        { status: 400 },
      )
    }

    // Delete the variant override
    await dbAny
      .delete(keywordVariantOverrides)
      .where(eq(keywordVariantOverrides.variantStem, variantStem))

    // Clear cache
    clearVariantCache()

    return NextResponse.json({ success: true })
  }
  catch (error) {
    console.error('Error deleting variant override:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 },
    )
  }
}
