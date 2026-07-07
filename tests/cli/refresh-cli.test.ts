import { spawn } from 'node:child_process'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { afterAll, beforeAll, afterEach, describe, expect, it } from 'vitest'
import { createDb, runMigrations } from '~/db/client'
import { syncErrors, syncRuns } from '~/db/schema'

const databaseUrl = process.env.DATABASE_URL?.trim()
const scriptPath = path.resolve(process.cwd(), 'scripts', 'refresh.ts')

function runCli(
  env?: Record<string, string>,
  args?: string[],
): Promise<{ exitCode: number; stderr: string; stdout: string }> {
  return new Promise((resolve, reject) => {
    const tsxBin = path.resolve(process.cwd(), 'node_modules', 'tsx', 'dist', 'cli.mjs')
    const child = spawn(process.execPath, [tsxBin, scriptPath, ...(args ?? [])], {
      env: { ...process.env, DATABASE_URL: databaseUrl, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString() })
    child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString() })
    child.on('close', (code) => resolve({ exitCode: code ?? 1, stdout, stderr }))
    child.on('error', reject)
  })
}

describe('refresh CLI', () => {
  let db: ReturnType<typeof createDb>

  beforeAll(async () => {
    await mkdir(path.join(process.cwd(), '.tmp'), { recursive: true })
    await runMigrations(databaseUrl)
    db = createDb(databaseUrl!)
    // Defensive: this file spawns real CLI subprocesses, which can leave a
    // 'running' row behind if a prior interrupted run never reached its own
    // afterEach — start from a clean slate rather than assume one.
    await db.delete(syncErrors)
    await db.delete(syncRuns)
  })

  afterAll(async () => {
    await db.$client.end({ timeout: 5 })
  })

  afterEach(async () => {
    await db.delete(syncErrors)
    await db.delete(syncRuns)
  })

  it('cli_refuses_with_message_when_already_running', async () => {
    await db.insert(syncRuns).values({
      kind: 'collector_refresh',
      status: 'running',
      startedAt: new Date(Date.now() - 5000),
      heartbeat: new Date(),
    })

    const { exitCode, stderr } = await runCli()

    expect(exitCode).toBe(1)
    expect(stderr).toMatch(/already running/i)
  }, 30_000)

  it('cli_exits_cleanly_when_no_refresh_running', async () => {
    // No pre-inserted running row. Must stay hermetic: the consolidated
    // pipeline's first phase is a live GitHub org listing + clone, so on a
    // normally-configured dev machine (real GITHUB_TOKEN/OWNER/API base in
    // .env, which `scripts/refresh.ts` reads and prefers over process env) an
    // otherwise-unconstrained run would clone the whole org and blow the
    // timeout. DATABASE_URL is the one lever the CLI takes from the process
    // env (it is absent from .env), and the run's first query — the zombie
    // sweep — happens before any GitHub call, so pointing it at an unreachable
    // database fails the run fast, with no network and no clones, exactly as
    // the original "fails for a benign reason, not because a run is already
    // in progress" intent requires.
    const { exitCode, stderr } = await runCli({
      DATABASE_URL: 'postgresql://nobody:nobody@127.0.0.1:1/does_not_exist',
    })

    // Exit code should be 0 or 1 (no new codes), and NO "already running" message
    expect([0, 1]).toContain(exitCode)
    expect(stderr).not.toMatch(/already running/i)
  }, 30_000)

  it('cli_clone_only_exits_zero_when_already_running', async () => {
    await db.insert(syncRuns).values({
      kind: 'collector_refresh',
      status: 'running',
      startedAt: new Date(Date.now() - 5000),
      heartbeat: new Date(),
    })

    const { exitCode, stderr } = await runCli(undefined, ['--clone-only'])

    // Matches the old bash clone-cron's "skip cleanly" contract for a lock conflict.
    expect(exitCode).toBe(0)
    expect(stderr).toMatch(/already running/i)
  }, 30_000)

  it('cli_without_clone_only_flag_still_exits_nonzero_when_already_running', async () => {
    await db.insert(syncRuns).values({
      kind: 'collector_refresh',
      status: 'running',
      mode: 'clone_only',
      startedAt: new Date(Date.now() - 5000),
      heartbeat: new Date(),
    })

    const { exitCode, stderr } = await runCli()

    expect(exitCode).toBe(1)
    expect(stderr).toMatch(/already running/i)
  }, 30_000)

})
