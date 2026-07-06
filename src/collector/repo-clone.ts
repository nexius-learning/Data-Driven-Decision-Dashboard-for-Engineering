import { execFile as execFileCb } from 'node:child_process'
import { access, rm } from 'node:fs/promises'
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

async function cloneFresh(repoRoot: string, owner: string, name: string): Promise<void> {
  const target = join(repoRoot, name)
  await runGitClone(
    ['clone', '--quiet', '--filter=blob:none', `https://github.com/${owner}/${name}.git`, target],
    CLONE_TIMEOUT_MS,
  )
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

  await rm(target, { recursive: true, force: true })
  await cloneFresh(repoRoot, owner, name)
  return 'repaired'
}
