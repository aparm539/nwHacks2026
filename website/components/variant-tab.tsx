'use client'

import type {
  ColumnDef,
} from '@tanstack/react-table'
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  useReactTable,
} from '@tanstack/react-table'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

interface KeywordVariantOverride {
  id: number
  parentKeyword: string
  parentStem: string
  variantKeyword: string
  variantStem: string
  createdAt: string
}

interface VariantGroup {
  parentKeyword: string
  parentStem: string
  variants: KeywordVariantOverride[]
}

interface StoredKeyword {
  keyword: string
  avgScore: number
  count: number
  maxScore: number
}

export function VariantTab() {
  const [groups, setGroups] = useState<VariantGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [parentKeyword, setParentKeyword] = useState('')
  const [selectedKeywords, setSelectedKeywords] = useState<Set<string>>(new Set())
  const [selectedParent, setSelectedParent] = useState<string | null>(null)
  const [bulkAdding, setBulkAdding] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())
  const [storedKeywords, setStoredKeywords] = useState<StoredKeyword[]>([])
  const [keywordsLoading, setKeywordsLoading] = useState(true)
  const [keywordsError, setKeywordsError] = useState<string | null>(null)
  const [keywordSearch, setKeywordSearch] = useState('')
  const [keywordPage, setKeywordPage] = useState(0)
  const [variantSort, setVariantSort] = useState<{
    column: 'variantKeyword' | 'createdAt'
    direction: 'asc' | 'desc'
  }>({ column: 'variantKeyword', direction: 'asc' })
  const [variantPages, setVariantPages] = useState<Record<string, number>>({})
  const [blacklist, setBlacklist] = useState<{ keyword: string }[]>([])
  const KEYWORDS_PER_PAGE = 15
  const VARIANTS_PER_PAGE = 10
  // Fetch blacklist entries
  const fetchBlacklist = useCallback(async () => {
    try {
      const res = await fetch('/api/keywords/blacklist')
      const data = await res.json()
      if (data.success) {
        setBlacklist(data.entries.filter((e: { keyword: string, action: string }) => e.action === 'block'))
      }
    }
    catch {
      // Ignore blacklist fetch errors
    }
  }, [])

  useEffect(() => {
    fetchBlacklist()
  }, [fetchBlacklist])

  const fetchVariants = useCallback(async () => {
    try {
      const res = await fetch('/api/keywords/variants')
      const data = await res.json()
      if (data.success) {
        setGroups(data.groups)
        setError(null)
      }
      else {
        setError('Failed to fetch variant groups')
      }
    }
    catch {
      setError('Failed to fetch variant groups')
    }
    finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchVariants()
  }, [fetchVariants])

  const fetchStoredKeywords = useCallback(async () => {
    try {
      setKeywordsLoading(true)
      const res = await fetch('/api/keywords/list?limit=500&offset=0')
      const data = await res.json()
      if (data.success) {
        setStoredKeywords(data.keywords || [])
        setKeywordsError(null)
      }
      else {
        setKeywordsError('Failed to fetch stored keywords')
      }
    }
    catch {
      setKeywordsError('Failed to fetch stored keywords')
    }
    finally {
      setKeywordsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchStoredKeywords()
  }, [fetchStoredKeywords])

  useEffect(() => {
    setKeywordPage(0)
  }, [keywordSearch, storedKeywords.length])

  const addSelectedVariants = async () => {
    if (!parentKeyword.trim()) {
      setError('Parent keyword is required for bulk add')
      return
    }

    const variants = Array.from(selectedKeywords)
    if (variants.length === 0) {
      setError('Select at least one keyword to add as a variant')
      return
    }

    setBulkAdding(true)
    setError(null)

    try {
      const results = await Promise.all(
        variants.map(async (variant) => {
          const res = await fetch('/api/keywords/variants', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              parentKeyword: parentKeyword.trim(),
              variantKeyword: variant,
            }),
          })
          const data = await res.json()
          return { variant, success: !!data.success, error: data.error }
        }),
      )

      const failed = results.filter(r => !r.success)
      if (failed.length > 0) {
        setError(
          `Failed to add ${failed.length} variant${failed.length !== 1 ? 's' : ''}: ${
            failed.map(f => f.variant).join(', ')}`,
        )
      }
      else {
        setSelectedKeywords(new Set())
      }

      await fetchVariants()
      // auto-extraction removed: user can run extraction manually or background job will handle it
    }
    catch {
      setError('Failed to add variants in bulk')
    }
    finally {
      setBulkAdding(false)
    }
  }

  const removeVariant = async (variantKeyword: string) => {
    try {
      const res = await fetch(
        `/api/keywords/variants?variantKeyword=${encodeURIComponent(variantKeyword)}`,
        { method: 'DELETE' },
      )

      const data = await res.json()
      if (data.success) {
        await fetchVariants()
        // auto-extraction removed: user can run extraction manually or background job will handle it
        setError(null)
      }
      else {
        setError(data.error || 'Failed to remove variant')
      }
    }
    catch {
      setError('Failed to remove variant')
    }
  }

  const toggleGroup = (parentKeyword: string) => {
    setExpandedGroups((prev) => {
      const newSet = new Set(prev)
      if (newSet.has(parentKeyword)) {
        newSet.delete(parentKeyword)
      }
      else {
        newSet.add(parentKeyword)
      }
      return newSet
    })
  }

  const expandAll = () => {
    setExpandedGroups(new Set(groups.map(g => g.parentKeyword)))
  }

  const collapseAll = () => {
    setExpandedGroups(new Set())
  }

  const filteredGroups = groups.filter((group) => {
    const query = searchQuery.toLowerCase()
    if (!query)
      return true
    return (
      group.parentKeyword.toLowerCase().includes(query)
      || group.variants.some(v => v.variantKeyword.toLowerCase().includes(query))
    )
  })

  const toggleVariantSort = (column: 'variantKeyword' | 'createdAt') => {
    setVariantSort((prev) => {
      if (prev.column !== column) {
        return { column, direction: 'asc' }
      }
      return { column, direction: prev.direction === 'asc' ? 'desc' : 'asc' }
    })
  }

  const getSortedVariants = (variants: KeywordVariantOverride[]) => {
    const sorted = [...variants].sort((a, b) => {
      if (variantSort.column === 'variantKeyword') {
        return a.variantKeyword.localeCompare(b.variantKeyword, undefined, { sensitivity: 'base' })
      }
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    })
    return variantSort.direction === 'asc' ? sorted : sorted.reverse()
  }

  const setVariantPage = (parentKeyword: string, page: number) => {
    setVariantPages(prev => ({ ...prev, [parentKeyword]: page }))
  }
  const blacklistSet = useMemo(() => {
    return new Set(blacklist.map(entry => entry.keyword))
  }, [blacklist])

  const keywordColumns = useMemo<ColumnDef<StoredKeyword>[]>(
    () => [
      {
        id: 'select',
        header: ({ table }) => {
          const rows = table.getRowModel().rows
          const keywords = rows.map(row => row.original.keyword)
          const allSelected = keywords.length > 0 && keywords.every(k => selectedKeywords.has(k))
          return (
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={allSelected}
              onChange={(e) => {
                setSelectedKeywords((prev) => {
                  const next = new Set(prev)
                  if (e.target.checked) {
                    keywords.forEach(k => next.add(k))
                  }
                  else {
                    keywords.forEach(k => next.delete(k))
                  }
                  return next
                })
              }}
              aria-label="Select all"
            />
          )
        },
        cell: ({ row }) => (
          <input
            type="checkbox"
            className="h-4 w-4"
            checked={selectedKeywords.has(row.original.keyword)}
            onChange={(e) => {
              setSelectedKeywords((prev) => {
                const next = new Set(prev)
                if (e.target.checked) {
                  next.add(row.original.keyword)
                }
                else {
                  next.delete(row.original.keyword)
                }
                return next
              })
            }}
            aria-label={`Select ${row.original.keyword}`}
          />
        ),
      },
      {
        accessorKey: 'keyword',
        header: 'Keyword',
        cell: ({ getValue }) => (
          <span className="font-mono text-sm ">{getValue<string>()}</span>
        ),
      },
      {
        accessorKey: 'count',
        header: 'Mentions',
        cell: ({ getValue }) => getValue<number>(),
      },
      {
        id: 'actions',
        header: 'Use',
        cell: ({ row }) => (
          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSelectedParent(row.original.keyword)
                setParentKeyword(row.original.keyword)
                setSelectedKeywords(new Set())
              }}
            >
              Set Parent
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                try {
                  const res = await fetch('/api/keywords/blacklist', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ keyword: row.original.keyword, action: 'block' }),
                  })
                  const data = await res.json()
                  if (data.success) {
                    fetchBlacklist()
                    // Removed refreshTrends to stop auto re-extraction after blacklist updates
                  }
                  else {
                    setError(data.error || 'Failed to add to blacklist')
                  }
                }
                catch {
                  setError('Failed to add to blacklist')
                }
              }}
              disabled={blacklistSet.has(row.original.keyword)}
            >
              {blacklistSet.has(row.original.keyword) ? 'Blacklisted' : 'Blacklist'}
            </Button>
          </div>
        ),
      },
    ],
    [selectedKeywords, setParentKeyword, setSelectedParent, blacklistSet, fetchBlacklist],
  )

  const variantKeywordSet = useMemo(() => {
    const set = new Set<string>()
    groups.forEach((group) => {
      group.variants.forEach(variant => set.add(variant.variantKeyword))
    })
    return set
  }, [groups])

  const sortedStoredKeywords = useMemo(
    () =>
      [...storedKeywords]
        .filter(kw => !variantKeywordSet.has(kw.keyword) && !blacklistSet.has(kw.keyword))
        .sort((a, b) => b.count - a.count),
    [storedKeywords, variantKeywordSet, blacklistSet],
  )

  const keywordTable = useReactTable({
    data: sortedStoredKeywords,
    columns: keywordColumns,
    state: { globalFilter: keywordSearch },
    onGlobalFilterChange: setKeywordSearch,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    globalFilterFn: (row, columnId, filterValue) => {
      const value = row.getValue(columnId)
      return String(value).toLowerCase().includes(String(filterValue).toLowerCase())
    },
  })

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="text-slate-400">Loading variant data...</div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Error Alert */}
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Stored Keywords Table */}
      <Card>
        <CardHeader>
          <CardTitle>Stored Keywords</CardTitle>
          <CardDescription>Select from existing keywords when creating variant groups.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <Input
              placeholder="Search stored keywords..."
              value={keywordSearch}
              onChange={e => setKeywordSearch(e.target.value)}
              className="flex-1"
            />
            <Button
              variant="outline"
              onClick={addSelectedVariants}
              disabled={
                bulkAdding
                || !parentKeyword.trim()
                || selectedKeywords.size === 0
                || selectedParent === null
              }
            >
              {bulkAdding ? 'Saving...' : `Save Variants (${selectedKeywords.size})`}
            </Button>
          </div>
          <div className="text-sm text-slate-500">
            {selectedParent
              ? (
                  <span>
                    Parent selected:
                    {' '}
                    <span className="font-medium">{selectedParent}</span>
                  </span>
                )
              : (
                  'Select a parent keyword from the table, then choose variants and save.'
                )}
          </div>

          {keywordsError && (
            <Alert variant="destructive">
              <AlertDescription>{keywordsError}</AlertDescription>
            </Alert>
          )}

          {keywordsLoading
            ? (
                <div className="py-6 text-center text-slate-400">Loading stored keywords...</div>
              )
            : (
                <div className="rounded-lg border border-slate-700 overflow-hidden">
                  <Table>
                    <TableHeader>
                      {keywordTable.getHeaderGroups().map(headerGroup => (
                        <TableRow key={headerGroup.id}>
                          {headerGroup.headers.map(header => (
                            <TableHead key={header.id}>
                              {header.isPlaceholder
                                ? null
                                : flexRender(header.column.columnDef.header, header.getContext())}
                            </TableHead>
                          ))}
                        </TableRow>
                      ))}
                    </TableHeader>
                    <TableBody>
                      {(() => {
                        const rows = keywordTable.getRowModel().rows
                        const totalPages = Math.max(1, Math.ceil(rows.length / KEYWORDS_PER_PAGE))
                        const safePage = Math.min(keywordPage, totalPages - 1)
                        const pageStart = safePage * KEYWORDS_PER_PAGE
                        const pageRows = rows.slice(pageStart, pageStart + KEYWORDS_PER_PAGE)

                        return pageRows.length
                          ? (
                              pageRows.map(row => (
                                <TableRow key={row.id}>
                                  {row.getVisibleCells().map(cell => (
                                    <TableCell key={cell.id}>
                                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                                    </TableCell>
                                  ))}
                                </TableRow>
                              ))
                            )
                          : (
                              <TableRow>
                                <TableCell colSpan={keywordColumns.length} className="text-center text-slate-500">
                                  {keywordSearch ? 'No matching keywords' : 'No stored keywords available'}
                                </TableCell>
                              </TableRow>
                            )
                      })()}
                    </TableBody>
                  </Table>
                  {(() => {
                    const totalRows = keywordTable.getRowModel().rows.length
                    const totalPages = Math.max(1, Math.ceil(totalRows / KEYWORDS_PER_PAGE))
                    const safePage = Math.min(keywordPage, totalPages - 1)
                    return (
                      <div className="flex items-center justify-between border-t border-slate-200 px-4 py-2 text-sm text-black bg-white">
                        <span>
                          Page
                          {' '}
                          {safePage + 1}
                          {' '}
                          of
                          {' '}
                          {totalPages}
                        </span>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setKeywordPage(Math.max(0, safePage - 1))}
                            disabled={safePage === 0}
                          >
                            Previous
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setKeywordPage(Math.min(totalPages - 1, safePage + 1))}
                            disabled={safePage >= totalPages - 1}
                          >
                            Next
                          </Button>
                        </div>
                      </div>
                    )
                  })()}
                </div>
              )}
        </CardContent>
      </Card>

      {/* Variant Groups Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Variant Groups</CardTitle>
              <CardDescription>
                {filteredGroups.length}
                {' '}
                group
                {filteredGroups.length !== 1 ? 's' : ''}
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={expandAll}>
                Expand All
              </Button>
              <Button variant="outline" size="sm" onClick={collapseAll}>
                Collapse All
              </Button>
            </div>
          </div>
          <Input
            placeholder="Search parent or variant keywords..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="mt-4"
          />
        </CardHeader>
        <CardContent>
          {filteredGroups.length === 0
            ? (
                <div className="text-center py-8 text-slate-500">
                  {searchQuery
                    ? 'No matching variant groups found'
                    : 'No variant groups yet. Create one above to get started.'}
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredGroups.map((group) => {
                    const isExpanded = expandedGroups.has(group.parentKeyword)
                    return (
                      <div key={group.parentKeyword} className="border border-slate-200 rounded-lg overflow-hidden">
                        {/* Parent Header */}
                        <div
                          className="flex items-center justify-between p-4 bg-slate-100 cursor-pointer hover:bg-slate-200 transition-colors"
                          onClick={() => toggleGroup(group.parentKeyword)}
                        >
                          <div className="flex items-center gap-3">
                            <svg
                              className={`w-4 h-4 text-slate-600 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                            </svg>
                            <span className="font-medium text-black">{group.parentKeyword}</span>
                            <Badge variant="secondary">
                              {group.variants.length}
                              {' '}
                              variant
                              {group.variants.length !== 1 ? 's' : ''}
                            </Badge>
                          </div>
                        </div>

                        {/* Variants List */}
                        {isExpanded && (
                          <div className="border-t border-slate-200 bg-white">
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead className="text-black">
                                    <button
                                      type="button"
                                      onClick={() => toggleVariantSort('variantKeyword')}
                                      className="flex items-center gap-1 text-black"
                                    >
                                      Variant Keyword
                                      {variantSort.column === 'variantKeyword' && (
                                        <span>{variantSort.direction === 'asc' ? '▲' : '▼'}</span>
                                      )}
                                    </button>
                                  </TableHead>
                                  <TableHead className="text-black">
                                    <button
                                      type="button"
                                      onClick={() => toggleVariantSort('createdAt')}
                                      className="flex items-center gap-1 text-black"
                                    >
                                      Added
                                      {variantSort.column === 'createdAt' && (
                                        <span>{variantSort.direction === 'asc' ? '▲' : '▼'}</span>
                                      )}
                                    </button>
                                  </TableHead>
                                  <TableHead className="text-right text-black">Actions</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {(() => {
                                  const sortedVariants = getSortedVariants(group.variants)
                                  const currentPage = variantPages[group.parentKeyword] ?? 0
                                  const totalPages = Math.max(1, Math.ceil(sortedVariants.length / VARIANTS_PER_PAGE))
                                  const safePage = Math.min(currentPage, totalPages - 1)
                                  const pageStart = safePage * VARIANTS_PER_PAGE
                                  const pageVariants = sortedVariants.slice(pageStart, pageStart + VARIANTS_PER_PAGE)

                                  return pageVariants.map(variant => (
                                    <TableRow key={variant.id}>
                                      <TableCell className="font-mono text-sm text-black">
                                        {variant.variantKeyword}
                                      </TableCell>
                                      <TableCell className="text-black text-sm">
                                        {new Date(variant.createdAt).toLocaleDateString()}
                                      </TableCell>
                                      <TableCell className="text-right">
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          onClick={() => removeVariant(variant.variantKeyword)}
                                          className="text-red-600 hover:text-red-700"
                                        >
                                          Unlink
                                        </Button>
                                      </TableCell>
                                    </TableRow>
                                  ))
                                })()}
                              </TableBody>
                            </Table>
                            {(() => {
                              const totalPages = Math.max(
                                1,
                                Math.ceil(group.variants.length / VARIANTS_PER_PAGE),
                              )
                              const currentPage = variantPages[group.parentKeyword] ?? 0
                              const safePage = Math.min(currentPage, totalPages - 1)
                              return (
                                <div className="flex items-center justify-between border-t border-slate-200 px-4 py-2 text-sm text-black">
                                  <span>
                                    Page
                                    {' '}
                                    {safePage + 1}
                                    {' '}
                                    of
                                    {' '}
                                    {totalPages}
                                  </span>
                                  <div className="flex gap-2">
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => setVariantPage(group.parentKeyword, Math.max(0, safePage - 1))}
                                      disabled={safePage === 0}
                                    >
                                      Previous
                                    </Button>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() =>
                                        setVariantPage(
                                          group.parentKeyword,
                                          Math.min(totalPages - 1, safePage + 1),
                                        )}
                                      disabled={safePage >= totalPages - 1}
                                    >
                                      Next
                                    </Button>
                                  </div>
                                </div>
                              )
                            })()}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
        </CardContent>
      </Card>
    </div>
  )
}
