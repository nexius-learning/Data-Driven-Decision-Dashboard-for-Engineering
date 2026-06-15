import { readdirSync } from 'node:fs'
import path from 'node:path'
import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createDb, runMigrations } from '~/db/client'
import { syncRuns } from '~/db/schema'

const databaseUrl = process.env.DATABASE_URL?.trim()
const drizzleDir = path.resolve(process.cwd(), 'drizzle')

describe('single-flight migration filesystem invariants', () => {
  it('migration_includes_single_flight_file', () => {
    const files = readdirSync(drizzleDir).filter((f) => /^\d{4}_.*\.sql$/.test(f))
    const sf = files.filter((f) => f.startsWith('0003_'))
    expect(sf.length, `expected exactly one 0003_*.sql migration, got: ${files.join(', ')}`).toBe(1)
  })
})

describe('single-flight migration', () => {
  let db: ReturnType<typeof createDb>

  beforeAll(async () => {
    await runMigrations(databaseUrl)
    db = createDb(databaseUrl)
  })

  afterAll(async () => {
    await db.$client.end({ timeout: 5 })
  })

  it('sync_runs_has_heartbeat_column', async () => {
    const rows = await db.execute<{ c: number; data_type: string; is_nullable: string }>(sql`
      SELECT COUNT(*)::int AS c, MIN(data_type) AS data_type, MIN(is_nullable) AS is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'sync_runs'
        AND column_name = 'heartbeat'
    `)
    expect(rows[0]?.c).toBe(1)
    expect(rows[0]?.data_type).toMatch(/timestamp/i)
    expect(rows[0]?.is_nullable).toBe('YES')
  })

  it('sync_runs_one_running_per_kind_index_exists', async () => {
    const rows = await db.execute<{ c: number }>(sql`
      SELECT COUNT(*)::int AS c FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename = 'sync_runs'
        AND indexname = 'sync_runs_one_running_per_kind'
    `)
    expect(rows[0]?.c).toBe(1)
  })

  it('sync_runs_rejects_second_running_row_for_same_kind', async () => {
    const kind = `test_sf_${crypto.randomUUID()}`
    await db.insert(syncRuns).values({ kind, status: 'running', startedAt: new Date() })
    await expect(
      db.insert(syncRuns).values({ kind, status: 'running', startedAt: new Date() }),
    ).rejects.toThrow()
  })

  it('sync_runs_allows_multiple_non_running_rows_for_same_kind', async () => {
    const kind = `test_sf_${crypto.randomUUID()}`
    await db.insert(syncRuns).values({ kind, status: 'success', startedAt: new Date(), finishedAt: new Date() })
    await expect(
      db.insert(syncRuns).values({ kind, status: 'failed', startedAt: new Date() }),
    ).resolves.not.toThrow()
  })
})
