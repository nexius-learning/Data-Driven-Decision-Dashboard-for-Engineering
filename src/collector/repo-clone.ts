import { execFile as execFileCb } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { access, mkdir, readdir, rename, rm, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { promisify } from 'node:util'

import { fetchRepo } from '~/collector/pr-size-sync'

const execFile = promisify(execFileCb)

export class RepoCloneError extends Error {
  override readonly name = 'RepoCloneError'

  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options)
  }
}

export type CloneExecFn = (args: readonly string[], timeoutMs: number) => Promise<void>

let cloneExecOverride: CloneExecFn | null = null

/** @internal Test hook — do not use in production code. */
export function __setCloneExecForTests(fn: CloneExecFn | null): void {
  cloneExecOverride = fn
}

// A first-time clone of a large repo (full commit history, even blobless)
// can legitimately take several minutes, especially split across
// GITHUB_SYNC_CONCURRENCY workers competing for bandwidth. 120s was
// observed killing healthy clones outright (see sync_errors from the
// 2026-07-07 07:52 run); 10 minutes gives real first clones room while
// still bounding a genuinely hung git process.
const CLONE_TIMEOUT_MS = 600_000
const HEAD_CHECK_TIMEOUT_MS = 10_000

/**
 * Directory clones/repairs stage into before being renamed into their final
 * path. Nested one level under `repoRoot` so it never has a `.git` marker
 * of its own — `discoverRepositories` only lists `repoRoot`'s immediate
 * children that do, so a leftover or in-progress entry here is invisible
 * to it.
 */
const CLONE_TMP_DIR_NAME = '.clone-tmp'

async function runGitClone(args: readonly string[], timeoutMs: number): Promise<void> {
  try {
    if (cloneExecOverride) {
      await cloneExecOverride(args, timeoutMs)
      return
    }
    await execFile('git', args, {
      encoding: 'utf8',
      env: { ...process.env, LC_ALL: 'C', GIT_TERMINAL_PROMPT: '0' },
      timeout: timeoutMs,
    })
  } catch (error) {
    if (error instanceof RepoCloneError) throw error
    const gitCommand = args[0] ?? 'command'
    // Node kills the process with SIGTERM when `timeout` fires; at that
    // point stderr is typically empty (the process died before writing
    // anything), so the generic message below would just be
    // "Command failed: <cmd>" with no indication of *why* — easy to
    // mistake for a genuine git failure instead of "needed more time".
    const isTimeout =
      typeof error === 'object' &&
      error !== null &&
      (error as NodeJS.ErrnoException & { killed?: boolean; signal?: string | null }).killed === true &&
      (error as { signal?: string | null }).signal === 'SIGTERM'
    if (isTimeout) {
      throw new RepoCloneError(`git ${gitCommand} timed out after ${timeoutMs}ms`, { cause: error })
    }
    const message = error instanceof Error ? error.message : String(error)
    throw new RepoCloneError(`git ${gitCommand} failed: ${message}`, { cause: error })
  }
}

async function pathExists(candidatePath: string): Promise<boolean> {
  try {
    await access(candidatePath)
    return true
  } catch {
    return false
  }
}

async function hasResolvableHead(repoPath: string): Promise<boolean> {
  try {
    await runGitClone(['-C', repoPath, 'rev-parse', '--verify', '--quiet', 'HEAD'], HEAD_CHECK_TIMEOUT_MS)
    return true
  } catch {
    return false
  }
}

/**
 * Clones `owner/name` into a fresh, uniquely-named directory under
 * `repoRoot/.clone-tmp` rather than directly at its final path, so a
 * concurrent writer targeting the same final path (e.g. an orphaned clone
 * from a reclaimed zombie run racing a freshly-started one) can never
 * observe or write into a partially-cloned directory — the only step that
 * touches the final path at all is the near-instant rename in
 * `swapIntoPlace`.
 */
async function cloneIntoTemp(repoRoot: string, owner: string, name: string): Promise<string> {
  const tmpRoot = join(repoRoot, CLONE_TMP_DIR_NAME)
  await mkdir(tmpRoot, { recursive: true })
  const tmpTarget = join(tmpRoot, `${name}-${randomUUID()}`)
  await runGitClone(
    ['clone', '--quiet', '--filter=blob:none', `https://github.com/${owner}/${name}.git`, tmpTarget],
    CLONE_TIMEOUT_MS,
  )
  return tmpTarget
}

/** Error codes Node's `rename` can raise when the destination directory already exists. */
const RENAME_DESTINATION_EXISTS_CODES = new Set(['ENOTEMPTY', 'EEXIST', 'EPERM'])

/**
 * Whether a `rename` failure means "another writer already finished a real
 * clone at `target`" rather than a genuine error. Renaming onto an existing
 * non-empty directory is `ENOTEMPTY`/`EEXIST` on POSIX, but Node reports it
 * as `EPERM` on Windows — so we confirm `target` actually holds a git repo
 * (`target/.git` present), not merely that a directory exists there. A bare
 * "exists" check would launder a genuine permission fault (Windows AV/file
 * lock, or an Azure Files SMB quirk) that happens to coincide with a leftover
 * non-repo directory into a benign "race loss", silently keeping the broken
 * `target` and discarding the fresh clone.
 */
async function isRenameRaceLoss(err: unknown, target: string): Promise<boolean> {
  const code = (err as NodeJS.ErrnoException).code
  return RENAME_DESTINATION_EXISTS_CODES.has(code ?? '') && (await pathExists(join(target, '.git')))
}

/**
 * Renames `tmpTarget` to `target`. If `target` now exists (another writer
 * finished cloning/repairing the same repo first), discards `tmpTarget`
 * instead of erroring — whichever writer finishes first wins, and neither
 * can ever observe or corrupt the other's result.
 */
async function swapIntoPlace(tmpTarget: string, target: string): Promise<boolean> {
  try {
    await rename(tmpTarget, target)
    return true
  } catch (err) {
    if (await isRenameRaceLoss(err, target)) {
      await rm(tmpTarget, { recursive: true, force: true })
      return false
    }
    throw err
  }
}

/**
 * Reclaims staging/stale directories under `repoRoot/.clone-tmp` orphaned by a
 * prior run that crashed mid-clone or mid-repair. Call once at the start of the
 * cloning phase (before any `cloneOrUpdateRepository` call) — otherwise they
 * accumulate forever.
 *
 * Only entries older than `maxAgeMs` are removed. The earlier "delete the whole
 * directory" behavior was only safe while the single-flight guard held
 * perfectly — but the temp+rename scheme exists precisely so a bypassed guard
 * (e.g. a zombie reclaim racing a still-alive writer) can never corrupt a repo,
 * and wiping the shared staging root unconditionally would delete a concurrent
 * live run's in-flight clone out from under it, defeating that guarantee. Aging
 * the sweep to the zombie TTL preserves any staging touched within the window a
 * live run could still own it. Pass `0` to remove everything (single-caller,
 * no-concurrency contexts only).
 */
export async function clearCloneTmpDir(repoRoot: string, maxAgeMs = 0): Promise<void> {
  const tmpRoot = join(repoRoot, CLONE_TMP_DIR_NAME)
  let entries: string[]
  try {
    entries = await readdir(tmpRoot)
  } catch {
    return
  }
  const cutoff = Date.now() - maxAgeMs
  await Promise.all(
    entries.map(async (entry) => {
      const entryPath = join(tmpRoot, entry)
      try {
        const info = await stat(entryPath)
        if (info.mtimeMs <= cutoff) {
          await rm(entryPath, { recursive: true, force: true })
        }
      } catch {
        // Entry vanished (a concurrent run renamed/removed it first) — nothing to reclaim.
      }
    }),
  )
}

async function cloneFresh(repoRoot: string, owner: string, name: string): Promise<void> {
  const target = join(repoRoot, name)
  const tmpTarget = await cloneIntoTemp(repoRoot, owner, name)
  await swapIntoPlace(tmpTarget, target)
}

export type RepoCloneAction = 'cloned' | 'updated' | 'repaired'

/**
 * Ensures `repoRoot/name` holds a working clone of `owner/name`: clones it if
 * missing, re-clones it if the existing clone is broken (HEAD doesn't
 * resolve), or fetches new objects if it's already cloned and healthy.
 */
export async function cloneOrUpdateRepository(
  repoRoot: string,
  owner: string,
  name: string,
): Promise<RepoCloneAction> {
  const target = join(repoRoot, name)

  if (!(await pathExists(join(target, '.git')))) {
    await cloneFresh(repoRoot, owner, name)
    return 'cloned'
  }

  if (await hasResolvableHead(target)) {
    const result = await fetchRepo(target)
    if (!result.ok) {
      throw new RepoCloneError(`git fetch failed for ${name}: ${result.reason}`)
    }
    return 'updated'
  }

  // Repair by cloning fresh into a temp dir, moving the broken directory
  // aside, then swapping the fresh clone into place — so a concurrent
  // repair/clone of the same repo (see cloneIntoTemp) can never interleave
  // with this one at the filesystem level, regardless of whether the
  // sync_runs single-flight guard that's supposed to prevent that ever
  // gets bypassed (e.g. a zombie reclaim racing a still-alive writer). This
  // guarantee is scoped to clone/repair; the `fetchRepo` branch above writes
  // directly into `target` and relies on git's own locking instead — see
  // Documentation/ADR/0001-refresh-progress-and-single-flight.md.
  const tmpTarget = await cloneIntoTemp(repoRoot, owner, name)
  const staleTarget = join(repoRoot, CLONE_TMP_DIR_NAME, `${name}-stale-${randomUUID()}`)
  try {
    await rename(target, staleTarget)
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err
  }
  await swapIntoPlace(tmpTarget, target)
  await rm(staleTarget, { recursive: true, force: true }).catch(() => {})
  return 'repaired'
}
