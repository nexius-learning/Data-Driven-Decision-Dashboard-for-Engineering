import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'

const LOCK_DIR_NAME = '.clone-in-progress'
const STARTED_AT_FILE = 'started-at'

/**
 * How long a lock can be held before it's assumed abandoned by a crashed
 * writer and reclaimed. Matches the bash clone script's own threshold —
 * generous enough to cover a full first-time clone of a large org.
 */
const STALE_LOCK_MS = 2 * 60 * 60 * 1000

function lockDir(repoRoot: string): string {
  return path.join(repoRoot, LOCK_DIR_NAME)
}

async function isStale(dir: string): Promise<boolean> {
  try {
    const raw = await readFile(path.join(dir, STARTED_AT_FILE), 'utf8')
    const startedAt = new Date(raw.trim()).getTime()
    return !Number.isFinite(startedAt) || Date.now() - startedAt > STALE_LOCK_MS
  } catch {
    return true
  }
}

/**
 * Runs `fn` while holding a lock shared with the bash clone-cron script
 * (scripts/docker/clone-github-org-repos.sh), which can clone into the same
 * `repoRoot` independently. Both sides use this same `mkdir`-based directory
 * as a portable, SMB-safe mutex — `mkdir` is atomic even over the Azure Files
 * mount both processes run against in production. Returns `{ ran: false }`
 * without calling `fn` if the other side currently holds the lock.
 */
export async function withCloneLock<T>(
  repoRoot: string,
  fn: () => Promise<T>,
): Promise<{ ran: true; result: T } | { ran: false }> {
  const dir = lockDir(repoRoot)

  try {
    await mkdir(dir)
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err
    if (!(await isStale(dir))) {
      return { ran: false }
    }
    await rm(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 })
    await mkdir(dir)
  }

  await writeFile(path.join(dir, STARTED_AT_FILE), new Date().toISOString(), 'utf8')
  try {
    const result = await fn()
    return { ran: true, result }
  } finally {
    await rm(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 })
  }
}
