import { execFile as execFileCb } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { access, mkdir, rename, rm } from 'node:fs/promises'
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

const CLONE_TIMEOUT_MS = 120_000
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
    const message = error instanceof Error ? error.message : String(error)
    throw new RepoCloneError(`git ${args[0] ?? 'command'} failed: ${message}`, { cause: error })
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
 * Whether a `rename` failure means "another writer already occupies
 * `target`" rather than a genuine error. Renaming onto an existing
 * non-empty directory is `ENOTEMPTY`/`EEXIST` on POSIX, but Node reports it
 * as `EPERM` on Windows — confirming `target` actually exists distinguishes
 * that race loss from a real permission error surfacing the same code.
 */
async function isRenameRaceLoss(err: unknown, target: string): Promise<boolean> {
  const code = (err as NodeJS.ErrnoException).code
  return RENAME_DESTINATION_EXISTS_CODES.has(code ?? '') && (await pathExists(target))
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
 * Clears `repoRoot/.clone-tmp` entirely. Call once at the start of the
 * cloning phase (before any `cloneOrUpdateRepository` call) to reclaim
 * staging/stale directories orphaned by a prior run that crashed mid-clone
 * or mid-repair — otherwise they accumulate forever. Safe because the
 * sync_runs single-flight guard already guarantees only one run touches
 * `.clone-tmp` at a time.
 */
export async function clearCloneTmpDir(repoRoot: string): Promise<void> {
  await rm(join(repoRoot, CLONE_TMP_DIR_NAME), { recursive: true, force: true })
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
  // docs/adr/0001-refresh-progress-and-single-flight.md.
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
