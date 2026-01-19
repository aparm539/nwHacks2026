import type { HNItem } from '@/lib/hn-api'
import { inArray } from 'drizzle-orm'
import { db } from '@/db'
import { items, users } from '@/db/schema'
import { fetchHNUser } from '@/lib/hn-api'

async function batchInsertUsers(usernames: string[]): Promise<void> {
  if (usernames.length === 0)
    return

  const uniqueUsernames = [...new Set(usernames)]

  const existingUsers = await db
    .select({ id: users.id })
    .from(users)
    .where(inArray(users.id, uniqueUsernames))

  const existingIds = new Set(existingUsers.map(u => u.id))
  const newUsernames = uniqueUsernames.filter(u => !existingIds.has(u))

  if (newUsernames.length === 0)
    return

  const userPromises = newUsernames.map(username => fetchHNUser(username))
  const hnUsers = await Promise.all(userPromises)

  const usersToInsert = hnUsers
    .filter((u): u is NonNullable<typeof u> => u !== null)
    .map(u => ({
      id: u.id,
      created: u.created,
      karma: u.karma,
      about: u.about ?? null,
    }))

  if (usersToInsert.length > 0) {
    await db.insert(users).values(usersToInsert).onConflictDoNothing()
  }
}
export async function batchInsertItems(hnItems: HNItem[]): Promise<number> {
  if (hnItems.length === 0)
    return 0

  const validItems = hnItems.filter(item => item.type && item.time)
  if (validItems.length === 0)
    return 0

  const usernames = validItems
    .map(item => item.by)
    .filter((by): by is string => by !== undefined)

  await batchInsertUsers(usernames)

  const itemsToInsert = validItems.map(item => ({
    id: item.id,
    deleted: item.deleted ?? false,
    type: item.type!,
    by: item.by ?? null,
    time: item.time!,
    text: item.text ?? null,
    dead: item.dead ?? false,
    parent: item.parent ?? null,
    poll: item.poll ?? null,
    url: item.url ?? null,
    score: item.score ?? 0,
    title: item.title ?? null,
    descendants: item.descendants ?? 0,
  }))

  await db.insert(items).values(itemsToInsert).onConflictDoNothing()
  return itemsToInsert.length
}
